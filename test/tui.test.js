import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { tempDir, waitFor, writeSession } from './helpers.js';

const home = tempDir(after, 'telex-tui-');
process.env.TELEX_HOME = home;
const { runTui } = await import('../src/tui.js');

const STEP = { type: 'step', source: 'claude', feature_id: 'f' };

// Faux terminal : on garde tout ce qui est écrit, et on envoie des touches.
function fakeTerminal() {
  const writes = [];
  const output = new Writable({ write(chunk, enc, done) { writes.push(String(chunk)); done(); } });
  output.columns = 100;
  output.rows = 30;
  const input = new PassThrough();
  return { input, output, screen: () => writes.join(''), last: () => writes.at(-1) || '' };
}

function start(t, dir, extra = {}) {
  const term = fakeTerminal();
  let quit = false;
  const ui = runTui(dir, { input: term.input, output: term.output, onQuit: () => { quit = true; }, ...extra });
  t.after(() => ui.quit()); // même si le test échoue, l'interface est fermée
  return { ...term, press: (k) => term.input.write(k), quitted: () => quit };
}

test('interface : timeline, vue tests, sorties de commandes nettoyées, et terminal restauré en quittant', async (t) => {
  const dir = writeSession(home, '20260120-000000-0001', { ended_at: '2026-09-22T10:05:00.000Z' }, [
    { ...STEP, ts: '2026-09-22T10:00:00.000Z', event: 'start', step_id: 'f', title: 'Ajouter le panier' },
    { ...STEP, ts: '2026-09-22T10:01:00.000Z', event: 'start', step_id: 't', title: 'Tester\x1b]0;piège\x07 le panier' },
    { ...STEP, ts: '2026-09-22T10:02:00.000Z', event: 'validate', step_id: 't', title: 'Tester le panier', narrative: '7 tests passent' },
    { type: 'session_end', ts: '2026-09-22T10:05:00.000Z', exit_code: 0 },
  ]);
  fs.writeFileSync(path.join(dir, 'observed.jsonl'), JSON.stringify({
    type: 'command', ts: '2026-09-22T10:01:30.000Z', command: 'npm test', ok: true, output_tail: '\x1b]52;c;cGnDqGdl\x07# pass 7',
  }) + '\n');
  const listeners = process.listenerCount('uncaughtException');
  const ui = start(t, dir);

  await waitFor(() => ui.screen().includes('Tester le panier'));
  assert.match(ui.screen(), /SESSION TERMINÉE/);
  assert.match(ui.screen(), /Bilan : 0 étape réalisée · 1 vérification exécutée · 1 non terminée/);
  ui.press('t');
  await waitFor(() => ui.screen().includes('# pass 7'));
  assert.ok(!ui.screen().includes('\x1b]'));
  ui.press('\x1b');
  ui.press('q');
  await waitFor(() => ui.quitted());
  assert.ok(ui.last().includes('\x1b[?1049l'));
  assert.equal(process.listenerCount('uncaughtException'), listeners);
});

test('interface : les erreurs internes de telex s’affichent en bas de l’écran', async (t) => {
  const dir = writeSession(home, '20260120-000000-0002', { ended_at: '2026-09-22T10:05:00.000Z' });
  const ui = start(t, dir, { notice: 'git introuvable : les fichiers et le diff par étape seront indisponibles.' });
  await waitFor(() => ui.screen().includes('⚠ git introuvable'));
  fs.writeFileSync(path.join(dir, 'errors.jsonl'), JSON.stringify({ type: 'error', ts: '2026-09-22T10:00:00.000Z', source: 'hook Claude Code', message: 'boom' }) + '\n');
  await waitFor(() => ui.screen().includes('⚠ erreur telex (hook Claude Code) : boom'));
  ui.press('q');
  await waitFor(() => ui.quitted());
});

test('interface : une session dont l’agent a disparu passe en « interrompue »', async (t) => {
  const dir = writeSession(home, '20260120-000000-0003');
  const gone = spawn('/bin/sh', ['-c', 'exit 0']); // un processus déjà terminé
  await new Promise((r) => gone.once('exit', r));
  fs.writeFileSync(path.join(dir, 'agent.pid'), String(gone.pid));
  const ui = start(t, dir);
  await waitFor(() => ui.screen().includes('SESSION INTERROMPUE'), { timeout: 6000 });
  ui.press('q');
  await waitFor(() => ui.quitted());
});
