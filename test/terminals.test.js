import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openAgentTerminal, sideBySide } from '../src/terminals.js';
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

// Zone utile d'un écran de 2240×1260 points, sous une barre de menus de 30 points.
const SCREEN = { x: 0, y: 30, width: 2240, height: 1230 };
const rect = (x, y, width, height) => ({ x, y, width, height });

test('placement : l’agent se colle à droite de la timeline, bords supérieurs alignés', () => {
  const r = sideBySide(rect(200, 150, 580, 500), rect(40, 60, 580, 456), [SCREEN]);
  assert.deepEqual(r, { timeline: rect(200, 150, 580, 500), agent: rect(788, 150, 580, 456) });
});

test('placement : trop près du bord droit, la paire est décalée vers la gauche', () => {
  const r = sideBySide(rect(1500, 100, 580, 500), rect(0, 0, 700, 400), [SCREEN]);
  assert.deepEqual(r, { timeline: rect(952, 100, 580, 500), agent: rect(1540, 100, 700, 400) });
});

test('placement : écran étroit, l’agent rétrécit, puis chacun prend la moitié', () => {
  const small = { x: 0, y: 25, width: 1280, height: 775 };
  assert.deepEqual(sideBySide(rect(300, 100, 580, 500), rect(0, 0, 900, 400), [small]), {
    timeline: rect(0, 100, 580, 500),
    agent: rect(588, 100, 692, 400),
  });
  const tiny = { x: 0, y: 25, width: 1000, height: 775 };
  assert.deepEqual(sideBySide(rect(300, 100, 700, 500), rect(0, 0, 580, 400), [tiny]), {
    timeline: rect(0, 100, 496, 500),
    agent: rect(504, 100, 496, 400),
  });
});

test('placement : les deux fenêtres restent dans la hauteur utile de l’écran', () => {
  const low = sideBySide(rect(200, 900, 580, 300), rect(0, 0, 580, 600), [SCREEN]);
  assert.deepEqual(low, { timeline: rect(200, 660, 580, 300), agent: rect(788, 660, 580, 600) });
  const tall = sideBySide(rect(200, 400, 580, 500), rect(0, 0, 580, 1500), [SCREEN]);
  assert.deepEqual(tall, { timeline: rect(200, 30, 580, 500), agent: rect(788, 30, 580, 1230) });
});

test('placement : l’écran retenu est celui où se trouve la timeline', () => {
  const second = { x: 2240, y: 0, width: 1920, height: 1080 };
  const r = sideBySide(rect(2400, 100, 580, 500), rect(0, 0, 580, 456), [SCREEN, second]);
  assert.deepEqual(r.agent, rect(2988, 100, 580, 456));
  const lost = sideBySide(rect(9000, 100, 580, 500), rect(0, 0, 580, 456), [SCREEN, second]);
  assert.deepEqual(lost.timeline, rect(1072, 100, 580, 500));
});
