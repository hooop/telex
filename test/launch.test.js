import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('script de lancement : shell valide, vrai CLI, fin de session enregistrée', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'telex-launch-'));
  process.env.TELEX_HOME = path.join(tmp, 'home');
  const { createSession, sessionDir } = await import('../src/store.js');
  const { ADAPTERS } = await import('../src/adapters/index.js');
  const { writeLaunchScript } = await import('../src/cli.js');
  for (const id of ['claude', 'codex']) {
    const meta = createSession({ project: "l'appli", cwd: tmp, agent: id });
    const dir = sessionDir(meta.id);
    const script = writeLaunchScript(dir, meta, ADAPTERS[id], `/usr/local/bin/${id}`, ['--model', 'x y']);
    execFileSync('/bin/sh', ['-n', script]);
    const text = fs.readFileSync(script, 'utf8');
    assert.match(text, new RegExp(`'/usr/local/bin/${id}' `));
    assert.match(text, /'x y'/);
    assert.match(text, / end '\d{8}-\d{6}-[0-9a-f]{4}' "\$code"/);
  }
  const settings = JSON.parse(fs.readFileSync(path.join(sessionDir(fs.readdirSync(path.join(tmp, 'home', 'sessions'))[0]), 'claude-settings.json'), 'utf8'));
  assert.deepEqual(settings.permissions.allow, ['mcp__telex__timeline']);
  assert.ok(settings.hooks.PostToolUse[0].hooks[0].command.includes(' hook claude'));
});
