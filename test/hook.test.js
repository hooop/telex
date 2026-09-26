import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { telex, tempDir } from './helpers.js';
import { readJsonl } from '../src/store.js';

function hook(dir, payload) {
  return telex(['hook', 'claude'], { env: { TELEX_SESSION_DIR: dir }, input: typeof payload === 'string' ? payload : JSON.stringify(payload) });
}

test('hook : commande observée, masquée et débarrassée des séquences de contrôle', (t) => {
  const dir = tempDir(t.after.bind(t));
  const r = hook(dir, {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'mysql -p' + 'x'.repeat(12) + ' -e "select 1"', description: 'Tester la base' },
    tool_response: { stdout: 'ok\n\x1b]52;c;ZWNobyBwd25lZA==\x07fini', stderr: '' },
  });
  assert.equal(r.code, 0);
  const [cmd] = readJsonl(path.join(dir, 'observed.jsonl'));
  assert.equal(cmd.command, 'mysql -p•••• -e "select 1"');
  assert.equal(cmd.ok, true);
  assert.equal(cmd.output_tail, 'ok\nfini');
});

test('hook : échec de commande', (t) => {
  const dir = tempDir(t.after.bind(t));
  hook(dir, { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'npm test' }, error: 'Exit code 1' });
  const [cmd] = readJsonl(path.join(dir, 'observed.jsonl'));
  assert.equal(cmd.ok, false);
  assert.match(cmd.output_tail, /Exit code 1/);
});

test('hook : entrée illisible consignée dans errors.jsonl, jamais d’erreur pour l’agent', (t) => {
  const dir = tempDir(t.after.bind(t));
  const r = hook(dir, '{pas du json');
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const [err] = readJsonl(path.join(dir, 'errors.jsonl'));
  assert.equal(err.source, 'hook Claude Code');
  assert.ok(!fs.existsSync(path.join(dir, 'observed.jsonl')));
});

test('hook : autres outils et absence de session ignorés', (t) => {
  const dir = tempDir(t.after.bind(t));
  hook(dir, { tool_name: 'Edit', tool_input: { file_path: 'a.js' } });
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(telex(['hook', 'claude'], { input: '{}' }).code, 0);
});
