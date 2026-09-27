#!/usr/bin/env node
// Éditeur local des GIFs de démonstration (VHS) : scénarios et style.
//
//   node docs/demo/editor.js [port] [--no-open]      puis http://127.0.0.1:4747
//
// La page (editor.html) écrit les scénarios (docs/demo/*.tape) et le style commun
// (style.tape), avec un aperçu animé et, à la demande, un vrai rendu VHS fait dans un
// dossier temporaire. « Enregistrer » écrit les fichiers de docs/demo ; les GIFs se
// régénèrent ensuite avec sh docs/demo/render.sh.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DEMO_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DEMO_DIR, '..', '..');
const STYLE = path.join(DEMO_DIR, 'style.tape');
const STYLE_SOURCE = /^Source docs\/demo\/style\.tape\s*$/m;
const HOST = '127.0.0.1';
const PORT = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a))) || 4747;
const OPEN = !process.argv.includes('--no-open');
const TAPE_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;

const VHS = which('vhs');
if (!VHS) {
  console.error('vhs est introuvable : brew install vhs');
  process.exit(1);
}
const VHS_VERSION = spawnSync(VHS, ['--version'], { encoding: 'utf8' }).stdout.trim().replace(/^vhs version /, '');
const THEMES = loadThemes();
const FONTS = loadFonts();
// Rendus, aperçus et vérifications : un dossier temporaire, supprimé à l'arrêt.
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'telex-vhs-'));

function which(bin) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(dir, bin);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch { /* absent de ce dossier */ }
  }
  return null;
}

// Les thèmes intégrés de VHS, avec leurs couleurs. « vhs themes » n'en donne que les
// noms, mais leur JSON est embarqué tel quel dans l'exécutable.
function loadThemes() {
  try {
    const bin = fs.readFileSync(fs.realpathSync(VHS));
    const at = bin.indexOf('"name": "3024 Day"');
    const start = at < 0 ? -1 : bin.lastIndexOf('[', at);
    if (start < 0) throw new Error('thèmes introuvables');
    const text = bin.subarray(start, start + 4_000_000).toString('utf8');
    return JSON.parse(text.slice(0, jsonEnd(text))).map(({ meta, ...theme }) => theme);
  } catch {
    const r = spawnSync(VHS, ['themes'], { encoding: 'utf8' });
    return `${r.stdout}${r.stderr}`.split('\n').filter(Boolean).map((name) => ({ name }));
  }
}

// Fin du tableau JSON qui commence au début de `text`.
function jsonEnd(text) {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if ((c === ']' || c === '}') && --depth === 0) return i + 1;
  }
  throw new Error('JSON des thèmes incomplet');
}

