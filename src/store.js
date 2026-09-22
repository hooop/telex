// Persistance locale des sessions : ~/.telex/sessions/<id>/
//   meta.json     — projet, agent, dates
//   events.jsonl  — événements de timeline (source de vérité, rejouable)
//   observed.jsonl — faits observés (commandes, fichiers) pour les détails
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const TELEX_HOME = process.env.TELEX_HOME || path.join(os.homedir(), '.telex');
export const SESSIONS_DIR = path.join(TELEX_HOME, 'sessions');

export function newSessionId(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${stamp}-${crypto.randomBytes(2).toString('hex')}`;
}

export function sessionDir(id) {
  return path.join(SESSIONS_DIR, id);
}

export function createSession({ project, cwd, agent }) {
  const id = newSessionId();
  const dir = sessionDir(id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const meta = { id, project, cwd, agent, started_at: new Date().toISOString(), ended_at: null };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '', { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'observed.jsonl'), '', { mode: 0o600 });
  return meta;
}

export function readMeta(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
}

export function updateMeta(dir, patch) {
  const meta = { ...readMeta(dir), ...patch };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), { mode: 0o600 });
  return meta;
}

// Une ligne JSON par appel, écrite d'un seul write() en mode append :
// plusieurs processus (serveur MCP, hooks) peuvent écrire sans se marcher dessus.
export function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n', { mode: 0o600 });
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return parseJsonl(fs.readFileSync(file, 'utf8'));
}

export function parseJsonl(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* ligne partielle ignorée */ }
  }
  return out;
}

export function listSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR)
    .filter((id) => fs.existsSync(path.join(SESSIONS_DIR, id, 'meta.json')))
    .map((id) => {
      const dir = sessionDir(id);
      const meta = readMeta(dir);
      const events = readJsonl(path.join(dir, 'events.jsonl'));
      return { ...meta, event_count: events.filter((e) => e.type === 'step').length };
    })
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
}

export function resolveSession(idOrPrefix) {
  const all = listSessions();
  if (!idOrPrefix || idOrPrefix === 'last') return all.at(-1) || null;
  return all.find((s) => s.id === idOrPrefix) || all.filter((s) => s.id.startsWith(idOrPrefix)).at(-1) || null;
}

// Suit un fichier JSONL et appelle onItems pour chaque nouvel objet complet.
export function tailJsonl(file, onItems) {
  let offset = 0;
  let buf = '';
  const read = () => {
    let fd;
    try {
      fd = fs.openSync(file, 'r');
      const size = fs.fstatSync(fd).size;
      if (size < offset) { offset = 0; buf = ''; }
      if (size === offset) return;
      const chunk = Buffer.alloc(size - offset);
      fs.readSync(fd, chunk, 0, chunk.length, offset);
      offset = size;
      buf += chunk.toString('utf8');
      const nl = buf.lastIndexOf('\n');
      if (nl < 0) return;
      const complete = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const items = parseJsonl(complete);
      if (items.length) onItems(items);
    } catch { /* fichier pas encore créé */ } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  };
  read();
  let watcher = null;
  try { watcher = fs.watch(file, read); } catch { /* repli sur le polling */ }
  const timer = setInterval(read, 400);
  return () => { clearInterval(timer); watcher?.close(); };
}
