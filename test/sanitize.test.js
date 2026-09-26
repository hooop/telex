import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize } from '../src/sanitize.js';
import { buildTimeline } from '../src/timeline.js';
import { staticTimeline, wrap } from '../src/render.js';

test('retire les séquences qui pilotent le terminal', () => {
  assert.equal(sanitize('a\x1b]0;titre piégé\x07b'), 'ab'); //                OSC 0 : titre de fenêtre
  assert.equal(sanitize('a\x1b]52;c;ZWNobyBwd25lZA==\x07b'), 'ab'); //       OSC 52 : presse-papiers
  assert.equal(sanitize('a\x1b]8;;https://x.test\x1b\\lien\x1b]8;;\x1b\\b'), 'alienb'); // OSC 8
  assert.equal(sanitize('\x1b[2K\x1b[1A✓ faux'), '✓ faux'); //              effacement, curseur
  assert.equal(sanitize('\x1b[31mrouge\x1b[0m'), 'rouge'); //               couleurs
  assert.equal(sanitize('a\x9b2Jb'), 'ab'); //                              CSI sur un octet
  assert.equal(sanitize('a\x1bPq#0;2;0;0;0\x1b\\b'), 'ab'); //              DCS
});

test('retire les caractères de contrôle et les marques bidi, garde les sauts de ligne', () => {
  assert.equal(sanitize('ligne 1\nligne 2'), 'ligne 1\nligne 2');
  assert.equal(sanitize('50%\r100%'), '50%100%');
  assert.equal(sanitize('a\tb'), 'a    b');
  assert.equal(sanitize('a\x00\x07\x7fb'), 'ab');
  assert.equal(sanitize('admin‮txt.exe'), 'admintxt.exe');
  assert.equal(sanitize('Créer la table des tokens — étape ✓'), 'Créer la table des tokens — étape ✓');
  assert.equal(sanitize(null), null);
});

test('un titre piégé ne traverse pas le rendu', () => {
  const title = 'Étape\x1b]0;TITRE-PIRATE\x07\x1b]52;c;ZWNobyBwd25lZA==\x07 ok';
  const { entries, session } = buildTimeline([{ type: 'step', ts: '2026-09-22T10:00:00Z', event: 'start', step_id: 'a', title }]);
  const out = staticTimeline({ meta: { project: 'demo\x1b]0;x\x07', agent: 'claude' }, entries, session }, 80);
  assert.ok(!out.includes('\x1b'));
  assert.match(out, /Étape ok/);
  assert.deepEqual(wrap('\x1b[2Jtexte', 20), ['texte']);
});
