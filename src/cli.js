import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendJsonl, createSession, listSessions, readJsonl, readMeta, resolveSession, sessionDir, updateMeta } from './store.js';
import { ADAPTERS, TELEX_BIN, shq } from './adapters/index.js';
import { openAgentTerminal } from './terminals.js';
import { annotate, buildTimeline } from './timeline.js';
import { staticTimeline, style as ansi, plain } from './render.js';

const style = process.stdout.isTTY ? ansi : plain;

const HELP = `telex — le second terminal qui explique ce que votre agent construit

Usage :
  telex claude [options de claude…]   lance Claude Code dans un nouveau terminal, la timeline ici
  telex codex  [options de codex…]    idem avec Codex
  telex sessions                      liste les sessions enregistrées
  telex replay [id|last] [--print]    rouvre la timeline d'une session
  telex run <id>                      (repli) lance l'agent d'une session dans ce terminal

Les sessions sont conservées localement dans ~/.telex/sessions.`;

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
      return runAgent(rest[0]);
    case 'end':
      return end(rest);
    case 'mcp': {
      const { runMcpServer } = await import('./mcp-server.js');
      return runMcpServer();
    }
    case 'hook': {
      if (rest[0] !== 'claude') return;
      const { runClaudeHook } = await import('./adapters/claude-hook.js');
      return runClaudeHook().catch(() => {}); // un hook ne doit jamais gêner l'agent
    }
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      return console.log(HELP);
    default:
      console.error(`Commande inconnue : ${cmd}\n\n${HELP}`);
      process.exitCode = 2;
  }
}

async function start(agentId, agentArgs) {
  const adapter = ADAPTERS[agentId];
  const bin = adapter.locate();
  if (!bin) {
    console.error(`${adapter.label} est introuvable (commande « ${adapter.bin} » absente du PATH).`);
    process.exitCode = 1;
    return;
  }
  const cwd = process.cwd();
  const meta = createSession({ project: projectName(cwd), cwd, agent: agentId });
  const dir = sessionDir(meta.id);
  const script = writeLaunchScript(dir, meta, adapter, bin, agentArgs);

  const opened = openAgentTerminal(script);
  if (!opened.ok) {
    console.log(`${style.bold}TELEX${style.reset}  ${style.amber}impossible d’ouvrir un second terminal automatiquement${style.reset}`);
    console.log(`${style.dim}${opened.error}${style.reset}\n`);
    console.log(`Ouvrez un autre terminal et lancez :\n\n  ${style.bold}telex run ${meta.id}${style.reset}\n`);
    console.log('La timeline démarre ici dans 5 secondes…');
    await new Promise((r) => setTimeout(r, 5000));
  }
  await openTimeline(dir);
}

export function writeLaunchScript(dir, meta, adapter, bin, agentArgs) {
  const args = [...adapter.prepare(dir), ...agentArgs];
  const script = path.join(dir, 'launch.sh');
  const lines = [
    '#!/bin/sh',
    `# telex — session ${meta.id}`,
    `cd ${shq(meta.cwd)} || exit 1`,
    `export TELEX_SESSION_DIR=${shq(dir)}`,
    `printf '\\033]0;%s\\007' ${shq(`${adapter.label} · ${meta.project} · telex`)}`,
    'clear',
    [shq(bin), ...args.map(shq)].join(' '),
    'code=$?',
    `${shq(process.execPath)} ${shq(TELEX_BIN)} end ${shq(meta.id)} "$code"`,
    'exit $code',
    '',
  ];
  fs.writeFileSync(script, lines.join('\n'), { mode: 0o700 });
  return script;
}

function runAgent(idArg) {
  const s = resolveSession(idArg);
  if (!s) { console.error('Session introuvable.'); process.exitCode = 1; return; }
  if (s.ended_at) { console.error('Cette session est terminée. Lancez « telex claude » ou « telex codex » pour en ouvrir une nouvelle.'); process.exitCode = 1; return; }
  const r = spawnSync('/bin/sh', [path.join(sessionDir(s.id), 'launch.sh')], { stdio: 'inherit' });
  process.exitCode = r.status ?? 0;
}

function end([id, code]) {
  const dir = sessionDir(id);
  if (!fs.existsSync(dir)) return;
  const ts = new Date().toISOString();
  appendJsonl(path.join(dir, 'events.jsonl'), { type: 'session_end', ts, exit_code: Number(code) || 0 });
  updateMeta(dir, { ended_at: ts });
}

function sessions() {
  const all = listSessions();
  if (!all.length) return console.log('Aucune session enregistrée.');
  const agent = { claude: 'Claude Code', codex: 'Codex' };
  for (const s of all) {
    const events = readJsonl(path.join(sessionDir(s.id), 'events.jsonl'));
    const { entries } = buildTimeline(events);
    const d = new Date(s.started_at);
    const when = d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const state = s.ended_at ? '' : `  ${style.amber}● en cours${style.reset}`;
    console.log(`${style.bold}${s.id}${style.reset}  ${when}  ${s.project}  ${style.dim}${agent[s.agent] || s.agent} · ${entries.length} ligne${entries.length > 1 ? 's' : ''}${style.reset}${state}`);
  }
  console.log(`\n${style.dim}telex replay <id>   ou   telex replay last${style.reset}`);
}

async function replay(args) {
  const print = args.includes('--print') || !process.stdout.isTTY;
  const id = args.find((a) => !a.startsWith('--'));
  const s = resolveSession(id);
  if (!s) { console.error(id ? `Session introuvable : ${id}` : 'Aucune session enregistrée.'); process.exitCode = 1; return; }
  const dir = sessionDir(s.id);
  if (print) {
    const { entries, session } = buildTimeline(readJsonl(path.join(dir, 'events.jsonl')));
    annotate(entries, readJsonl(path.join(dir, 'observed.jsonl')));
    console.log(staticTimeline({ meta: readMeta(dir), entries, session }, Math.min(100, process.stdout.columns || 80)));
    return;
  }
  await openTimeline(dir);
}

async function openTimeline(dir) {
  const { runTui } = await import('./tui.js');
  await new Promise((resolve) => runTui(dir, { onQuit: resolve }));
  const meta = readMeta(dir);
  if (!meta.ended_at) console.log(`La session continue dans le terminal de l’agent. Pour rouvrir la timeline : telex replay ${meta.id}`);
  else console.log(`Session enregistrée. Pour la revoir : telex replay ${meta.id}`);
  process.exit(0);
}

function projectName(cwd) {
  return path.basename(cwd);
}
