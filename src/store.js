// Persistance locale des sessions : ~/.telex/sessions/<id>/
//   meta.json       — projet, agent, dates
//   events.jsonl    — événements de timeline (source de vérité, rejouable)
//   observed.jsonl  — commandes shell observées (hook), pour les détails
//   errors.jsonl    — erreurs internes de telex (serveur MCP, hook, instantanés)
//   agent.pid       — processus du script de lancement, pour détecter une fin brutale
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TelexError } from './errors.js';

export const TELEX_HOME = process.env.TELEX_HOME || path.join(os.homedir(), '.telex');
export const SESSIONS_DIR = path.join(TELEX_HOME, 'sessions');

const SESSION_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function newSessionId(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${stamp}-${crypto.randomBytes(2).toString('hex')}`;
}

export function isSessionId(id) {
  return typeof id === 'string' && SESSION_ID.test(id);
}

// Seuls les identifiants bien formés sont acceptés : aucun chemin ne sort de SESSIONS_DIR.
export function sessionDir(id) {
  if (!isSessionId(id)) {
    throw new TelexError(`identifiant de session invalide : ${JSON.stringify(String(id ?? ''))}`, {
      hint: 'Un identifiant ressemble à 20260922-181320-3f4f. Voir la liste : telex sessions',
    });
  }
  return path.join(SESSIONS_DIR, id);
}

export function createSession({ project, cwd, agent }) {
  const id = newSessionId();
  const dir = sessionDir(id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const meta = { id, project, cwd, agent, started_at: new Date().toISOString(), ended_at: null };
  writeJsonAtomic(path.join(dir, 'meta.json'), meta);
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '', { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'observed.jsonl'), '', { mode: 0o600 });
  return meta;
}

export function readMeta(dir) {
  const id = path.basename(dir);
  const file = path.join(dir, 'meta.json');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new TelexError(err.code === 'ENOENT' ? `session introuvable : ${id}` : `lecture impossible de ${file} (${err.code || err.message})`, { cause: err });
  }
  let meta;
  try {
    meta = JSON.parse(text);
  } catch (err) {
    throw new TelexError(`session ${id} illisible : meta.json est corrompu`, { hint: `Pour la supprimer : telex rm ${id}`, cause: err });
  }
  if (!meta || typeof meta !== 'object' || typeof meta.started_at !== 'string') {
    throw new TelexError(`session ${id} illisible : meta.json est incomplet`, { hint: `Pour la supprimer : telex rm ${id}` });
  }
  return { ...meta, id }; // le nom du dossier fait foi
}

export function updateMeta(dir, patch) {
  const meta = { ...readMeta(dir), ...patch };
  writeJsonAtomic(path.join(dir, 'meta.json'), meta);
  return meta;
}

// Écrit dans un fichier temporaire puis renomme : un arrêt brutal ne laisse jamais
// un meta.json à moitié écrit.
function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// Une ligne JSON par appel, écrite d'un seul write() en mode append :
// plusieurs processus (serveur MCP, hooks) peuvent écrire sans se marcher dessus.
export function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n', { mode: 0o600 });
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return parseJsonl(fs.readFileSync(file, 'utf8'));
}

export function parseJsonl(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* ligne partielle (écriture en cours) : ignorée */ }
  }
  return out;
}

// Sessions lisibles, de la plus ancienne à la plus récente, et sessions illisibles à part :
// une session abîmée ne doit pas empêcher d'accéder aux autres.
export function scanSessions() {
  let ids = [];
  try {
    ids = fs.readdirSync(SESSIONS_DIR);
  } catch (err) {
    if (err.code !== 'ENOENT') throw new TelexError(`lecture impossible de ${SESSIONS_DIR} (${err.code || err.message})`, { cause: err });
  }
  const sessions = [];
  const broken = [];
  for (const id of ids.filter(isSessionId)) {
    try {
      sessions.push(readMeta(path.join(SESSIONS_DIR, id)));
    } catch (err) {
      broken.push({ id, reason: err.message });
    }
  }
  sessions.sort((a, b) => a.started_at.localeCompare(b.started_at));
  return { sessions, broken };
}

export function listSessions() {
  return scanSessions().sessions;
}

// Identifiant complet, préfixe unique ou « last ».
export function resolveSession(ref) {
  if (isSessionId(ref) && fs.existsSync(path.join(SESSIONS_DIR, ref))) return readMeta(sessionDir(ref));
  const all = listSessions();
  if (!all.length) {
    throw new TelexError('aucune session enregistrée', { hint: 'Lancez « telex claude » ou « telex codex » dans le dossier d’un projet.' });
  }
  if (!ref || ref === 'last') return all.at(-1);
  const matches = all.filter((s) => s.id.startsWith(ref));
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new TelexError(`session introuvable : ${ref}`, { hint: 'Voir la liste : telex sessions' });
  throw new TelexError(`préfixe ambigu : « ${ref} » correspond à ${matches.length} sessions`, {
    hint: `Précisez l’identifiant, par exemple :\n${matches.slice(-3).map((s) => `  ${s.id}`).join('\n')}`,
  });
}

// État d'une session :
//   ended       — fin enregistrée ;
//   waiting     — l'agent n'a pas encore été lancé (repli « telex run » pas encore exécuté) ;
//   live        — le script de lancement tourne ;
//   interrupted — le script a disparu sans enregistrer de fin (fenêtre tuée, machine arrêtée…).
export function sessionState(meta) {
  if (meta.ended_at) return 'ended';
  const dir = sessionDir(meta.id);
  let pid;
  try {
    pid = Number(fs.readFileSync(path.join(dir, 'agent.pid'), 'utf8').trim());
  } catch {
    return 'waiting';
  }
  if (!Number.isInteger(pid) || pid <= 0) return 'waiting';
  return isLaunchScriptRunning(pid, dir) ? 'live' : 'interrupted';
}

// Le numéro de processus peut avoir été réattribué : on vérifie qu'il exécute bien
// le script de CETTE session. Dans le doute (ps indisponible), la session reste vivante.
function isLaunchScriptRunning(pid, dir) {
  try {
    process.kill(pid, 0);
  } catch (err) {
    if (err.code === 'ESRCH') return false;
  }
  try {
    const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return command.includes(path.join(dir, 'launch.sh'));
  } catch (err) {
    return err.status !== 1; // ps sort en 1 quand le processus n'existe pas
  }
}

export function markInterrupted(meta) {
  const dir = sessionDir(meta.id);
  const current = readMeta(dir);
  if (current.ended_at) return current;
  const ts = new Date().toISOString();
  appendJsonl(path.join(dir, 'events.jsonl'), { type: 'session_end', ts, exit_code: null, interrupted: true });
  return updateMeta(dir, { ended_at: ts, interrupted: true });
}

// Constate une interruption et l'enregistre, pour que la session ne reste pas « en cours ».
export function refreshSession(meta) {
  const state = sessionState(meta);
  return state === 'interrupted' ? { meta: markInterrupted(meta), state } : { meta, state };
}

export function removeSession(id) {
  const dir = sessionDir(id);
  if (!fs.existsSync(dir)) throw new TelexError(`session introuvable : ${id}`, { hint: 'Voir la liste : telex sessions' });
  fs.rmSync(dir, { recursive: true, force: true });
}

// Sessions commencées il y a plus de `days` jours et qui ne tournent plus,
// y compris les sessions illisibles (datées par leur dossier).
export function pruneCandidates(days, now = Date.now()) {
  const limit = now - days * DAY_MS;
  const { sessions, broken } = scanSessions();
  const old = sessions.filter((s) => Date.parse(s.started_at) < limit && sessionState(s) !== 'live');
  const oldBroken = broken
    .filter((b) => {
      try { return fs.statSync(path.join(SESSIONS_DIR, b.id)).mtimeMs < limit; } catch { return false; }
    })
    .map((b) => ({ id: b.id, project: null, broken: true }));
  return [...old, ...oldBroken];
}

// Suit un fichier JSONL et appelle onItems pour chaque nouvel objet complet.
// Un fichier absent est attendu (pas encore créé) ; toute autre erreur est signalée à onError.
export function tailJsonl(file, onItems, onError) {
  let offset = 0;
  let buf = '';
  const read = () => {
    let fd;
    let items = [];
    try {
      fd = fs.openSync(file, 'r');
      const size = fs.fstatSync(fd).size;
      if (size < offset) { offset = 0; buf = ''; }
      if (size === offset) return;
      const chunk = Buffer.alloc(size - offset);
      fs.readSync(fd, chunk, 0, chunk.length, offset);
      offset = size;
      buf += chunk.toString('utf8');
      const nl = buf.lastIndexOf('\n');
      if (nl < 0) return;
      items = parseJsonl(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    } catch (err) {
      if (err.code !== 'ENOENT') onError?.(err);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    if (items.length) onItems(items); // hors du try : une erreur de l'appelant n'est pas une erreur de lecture
  };
  read();
  let watcher = null;
  try { watcher = fs.watch(file, read); } catch { /* fichier absent ou fs.watch indisponible : le polling suffit */ }
  const timer = setInterval(read, 400);
  return () => { clearInterval(timer); watcher?.close(); };
}
