import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, plain, style, visibleLength } from '../src/render.js';

// Deux lignes de contexte vides : l'une telle que git l'écrit (une espace), l'autre
// sans son espace, comme après un éditeur qui retire les espaces de fin de ligne.
const DIFF = `diff --git a/src/mail.js b/src/mail.js
index 7418200..6aa9b29 100644
--- a/src/mail.js
+++ b/src/mail.js
@@ -1,4 +1,4 @@
 import { Resend } from 'resend';
\x20
-const resend = new Resend(process.env.RESEND_KEY);
+const resend = new Resend(process.env.RESEND_API_KEY);

@@ -40,2 +40,3 @@ export function footer() {
 -- signature
---- tirets
+++ plus
+nouvelle ligne
\\ No newline at end of file
diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..e69de29
Binary files /dev/null and b/logo.png differ
`;

test('diffLines : résumé, en-tête par fichier, lignes numérotées, sans en-têtes git bruts', () => {
  const lines = diffLines(DIFF, 60, plain);
  assert.equal(lines[0], '2 fichiers  +3 -2');
  assert.equal(lines[2], 'src/mail.js  modifié  +3 -2');
  assert.equal(lines[3], '-'.repeat(60));
  assert.deepEqual(lines.slice(4, 14), [
    ' 1   import { Resend } from \'resend\';',
    ' 2   ',
    ' 3 - const resend = new Resend(process.env.RESEND_KEY);',
    ' 3 + const resend = new Resend(process.env.RESEND_API_KEY);',
    ' 4   ',
    ' ⋯',
    '40   -- signature',
    '41 - --- tirets', // « ---- » à l'intérieur d'un bloc : une ligne retirée, pas un en-tête
    '41 + ++ plus',
    '42 + nouvelle ligne',
  ]);
  assert.ok(!lines.some((l) => /^(diff --git|index |@@|\\)/.test(l)));
  assert.deepEqual(lines.slice(14), ['', 'logo.png  ajouté', '-'.repeat(60), 'Fichier binaire : contenu non affiché.']);
});

test('diffLines : une ligne trop longue continue sous le texte, indentation conservée', () => {
  const diff = `diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-${'x'.repeat(10)}\n+    ${'y'.repeat(30)}\n`;
  const lines = diffLines(diff, 24, plain).slice(4);
  assert.deepEqual(lines, ['1 - xxxxxxxxxx', '1 +     yyyyyyyyyyyyyyyy', '    yyyyyyyyyyyyyy']);
});

test('diffLines : fonds sur toute la largeur, mots changés surlignés seulement si les lignes se ressemblent', () => {
  const lines = diffLines(DIFF, 60, style);
  const [removed, added] = [lines[6], lines[7]];
  for (const l of [removed, added]) assert.equal(visibleLength(l), 60);
  // Un fond pour la ligne, un second plus vif autour du seul mot changé.
  const backgrounds = (l) => [...new Set(l.match(/\x1b\[48;[0-9;]+m/g))];
  assert.equal(backgrounds(removed).length, 2);
  assert.match(removed, /\x1b\[48;[0-9;]+mRESEND_KEY\x1b\[48;/);
  assert.match(added, /\x1b\[48;[0-9;]+mRESEND_API_KEY\x1b\[48;/);
  assert.notEqual(backgrounds(removed)[0], backgrounds(added)[0]);
  // Numéro et marqueur rouges ou verts, puis un même texte foncé des deux côtés.
  const foregrounds = (l) => [...new Set(l.match(/\x1b\[38;[0-9;]+m/g))];
  assert.equal(foregrounds(removed).length, 2);
  assert.notEqual(foregrounds(removed)[0], foregrounds(added)[0]);
  assert.equal(foregrounds(removed)[1], foregrounds(added)[1]);
  // Lignes trop différentes : fond de ligne seul.
  assert.equal(backgrounds(lines[11]).length, 1);
});
