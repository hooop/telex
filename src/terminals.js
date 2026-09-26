// Ouverture d'un terminal séparé pour l'agent. Chaque terminal est décrit par
// { id, name, available(ctx), open(script, ctx) } ; open() lève une erreur en cas
// d'échec, et openAgentTerminal essaie les terminaux disponibles dans l'ordre.
// ctx = { cwd, env, platform }, injectable pour les tests.
// Ajouter un terminal revient à ajouter une entrée ici.
import { execFileSync, spawn } from 'node:child_process';
import { shq, which } from './adapters/index.js';

function osascript(lines) {
  execFileSync('osascript', lines.flatMap((l) => ['-e', l]), { stdio: ['ignore', 'ignore', 'pipe'], timeout: 15000 });
}

function asStr(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function run(cmd, args, ctx) {
  execFileSync(cmd, args, { cwd: ctx.cwd, env: ctx.env, stdio: ['ignore', 'ignore', 'pipe'], timeout: 15000 });
}

// Lance un terminal graphique détaché de telex. Échec seulement s'il ne démarre pas
// ou s'il se termine en erreur dans la première seconde.
function launchDetached(cmd, args, ctx) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ctx.cwd, env: ctx.env, detached: true, stdio: 'ignore' });
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.unref();
      fn(value);
    };
    child.on('error', (err) => settle(reject, err));
    child.on('exit', (code) => (code ? settle(reject, new Error(`arrêt immédiat (code ${code})`)) : settle(resolve)));
    const timer = setTimeout(() => settle(resolve), 1000);
  });
}

// Dans tmux : un panneau à droite, quel que soit le système.
const tmux = {
  id: 'tmux',
  name: 'tmux',
  available: (ctx) => Boolean(ctx.env.TMUX) && Boolean(which('tmux', ctx.env.PATH)),
  open: (script, ctx) => run('tmux', ['split-window', '-h', '-c', ctx.cwd, `/bin/sh ${shq(script)}`], ctx),
};

const iterm = {
  id: 'iterm',
  name: 'iTerm2',
  available: (ctx) => ctx.platform === 'darwin' && ctx.env.TERM_PROGRAM === 'iTerm.app',
  open(script) {
    osascript([
      'tell application "iTerm"',
      '  create window with default profile',
      `  tell current session of current window to write text ${asStr(`/bin/sh ${shq(script)}`)}`,
      '  activate',
      'end tell',
    ]);
  },
};

const wezterm = {
  id: 'wezterm',
  name: 'WezTerm',
  available: (ctx) => ctx.env.TERM_PROGRAM === 'WezTerm' && Boolean(which('wezterm', ctx.env.PATH)),
  open: (script, ctx) => run('wezterm', ['cli', 'spawn', '--new-window', '--cwd', ctx.cwd, '--', '/bin/sh', script], ctx),
};

const appleTerminal = {
  id: 'terminal',
  name: 'Terminal',
  available: (ctx) => ctx.platform === 'darwin',
  open(script) {
    osascript([
      'tell application "Terminal"',
      `  do script ${asStr(`/bin/sh ${shq(script)}`)}`,
      '  activate',
      'end tell',
    ]);
  },
};

// Terminaux graphiques Linux : d'abord celui choisi par la distribution
// (x-terminal-emulator), puis les plus courants.
const LINUX_TERMINALS = [
  ['x-terminal-emulator', (s) => ['-e', '/bin/sh', s]],
  ['gnome-terminal', (s) => ['--', '/bin/sh', s]],
  ['konsole', (s) => ['-e', '/bin/sh', s]],
  ['xfce4-terminal', (s) => ['-x', '/bin/sh', s]],
  ['kitty', (s) => ['/bin/sh', s]],
  ['alacritty', (s) => ['-e', '/bin/sh', s]],
  ['foot', (s) => ['/bin/sh', s]],
  ['xterm', (s) => ['-e', '/bin/sh', s]],
].map(([bin, args]) => ({
  id: bin,
  name: bin,
  available: (ctx) => ctx.platform === 'linux' && Boolean(ctx.env.DISPLAY || ctx.env.WAYLAND_DISPLAY) && Boolean(which(bin, ctx.env.PATH)),
  open: (script, ctx) => launchDetached(which(bin, ctx.env.PATH) || bin, args(script), ctx),
}));

export const TERMINALS = [tmux, iterm, wezterm, appleTerminal, ...LINUX_TERMINALS];

// TELEX_TERMINAL peut aussi contenir une commande : elle reçoit le script en $1.
function customTerminal(command) {
  return {
    id: 'custom',
    name: 'TELEX_TERMINAL',
    open: (script, ctx) => launchDetached('/bin/sh', ['-c', command, 'telex', script], ctx),
  };
}

export async function openAgentTerminal(script, { cwd = process.cwd(), env = process.env, platform = process.platform } = {}) {
  const ctx = { cwd, env, platform };
  const choice = (env.TELEX_TERMINAL || '').trim();
  if (choice === 'none') return { ok: false, error: 'ouverture automatique désactivée (TELEX_TERMINAL=none).' };
  const named = TERMINALS.find((t) => t.id === choice.toLowerCase());
  const candidates = !choice ? TERMINALS.filter((t) => t.available(ctx)) : [named ?? customTerminal(choice)];
  const errors = [];
  for (const term of candidates) {
    try {
      await term.open(script, ctx);
      return { ok: true, name: term.name };
    } catch (err) {
      errors.push(`${term.name} : ${String(err.stderr || err.message).trim().split('\n')[0]}`);
    }
  }
  if (!errors.length) {
    return { ok: false, error: `aucun terminal pris en charge n’a été détecté (${platform}).`, hint: 'Choisissez-en un avec la variable TELEX_TERMINAL (voir le README).' };
  }
  const text = errors.join(' ; ');
  const hint = /-1743|not authori[sz]ed|not allowed/i.test(text)
    ? 'macOS bloque le pilotage du terminal : autorisez-le dans Réglages Système › Confidentialité et sécurité › Automatisation, ou choisissez un autre terminal avec TELEX_TERMINAL.'
    : 'Vous pouvez choisir un autre terminal avec la variable TELEX_TERMINAL (voir le README).';
  return { ok: false, error: text, hint };
}
