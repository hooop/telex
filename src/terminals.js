// Ouverture d'un terminal séparé pour l'agent. Chaque terminal est décrit par
// { id, name, available(ctx), open(script, ctx), arrange?(opened, ctx) } ; open() lève
// une erreur en cas d'échec, et openAgentTerminal essaie les terminaux disponibles dans
// l'ordre. arrange(), facultatif, place les fenêtres à partir de ce que open() a renvoyé.
// ctx = { cwd, env, platform }, injectable pour les tests.
// Ajouter un terminal revient à ajouter une entrée ici.
import { execFileSync, spawn } from 'node:child_process';
import { shq, which } from './adapters/index.js';

function osascript(lines) {
  return execFileSync('osascript', lines.flatMap((l) => ['-e', l]), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
}

// Script JavaScript for Automation : les arguments arrivent dans run(argv).
function jxa(source, args) {
  return execFileSync('osascript', ['-l', 'JavaScript', '-e', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
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

// Placement côte à côte : la timeline reste où elle est, l'agent se colle à sa droite,
// bords supérieurs alignés, chacun garde sa taille. Si la paire dépasse de l'écran, elle
// est décalée, puis l'agent rétréci ; sur un écran trop étroit, chacun en prend la moitié.
// Rectangles { x, y, width, height } en points, origine en haut à gauche de l'écran
// principal ; les écrans sont leurs zones utiles (sans barre de menus ni Dock).
export const WINDOW_GAP = 8;
const MIN_AGENT_WIDTH = 400;

export function sideBySide(timeline, agent, screens) {
  const cx = timeline.x + timeline.width / 2;
  const cy = timeline.y + timeline.height / 2;
  const screen = screens.find((s) => cx >= s.x && cx < s.x + s.width && cy >= s.y && cy < s.y + s.height) ?? screens[0];
  let left = timeline.width;
  let right = Math.min(agent.width, screen.width - left - WINDOW_GAP);
  if (right < MIN_AGENT_WIDTH) left = right = Math.floor((screen.width - WINDOW_GAP) / 2);
  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
  const fit = (h) => Math.min(h, screen.height);
  const x = clamp(timeline.x, screen.x, screen.x + screen.width - (left + WINDOW_GAP + right));
  const y = clamp(timeline.y, screen.y, screen.y + screen.height - fit(Math.max(timeline.height, agent.height)));
  return {
    timeline: { x, y, width: left, height: fit(timeline.height) },
    agent: { x: x + left + WINDOW_GAP, y, width: right, height: fit(agent.height) },
  };
}

// Zones utiles des écrans et fenêtres de Terminal.app qui contiennent les terminaux
// (tty) donnés. Cocoa compte y depuis le bas de l'écran principal : on le retourne.
const READ_TERMINAL_WINDOWS = `function run(ttys) {
  ObjC.import('AppKit');
  const all = $.NSScreen.screens, height = all.objectAtIndex(0).frame.size.height, screens = [];
  for (let i = 0; i < all.count; i++) {
    const f = all.objectAtIndex(i).visibleFrame;
    screens.push({ x: f.origin.x, y: height - f.origin.y - f.size.height, width: f.size.width, height: f.size.height });
  }
  const windows = Application('Terminal').windows();
  const find = (tty) => { const w = windows.find((w) => w.tabs.tty().includes(tty)); return w ? { id: w.id(), ...w.bounds() } : null; };
  return JSON.stringify({ screens, found: ttys.map(find) });
}`;

const MOVE_TERMINAL_WINDOWS = `function run([json]) {
  const windows = Application('Terminal').windows;
  for (const { id, ...bounds } of JSON.parse(json)) windows.byId(id).bounds = bounds;
}`;

// Terminal où tourne la timeline (/dev/ttys003), ou null hors d'un terminal.
function ownTty() {
  try {
    return execFileSync('tty', { encoding: 'utf8', stdio: ['inherit', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// Sans effet si la timeline ne tourne pas dans une fenêtre de Terminal.app, ou si les
// deux partagent la même fenêtre.
function arrangeTerminalWindows(agentTty) {
  const timelineTty = ownTty();
  if (!timelineTty || !agentTty) return;
  const { screens, found: [timeline, agent] } = JSON.parse(jxa(READ_TERMINAL_WINDOWS, [timelineTty, agentTty]));
  if (!timeline || !agent || timeline.id === agent.id) return;
  const next = sideBySide(timeline, agent, screens);
  jxa(MOVE_TERMINAL_WINDOWS, [JSON.stringify([{ id: timeline.id, ...next.timeline }, { id: agent.id, ...next.agent }])]);
}

const appleTerminal = {
  id: 'terminal',
  name: 'Terminal',
  available: (ctx) => ctx.platform === 'darwin',
  // Renvoie le terminal (tty) de la nouvelle fenêtre, pour la placer ensuite.
  open(script) {
    return osascript([
      'tell application "Terminal"',
      `  set agentTab to do script ${asStr(`/bin/sh ${shq(script)}`)}`,
      '  activate',
      '  return tty of agentTab',
      'end tell',
    ]).trim();
  },
  arrange: arrangeTerminalWindows,
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
      const opened = await term.open(script, ctx);
      if (term.arrange && env.TELEX_LAYOUT !== 'none') {
        try {
          term.arrange(opened, ctx);
        } catch {
          // Le placement est un confort : l'agent est ouvert, on n'en fait pas un échec.
        }
      }
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
