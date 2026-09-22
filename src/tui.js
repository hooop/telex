// Interface interactive de la timeline (terminal, sans dépendance).
import path from 'node:path';
import { readMeta, tailJsonl } from './store.js';
import { annotate, buildTimeline, isTestOrBuild, observedFor } from './timeline.js';
import { Workspace } from './workspace.js';
import { redact } from './redact.js';
import { clock, entryLines, footerSummary, header, style as s, visibleLength, wrap } from './render.js';
import { SYMBOL } from './timeline.js';

const KEYS_TIMELINE = '[↑↓] naviguer   [Entrée] détails   [D] diff   [T] tests   [Q] quitter';
const KEYS_VIEW = '[↑↓] défiler   [Échap] retour   [D] diff   [T] tests   [Entrée] détails';

const STATUS_LABEL = { running: 'en cours', done: 'réalisée', validated: 'vérification exécutée', failed: 'erreur', replaced: 'approche remplacée' };
const AGENT_LABEL = { claude: 'Claude Code', codex: 'Codex' };

export function runTui(sessionDir, { onQuit } = {}) {
  const out = process.stdout;
  const stdin = process.stdin;
  let meta = readMeta(sessionDir);
  let events = [];
  let observed = [];
  let timeline = { entries: [], session: { ended_at: meta.ended_at } };
  let selected = -1;
  let follow = true;
  let unseen = 0;
  let view = 'timeline';
  let viewScroll = 0;
  let showRaw = false;
  let workspace = null;
  const diffCache = new Map();

  const ws = () => (workspace ??= new Workspace(sessionDir, meta.cwd));

  function rebuild() {
    const before = timeline.entries.length;
    timeline = buildTimeline(events);
    annotate(timeline.entries, observed);
    const after = timeline.entries.length;
    if (follow) selected = after - 1;
    else if (after > before) unseen += after - before;
    if (timeline.session.ended_at) { try { meta = readMeta(sessionDir); } catch { /* ignore */ } }
  }

  // ─── Vues ────────────────────────────────────────────────────────────────

  function timelineRows(width) {
    const rows = [];
    const starts = [];
    timeline.entries.forEach((entry, i) => {
      if (i) rows.push('');
      starts.push(rows.length);
      const lines = entryLines(entry, width - 2);
      lines.forEach((l, j) => rows.push((i === selected && (j === 0) ? `${s.amber}›${s.reset} ` : '  ') + l));
      starts[i] = [starts[i], rows.length - 1];
    });
    return { rows, starts };
  }

  function entryFiles(entry) {
    const to = entry.end_tree || latestTreeAfter(entry);
    if (!entry.start_tree && entry.status !== 'validated') return null;
    const from = entry.status === 'validated' ? previousTree(entry) : entry.start_tree;
    return { from, to, changes: from && to ? ws().changes(from, to) : null };
  }

  function latestTreeAfter(entry) {
    // Étape en cours : on compare au dernier instantané connu.
    const t = Date.parse(entry.ts);
    const later = events.filter((e) => e.tree && Date.parse(e.ts) > t);
    return later.at(-1)?.tree || null;
  }

  function previousTree(entry) {
    const t = Date.parse(entry.ts);
    const prev = events.filter((e) => e.tree && Date.parse(e.ts) < t);
    return prev.at(-1)?.tree || null;
  }

  function detailRows(entry, width) {
    const w = width - 4;
    const rows = [];
    const sec = (title) => { rows.push('', `${s.bold}${title}${s.reset}`); };
    const color = { running: s.amber, done: s.green, validated: s.green, failed: s.red, replaced: s.gray }[entry.status];
    rows.push(...wrap(entry.title, w).map((l) => `${s.bold}${l}${s.reset}`));
    let when = `${color}${SYMBOL[entry.status]} ${STATUS_LABEL[entry.status]}${s.reset}   ${s.dim}début${s.reset} ${clock(entry.ts)}`;
    if (entry.end_ts && entry.status !== 'validated') {
      const secs = Math.round((Date.parse(entry.end_ts) - Date.parse(entry.ts)) / 1000);
      when += `   ${s.dim}fin${s.reset} ${clock(entry.end_ts)}   ${s.dim}(${duration(secs)})${s.reset}`;
    }
    rows.push(when);
    if (entry.narrative) rows.push('', ...wrap(entry.narrative, w));
    if (entry.technical_detail) { sec('Technique'); rows.push(...wrap(entry.technical_detail, w).map((l) => `${s.gray}${l}${s.reset}`)); }

    sec('Fichiers concernés');
    const files = entryFiles(entry);
    if (!files || !files.to) {
      rows.push(`${s.dim}${entry.status === 'running' ? 'Étape en cours : les fichiers seront comparés à sa fin.' : 'Instantané indisponible pour cette étape.'}${s.reset}`);
    } else if (!files.changes?.length) {
      rows.push(`${s.dim}Aucun fichier modifié ${entry.status === 'validated' ? 'depuis l’événement précédent' : 'entre le début et la fin de l’étape'}.${s.reset}`);
    } else {
      const label = { A: 'ajouté  ', M: 'modifié ', D: 'supprimé' };
      for (const c of files.changes) rows.push(`${s.dim}${label[c.status[0]] || c.status}${s.reset}  ${c.path}`);
    }

    const cmds = observedFor(entry, observed, timeline.entries);
    sec('Commandes observées');
    if (meta.agent === 'codex') rows.push(`${s.dim}Non disponibles avec Codex dans cette version : seul le récit de l’agent et les fichiers sont observés.${s.reset}`);
    else if (!cmds.length) rows.push(`${s.dim}Aucune commande shell observée pendant cette étape.${s.reset}`);
    else for (const c of cmds) rows.push(...commandLine(c, w, false));

    if (entry.evidence?.length) {
      sec('Preuves citées par l’agent');
      for (const e of entry.evidence) rows.push(...wrap(`· ${e}`, w));
    }

    sec('Origine');
    const agent = AGENT_LABEL[entry.source] || entry.source;
    rows.push(...wrap(`Titre et récit : écrits par ${agent} via l’outil timeline. Fichiers : instantanés pris par telex à chaque événement.${meta.agent === 'claude' ? ' Commandes : hook PostToolUse de Claude Code.' : ''}`, w).map((l) => `${s.dim}${l}${s.reset}`));

    sec(`Événements bruts ${s.dim}[R] ${showRaw ? 'masquer' : 'afficher'}${s.reset}`);
    if (showRaw) {
      for (const u of entry.updates) {
        const { tree, ...rest } = u;
        rows.push(...wrap(JSON.stringify(rest), w).map((l) => `${s.gray}${l}${s.reset}`));
      }
    }
    return rows;
  }

  function commandLine(c, w, withOutput) {
    const mark = c.ok ? `${s.green}✓${s.reset}` : `${s.red}✕${s.reset}`;
    const rows = wrap(c.command, w - 13).map((l, i) => (i ? ' '.repeat(13) : `${s.gray}${clock(c.ts)}${s.reset}  ${mark}  `) + l);
    if (withOutput && c.output_tail) {
      const tail = c.output_tail.split('\n').filter((l) => l.trim()).slice(-12);
      for (const l of tail) rows.push(`${' '.repeat(13)}${s.gray}${[...l].slice(0, w - 13).join('')}${s.reset}`);
      rows.push('');
    }
    return rows;
  }

  function diffRows(entry, width) {
    const files = entryFiles(entry);
    const rows = [`${s.bold}Diff : ${entry.title}${s.reset}`, ''];
    if (!files?.from || !files?.to) {
      rows.push(`${s.dim}${entry.status === 'running' ? 'Étape en cours : le diff sera disponible à sa fin.' : 'Instantané indisponible pour cette étape.'}${s.reset}`);
      return rows;
    }
    const key = `${files.from}..${files.to}`;
    if (!diffCache.has(key)) diffCache.set(key, redact(ws().diff(files.from, files.to)));
    const diff = diffCache.get(key);
    if (!diff.trim()) { rows.push(`${s.dim}Aucune modification de fichier pendant cette étape.${s.reset}`); return rows; }
    for (const l of diff.split('\n')) {
      const t = [...l].slice(0, width - 1).join('');
      if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') || l.startsWith('index ')) rows.push(`${s.bold}${t}${s.reset}`);
      else if (l.startsWith('+')) rows.push(`${s.green}${t}${s.reset}`);
      else if (l.startsWith('-')) rows.push(`${s.red}${t}${s.reset}`);
      else if (l.startsWith('@@')) rows.push(`${s.cyan}${t}${s.reset}`);
      else rows.push(t);
    }
    return rows;
  }

  function testRows(entry, width) {
    const w = width - 2;
    const rows = [`${s.bold}Tests et compilations${s.reset}`, ''];
    const checks = timeline.entries.filter((e) => e.status === 'validated');
    if (checks.length) {
      rows.push(`${s.bold}Vérifications déclarées par l’agent${s.reset}`);
      for (const c of checks) {
        rows.push(`${s.gray}${clock(c.ts)}${s.reset}  ${s.green}✓${s.reset}  ${c.title}`);
        if (c.narrative) rows.push(...wrap(c.narrative, w - 13).map((l) => ' '.repeat(13) + `${s.dim}${l}${s.reset}`));
      }
      rows.push('');
    }
    if (meta.agent === 'codex') {
      rows.push(`${s.dim}Avec Codex, telex n’observe pas encore les commandes exécutées : seules les vérifications déclarées ci-dessus sont connues.${s.reset}`);
      return rows;
    }
    const all = observed.filter((o) => o.type === 'command' && isTestOrBuild(o.command));
    const mine = entry ? observedFor(entry, all, timeline.entries) : [];
    if (entry) {
      rows.push(`${s.bold}Pendant « ${entry.title} »${s.reset}`);
      if (!mine.length) rows.push(`${s.dim}Aucune commande de test ou de compilation observée pendant cette étape.${s.reset}`, '');
      for (const c of mine) rows.push(...commandLine(c, w, true));
    }
    const others = all.filter((c) => !mine.includes(c));
    if (others.length) {
      rows.push(`${s.bold}Dans le reste de la session${s.reset}`);
      for (const c of others) rows.push(...commandLine(c, w, true));
    }
    if (!all.length && !checks.length) rows.push(`${s.dim}Aucun test ni aucune compilation observés dans cette session.${s.reset}`);
    return rows;
  }

  // ─── Rendu ───────────────────────────────────────────────────────────────

  function render() {
    const width = Math.max(40, out.columns || 80);
    const height = Math.max(10, out.rows || 24);
    const head = header(meta, timeline.session).map((l) => ' ' + l);
    const entry = timeline.entries[selected];
    let body;
    let keys;

    if (view === 'timeline' || !entry) {
      view = 'timeline';
      keys = KEYS_TIMELINE;
      const bodyHeight = height - head.length - 2;
      const { rows, starts } = timelineRows(width);
      if (!rows.length) rows.push(`  ${s.dim}En attente de la première étape…${s.reset}`);
      if (timeline.session.ended_at) rows.push('', ...footerSummary(timeline.entries).map((l) => '  ' + l));
      let top = 0;
      if (rows.length > bodyHeight) {
        if (follow) top = rows.length - bodyHeight;
        else if (starts[selected]) {
          const [a, b] = starts[selected];
          top = Math.min(a, Math.max(0, b - bodyHeight + 1));
          top = Math.max(0, Math.min(top, rows.length - bodyHeight));
          if (a < top) top = a;
        }
      }
      body = rows.slice(top, top + bodyHeight);
      if (!follow && unseen) body[body.length - 1] = `  ${s.amber}↓ ${unseen} nouvelle${unseen > 1 ? 's' : ''} étape${unseen > 1 ? 's' : ''} — [Fin] pour suivre${s.reset}`;
    } else {
      keys = KEYS_VIEW;
      const bodyHeight = height - head.length - 2;
      const rows = (view === 'details' ? detailRows(entry, width) : view === 'diff' ? diffRows(entry, width) : testRows(entry, width))
        .map((l) => '  ' + l);
      viewScroll = Math.max(0, Math.min(viewScroll, rows.length - bodyHeight));
      body = rows.slice(viewScroll, viewScroll + bodyHeight);
    }

    while (body.length < height - head.length - 2) body.push('');
    const frame = [...head, ...body, '', ` ${s.dim}${keys}${s.reset}`];
    out.write('\x1b[H' + frame.map((l) => clip(l, width) + '\x1b[K').join('\n') + '\x1b[J');
  }

  function clip(line, width) {
    if (visibleLength(line) <= width) return line;
    let n = 0;
    let res = '';
    for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
      if (part.startsWith('\x1b[')) { res += part; continue; }
      for (const ch of part) { if (n >= width - 1) break; res += ch; n++; }
    }
    return res + s.reset;
  }

  // ─── Clavier ─────────────────────────────────────────────────────────────

  function move(delta) {
    const n = timeline.entries.length;
    if (!n) return;
    selected = Math.max(0, Math.min(n - 1, selected + delta));
    follow = selected === n - 1;
    if (follow) unseen = 0;
  }

  function onKey(key) {
    const k = key.toLowerCase();
    if (key === '\x03' || (k === 'q' && view === 'timeline')) return quit();
    if (view === 'timeline') {
      if (key === '\x1b[A' || k === 'k') move(-1);
      else if (key === '\x1b[B' || k === 'j') move(1);
      else if (key === '\x1b[5~') move(-5);
      else if (key === '\x1b[6~') move(5);
      else if (key === '\x1b[H' || key === 'g') { move(-Infinity); }
      else if (key === '\x1b[F' || key === 'G' || key === ' ') { move(Infinity); }
      else if ((key === '\r' || key === '\n') && selected >= 0) { view = 'details'; viewScroll = 0; }
      else if (k === 'd' && selected >= 0) { view = 'diff'; viewScroll = 0; }
      else if (k === 't') { view = 'tests'; viewScroll = 0; }
    } else {
      if (key === '\x1b' || k === 'q' || key === '\x7f') view = 'timeline';
      else if (key === '\x1b[A' || k === 'k') viewScroll = Math.max(0, viewScroll - 1);
      else if (key === '\x1b[B' || k === 'j') viewScroll += 1;
      else if (key === '\x1b[5~') viewScroll = Math.max(0, viewScroll - 10);
      else if (key === '\x1b[6~' || key === ' ') viewScroll += 10;
      else if (k === 'd') { view = 'diff'; viewScroll = 0; }
      else if (k === 't') { view = 'tests'; viewScroll = 0; }
      else if (key === '\r') { view = 'details'; viewScroll = 0; }
      else if (k === 'r' && view === 'details') showRaw = !showRaw;
    }
    render();
  }

  // ─── Cycle de vie ────────────────────────────────────────────────────────

  const stops = [];
  function quit() {
    stops.forEach((f) => f());
    out.write('\x1b[?25h\x1b[?1049l');
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    onQuit?.();
  }

  out.write('\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J');
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.on('data', (data) => {
    // Plusieurs touches peuvent arriver dans le même paquet.
    for (const key of data.match(/\x1b\[[0-9;]*[~A-Za-z]|\x1bO[A-Z]|[\s\S]/g) || []) onKey(key.replace(/^\x1bO/, '\x1b['));
  });
  out.on('resize', render);
  stops.push(tailJsonl(path.join(sessionDir, 'events.jsonl'), (items) => { events.push(...items); rebuild(); render(); }));
  stops.push(tailJsonl(path.join(sessionDir, 'observed.jsonl'), (items) => { observed.push(...items); annotate(timeline.entries, observed); render(); }));
  render();
}

function duration(secs) {
  if (secs < 60) return `${secs} s`;
  const m = Math.floor(secs / 60);
  return m < 60 ? `${m} min ${String(secs % 60).padStart(2, '0')} s` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
