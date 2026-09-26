import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { BIN, tempDir } from './helpers.js';

const home = tempDir(after, 'telex-mcp-');
process.env.TELEX_HOME = home;
const { createSession, sessionDir, readJsonl } = await import('../src/store.js');

// Client JSON-RPC minimal : une promesse par identifiant, et les réponses sans identifiant à part.
function startServer(sessionDirPath) {
  const child = spawn(process.execPath, [BIN, 'mcp'], { env: { ...process.env, TELEX_HOME: home, TELEX_SESSION_DIR: sessionDirPath, TELEX_AGENT: 'claude' } });
  let buf = '';
  const waiting = new Map();
  const orphans = [];
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id === null) orphans.push(msg);
      else waiting.get(msg.id)?.(msg);
    }
  });
  let n = 0;
  const call = (method, params) => new Promise((resolve) => {
    const id = ++n;
    waiting.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const raw = (line) => child.stdin.write(line + '\n');
  return { child, call, raw, orphans };
}

const timeline = (args) => ({ name: 'timeline', arguments: { feature_id: 'f', ...args } });

test('serveur MCP : outil timeline, événement écrit, secrets masqués, fichiers suivis', async () => {
  const proj = path.join(home, 'proj');
  fs.mkdirSync(proj);
  execFileSync('git', ['init', '-q'], { cwd: proj });
  fs.writeFileSync(path.join(proj, 'a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(proj, '.env'), 'SECRET_TOKEN=' + 'x'.repeat(12) + '\n'); // valeurs factices, construites à l'exécution
  const meta = createSession({ project: 'proj', cwd: proj, agent: 'claude' });
  const dir = sessionDir(meta.id);

  const { child, call } = startServer(dir);
  const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'telex');
  assert.equal(init.result.protocolVersion, '2025-06-18');
  const list = await call('tools/list', {});
  assert.deepEqual(list.result.tools.map((t) => t.name), ['timeline']);

  await call('tools/call', timeline({ event: 'start', step_id: 's1', title: 'Ajouter b\x1b]0;piège\x07', narrative: 'Clé API_KEY=' + 'sk-' + 'x'.repeat(20) }));
  fs.writeFileSync(path.join(proj, 'b.js'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(proj, '.env'), 'SECRET_TOKEN=' + 'y'.repeat(12) + '\n');
  const done = await call('tools/call', timeline({ event: 'complete', step_id: 's1', title: 'Ajouter b' }));
  assert.equal(done.result.isError, false);
  const bad = await call('tools/call', timeline({ event: 'oops', step_id: 's1', title: 'x' }));
  assert.equal(bad.result.isError, true);
  child.kill();

  const events = readJsonl(path.join(dir, 'events.jsonl'));
  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'Ajouter b');
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

test('serveur MCP : une erreur est renvoyée à l’agent et consignée, le serveur continue', async () => {
  // Session sans meta.json : l'instantané échoue mais la ligne est tout de même écrite.
  const dir = path.join(home, 'sans-meta');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '');
  const { child, call, raw, orphans } = startServer(dir);

  const ok = await call('tools/call', timeline({ event: 'start', step_id: 'a', title: 'A' }));
  assert.equal(ok.result.isError, false);
  assert.equal(readJsonl(path.join(dir, 'events.jsonl'))[0].tree, null);
  assert.equal(readJsonl(path.join(dir, 'errors.jsonl'))[0].source, 'instantanés');

  raw('{pas du json');
  assert.deepEqual((await call('ping', {})).result, {});
  assert.equal(orphans[0].error.code, -32700);

  // Session supprimée pendant que l'agent tourne.
  fs.rmSync(dir, { recursive: true });
  const gone = await call('tools/call', timeline({ event: 'complete', step_id: 'a', title: 'A' }));
  assert.equal(gone.result.isError, true);
  assert.match(gone.result.content[0].text, /la session n’existe plus/);
  assert.deepEqual((await call('ping', {})).result, {});
  child.kill();
});

test('serveur MCP : négociation de la version du protocole', async () => {
  const { child, call } = startServer(path.join(home, 'inutile'));
  assert.equal((await call('initialize', { protocolVersion: '2025-03-26' })).result.protocolVersion, '2025-03-26');
  assert.equal((await call('initialize', { protocolVersion: '2099-01-01' })).result.protocolVersion, '2025-11-25');
  assert.equal((await call('inconnue', {})).error.code, -32601);
  child.kill();
});
