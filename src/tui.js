// Interface interactive de la timeline (terminal, sans dépendance).
import path from 'node:path';
import { readMeta, refreshSession, tailJsonl } from './store.js';
import { annotate, buildTimeline, isStandaloneCheck, isTestOrBuild, observedFor, SYMBOL } from './timeline.js';
import { Workspace } from './workspace.js';
import { redact } from './redact.js';
import { sanitize } from './sanitize.js';
import { agentLabel } from './agents.js';
import { buttonBar, clock, diffLines, duration, entryLines, footerSummary, header, ICON_COLOR, previewLines, separator, SPINNER_TICKS, STATUS_LABEL, style as s, visibleLength, wrap } from './render.js';

const LIVENESS_EVERY_MS = 2000; // vérification que l'agent tourne encore
const MARGIN = 1; // colonne laissée libre à gauche de l'en-tête et des pointillés, où se place le repère ›

// `input` et `output` sont injectables pour les tests. `onFatal` reçoit une erreur
// inattendue, une fois le terminal restauré. `notice` : message initial en bas d'écran.
export function runTui(sessionDir, { onQuit, onFatal, notice: initialNotice = null, input = process.stdin, output = process.stdout } = {}) {
  const out = output;
  const stdin = input;
  let meta = readMeta(sessionDir);
  let events = [];
  let observed = [];
  let timeline = { entries: [], session: { ended_at: meta.ended_at, interrupted: meta.interrupted } };
  let selected = -1;
  let follow = true;
  let unseen = 0;
  let view = 'timeline';
  let viewScroll = 0;
  let showRaw = false;
  let focus = null; // bouton du menu en surbrillance (flèches ← →)
  let workspace = null;
  let tick = 0; // image courante de l'animation de l'en-tête
  let notice = initialNotice; // dernière erreur ou information, affichée au-dessus du menu
  let snapshotError = null; // dernière erreur d'instantané, citée dans les détails
  const diffCache = new Map();
  let diffView = { key: null, rows: [] }; // dernier diff mis en forme

  const ws = () => (workspace ??= new Workspace(sessionDir, meta.cwd));

  function rebuild() {
    const before = timeline.entries.length;
    timeline = buildTimeline(events);
    annotate(timeline.entries, observed);
    const after = timeline.entries.length;
    if (follow) selected = after - 1;
    else if (after > before) unseen += after - before;
    if (timeline.session.ended_at) { try { meta = readMeta(sessionDir); } catch { /* méta illisible : on garde la précédente */ } }
  }

  function onErrors(items) {
    const last = items.at(-1);
    if (last.source === 'instantanés') snapshotError = last.message;
    notice = `erreur telex (${last.source}) : ${last.message}`;
    render();
  }

  function onReadError(err) {
    const message = `lecture impossible (${err.code || err.message})`;
    if (notice !== message) { notice = message; render(); }
  }

  // Une fenêtre d'agent tuée sans que la fin soit enregistrée : on le constate ici.
  function checkLiveness() {
    if (timeline.session.ended_at) return;
    try {
      refreshSession(meta);
    } catch (err) {
      onReadError(err);
    }
  }

  // ─── Vues ────────────────────────────────────────────────────────────────

  function timelineRows(width) {
    const rows = [];
    const starts = [];
    timeline.entries.forEach((entry, i) => {
      rows.push(separator(width, s, MARGIN));
      starts.push(rows.length);
      const lines = entryLines(entry, width, s, { tick, gutter: 2, compact: true });
      if (i === selected) lines[0] = `${s.accent}›${s.reset} ` + lines[0].slice(2);
      rows.push(...lines);
      starts[i] = [starts[i], rows.length - 1];
    });
    if (timeline.entries.length) rows.push(separator(width, s, MARGIN));
    return { rows, starts };
  }

  function entryFiles(entry) {
    const to = entry.end_tree || latestTreeAfter(entry);
    if (!entry.start_tree && !isStandaloneCheck(entry)) return null;
    const from = isStandaloneCheck(entry) ? previousTree(entry) : entry.start_tree;
    return { from, to, changes: from && to ? ws().changes(from, to) : null };
  }

  function latestTreeAfter(entry) {
    // Étape en cours : on compare au dernier instantané connu.
    const t = Date.parse(entry.ts);
    const later = events.filter((e) => e.tree && Date.parse(e.ts) > t);
    return later.at(-1)?.tree || null;
  }

  function unavailable() {
    return snapshotError ? `Instantané indisponible : ${snapshotError}` : 'Instantané indisponible pour cette étape.';
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
    const color = { running: s.accent, done: s.ok, validated: s.ok, failed: s.error, replaced: s.muted }[entry.status];
    rows.push(...wrap(entry.title, w).map((l) => `${s.bold}${l}${s.reset}`));
    let when = `${s[ICON_COLOR[entry.status]]}${SYMBOL[entry.status]}${s.reset} ${color}${STATUS_LABEL[entry.status]}${s.reset}   ${s.dim}début${s.reset} ${clock(entry.ts)}`;
    if (entry.end_ts && !isStandaloneCheck(entry)) {
      const secs = Math.round((Date.parse(entry.end_ts) - Date.parse(entry.ts)) / 1000);
      when += `   ${s.dim}fin${s.reset} ${clock(entry.end_ts)}   ${s.dim}(${duration(secs)})${s.reset}`;
    }
    rows.push(when);
    if (entry.narrative) rows.push('', ...wrap(entry.narrative, w));
    if (entry.technical_detail) { sec('Technique'); rows.push(...wrap(entry.technical_detail, w).map((l) => `${s.muted}${l}${s.reset}`)); }

    sec('Fichiers concernés');
    const files = entryFiles(entry);
    if (!files || !files.to) {
      rows.push(`${s.dim}${entry.status === 'running' ? 'Étape en cours : les fichiers seront comparés à sa fin.' : unavailable()}${s.reset}`);
    } else if (!files.changes?.length) {
      rows.push(`${s.dim}Aucun fichier modifié ${isStandaloneCheck(entry) ? 'depuis l’événement précédent' : 'entre le début et la fin de l’étape'}.${s.reset}`);
    } else {
      const label = { A: 'ajouté  ', M: 'modifié ', D: 'supprimé' };
      for (const c of files.changes) rows.push(`${s.dim}${label[c.status[0]] || c.status}${s.reset}  ${sanitize(c.path)}`);
    }

    const cmds = observedFor(entry, observed, timeline.entries);
    sec('Commandes observées');
    if (meta.agent === 'codex') rows.push(`${s.dim}Non disponibles avec Codex dans cette version : seul le récit de l’agent et les fichiers sont observés.${s.reset}`);
    else if (!cmds.length) rows.push(`${s.dim}Aucune commande shell observée pendant cette étape.${s.reset}`);
    else cmds.forEach((c, i) => rows.push(...(i ? [separator(w, s)] : []), ...commandLine(c, w, false)));

    if (entry.evidence?.length) {
      sec('Preuves citées par l’agent');
      for (const e of entry.evidence) rows.push(...wrap(`· ${e}`, w));
    }

    sec('Origine');
    const agent = agentLabel(entry.source);
    rows.push(...wrap(`Titre et récit : écrits par ${agent} via l’outil timeline. Fichiers : instantanés pris par telex à chaque événement.${meta.agent === 'claude' ? ' Commandes : hook PostToolUse de Claude Code.' : ''}`, w).map((l) => `${s.dim}${l}${s.reset}`));

    sec(`Événements bruts ${s.dim}[R] ${showRaw ? 'masquer' : 'afficher'}${s.reset}`);
    if (showRaw) {
      for (const u of entry.updates) {
        rows.push(...wrap(JSON.stringify({ ...u, tree: undefined }), w).map((l) => `${s.muted}${l}${s.reset}`));
      }
    }
    return rows;
  }

  function commandLine(c, w, withOutput) {
    const mark = c.ok ? `${s.check}✓${s.reset}` : `${s.cross}✕${s.reset}`;
    const rows = wrap(c.command, w - 13).map((l, i) => (i ? ' '.repeat(13) : `${s.muted}${clock(c.ts)}${s.reset}  ${mark}  `) + l);
    if (withOutput && c.output_tail) {
      const tail = sanitize(c.output_tail).split('\n').filter((l) => l.trim()).slice(-12);
      for (const l of tail) rows.push(`${' '.repeat(13)}${s.muted}${[...l].slice(0, w - 13).join('')}${s.reset}`);
      rows.push('');
    }
    return rows;
  }

  function diffRows(entry, width) {
    const files = entryFiles(entry);
    const rows = [`${s.bold}Diff : ${sanitize(entry.title)}${s.reset}`, ''];
    if (!files?.from || !files?.to) {
      rows.push(`${s.dim}${entry.status === 'running' ? 'Étape en cours : le diff sera disponible à sa fin.' : unavailable()}${s.reset}`);
      return rows;
    }
    const key = `${files.from}..${files.to}`;
    if (!diffCache.has(key)) diffCache.set(key, redact(sanitize(ws().diff(files.from, files.to))));
    const diff = diffCache.get(key);
    if (!diff.trim()) { rows.push(`${s.dim}Aucune modification de fichier pendant cette étape.${s.reset}`); return rows; }
    // Mise en forme (comparaison mot à mot comprise) gardée tant que le diff et la largeur ne changent pas.
    // Largeur : 2 colonnes de marge, et la dernière laissée vide.
    if (diffView.key !== `${key}@${width}`) diffView = { key: `${key}@${width}`, rows: diffLines(diff, width - 3, s) };
    rows.push(...diffView.rows);
    return rows;
  }

  function testRows(entry, width) {
    const w = width - 2;
    const rows = [`${s.bold}Tests et compilations${s.reset}`, ''];
    const checks = timeline.entries.filter((e) => e.status === 'validated');
    if (checks.length) {
      rows.push(`${s.bold}Vérifications déclarées par l’agent${s.reset}`);
      for (const c of checks) {
        rows.push(`${s.muted}${clock(c.ts)}${s.reset}  ${s.check}✓${s.reset}  ${sanitize(c.title)}`);
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
      rows.push(`${s.bold}Pendant « ${sanitize(entry.title)} »${s.reset}`);
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
    if (closed) return;
    const width = Math.max(40, out.columns || 80);
    const height = Math.max(10, out.rows || 24);
    const head = headLines(width);
    const entry = timeline.entries[selected];
    let body;
    let info = '';

    if (view === 'timeline' || !entry) {
      view = 'timeline';
      const n = timeline.entries.length;
      if (n && follow) info = 'suivi en direct'; // le numéro d'étape est dans le panneau d'aperçu
      // Panneau d'aperçu de l'étape sélectionnée, en bas ; la liste occupe le reste.
      const available = height - head.length - 2;
      const panelHeight = n && selected >= 0 ? Math.max(6, Math.min(12, Math.floor(available * 0.4))) : 0;
      const bodyHeight = available - panelHeight;
      const { rows, starts } = timelineRows(width);
      if (!rows.length) rows.push(`  ${s.dim}Prêt${s.reset}`);
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
      if (!follow && unseen) body[body.length - 1] = `  ${s.accent}↓ ${unseen} nouvelle${unseen > 1 ? 's' : ''} étape${unseen > 1 ? 's' : ''} — [Fin] pour suivre${s.reset}`;
      if (panelHeight) {
        while (body.length < bodyHeight) body.push('');
        body.push(...previewLines(entry, { index: selected, count: n, width, height: panelHeight, s, margin: MARGIN }));
      }
    } else {
      const bodyHeight = height - head.length - 2;
      const rows = (view === 'details' ? detailRows(entry, width) : view === 'diff' ? diffRows(entry, width) : testRows(entry, width))
        .map((l) => '  ' + l);
      viewScroll = Math.max(0, Math.min(viewScroll, rows.length - bodyHeight));
      body = rows.slice(viewScroll, viewScroll + bodyHeight);
      if (rows.length > bodyHeight) info = `lignes ${viewScroll + 1}–${Math.min(rows.length, viewScroll + bodyHeight)} / ${rows.length}`;
    }

    while (body.length < height - head.length - 2) body.push('');
    // La ligne au-dessus du menu affiche la dernière erreur ou information, s'il y en a une.
    const status = notice ? `  ${s.error}⚠ ${sanitize(notice)}${s.reset}` : '';
    const frame = [...head, ...body, status, buttonBar(buttons(), width, { focus: focusedId(), info })];
    out.write('\x1b[H' + frame.map((l) => clip(l, width) + '\x1b[K').join('\n') + '\x1b[J');
  }

  function headLines(width) {
    return header(meta, timeline.session, s, width - MARGIN, tick).map((l) => ' '.repeat(MARGIN) + l);
  }

  // Anime l'en-tête seul : on réécrit ses lignes sans toucher au reste de l'écran.
  function animate() {
    if (closed) return;
    tick++;
    // Le rond d'une étape en cours change de moitié : il faut redessiner le corps.
    if (tick % SPINNER_TICKS === 0 && view === 'timeline' && timeline.entries.some((e) => e.status === 'running')) return render();
    const width = Math.max(40, out.columns || 80);
    out.write('\x1b[H' + headLines(width).map((l) => clip(l, width) + '\x1b[K').join('\n'));
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

  // ─── Menu du bas ─────────────────────────────────────────────────────────

  function open(v) {
    if (v !== 'tests' && selected < 0) return;
    view = v;
    viewScroll = 0;
    focus = null;
  }

  const ACTIONS = {
    details: () => open('details'),
    diff: () => open('diff'),
    tests: () => open('tests'),
    back: () => { view = 'timeline'; focus = null; },
    raw: () => { showRaw = !showRaw; },
    follow: () => move(Infinity),
  };

  function buttons() {
    const none = selected < 0;
    if (view === 'timeline') {
      return [
        { id: 'details', key: '↵', label: 'détails', disabled: none },
        { id: 'diff', key: 'D', label: 'diff', disabled: none },
        { id: 'tests', key: 'T', label: 'tests' },
        ...(!follow && timeline.entries.length ? [{ id: 'follow', key: 'Fin', label: unseen ? `suivre (${unseen})` : 'suivre' }] : []),
        { id: 'quit', key: 'Q', label: 'quitter' },
      ];
    }
    return [
      { id: 'back', key: 'Échap', label: 'retour' },
      { id: 'details', key: '↵', label: 'détails', active: view === 'details' },
      { id: 'diff', key: 'D', label: 'diff', active: view === 'diff' },
      { id: 'tests', key: 'T', label: 'tests', active: view === 'tests' },
      ...(view === 'details' ? [{ id: 'raw', key: 'R', label: 'brut', active: showRaw }] : []),
      { key: '↑↓', label: 'défiler' },
    ];
  }

  // Bouton en surbrillance : celui choisi aux flèches s'il est encore là,
  // sinon celui qui correspond à Entrée (détails, ou la vue ouverte).
  function focusedId() {
    const ids = buttons().filter((b) => b.id && !b.disabled).map((b) => b.id);
    if (ids.includes(focus)) return focus;
    const fallback = view === 'timeline' ? 'details' : view;
    return ids.includes(fallback) ? fallback : null;
  }

  function moveFocus(delta) {
    const ids = buttons().filter((b) => b.id && !b.disabled).map((b) => b.id);
    const i = ids.indexOf(focusedId());
    focus = i < 0 ? ids.at(delta > 0 ? 0 : -1) : ids[(i + delta + ids.length) % ids.length];
  }

  function press() {
    const id = focusedId();
    if (id === 'quit') return quit();
    ACTIONS[id]?.();
    render();
  }

  function onKey(key) {
    const k = key.toLowerCase();
    if (key === '\x03' || (k === 'q' && view === 'timeline')) return quit();
    if (key === '\x1b[D') { moveFocus(-1); return render(); }
    if (key === '\x1b[C') { moveFocus(1); return render(); }
    if (key === '\r' || key === '\n') return press();
    if (view === 'timeline') {
      if (key === '\x1b[A' || k === 'k') move(-1);
      else if (key === '\x1b[B' || k === 'j') move(1);
      else if (key === '\x1b[5~') move(-5);
      else if (key === '\x1b[6~') move(5);
      else if (key === '\x1b[H' || key === 'g') { move(-Infinity); }
      else if (key === '\x1b[F' || key === 'G' || key === ' ') { move(Infinity); }
      else if (k === 'd') open('diff');
      else if (k === 't') open('tests');
      else if (key === '\x1b') notice = null; // Échap efface le message d'erreur
    } else {
      if (key === '\x1b' || k === 'q' || key === '\x7f') ACTIONS.back();
      else if (key === '\x1b[A' || k === 'k') viewScroll = Math.max(0, viewScroll - 1);
      else if (key === '\x1b[B' || k === 'j') viewScroll += 1;
      else if (key === '\x1b[5~') viewScroll = Math.max(0, viewScroll - 10);
      else if (key === '\x1b[6~' || key === ' ') viewScroll += 10;
      else if (k === 'd') open('diff');
      else if (k === 't') open('tests');
      else if (k === 'r' && view === 'details') ACTIONS.raw();
    }
    render();
  }

  // ─── Cycle de vie ────────────────────────────────────────────────────────

  // Le terminal est toujours rendu dans son état normal (curseur, écran principal,
  // mode ligne), que l'on quitte, que l'on reçoive un signal ou qu'une erreur survienne.
  const stops = [];
  let closed = false;
  function restore() {
    if (closed) return;
    closed = true;
    for (const stop of stops) { try { stop(); } catch { /* on restaure le reste quand même */ } }
    out.write('\x1b[?25h\x1b[?1049l');
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  }
  function quit() {
    restore();
    onQuit?.();
  }
  function fatal(err) {
    restore();
    if (onFatal) onFatal(err);
    else throw err;
  }

  process.on('SIGTERM', quit);
  process.on('SIGHUP', quit);
  process.on('uncaughtException', fatal);
  stops.push(() => {
    process.off('SIGTERM', quit);
    process.off('SIGHUP', quit);
    process.off('uncaughtException', fatal);
  });

  const onData = (data) => {
    // Plusieurs touches peuvent arriver dans le même paquet.
    for (const key of data.match(/\x1b\[[0-9;]*[~A-Za-z]|\x1bO[A-Z]|[\s\S]/g) || []) {
      if (closed) return;
      onKey(key.replace(/^\x1bO/, '\x1b['));
    }
  };
  out.write('\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J');
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.on('data', onData);
  out.on('resize', render);
  stops.push(() => { stdin.off('data', onData); out.off('resize', render); });
  stops.push(tailJsonl(path.join(sessionDir, 'events.jsonl'), (items) => { events.push(...items); rebuild(); render(); }, onReadError));
  stops.push(tailJsonl(path.join(sessionDir, 'observed.jsonl'), (items) => { observed.push(...items); annotate(timeline.entries, observed); render(); }, onReadError));
  stops.push(tailJsonl(path.join(sessionDir, 'errors.jsonl'), onErrors, onReadError));
  const animation = setInterval(animate, 140);
  const liveness = setInterval(checkLiveness, LIVENESS_EVERY_MS);
  stops.push(() => { clearInterval(animation); clearInterval(liveness); });
  render();
  return { quit };
}

