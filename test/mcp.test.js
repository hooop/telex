import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const BIN = new URL('../bin/telex.js', import.meta.url).pathname;

function rpc(child) {
  let buf = '';
  const waiting = new Map();
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      waiting.get(msg.id)?.(msg);
    }
  });
  let n = 0;
  return (method, params) => new Promise((resolve) => {
    const id = ++n;
    waiting.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

test('serveur MCP : outil timeline, événement écrit, secrets masqués, fichiers suivis', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'telex-test-'));
  const home = path.join(tmp, 'home');
  const proj = path.join(tmp, 'proj');
  fs.mkdirSync(proj);
  execFileSync('git', ['init', '-q'], { cwd: proj });
  fs.writeFileSync(path.join(proj, 'a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(proj, '.env'), 'SECRET_TOKEN=abcdef123456\n');
  const env = { ...process.env, TELEX_HOME: home };
  process.env.TELEX_HOME = home;
  const { createSession, sessionDir, readJsonl } = await import('../src/store.js');
  const meta = createSession({ project: 'proj', cwd: proj, agent: 'claude' });
  const dir = sessionDir(meta.id);

  const child = spawn(process.execPath, [BIN, 'mcp'], { env: { ...env, TELEX_SESSION_DIR: dir, TELEX_AGENT: 'claude' } });
  const call = rpc(child);
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'telex');
  const list = await call('tools/list', {});
  assert.deepEqual(list.result.tools.map((t) => t.name), ['timeline']);

  await call('tools/call', { name: 'timeline', arguments: { event: 'start', step_id: 's1', title: 'Ajouter b', narrative: 'Clé API_KEY=sk-abcdefghijklmnopqrstuv' } });
  fs.writeFileSync(path.join(proj, 'b.js'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(proj, '.env'), 'SECRET_TOKEN=changed999999\n');
  const done = await call('tools/call', { name: 'timeline', arguments: { event: 'complete', step_id: 's1', title: 'Ajouter b' } });
  assert.equal(done.result.isError, false);
  const bad = await call('tools/call', { name: 'timeline', arguments: { event: 'oops', step_id: 's1', title: 'x' } });
  assert.equal(bad.result.isError, true);
  child.kill();

  const events = readJsonl(path.join(dir, 'events.jsonl'));
  assert.equal(events.length, 2);
  assert.equal(events[0].narrative, 'Clé API_KEY=••••');
  assert.ok(events[0].tree && events[1].tree && events[0].tree !== events[1].tree);

  const { Workspace } = await import('../src/workspace.js');
  const ws = new Workspace(dir, proj);
  assert.deepEqual(ws.changes(events[0].tree, events[1].tree), [{ status: 'A', path: 'b.js' }]);
  assert.ok(!ws.diff(events[0].tree, events[1].tree).includes('SECRET_TOKEN'));
  // le dépôt de l'utilisateur n'est pas touché
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: proj, encoding: 'utf8' }).split('\n').filter(Boolean).length, 3);
  assert.equal(execFileSync('git', ['rev-list', '--all'], { cwd: proj, encoding: 'utf8' }).trim(), '');
});
