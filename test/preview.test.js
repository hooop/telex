import test from 'node:test';
import assert from 'node:assert/strict';
import { entryLines, plain, previewLines } from '../src/render.js';

const ENTRY = {
  ts: '2026-09-22T14:05:30Z', end_ts: '2026-09-22T14:07:40Z', status: 'done',
  title: 'Corriger la validation du token',
  narrative: 'Le middleware rejette désormais les tokens expirés.',
  technical_detail: 'src/auth.js',
};

test('entryLines compact : titre seul, sans récit ni détail', () => {
  const lines = entryLines(ENTRY, 80, plain, { compact: true });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].endsWith('Corriger la validation du token'));
});

test('previewLines : en-tête entre pointillés, récit, détail, hauteur fixe', () => {
  const lines = previewLines(ENTRY, { index: 3, count: 4, width: 60, height: 8, s: plain });
  assert.equal(lines.length, 8);
  assert.equal(lines[0], '-'.repeat(59));
  assert.equal(lines[1].trim(), 'étape 4/4 · réalisée · 2 min 10 s');
  assert.equal(lines[2], '-'.repeat(59));
  assert.equal(lines[3].trim(), ENTRY.narrative);
  assert.equal(lines[4].trim(), 'src/auth.js');
});

test('previewLines : récit trop long tronqué avec renvoi aux détails', () => {
  const long = { ...ENTRY, narrative: 'mot '.repeat(200) };
  const lines = previewLines(long, { index: 0, count: 1, width: 40, height: 6, s: plain });
  assert.equal(lines.length, 6);
  assert.match(lines.at(-1), /suite dans les détails/);
});

test('previewLines : étape en cours, durée depuis le début', () => {
  const running = { ...ENTRY, status: 'running', end_ts: null };
  const [, head] = previewLines(running, { index: 0, count: 1, width: 60, height: 5, now: Date.parse('2026-09-22T14:06:42Z'), s: plain });
  assert.match(head, /en cours depuis 1 min 12 s/);
});
