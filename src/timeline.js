// Réduction des événements en lignes de timeline.
// Règles : une ligne naît au « start » (ou à un fail/validate isolé), change
// de statut sur place, ne disparaît jamais. Aucune ligne n'est créée à l'avance.

export const SYMBOL = { running: '●', done: '✓', failed: '✕', replaced: '–', validated: '✓' };

export function buildTimeline(events) {
  const entries = [];
  const open = new Map(); // step_id -> dernière entrée portant cet identifiant
  let session = { ended_at: null };

  const closeOn = (entry, ev, status) => {
    entry.status = status;
    entry.end_ts = ev.ts;
    entry.end_tree = ev.tree;
    if (ev.narrative) entry.narrative = ev.narrative;
    if (ev.technical_detail) entry.technical_detail = ev.technical_detail;
    if (ev.evidence?.length) entry.evidence = [...(entry.evidence || []), ...ev.evidence];
    entry.updates.push(ev);
  };
  const standalone = (ev, status) => {
    const entry = newEntry(ev, status);
    entry.end_ts = ev.ts;
    entry.end_tree = ev.tree;
    entries.push(entry);
    return entry;
  };

  for (const ev of events) {
    if (ev.type === 'session_end') { session = { ended_at: ev.ts, exit_code: ev.exit_code }; continue; }
    if (ev.type !== 'step') continue;
    const current = open.get(ev.step_id);
    const running = current?.status === 'running';

    if (ev.event === 'start') {
      if (running) {
        // Relance du même step_id : même ligne, récit mis à jour.
        current.updates.push(ev);
        if (ev.narrative) current.narrative = ev.narrative;
        continue;
      }
      const entry = newEntry(ev, 'running');
      entry.is_feature = ev.feature_id ? ev.feature_id === ev.step_id : ![...open.values()].some((e) => e.status === 'running');
      entries.push(entry);
      open.set(ev.step_id, entry);
    } else if (ev.event === 'validate') {
      // Sur une partie en cours : la même ligne devient ✓ (vérifiée).
      // Sur la fonctionnalité ou sans étape ouverte : ligne propre, datée.
      if (running && !current.is_feature) closeOn(current, ev, 'validated');
      else standalone(ev, 'validated');
    } else if (ev.event === 'fail' || ev.event === 'replace' || ev.event === 'complete') {
      const status = { complete: 'done', fail: 'failed', replace: 'replaced' }[ev.event];
      if (running && !(current.is_feature && ev.event === 'fail')) {
        closeOn(current, ev, status);
      } else if (ev.event === 'complete' && (current?.status === 'done' || current?.status === 'validated')) {
        // Déjà close (validate puis complete) : on complète la ligne existante.
        current.updates.push(ev);
        if (ev.narrative && current.status === 'done') current.narrative = ev.narrative;
      } else {
        // Erreur signalée sur la fonctionnalité, ou fin sans début connu : ligne propre.
        const entry = standalone(ev, status);
        if (!running) open.set(ev.step_id, entry);
      }
    }
  }
  return { entries, session };
}

function newEntry(ev, status) {
  return {
    step_id: ev.step_id,
    feature_id: ev.feature_id,
    title: ev.title,
    narrative: ev.narrative,
    technical_detail: ev.technical_detail,
    evidence: ev.evidence ? [...ev.evidence] : undefined,
    status,
    ts: ev.ts,
    end_ts: null,
    start_tree: ev.tree,
    end_tree: null,
    source: ev.source,
    updates: [ev],
  };
}

// Commandes observées (hooks) survenues pendant la vie d'une entrée.
export function observedFor(entry, observed, allEntries) {
  const from = Date.parse(entry.ts);
  let to = entry.end_ts ? Date.parse(entry.end_ts) : Infinity;
  if (entry.status === 'validated') {
    // Un « validate » arrive après la commande : on regarde depuis l'événement précédent.
    const idx = allEntries.indexOf(entry);
    const prevTimes = allEntries.slice(0, idx).flatMap((e) => [e.ts, e.end_ts]).filter(Boolean).map(Date.parse).filter((t) => t < from);
    return observed.filter((o) => {
      const t = Date.parse(o.ts);
      return t <= from && t > (prevTimes.length ? Math.max(...prevTimes) : 0);
    });
  }
  return observed.filter((o) => { const t = Date.parse(o.ts); return t >= from && t <= to; });
}

const TEST_RE = /\b(test|tests|jest|vitest|mocha|pytest|unittest|rspec|phpunit|go test|cargo test|cargo build|tsc|typecheck|lint|eslint|build|compile|make|gradle|mvn|swift build|swift test|xcodebuild|playwright|cypress)\b/i;

export function isTestOrBuild(command) {
  return TEST_RE.test(command || '');
}

// Recoupement léger (§10) : si l'agent déclare une étape réalisée ou vérifiée
// alors que la dernière commande de test/compilation observée a échoué, on
// affiche ce fait précis sous la ligne plutôt qu'une conclusion avantageuse.
export function annotate(entries, observed) {
  const commands = observed.filter((o) => o.type === 'command' && isTestOrBuild(o.command));
  for (const entry of entries) {
    entry.fact_note = undefined;
    if (entry.status !== 'done' && entry.status !== 'validated') continue;
    const last = observedFor(entry, commands, entries).at(-1);
    if (last && !last.ok) entry.fact_note = `Fait observé : la dernière commande de vérification a échoué (${last.command.split('\n')[0].slice(0, 60)}).`;
  }
  return entries;
}
