import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  appendJsonl, createSession, isSessionId, pruneCandidates, readJsonl, readMeta, refreshSession,
  removeSession, resolveSession, scanSessions, sessionDir, sessionState, TELEX_HOME, updateMeta,
} from './store.js';
import { ADAPTERS, TELEX_BIN, shq } from './adapters/index.js';
import { agentLabel } from './agents.js';
import { openAgentTerminal } from './terminals.js';
import { annotate, buildTimeline } from './timeline.js';
import { staticTimeline, style as ansi, plain } from './render.js';
import { sanitize } from './sanitize.js';
import { gitAvailable } from './workspace.js';
import { TelexError } from './errors.js';
import { VERSION } from './version.js';

const style = process.stdout.isTTY ? ansi : plain;

const HELP = `telex ${VERSION} — le second terminal qui explique ce que votre agent construit

Usage :
  telex claude [options de claude…]   lance Claude Code dans un nouveau terminal, la timeline ici
  telex codex  [options de codex…]    idem avec Codex
  telex sessions                      liste les sessions enregistrées
  telex replay [id|last] [--print]    rouvre la timeline d'une session (--print : version texte)
  telex run <id>                      (repli) lance l'agent d'une session dans ce terminal
  telex rm <id> [--force]             supprime une session
  telex prune [jours] [--yes]         supprime les sessions de plus de N jours (30 par défaut)
  telex --version                     affiche la version

Un identifiant peut être abrégé en un préfixe unique, ou remplacé par « last ».
Sessions : ~/.telex/sessions (TELEX_HOME pour changer). Terminal : TELEX_TERMINAL.
Trace complète des erreurs : TELEX_DEBUG=1. Documentation : https://github.com/hooop/telex`;

export async function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'claude':
    case 'codex':
      return start(cmd, rest);
    case 'sessions':
      return sessions();
    case 'replay':
      return replay(rest);
    case 'run':
      return runAgent(rest);
    case 'rm':
      return remove(rest);
    case 'prune':
      return prune(rest);
    // Commandes internes, appelées par le script de lancement et par l'agent.
    case 'end':
      return end(rest);
    case 'mcp': {
      const { runMcpServer } = await import('./mcp-server.js');
      return runMcpServer();
    }
    case 'hook': {
      if (rest[0] !== 'claude') return;
      const { runClaudeHook } = await import('./adapters/claude-hook.js');
      return runClaudeHook(); // ne lève jamais : un hook ne doit pas gêner l'agent
    }
    case '-v':
    case '--version':
    case 'version':
      return console.log(VERSION);
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      return console.log(HELP);
    default:
      throw new TelexError(`commande inconnue : ${sanitize(cmd)}`, { hint: 'Voir l’aide : telex --help', exitCode: 2 });
  }
}

function requirePosix() {
  if (process.platform === 'win32') {
    throw new TelexError('Windows n’est pas pris en charge : telex s’appuie sur /bin/sh.', { hint: 'Utilisez telex depuis WSL.' });
  }
}

async function start(agentId, agentArgs) {
  requirePosix();
  const adapter = ADAPTERS[agentId];
  const bin = adapter.locate();
  if (!bin) {
    throw new TelexError(`${adapter.label} est introuvable : la commande « ${adapter.bin} » est absente du PATH.`, { hint: adapter.installHint });
  }
  const cwd = process.cwd();
  const meta = createSession({ project: projectName(cwd), cwd, agent: agentId });
  const dir = sessionDir(meta.id);
  const script = writeLaunchScript(dir, meta, adapter, bin, agentArgs);

  const opened = await openAgentTerminal(script, { cwd });
  if (!opened.ok) {
    console.log(`${style.bright}TELEX${style.reset}  ${style.accent}impossible d’ouvrir un second terminal automatiquement${style.reset}`);
    console.log(`${style.dim}${opened.error}${style.reset}`);
    if (opened.hint) console.log(`${style.dim}${opened.hint}${style.reset}`);
    console.log(`\nOuvrez un autre terminal et lancez :\n\n  ${style.bright}telex run ${meta.id}${style.reset}\n`);
    console.log('La timeline démarre ici dans 5 secondes…');
    await new Promise((r) => setTimeout(r, 5000));
  }
  const notice = gitAvailable() ? null : 'git introuvable : les fichiers et le diff par étape seront indisponibles.';
  await openTimeline(dir, { notice });
}