// Polices à chasse fixe installées : VHS (un navigateur sans fenêtre) utilise les mêmes.
function loadFonts() {
  const r = spawnSync('fc-list', [':spacing=mono', 'family'], { encoding: 'utf8' });
  if (r.status !== 0) return [];
  const names = r.stdout.split('\n').map((l) => l.split(',')[0].trim()).filter((n) => n && !n.startsWith('.') && !/emoji/i.test(n));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

function tapeNames() {
  return fs.readdirSync(DEMO_DIR).filter((f) => f.endsWith('.tape') && f !== 'style.tape').map((f) => f.slice(0, -5)).sort();
}

function checkName(name) {
  if (typeof name !== 'string' || !TAPE_NAME.test(name) || name === 'style') {
    throw httpError(400, `nom de GIF invalide : ${JSON.stringify(name)} (lettres minuscules, chiffres, - et _)`);
  }
}

// ─── Aperçu : la vraie sortie des commandes telex ──────────────────────────
// Les commandes sont exécutées dans l'ordre sur des sessions fictives, avec leurs
// couleurs. Seules les commandes telex qui ne font qu'afficher sont lancées :
// jamais telex claude, codex ou run, ni une timeline interactive.

const outputs = new Map();

async function commandOutputs({ env, columns, commands }) {
  if (!Array.isArray(commands) || commands.length > 200 || commands.some((c) => typeof c !== 'string')) throw httpError(400, 'commandes invalides');
  const cols = Number.isInteger(columns) && columns >= 20 && columns <= 400 ? columns : 80;
  const key = JSON.stringify([env, cols, commands]);
  if (!outputs.has(key)) {
    if (outputs.size > 100) outputs.clear();
    outputs.set(key, buildOutputs(env, cols, commands).catch((err) => {
      outputs.delete(key);
      throw err;
    }));
  }
  return { outputs: await outputs.get(key) };
}

async function buildOutputs(env, cols, commands) {
  const home = fs.mkdtempSync(path.join(WORK, 'apercu-'));
  try {
    if (env === 'telex') await run(process.execPath, [path.join(DEMO_DIR, 'demo-home.js'), home]);
    const out = [];
    for (const command of commands) out.push(await sampleOutput(command.trim(), home, cols));
    return out;
  } finally {
    stopLiveSessions(home);
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function safeTelex(args) {
  const [sub] = args;
  if (sub === undefined || ['sessions', 'prune', 'rm', '--version', '-v', 'version', '--help', '-h', 'help'].includes(sub)) return true;
  return sub === 'replay' && args.includes('--print');
}

async function sampleOutput(command, home, cols) {
  const [bin, ...args] = command.split(/\s+/).filter(Boolean);
  if (bin === 'telex' && safeTelex(args)) {
    // telex ne colore sa sortie que dans un terminal : on le lui fait croire.
    const preload = `data:text/javascript,process.stdout.isTTY=true;process.stdout.columns=${cols}`;
    const argv = ['--import', preload, path.join(ROOT, 'bin', 'telex.js'), ...args];
    const r = await run(process.execPath, argv, { env: { ...process.env, TELEX_HOME: home }, timeout: 5000 }).catch((err) => err);
    return `${r.stdout ?? ''}${r.stderr ?? ''}`;
  }
  if (/^npm install -g /.test(command)) return '\nadded 1 package in 6s\n'; // l'aperçu n'installe rien
  return null;
}

// La session « en cours » des données fictives attend dans son propre groupe de processus.
function stopLiveSessions(home) {
  const dir = path.join(home, 'sessions');
  for (const id of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    try {
      const pid = Number(fs.readFileSync(path.join(dir, id, 'agent.pid'), 'utf8'));
      if (Number.isInteger(pid) && pid > 0) process.kill(-pid, 'SIGTERM');
    } catch { /* pas de processus pour cette session */ }
  }
}

// ─── Géométrie : lignes et colonnes réelles du terminal ────────────────────
// VHS mesure lui-même son terminal (stty size) : l'aperçu sait alors exactement ce qui
// passe à la ligne ou sort par le haut. Environ 1,5 s, mémorisé par réglages.

const GEOMETRY_SET = /^Set (Shell|FontFamily|FontSize|LineHeight|LetterSpacing|Width|Padding|Margin|WindowBar|WindowBarSize) /;
const geometries = new Map();
let geometryQueue = Promise.resolve();

function geometry({ style, height }) {
  if (typeof style !== 'string' || style.length > 10_000) throw httpError(400, 'réglages invalides');
  const lines = style.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.some((l) => !GEOMETRY_SET.test(l))) throw httpError(400, 'seuls les réglages de taille sont acceptés');
  if (!Number.isInteger(height) || height < 100 || height > 5000) throw httpError(400, `hauteur invalide : ${height}`);
  const key = JSON.stringify([lines, height]);
  if (!geometries.has(key)) {
    if (geometries.size > 200) geometries.clear();
    const job = geometryQueue.then(() => measure(lines, height)); // une mesure à la fois
    geometryQueue = job.catch(() => {});
    geometries.set(key, job.catch((err) => {
      geometries.delete(key);
      throw err;
    }));
  }
  return geometries.get(key);
}

async function measure(lines, height) {
  const dir = fs.mkdtempSync(path.join(WORK, 'mesure-'));
  const size = path.join(dir, 'size');
  const tape = [`Output ${JSON.stringify(path.join(dir, 'mesure.gif'))}`, `Set Height ${height}`, 'Set Framerate 10', ...lines,
    `Type@1ms ${JSON.stringify(`stty size > '${size}'`)}`, 'Enter', 'Sleep 150ms', ''].join('\n');
  try {
    fs.writeFileSync(path.join(dir, 'mesure.tape'), tape);
    await run(VHS, ['--quiet', path.join(dir, 'mesure.tape')], { cwd: dir, timeout: 60_000 });
    const [rows, cols] = fs.readFileSync(size, 'utf8').trim().split(/\s+/).map(Number);
    if (!rows || !cols) throw new Error('taille illisible');
    return { rows, cols };
  } catch (err) {
    throw httpError(422, `mesure impossible : ${vhsError(err)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Actions ───────────────────────────────────────────────────────────────

function state() {
  const tapes = tapeNames().map((name) => ({ name, text: fs.readFileSync(path.join(DEMO_DIR, `${name}.tape`), 'utf8') }));
  return { style: fs.readFileSync(STYLE, 'utf8'), tapes, themes: THEMES, fonts: FONTS, vhs: VHS_VERSION };
}

let rendering = false;

// Rend un scénario tel qu'il est dans la page, sans rien écrire dans docs/demo :
// la sortie, le style et les captures vont dans un dossier temporaire.
async function render({ name, tape, style }) {
  if (rendering) throw httpError(409, 'un rendu est déjà en cours');
  checkName(name);
  checkStyle(style);
  checkTape(tape);
  const id = String(Date.now());
  const dir = path.join(WORK, id);
  fs.mkdirSync(path.join(dir, 'captures'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'style.tape'), style);
  const scene = `Output ${JSON.stringify(path.join(dir, 'rendu.gif'))}\n${tape.replace(/^\s*Output\s.*$/gm, '')}`
    .replace(STYLE_SOURCE, `Source ${JSON.stringify(path.join(dir, 'style.tape'))}`)
    .replace(/^(\s*)Screenshot\s+(.*)$/gm, (_, indent, file) => `${indent}Screenshot ${JSON.stringify(path.join(dir, 'captures', path.basename(file.replace(/^["'`]|["'`]$/g, ''))))}`);
  fs.writeFileSync(path.join(dir, 'scene.tape'), scene);
  rendering = true;
  const started = Date.now();
  try {
    // Depuis la racine du dépôt : env.sh et les scénarios s'y réfèrent.
    await run(VHS, ['--quiet', path.join(dir, 'scene.tape')], { cwd: ROOT, timeout: 300_000 });
  } catch (err) {
    throw httpError(422, vhsError(err));
  } finally {
    rendering = false;
  }
  const gif = fs.readFileSync(path.join(dir, 'rendu.gif'));
  return { url: `/rendus/${id}/rendu.gif`, ms: Date.now() - started, size: gif.length, duration: gifDuration(gif) };
}

// Durée d'un GIF : somme des délais de ses images (extensions de contrôle graphique).
function gifDuration(buf) {
  let hundredths = 0;
  for (let i = 0; i + 5 < buf.length; i++) {
    if (buf[i] === 0x21 && buf[i + 1] === 0xf9 && buf[i + 2] === 0x04) {
      hundredths += buf.readUInt16LE(i + 4);
      i += 7;
    }
  }
  return hundredths * 10;
}

// Crée, modifie et supprime les scénarios, et écrit le style. Tout est vérifié par
// VHS avant d'écrire quoi que ce soit.
async function save({ style, tapes = {}, deleted = [] }) {
  checkStyle(style);
  if (!tapes || typeof tapes !== 'object' || !Array.isArray(deleted)) throw httpError(400, 'requête invalide');
  const check = path.join(WORK, `verification-${Date.now()}`);
  fs.mkdirSync(check);
  fs.writeFileSync(path.join(check, 'style.tape'), style);
  await validate(path.join(check, 'style.tape'), 'style.tape');
  for (const [name, text] of Object.entries(tapes)) {
    checkName(name);
    checkTape(text);
    const file = path.join(check, `${name}.tape`);
    fs.writeFileSync(file, text.replace(STYLE_SOURCE, `Source ${JSON.stringify(path.join(check, 'style.tape'))}`));
    await validate(file, `${name}.tape`);
  }
  for (const name of deleted) checkName(name);

  fs.writeFileSync(STYLE, style);
  for (const [name, text] of Object.entries(tapes)) {
    const file = path.join(DEMO_DIR, `${name}.tape`);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text);
  }
  for (const name of deleted) {
    if (!(name in tapes)) fs.rmSync(path.join(DEMO_DIR, `${name}.tape`), { force: true });
  }
  fs.rmSync(check, { recursive: true, force: true });
}

async function validate(file, label) {
  await run(VHS, ['validate', file], { cwd: ROOT }).catch((err) => {
    throw httpError(422, `${label} : ${vhsError(err)}`);
  });
}

function checkStyle(style) {
  if (typeof style !== 'string' || !style.trim() || style.length > 100_000) throw httpError(400, 'style.tape invalide');
  // Le style ne doit que régler : pas de sortie, de commande tapée ni d'inclusion.
  const forbidden = style.split('\n').map((l) => l.trim()).find((l) => l && !/^(#|Set\s|Env\s)/.test(l));
  if (forbidden) throw httpError(400, `ligne refusée dans style.tape : ${forbidden}`);
}

function checkTape(text) {
  if (typeof text !== 'string' || text.length > 200_000) throw httpError(400, 'scénario invalide');
}

function vhsError(err) {
  // Sans le cadre qui rappelle le chemin du fichier (temporaire, donc sans intérêt).
  const text = `${err.stderr || ''}${err.stdout || ''}`.replace(/\x1b\[[\d;]*m/g, '')
    .split('\n').filter((l) => !/^[┌└]─|^│.*│\s*$/.test(l)).join('\n').trim();
  return text || err.message;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// ─── Serveur ───────────────────────────────────────────────────────────────

// Seules les requêtes de la page elle-même sont acceptées : pas d'autre site
// (en-tête Origin), pas de nom de domaine qui pointerait ici (en-tête Host).
function allowed(req) {
  const hosts = [`${HOST}:${PORT}`, `localhost:${PORT}`];
  if (!hosts.includes(req.headers.host)) return false;
  if (req.method === 'GET') return true;
  const origin = req.headers.origin;
  return (!origin || origin === `http://${req.headers.host}`) && /^application\/json\b/.test(req.headers['content-type'] || '');
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2_000_000) throw httpError(413, 'requête trop grosse');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw httpError(400, 'JSON invalide');
  }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    if (!allowed(req)) return send(res, 403, { error: 'requête refusée' });
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && pathname === '/') {
      return send(res, 200, fs.readFileSync(path.join(DEMO_DIR, 'editor.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && pathname === '/api/state') return send(res, 200, state());
    const gif = req.method === 'GET' && pathname.match(/^\/rendus\/(\d+)\/rendu\.gif$/);
    if (gif) {
      const file = path.join(WORK, gif[1], 'rendu.gif');
      return fs.existsSync(file) ? send(res, 200, fs.readFileSync(file), 'image/gif') : send(res, 404, { error: 'rendu introuvable' });
    }
    if (req.method === 'POST' && pathname === '/api/outputs') return send(res, 200, await commandOutputs(await readJson(req)));
    if (req.method === 'POST' && pathname === '/api/geometry') return send(res, 200, await geometry(await readJson(req)));
    if (req.method === 'POST' && pathname === '/api/render') return send(res, 200, await render(await readJson(req)));
    if (req.method === 'POST' && pathname === '/api/save') {
      await save(await readJson(req));
      return send(res, 200, state());
    }
    send(res, 404, { error: 'introuvable' });
  } catch (err) {
    if (!err.status) console.error(err);
    send(res, err.status || 500, { error: err.message });
  }
});

function stop() {
  fs.rmSync(WORK, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

server.on('error', (err) => {
  fs.rmSync(WORK, { recursive: true, force: true });
  console.error(err.code === 'EADDRINUSE' ? `le port ${PORT} est déjà utilisé : node docs/demo/editor.js ${PORT + 1}` : err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`Éditeur des GIFs : ${url}   (Ctrl+C pour arrêter)`);
  if (!OPEN) return;
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(opener, [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
});
