import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openAgentTerminal } from '../src/terminals.js';
import { tempDir, waitFor } from './helpers.js';

// Faux exécutable qui consigne ses arguments, pour simuler un terminal absent de cette machine.
function fakeBin(dir, name, log) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\n`, { mode: 0o755 });
}

test('TELEX_TERMINAL : commande personnalisée qui reçoit le script en $1', async (t) => {
  const dir = tempDir(t.after.bind(t));
  const out = path.join(dir, 'recu.txt');
  const r = await openAgentTerminal('/chemin/avec espace/launch.sh', { cwd: dir, env: { ...process.env, TELEX_TERMINAL: `printf '%s' "$1" > '${out}'` } });
  assert.deepEqual(r, { ok: true, name: 'TELEX_TERMINAL' });
  assert.equal(await waitFor(() => fs.existsSync(out) && fs.readFileSync(out, 'utf8')), '/chemin/avec espace/launch.sh');
});

test('TELEX_TERMINAL : échec signalé, et « none » désactive l’ouverture', async (t) => {
  const dir = tempDir(t.after.bind(t));
  const failed = await openAgentTerminal('/x/launch.sh', { cwd: dir, env: { ...process.env, TELEX_TERMINAL: 'exit 3' } });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /TELEX_TERMINAL : arrêt immédiat \(code 3\)/);
  const none = await openAgentTerminal('/x/launch.sh', { cwd: dir, env: { TELEX_TERMINAL: 'none' } });
  assert.deepEqual(none, { ok: false, error: 'ouverture automatique désactivée (TELEX_TERMINAL=none).' });
});

test('Linux : un terminal graphique présent dans le PATH est utilisé', async (t) => {
  const dir = tempDir(t.after.bind(t));
  const log = path.join(dir, 'args.txt');
  fakeBin(dir, 'xterm', log);
  const r = await openAgentTerminal('/s/launch.sh', { cwd: dir, platform: 'linux', env: { PATH: dir, DISPLAY: ':0' } });
  assert.deepEqual(r, { ok: true, name: 'xterm' });
  assert.equal(await waitFor(() => fs.existsSync(log) && fs.readFileSync(log, 'utf8')), '-e\n/bin/sh\n/s/launch.sh\n');
});

test('tmux : un panneau s’ouvre à droite, dans le dossier du projet', async (t) => {
  const dir = tempDir(t.after.bind(t));
  const log = path.join(dir, 'args.txt');
  fakeBin(dir, 'tmux', log);
  const r = await openAgentTerminal('/s/launch.sh', { cwd: dir, platform: 'darwin', env: { PATH: dir, TMUX: '/tmp/tmux-1/default,1,0' } });
  assert.deepEqual(r, { ok: true, name: 'tmux' });
  assert.equal(fs.readFileSync(log, 'utf8'), `split-window\n-h\n-c\n${dir}\n/bin/sh '/s/launch.sh'\n`);
});

test('aucun terminal détecté : message et piste', async () => {
  const r = await openAgentTerminal('/s/launch.sh', { platform: 'linux', env: { PATH: '' } });
  assert.equal(r.ok, false);
  assert.match(r.error, /aucun terminal pris en charge n’a été détecté \(linux\)/);
  assert.match(r.hint, /TELEX_TERMINAL/);
});