export function writeLaunchScript(dir, meta, adapter, bin, agentArgs) {
  const args = [...adapter.prepare(dir), ...agentArgs];
  const script = path.join(dir, 'launch.sh');
  // Créé ici en mode 600 : le shell ne fera que le réécrire, sans changer ses droits.
  fs.writeFileSync(path.join(dir, 'agent.pid'), '', { mode: 0o600 });
  const lines = [
    '#!/bin/sh',
    `# telex — session ${meta.id}`,
    // Fermer la fenêtre envoie SIGHUP. Le piège (vide, et non ignoré : l'agent garde le
    // comportement par défaut) laisse le script en vie après l'arrêt de l'agent, le
    // temps d'enregistrer la fin de session.
    'trap : HUP INT TERM',
    `echo $$ > ${shq(path.join(dir, 'agent.pid'))}`,
    `cd ${shq(meta.cwd)} || exit 1`,
    `export TELEX_HOME=${shq(TELEX_HOME)}`,
    `export TELEX_SESSION_DIR=${shq(dir)}`,
    `printf '\\033]0;%s\\007' ${shq(`${adapter.label} · ${meta.project} · telex`)}`,
    'clear',
    [shq(bin), ...args.map(shq)].join(' '),
    'code=$?',
    // Fenêtre fermée, le terminal n'existe plus : node s'arrêterait en erreur (SIGABRT)
    // avant d'écrire la fin si ses entrées et sorties y restaient reliées.
    `${shq(process.execPath)} ${shq(TELEX_BIN)} end ${shq(meta.id)} "$code" </dev/null >/dev/null 2>&1`,
    'exit $code',
    '',
  ];
  fs.writeFileSync(script, lines.join('\n'), { mode: 0o700 });
  return script;
}

function runAgent([ref]) {
  requirePosix();
  if (!ref) throw new TelexError('précisez la session à lancer : telex run <id>', { hint: 'L’identifiant est affiché par « telex claude » ou « telex codex ».' });
  const { meta, state } = refreshSession(resolveSession(ref));
  if (state === 'ended' || state === 'interrupted') {
    throw new TelexError(`la session ${meta.id} est terminée`, { hint: 'Lancez « telex claude » ou « telex codex » pour en ouvrir une nouvelle.' });
  }
  if (state === 'live') throw new TelexError(`la session ${meta.id} tourne déjà dans un autre terminal`);
  const r = spawnSync('/bin/sh', [path.join(sessionDir(meta.id), 'launch.sh')], { stdio: 'inherit' });
  if (r.error) throw new TelexError(`lancement impossible : ${r.error.message}`, { cause: r.error });
  process.exitCode = r.status ?? 0;
}

// Appelée par le script de lancement quand l'agent s'arrête.
function end([id, code]) {
  const dir = sessionDir(id);
  if (!fs.existsSync(path.join(dir, 'meta.json'))) return; // session supprimée entre-temps
  if (readMeta(dir).ended_at) return;
  const ts = new Date().toISOString();
  appendJsonl(path.join(dir, 'events.jsonl'), { type: 'session_end', ts, exit_code: Number(code) || 0 });
  updateMeta(dir, { ended_at: ts });
}

