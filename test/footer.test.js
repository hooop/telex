import test from 'node:test';
import assert from 'node:assert/strict';
import { buttonBar, plain, style } from '../src/render.js';

const BUTTONS = [
  { key: '↑↓', label: 'étapes' },
  { id: 'details', key: '↵', label: 'détails', disabled: true },
  { id: 'tests', key: 'T', label: 'tests', active: true },
  { id: 'quit', key: 'Q', label: 'quitter' },
];

test('buttonBar : libellés complets quand la place suffit, info alignée à droite', () => {
  const line = buttonBar(BUTTONS, 100, { s: plain, info: 'étape 1/3' });
  assert.ok(line.includes(' T tests ') && line.includes(' Q quitter '));
  assert.ok(line.trimEnd().endsWith('étape 1/3'));
  assert.ok([...line].length < 100);
});

test('buttonBar : libellés retirés si le terminal est étroit', () => {
  const line = buttonBar(BUTTONS, 30, { s: plain, info: 'étape 1/3' });
  assert.ok(!line.includes('quitter'));
  assert.ok(line.includes(' Q '));
});

test('buttonBar : le bouton en surbrillance est affiché en inversé', () => {
  const line = buttonBar(BUTTONS, 100, { focus: 'quit' });
  assert.ok(line.includes(`${style.inverse}${style.bold} Q quitter `));
  assert.ok(!line.includes(`${style.inverse}${style.bold} T`));
});
