import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTimeline } from '../src/timeline.js';
import { parseJsonl } from '../src/store.js';
import { staticTimeline } from '../src/render.js';

const events = parseJsonl(fs.readFileSync(new URL('./fixtures/reference.jsonl', import.meta.url), 'utf8'));

test('une ligne par étape, statut mis à jour sur place', () => {
  const { entries } = buildTimeline(events);
  assert.deepEqual(entries.map((e) => [e.step_id, e.status]), [
    ['reset', 'running'],
    ['examine', 'done'],
    ['resend-config', 'failed'],
    ['resend-fix', 'done'],
    ['mem', 'replaced'],
    ['db', 'running'],
    ['reset', 'validated'],
  ]);
});

test('le titre et l’horodatage de la ligne sont ceux du début', () => {
  const { entries } = buildTimeline(events);
  const examine = entries.find((e) => e.step_id === 'examine');
  assert.equal(examine.title, 'Examiner l’authentification existante');
  assert.equal(examine.ts, '2026-09-22T14:32:20Z');
  assert.equal(examine.end_ts, '2026-09-22T14:32:48Z');
  assert.match(examine.narrative, /identifié/);
});

test('les étapes futures n’existent pas avant leur début', () => {
  const { entries } = buildTimeline(events.slice(0, 2));
  assert.equal(entries.length, 2);
  assert.ok(entries.every((e) => e.status === 'running'));
});

test('erreur et approche remplacée restent visibles', () => {
  const out = staticTimeline({ meta: { project: 'needle', agent: 'claude' }, ...buildTimeline(events) }, 80);
  assert.match(out, /✕  Configurer l’accès à Resend/);
  assert.match(out, /–  Conserver les tokens en mémoire/);
  assert.match(out, /✓  Corriger la configuration de Resend/);
  assert.match(out, /RESEND_API_KEY introuvable/);
});

test('fin de session et bilan', () => {
  const ended = [...events, { type: 'session_end', ts: '2026-09-22T14:50:00Z', exit_code: 0 }];
  const out = staticTimeline({ meta: { project: 'needle', agent: 'claude' }, ...buildTimeline(ended) }, 80);
  assert.match(out, /session terminée/);
  assert.match(out, /Bilan : 2 étapes réalisées · 1 vérification exécutée · 1 erreur · 1 approche remplacée · 2 non terminées/);
});

test('recoupement : une vérification déclarée après un test observé en échec est signalée', async () => {
  const { annotate } = await import('../src/timeline.js');
  const evs = [
    { type: 'step', ts: '2026-09-22T10:00:00Z', event: 'start', step_id: 'a', title: 'A' },
    { type: 'step', ts: '2026-09-22T10:00:10Z', event: 'validate', step_id: 'a', title: 'Tester A' },
    { type: 'step', ts: '2026-09-22T10:00:20Z', event: 'complete', step_id: 'a', title: 'A' },
  ];
  const observed = [{ type: 'command', ts: '2026-09-22T10:00:05Z', command: 'npm test', ok: false }];
  const { entries } = buildTimeline(evs);
  annotate(entries, observed);
  assert.match(entries[1].fact_note, /a échoué \(npm test\)/);
  assert.match(entries[0].fact_note, /a échoué/);
  annotate(entries, [...observed, { type: 'command', ts: '2026-09-22T10:00:08Z', command: 'npm test', ok: true }]);
  assert.equal(entries[1].fact_note, undefined);
});

const ev = (t, event, step_id, extra = {}) => ({ type: 'step', ts: `2026-09-22T10:00:${String(t).padStart(2, '0')}Z`, event, step_id, title: step_id, ...extra });

test('validate sur une partie en cours ferme la même ligne ; complete ensuite ne duplique pas (séquence Codex réelle)', () => {
  const { entries } = buildTimeline([
    ev(1, 'start', 'panier', { feature_id: 'panier' }),
    ev(2, 'start', 'tests', { feature_id: 'panier' }),
    ev(3, 'validate', 'tests', { feature_id: 'panier', narrative: '7 tests passent' }),
    ev(4, 'complete', 'tests', { feature_id: 'panier' }),
    ev(5, 'complete', 'panier', { feature_id: 'panier' }),
  ]);
  assert.deepEqual(entries.map((e) => [e.step_id, e.status]), [['panier', 'done'], ['tests', 'validated']]);
  assert.equal(entries[1].narrative, '7 tests passent');
});

test('fail sur la fonctionnalité crée une ligne ✕ propre ; la fonctionnalité reste en cours (séquence Claude réelle)', () => {
  const { entries } = buildTimeline([
    ev(1, 'start', 'cart'),
    ev(2, 'fail', 'cart', { title: 'Test formatPrice en échec' }),
    ev(3, 'validate', 'cart', { title: 'Valider les tests' }),
    ev(4, 'complete', 'cart', { title: 'Module panier en place' }),
  ]);
  assert.deepEqual(entries.map((e) => [e.title, e.status]), [
    ['cart', 'done'],
    ['Test formatPrice en échec', 'failed'],
    ['Valider les tests', 'validated'],
  ]);
});