function sessions() {
  const { sessions: all, broken } = scanSessions();
  if (!all.length && !broken.length) return console.log('Aucune session enregistrée.');
  for (const found of all) {
    const { meta: s, state } = refreshSession(found);
    const { entries } = buildTimeline(readJsonl(path.join(sessionDir(s.id), 'events.jsonl')));
    const when = new Date(s.started_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const label = {
      live: `  ${style.accent}● en cours${style.reset}`,
      waiting: `  ${style.accent}○ en attente de l’agent${style.reset}`,
      interrupted: `  ${style.muted}■ interrompue${style.reset}`,
      ended: s.interrupted ? `  ${style.muted}■ interrompue${style.reset}` : '',
    }[state];
    const lines = `${entries.length} ligne${entries.length > 1 ? 's' : ''}`;
    console.log(`${style.bright}${s.id}${style.reset}  ${when}  ${sanitize(s.project)}  ${style.dim}${agentLabel(s.agent)} · ${lines}${style.reset}${label}`);
  }
  for (const b of broken) {
    console.log(`${style.error}⚠ ${b.id}  ignorée : ${b.reason}${style.reset}  ${style.dim}(telex rm ${b.id})${style.reset}`);
  }
  console.log(`\n${style.dim}telex replay <id>   ou   telex replay last${style.reset}`);
}

async function replay(args) {
  const print = args.includes('--print') || !process.stdout.isTTY;
  const ref = args.find((a) => !a.startsWith('--'));
  const { meta } = refreshSession(resolveSession(ref));
  const dir = sessionDir(meta.id);
  if (print) {
    const { entries, session } = buildTimeline(readJsonl(path.join(dir, 'events.jsonl')));
    annotate(entries, readJsonl(path.join(dir, 'observed.jsonl')));
    console.log(staticTimeline({ meta, entries, session }, Math.min(100, process.stdout.columns || 80)));
    return;
  }
  await openTimeline(dir);
}

function remove(args) {
  const force = args.includes('--force');
  const ref = args.find((a) => !a.startsWith('--'));
  if (!ref) throw new TelexError('précisez la session à supprimer : telex rm <id>', { hint: 'Voir la liste : telex sessions' });
  // Un identifiant complet suffit, même si la session est illisible.
  const id = isSessionId(ref) && fs.existsSync(sessionDir(ref)) ? ref : resolveSession(ref).id;
  if (!force) {
    let state = 'broken';
    try { state = sessionState(readMeta(sessionDir(id))); } catch { /* illisible : suppression possible */ }
    if (state === 'live') {
      throw new TelexError(`la session ${id} est en cours : l’agent tourne encore`, { hint: `Pour la supprimer quand même : telex rm ${id} --force` });
    }
  }
  removeSession(id);
  console.log(`Session ${id} supprimée.`);
}

function prune(args) {
  const yes = args.includes('--yes') || args.includes('-y');
  const raw = args.find((a) => !a.startsWith('-'));
  const days = raw === undefined ? 30 : Number(raw);
  if (!Number.isFinite(days) || days < 0) throw new TelexError(`nombre de jours invalide : ${sanitize(raw)}`, { hint: 'Exemple : telex prune 30' });
  const old = pruneCandidates(days);
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  if (!old.length) return console.log(`Aucune session de plus de ${plural(days, 'jour')}.`);
  for (const s of old) console.log(`  ${s.id}  ${s.broken ? '(illisible)' : sanitize(s.project)}`);
  if (!yes) {
    console.log(`\n${plural(old.length, 'session')} de plus de ${plural(days, 'jour')}. Pour les supprimer : telex prune ${days} --yes`);
    return;
  }
  for (const s of old) removeSession(s.id);
  console.log(`\n${plural(old.length, 'session')} supprimée${old.length > 1 ? 's' : ''}.`);
}

async function openTimeline(dir, { notice = null } = {}) {
  const { runTui } = await import('./tui.js');
  await new Promise((resolve, reject) => runTui(dir, { onQuit: resolve, onFatal: reject, notice }));
  const meta = readMeta(dir);
  if (!meta.ended_at) console.log(`La session continue dans le terminal de l’agent. Pour rouvrir la timeline : telex replay ${meta.id}`);
  else console.log(`Session enregistrée. Pour la revoir : telex replay ${meta.id}`);
  process.exit(0);
}

function projectName(cwd) {
  return sanitize(path.basename(cwd)) || cwd;
}
