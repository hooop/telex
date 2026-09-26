import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { tempDir, waitFor, writeSession } from './helpers.js';

const home = tempDir(after, 'telex-store-');
process.env.TELEX_HOME = home;
const store = await import('../src/store.js');
const { TelexError } = await import('../src/errors.js');
const { readJsonl, sessionDir } = store;

test('sessionDir refuse tout identifiant qui pourrait sortir du dossier des sessions', () => {
  for (const bad of ['../../victime', '/etc', '20260101-000000-zzzz', '', undefined]) {
    assert.throws(() => sessionDir(bad), (err) => err instanceof TelexError && /identifiant de session invalide/.test(err.message));
  }
  assert.equal(sessionDir('20260101-000000-abcd'), path.join(home, 'sessions', '20260101-000000-abcd'));
});

test('une session illisible est signalée à part et ne bloque pas les autres', () => {
  writeSession(home, '20260102-000000-0001');
  const broken = writeSession(home, '20260102-000000-0002');
  fs.writeFileSync(path.join(broken, 'meta.json'), '{"id": "tronq');
  fs.mkdirSync(path.join(home, 'sessions', 'pas-une-session'));

  const { sessions, broken: bad } = store.scanSessions();
  assert.ok(sessions.some((s) => s.id === '20260102-000000-0001'));
  assert.deepEqual(bad.map((b) => b.id), ['20260102-000000-0002']);
  assert.match(bad[0].reason, /corrompu/);
  assert.throws(() => store.resolveSession('20260102-000000-0002'), /corrompu/);
  store.removeSession('20260102-000000-0002');
});

test('resolveSession : identifiant, préfixe unique, préfixe ambigu, inconnu, last', () => {
  writeSession(home, '20260103-000000-aaaa', { started_at: '2026-09-23T10:00:00.000Z' });
  writeSession(home, '20260103-000000-bbbb', { started_at: '2026-09-23T11:00:00.000Z' });
  assert.equal(store.resolveSession('20260103-000000-aaaa').id, '20260103-000000-aaaa');
  assert.equal(store.resolveSession('20260103-000000-bbbb'.slice(0, 17)).id, '20260103-000000-bbbb');
  assert.throws(() => store.resolveSession('20260103'), /préfixe ambigu/);
  assert.throws(() => store.resolveSession('1999'), /session introuvable/);
  assert.equal(store.resolveSession('last').id, store.listSessions().at(-1).id);
});

test('updateMeta écrit de façon atomique', () => {
  const meta = store.createSession({ project: 'demo', cwd: home, agent: 'codex' });
  const dir = sessionDir(meta.id);
  store.updateMeta(dir, { ended_at: '2026-09-22T12:00:00.000Z' });
  assert.equal(store.readMeta(dir).ended_at, '2026-09-22T12:00:00.000Z');
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
  assert.equal(fs.statSync(path.join(dir, 'meta.json')).mode & 0o777, 0o600);
});

test('état d’une session : en attente, vivante, puis interrompue quand son processus disparaît', async () => {
  const dir = writeSession(home, '20260104-000000-0001');
  const meta = store.readMeta(dir);
  assert.equal(store.sessionState(meta), 'waiting');

  // Un numéro de processus vivant mais qui n'exécute pas le script de la session.
  fs.writeFileSync(path.join(dir, 'agent.pid'), String(process.pid));
  assert.equal(store.sessionState(meta), 'interrupted');

  fs.writeFileSync(path.join(dir, 'launch.sh'), 'sleep 30\n');
  const child = spawn('/bin/sh', [path.join(dir, 'launch.sh')], { stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'agent.pid'), String(child.pid));
  await waitFor(() => store.sessionState(meta) === 'live');

  child.kill('SIGKILL');
  await new Promise((r) => child.once('exit', r));
  const { meta: ended, state } = store.refreshSession(meta);
  assert.equal(state, 'interrupted');
  assert.ok(ended.ended_at && ended.interrupted);
  assert.deepEqual(readJsonl(path.join(dir, 'events.jsonl')).map((e) => [e.type, e.interrupted]), [['session_end', true]]);
  // Déjà close : rien n'est ajouté une seconde fois.
  store.refreshSession(store.readMeta(dir));
  assert.equal(readJsonl(path.join(dir, 'events.jsonl')).length, 1);
});

test('pruneCandidates : anciennes sessions et dossiers illisibles, jamais les récentes', () => {
  const now = Date.parse('2026-09-26T00:00:00.000Z');
  writeSession(home, '20260105-000000-0001', { started_at: '2026-08-01T00:00:00.000Z', ended_at: '2026-08-01T01:00:00.000Z' });
  writeSession(home, '20260105-000000-0002', { started_at: '2026-09-25T00:00:00.000Z', ended_at: '2026-09-25T01:00:00.000Z' });
  const brokenDir = path.join(home, 'sessions', '20260105-000000-0003');
  fs.mkdirSync(brokenDir);
  fs.utimesSync(brokenDir, new Date('2026-08-01'), new Date('2026-08-01'));

  const ids = store.pruneCandidates(30, now).map((s) => s.id);
  assert.ok(ids.includes('20260105-000000-0001'));
  assert.ok(ids.includes('20260105-000000-0003'));
  assert.ok(!ids.includes('20260105-000000-0002'));
  store.removeSession('20260105-000000-0001');
  assert.ok(!fs.existsSync(sessionDir('20260105-000000-0001')));
  assert.throws(() => store.removeSession('20260105-000000-0001'), /session introuvable/);
});
