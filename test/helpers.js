// Outils communs aux tests : dossiers temporaires nettoyés, exécution du CLI, attente.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const BIN = fileURLToPath(new URL('../bin/telex.js', import.meta.url));

// Dossier temporaire supprimé à la fin du test (ou du fichier, avec `after`).
export function tempDir(cleanup, prefix = 'telex-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  cleanup(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function telex(args, { home, env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    env: { ...process.env, TELEX_HOME: home, TELEX_DEBUG: '', TELEX_TERMINAL: '', ...env },
    input,
    encoding: 'utf8',
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Session écrite à la main, avec un identifiant choisi.
export function writeSession(home, id, meta = {}, events = []) {
  const dir = path.join(home, 'sessions', id);
  fs.mkdirSync(dir, { recursive: true });
  const full = { id, project: 'demo', cwd: home, agent: 'claude', started_at: '2026-09-22T10:00:00.000Z', ended_at: null, ...meta };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(full));
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events.map((e) => JSON.stringify(e) + '\n').join(''));
  fs.writeFileSync(path.join(dir, 'observed.jsonl'), '');
  return dir;
}

export async function waitFor(check, { timeout = 5000, every = 25 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('délai dépassé en attendant une condition');
    await new Promise((r) => setTimeout(r, every));
  }
}
