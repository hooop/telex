import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tempDir } from './helpers.js';
import { MAX_FILE_BYTES, Workspace } from '../src/workspace.js';

function setup(t) {
  const root = tempDir(t.after.bind(t));
  const proj = path.join(root, 'proj');
  const session = path.join(root, 'session');
  fs.mkdirSync(proj);
  fs.mkdirSync(session);
  return { proj, session, ws: new Workspace(session, proj).init() };
}

const write = (proj, file, content) => {
  fs.mkdirSync(path.dirname(path.join(proj, file)), { recursive: true });
  fs.writeFileSync(path.join(proj, file), content);
};
const filesIn = (ws, tree) => ws.git(['ls-tree', '-r', '--name-only', tree]).split('\n').filter(Boolean);
const biggestObject = (ws) => Math.max(0, ...ws.git(['cat-file', '--batch-all-objects', '--batch-check=%(objectsize)']).split('\n').filter(Boolean).map(Number));

test('instantanés : un gros fichier n’est jamais copié dans le dépôt fantôme', (t) => {
  const { proj, ws } = setup(t);
  write(proj, 'a.js', 'export const a = 1;\n');
  write(proj, 'data.bin', crypto.randomBytes(MAX_FILE_BYTES + 1));
  const first = ws.snapshot();
  assert.deepEqual(filesIn(ws, first), ['a.js']);

  // Un fichier suivi qui grossit est retiré de l'instantané, sans être copié non plus.
  write(proj, 'a.js', crypto.randomBytes(MAX_FILE_BYTES + 1));
  write(proj, 'b.js', 'export const b = 2;\n');
  const second = ws.snapshot();
  assert.deepEqual(filesIn(ws, second), ['b.js']);
  assert.ok(biggestObject(ws) < MAX_FILE_BYTES);
});

test('instantanés : les fichiers sensibles sont exclus', (t) => {
  const { proj, ws } = setup(t);
  for (const f of ['.env', '.env.local', '.aws/credentials', '.ssh/config', 'credentials', 'secrets.yaml',
    'id_ecdsa', 'prod.tfvars', 'server.key', 'keystore.jks', 'service-account-prod.json']) write(proj, f, 'secret\n');
  write(proj, '.env.example', 'API_KEY=\n');
  write(proj, 'src/index.js', 'console.log(1);\n');
  assert.deepEqual(filesIn(ws, ws.snapshot()).sort(), ['.env.example', 'src/index.js']);
});

test('instantanés : le dépôt fantôme n’est lisible que par son propriétaire', (t) => {
  const { proj, session, ws } = setup(t);
  write(proj, 'a.js', 'x\n');
  ws.snapshot();
  const open = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (fs.statSync(p).mode & 0o077) open.push(p);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(path.join(session, 'shadow.git'));
  assert.deepEqual(open, []);
});

test('instantanés : sans git, la raison est expliquée au lieu d’être ignorée', (t) => {
  const root = tempDir(t.after.bind(t));
  const savedPath = process.env.PATH;
  process.env.PATH = root; // un dossier vide : git y est introuvable
  try {
    const ws = new Workspace(root, root).init();
    assert.equal(ws.available, false);
    assert.match(ws.error.message, /git introuvable/);
    assert.equal(ws.snapshot(), null);
  } finally {
    process.env.PATH = savedPath;
  }
  assert.ok(execFileSync('git', ['--version'], { encoding: 'utf8' }).startsWith('git version'));
});
