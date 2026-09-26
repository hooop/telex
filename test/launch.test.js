import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { tempDir, waitFor } from './helpers.js';

const home = tempDir(after, 'telex-launch-');
process.env.TELEX_HOME = home;
const { createSession, readJsonl, readMeta, sessionDir, sessionState } = await import('../src/store.js');
const { ADAPTERS } = await import('../src/adapters/index.js');
const { writeLaunchScript } = await import('../src/cli.js');

// Agent factice : le script lance `sleep 30` à la place du vrai CLI.
const FAKE = { label: 'Faux agent', prepare: () => [] };

function fakeSession() {
  const meta = createSession({ project: 'demo', cwd: home, agent: 'claude' });
  const dir = sessionDir(meta.id);
  return { meta, dir, script: writeLaunchScript(dir, meta, FAKE, '/bin/sleep', ['30']) };
}

async function startDetached(script, dir) {
  const child = spawn('/bin/sh', [script], { detached: true, stdio: 'ignore', env: { ...process.env, TELEX_HOME: home } });
  const exited = new Promise((r) => child.once('exit', r));
  await waitFor(() => fs.readFileSync(path.join(dir, 'agent.pid'), 'utf8').trim() === String(child.pid));
  assert.equal(fs.statSync(path.join(dir, 'agent.pid')).mode & 0o777, 0o600);
  return { child, exited };
}

test('script de lancement : shell valide, vrai CLI, fin de session enregistrée', () => {
  const ids = {};
  for (const id of ['claude', 'codex']) {
    const meta = createSession({ project: "l'appli", cwd: home, agent: id });
    ids[id] = meta.id;
    const dir = sessionDir(meta.id);
    const script = writeLaunchScript(dir, meta, ADAPTERS[id], `/usr/local/bin/${id}`, ['--model', 'x y']);
    execFileSync('/bin/sh', ['-n', script]);
    const text = fs.readFileSync(script, 'utf8');
    assert.match(text, new RegExp(`'/usr/local/bin/${id}' `));
    assert.match(text, /'x y'/);
    assert.match(text, / end '\d{8}-\d{6}-[0-9a-f]{4}' "\$code"/);
    assert.match(text, /^trap : HUP INT TERM$/m);
    assert.ok(text.includes(`export TELEX_HOME='${home}'`));
    assert.equal(fs.statSync(script).mode & 0o777, 0o700);
  }
  const settings = JSON.parse(fs.readFileSync(path.join(sessionDir(ids.claude), 'claude-settings.json'), 'utf8'));
  assert.deepEqual(settings.permissions.allow, ['mcp__telex__timeline']);
  assert.ok(settings.hooks.PostToolUse[0].hooks[0].command.includes(' hook claude'));
});

test('fenêtre fermée (SIGHUP) : l’agent s’arrête et la fin de session est quand même enregistrée', async () => {
  const { meta, dir, script } = fakeSession();
  const { child, exited } = await startDetached(script, dir);
  assert.equal(sessionState(readMeta(dir)), 'live');
  process.kill(-child.pid, 'SIGHUP'); // comme le terminal qui ferme : tout le groupe de processus
  await exited;
  const end = readJsonl(path.join(dir, 'events.jsonl')).find((e) => e.type === 'session_end');
  assert.equal(end.exit_code, 129); // 128 + SIGHUP
  assert.ok(readMeta(dir).ended_at);
  assert.equal(sessionState(readMeta(dir)), 'ended');
  assert.equal(meta.ended_at, null);
});

test('processus tué sans préavis (SIGKILL) : la session est reconnue comme interrompue', async () => {
  const { dir, script } = fakeSession();
  const { child, exited } = await startDetached(script, dir);
  process.kill(-child.pid, 'SIGKILL');
  await exited;
  assert.equal(readMeta(dir).ended_at, null);
  assert.equal(sessionState(readMeta(dir)), 'interrupted');
});

test('consignes de l’utilisateur ajoutées à celles de telex, pour les deux agents', () => {
  fs.writeFileSync(path.join(home, 'instructions.md'), 'Écris les titres en anglais.\n');
  try {
    const meta = createSession({ project: 'demo', cwd: home, agent: 'claude' });
    const claudeArgs = ADAPTERS.claude.prepare(sessionDir(meta.id));
    const prompt = claudeArgs[claudeArgs.indexOf('--append-system-prompt') + 1];
    assert.match(prompt, /^# Timeline telex/);
    assert.match(prompt, /## Consignes supplémentaires de l'utilisateur\n\nÉcris les titres en anglais\.$/);
    const codexArgs = ADAPTERS.codex.prepare(sessionDir(meta.id));
    assert.ok(codexArgs.some((a) => a.startsWith('developer_instructions=') && a.includes('Écris les titres en anglais.')));
  } finally {
    fs.rmSync(path.join(home, 'instructions.md'));
  }
});
