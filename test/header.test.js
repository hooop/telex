import test from 'node:test';
import assert from 'node:assert/strict';
import { HEADER_LINES, header, plain, style, visibleLength } from '../src/render.js';

const META = { project: 'telex', agent: 'claude', started_at: new Date(Date.now() - 65_000).toISOString() };

test('header statique : cadre, plaque, voyant, projet et agent, sans chrono en direct', () => {
  const lines = header(META, { ended_at: null }, plain, 80);
  assert.equal(lines.length, HEADER_LINES);
  assert.ok(lines[0].startsWith('╭─ TÉLÉSCRIPTEUR ') && lines[0].endsWith('╮'));
  assert.ok(lines[1].includes('[ T E L E X ]') && lines[1].includes('● EN DIRECT'));
  assert.ok(!/\d\d:\d\d/.test(lines[1]));
  assert.ok(lines[2].includes('PROJET ▸ telex') && lines[2].includes('AGENT ▸ Claude Code'));
  assert.match(lines[3], /^╰─+╯$/);
});

test('header animé : le logo se frappe lettre par lettre et le chrono tourne', () => {
  assert.ok(header(META, { ended_at: null }, plain, 80, 0)[1].includes('[ T ▌'));
  const line = header(META, { ended_at: null }, plain, 80, 20)[1];
  assert.ok(line.includes('T E L E X') && line.includes('01:05'));
});

test('header animé : la plaque ondule et la bande défile en direct, tout se fige en fin de session', () => {
  const logoAt = (session, t) => header(META, session, style, 80, t)[1].split('●')[0];
  const tapeAt = (session, t) => header(META, session, plain, 80, t).slice(4).join('\n');
  assert.notEqual(logoAt({ ended_at: null }, 20), logoAt({ ended_at: null }, 23));
  assert.notEqual(tapeAt({ ended_at: null }, 20), tapeAt({ ended_at: null }, 21));
  const ended = { ended_at: new Date().toISOString() };
  assert.equal(logoAt(ended, 20), logoAt(ended, 23));
  assert.equal(tapeAt(ended, 20), tapeAt(ended, 21));
  assert.ok(header(META, ended, plain, 80, 5)[1].includes('SESSION TERMINÉE'));
});

test('header : la bande perforée code le texte en Baudot, avec la rangée d’entraînement', () => {
  const [top, bottom] = header({ ...META, agent: 'codex' }, { ended_at: null }, plain, 80).slice(4);
  assert.ok([...top].every((c) => c >= '\u2800' && c <= '\u28ff'));
  // Rangée 3 de la première ligne (points 7 et 8) : trou d'entraînement à chaque colonne.
  assert.ok([...top].every((c) => ((c.charCodeAt(0) - 0x2800) & 0xc0) === 0xc0));
  // « T » = 00001 : seul le trou 5 est percé dans la première colonne.
  assert.equal((top.charCodeAt(0) - 0x2800) & 0x06, 0);
  assert.equal((bottom.charCodeAt(0) - 0x2800) & 0x07, 0x04);
});

test('header : ne déborde jamais, même en couleur et sur terminal étroit', () => {
  for (const w of [40, 60, 120]) for (const t of [null, 3, 40]) {
    for (const l of header({ ...META, project: 'un-projet-au-nom-vraiment-très-long' }, { ended_at: null }, style, w, t)) {
      assert.ok(visibleLength(l) < w, `${w}/${t}: ${l}`);
    }
  }
});
