// Ouverture d'un terminal séparé pour l'agent. Chaque terminal est isolé derrière
// la même interface : open(scriptPath, title) -> { ok, name, error? }.
// Ajouter WezTerm, Ghostty ou Linux revient à ajouter une entrée ici.
import { execFileSync } from 'node:child_process';
import { shq } from './adapters/index.js';

function osascript(lines) {
  execFileSync('osascript', lines.flatMap((l) => ['-e', l]), { stdio: ['ignore', 'ignore', 'pipe'], timeout: 15000 });
}

function asStr(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const appleTerminal = {
  name: 'Terminal',
  available: () => process.platform === 'darwin',
  open(script) {
    osascript([
      'tell application "Terminal"',
      `  do script ${asStr(`/bin/sh ${shq(script)}`)}`,
      '  activate',
      'end tell',
    ]);
  },
};

const iterm = {
  name: 'iTerm2',
  available: () => process.platform === 'darwin' && process.env.TERM_PROGRAM === 'iTerm.app',
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

const ORDER = [iterm, appleTerminal];

export function openAgentTerminal(script) {
  const errors = [];
  for (const term of ORDER) {
    if (!term.available()) continue;
    try {
      term.open(script);
      return { ok: true, name: term.name };
    } catch (err) {
      errors.push(`${term.name} : ${String(err.stderr || err.message).trim().split('\n')[0]}`);
    }
  }
  return { ok: false, error: errors.join(' ; ') || `aucun terminal pris en charge sur ${process.platform}` };
}
