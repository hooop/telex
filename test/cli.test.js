import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { telex, tempDir, writeSession } from './helpers.js';

const { version } = createRequire(import.meta.url)('../package.json');
const STEP = { type: 'step', ts: '2026-09-22T10:00:00.000Z', source: 'claude', event: 'start', step_id: 'a', feature_id: 'a' };

test('--version affiche la version de package.json', () => {
  assert.equal(telex(['--version']).stdout.trim(), version);
});

test('commande inconnue : message d’une ligne, piste, code 2, sans trace de pile', (t) => {
  const r = telex(['nimporte'], { home: tempDir(t.after.bind(t)) });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /^telex : commande inconnue : nimporte\nVoir l’aide : telex --help\n$/);
});

test('erreur inattendue : message clair, trace seulement avec TELEX_DEBUG=1', (t) => {
  const home = tempDir(t.after.bind(t));
  const dir = writeSession(home, '20260110-000000-0001');
  fs.rmSync(path.join(dir, 'events.jsonl'));
  fs.mkdirSync(path.join(dir, 'events.jsonl')); // lecture impossible : c'est un dossier
  const r = telex(['replay', 'last', '--print'], { home });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /^telex : erreur inattendue : .*EISDIR/);
  assert.match(r.stderr, /TELEX_DEBUG=1/);
  assert.ok(!/\n\s+at /.test(r.stderr));
  assert.match(telex(['replay', 'last', '--print'], { home, env: { TELEX_DEBUG: '1' } }).stderr, /\n\s+at /);
});

test('end refuse un identifiant qui sort du dossier des sessions', (t) => {
  const home = tempDir(t.after.bind(t));
  const victim = path.join(home, 'victime');
  fs.mkdirSync(victim);
  const r = telex(['end', '../../victime', '0'], { home });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /identifiant de session invalide/);
  assert.deepEqual(fs.readdirSync(victim), []);
});

test('sessions : liste les sessions lisibles et signale les autres', (t) => {
  const home = tempDir(t.after.bind(t));
  writeSession(home, '20260110-000000-0001', { ended_at: '2026-09-22T11:00:00.000Z' }, [{ ...STEP, title: 'Ajouter la route' }]);
  fs.writeFileSync(path.join(writeSession(home, '20260110-000000-0002'), 'meta.json'), '{');
  const r = telex(['sessions'], { home });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /20260110-000000-0001 .* demo .*Claude Code · 1 ligne/);
  assert.match(r.stdout, /⚠ 20260110-000000-0002 {2}ignorée : session 20260110-000000-0002 illisible/);
  assert.equal(telex(['sessions'], { home: tempDir(t.after.bind(t)) }).stdout.trim(), 'Aucune session enregistrée.');
});

test('replay --print : timeline en texte, sans séquence d’échappement venue de l’agent', (t) => {
  const home = tempDir(t.after.bind(t));
  writeSession(home, '20260110-000000-0001', { ended_at: '2026-09-22T11:00:00.000Z' }, [
    { ...STEP, title: 'Ajouter\x1b]0;piège\x07 la route' },
    { type: 'session_end', ts: '2026-09-22T11:00:00.000Z', exit_code: 0 },
  ]);
  const r = telex(['replay', '20260110', '--print'], { home });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /●\s{2}Ajouter la route/);
  assert.match(r.stdout, /SESSION TERMINÉE/);
  assert.ok(!r.stdout.includes('\x1b'));
  assert.match(telex(['replay', 'inconnue', '--print'], { home }).stderr, /session introuvable : inconnue\nVoir la liste : telex sessions/);
});

test('rm et prune : suppression explicite, purge confirmée par --yes', (t) => {
  const home = tempDir(t.after.bind(t));
  writeSession(home, '20260110-000000-0001', { started_at: '2020-01-01T00:00:00.000Z', ended_at: '2020-01-01T01:00:00.000Z' });
  writeSession(home, '20260110-000000-0002', { started_at: new Date().toISOString(), ended_at: new Date().toISOString() });
  writeSession(home, '20260110-000000-0003', { started_at: new Date().toISOString(), ended_at: new Date().toISOString() });
  const sessions = path.join(home, 'sessions');

  const dry = telex(['prune'], { home });
  assert.match(dry.stdout, /20260110-000000-0001/);
  assert.match(dry.stdout, /telex prune 30 --yes/);
  assert.equal(fs.readdirSync(sessions).length, 3);

  assert.match(telex(['prune', '30', '--yes'], { home }).stdout, /1 session supprimée/);
  assert.deepEqual(fs.readdirSync(sessions).sort(), ['20260110-000000-0002', '20260110-000000-0003']);

  assert.match(telex(['rm', '20260110-000000-0002'], { home }).stdout, /Session 20260110-000000-0002 supprimée/);
  assert.match(telex(['rm'], { home }).stderr, /précisez la session à supprimer/);
  assert.match(telex(['prune', 'abc'], { home }).stderr, /nombre de jours invalide/);
});

test('run refuse une session terminée', (t) => {
  const home = tempDir(t.after.bind(t));
  writeSession(home, '20260110-000000-0001', { ended_at: '2026-09-22T11:00:00.000Z' });
  const r = telex(['run', '20260110-000000-0001'], { home });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /la session 20260110-000000-0001 est terminée/);
});
