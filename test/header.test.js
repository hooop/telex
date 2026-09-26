import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { HEADER_LINES, header, plain, style, visibleLength } from '../src/render.js';

const META = { project: 'telex', agent: 'claude', started_at: new Date(Date.now() - 65_000).toISOString() };
const OPEN = '▐ █  █ ▌';
const CLOSED = '▐ ─  ─ ▌';

test('header statique : cases en tirets, mascotte, logo, voyant en haut à droite, projet et agent', () => {
  const lines = header(META, { ended_at: null }, plain, 80);
  assert.equal(lines.length, HEADER_LINES);
  assert.ok(!lines.some((l) => /[╭╮╰╯│⠀-⣿]|TÉLÉSCRIPTEUR/.test(l)));
  assert.match(lines[0], /^-{10}\+-{68}$/);
  assert.equal(lines[4], lines[0]);
  assert.deepEqual(lines.slice(1, 4).map((l) => l.slice(0, 11)), ['  ▄████▄  |', ` ${OPEN} |`, '  ▀████▀  |']);
  assert.ok(lines[1].startsWith('  ▄████▄  | T E L E X ') && lines[1].endsWith('● EN DIRECT'));
  assert.match(lines[2], /\|-{68}$/);
  assert.ok(lines[3].includes('| PROJET ▸ telex') && lines[3].includes('AGENT ▸ Claude Code'));
  assert.ok([0, 1, 2, 4].every((i) => visibleLength(lines[i]) === 79));
  assert.equal(lines[5], '');
});

// En-tête en couleur, avec le COLORTERM donné, dans un processus à part (la
// profondeur de couleur est lue au chargement du module).
function colorHeader(colorterm) {
  const script = `import { header, style } from ${JSON.stringify(new URL('../src/render.js', import.meta.url).href)};
    process.stdout.write(JSON.stringify(header(${JSON.stringify(META)}, { ended_at: null }, style, 80, 30)));`;
  const env = { ...process.env, COLORTERM: colorterm };
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' }));
}

test('header : mascotte en couleurs hexadécimales (24 bits si annoncé, sinon palette 256), logo sans blocs de fond', () => {
  const rich = colorHeader('truecolor');
  assert.ok(rich[2].includes('\x1b[48;2;48;19;0m') && rich[2].includes('\x1b[38;2;255;152;85m█'));
  assert.ok(!rich[1].includes('\x1b[48;'));
  const basic = colorHeader('');
  assert.ok(basic[2].includes('\x1b[48;5;233m') && basic[2].includes('\x1b[38;5;209m█'));
  assert.ok(!basic.join('').includes(';2;'));
});

test('header animé : le logo se frappe lettre par lettre et le chrono tourne', () => {
  const typing = header(META, { ended_at: null }, plain, 80, 0)[1];
  assert.ok(typing.includes('T ▌') && !typing.includes('T E'));
  const line = header(META, { ended_at: null }, plain, 80, 20)[1];
  assert.ok(line.includes('T E L E X') && line.endsWith('01:05'));
});

test('header animé : la mascotte cligne des yeux en direct, plus en fin de session', () => {
  const eyes = (session, t) => header(META, session, plain, 80, t)[2].slice(1, 9);
  const live = Array.from({ length: 60 }, (_, t) => eyes({ ended_at: null }, t));
  assert.ok(live.includes(CLOSED));
  assert.ok(live.filter((e) => e === OPEN).length >= 50);
  assert.equal(eyes({ ended_at: null }, null), OPEN);
  const ended = { ended_at: new Date().toISOString() };
  assert.ok(Array.from({ length: 60 }, (_, t) => eyes(ended, t)).every((e) => e === OPEN));
  assert.ok(header(META, ended, plain, 80, 5)[1].includes('SESSION TERMINÉE'));
});

test('header : ne déborde jamais, même en couleur et sur terminal étroit', () => {
  for (const w of [24, 40, 60, 120]) for (const t of [null, 3, 40]) {
    for (const l of header({ ...META, project: 'un-projet-au-nom-vraiment-très-long' }, { ended_at: null }, style, w, t)) {
      assert.ok(visibleLength(l) < w, `${w}/${t}: ${l}`);
    }
  }
});
