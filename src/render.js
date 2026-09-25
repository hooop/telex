// Mise en forme texte de la timeline, partagée par l'interface interactive
// et l'affichage statique (replay --print, tests).
import { SYMBOL } from './timeline.js';

const ESC = '\x1b[';
export const style = {
  // Pas de gras : `bold` reste vide pour que tous ses usages s'affichent en graisse normale.
  reset: `${ESC}0m`, bold: '', dim: `${ESC}2m`, underline: `${ESC}4m`, inverse: `${ESC}7m`,
  // Palette 256 couleurs : 231 blanc, 230 crème, 195 bleu pâle, 225 rose pâle.
  green: `${ESC}38;5;195m`, red: `${ESC}38;5;225m`, amber: `${ESC}38;5;230m`, gray: `${ESC}2;38;5;231m`, white: `${ESC}38;5;231m`, cyan: `${ESC}38;5;230m`,
};

export const plain = Object.fromEntries(Object.keys(style).map((k) => [k, '']));

const STATUS_COLOR = { running: 'amber', done: 'green', validated: 'green', failed: 'red', replaced: 'gray' };

export const INDENT = 13; // "HH:MM:SS  ●  "

export function clock(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function visibleLength(s) {
  return [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
}

export function wrap(text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) { line = word; continue; }
      if (visibleLength(line) + 1 + visibleLength(word) > width) { out.push(line); line = word; } else line += ' ' + word;
    }
    // mot plus long que la largeur : coupure franche
    while (visibleLength(line) > width) { out.push([...line].slice(0, width).join('')); line = [...line].slice(width).join(''); }
    out.push(line);
  }
  return out;
}

// Ligne de tirets entre deux entrées ; une colonne de moins pour éviter le retour à la ligne automatique du terminal.
export function separator(width, s = style) {
  return `${s.gray}${'-'.repeat(Math.max(1, width - 1))}${s.reset}`;
}

// Rond à moitié rempli qui tourne (gauche, haut, droite, bas) pour une étape en cours,
// en alternant rose pâle et vert pâle à chaque image pour un effet scintillant.
const SPINNER = ['◐', '◓', '◑', '◒'];
const SPINNER_COLORS = [225, 194]; // rose pâle, vert pâle
export const SPINNER_TICKS = 1; // images d'animation par demi-rond

function symbol(entry, tick, s, color) {
  if (entry.status !== 'running' || tick == null) return `${color}${SYMBOL[entry.status]}${s.reset}`;
  const frame = Math.floor(tick / SPINNER_TICKS);
  const tint = s.reset ? `${ESC}38;5;${SPINNER_COLORS[frame % SPINNER_COLORS.length]}m` : '';
  return `${tint}${SPINNER[frame % SPINNER.length]}${s.reset}`;
}

// Lignes d'une entrée. `gutter` : colonnes de marge à gauche (repère de sélection),
// que la ligne pointillée recouvre pour traverser tout l'écran.
// `compact` : heure, symbole et titre seulement (le récit passe dans le panneau d'aperçu).
export function entryLines(entry, width, s = style, { tick = null, gutter = 0, compact = false } = {}) {
  const color = s[STATUS_COLOR[entry.status]];
  const textWidth = Math.max(20, width - gutter - INDENT);
  const pad = ' '.repeat(gutter + INDENT);
  const [first, ...rest] = wrap(entry.title, textWidth);
  const lines = [`${' '.repeat(gutter)}${s.white}${clock(entry.ts)}${s.reset}  ${symbol(entry, tick, s, color)}  ${entry.status === 'replaced' ? s.dim : s.bold}${first}${s.reset}`];
  for (const r of rest) lines.push(`${pad}${s.bold}${r}${s.reset}`);
  if (compact) return lines;
  if (entry.narrative) {
    lines.push(separator(width, s));
    for (const l of wrap(entry.narrative, textWidth)) lines.push(`${pad}${entry.status === 'replaced' ? s.dim : ''}${l}${s.reset}`);
  }
  if (entry.technical_detail) {
    lines.push('');
    for (const l of wrap(entry.technical_detail, textWidth)) lines.push(`${pad}${s.gray}${l}${s.reset}`);
  }
  if (entry.fact_note) {
    lines.push('');
    for (const l of wrap(entry.fact_note, textWidth)) lines.push(`${pad}${s.red}${l}${s.reset}`);
  }
  return lines;
}

export const STATUS_LABEL = { running: 'en cours', done: 'réalisée', validated: 'vérification exécutée', failed: 'erreur', replaced: 'approche remplacée' };

export function duration(secs) {
  if (secs < 60) return `${secs} s`;
  const m = Math.floor(secs / 60);
  return m < 60 ? `${m} min ${String(secs % 60).padStart(2, '0')} s` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

// Panneau d'aperçu de l'étape sélectionnée, en bas de la timeline compacte.
// Hauteur fixe (`height` lignes) pour que la liste ne saute pas d'une étape à l'autre.
export function previewLines(entry, { index, count, width, height, now = Date.now(), s = style }) {
  const textWidth = Math.max(20, width - 2);
  let info = `étape ${index + 1}/${count} · ${STATUS_LABEL[entry.status]}`;
  if (entry.status === 'running') info += ` depuis ${duration(Math.max(0, Math.round((now - Date.parse(entry.ts)) / 1000)))}`;
  else if (entry.end_ts && entry.status !== 'validated') info += ` · ${duration(Math.round((Date.parse(entry.end_ts) - Date.parse(entry.ts)) / 1000))}`;
  // Même habillage qu'une étape complète : pointillés, en-tête, pointillés, récit.
  const lines = [separator(width, s), `  ${s.white}${info}${s.reset}`, separator(width, s)];

  const body = [];
  const dim = entry.status === 'replaced' ? s.dim : '';
  if (entry.narrative) body.push(...wrap(entry.narrative, textWidth).map((l) => `${dim}${l}${s.reset}`));
  if (entry.technical_detail) body.push(...wrap(entry.technical_detail, textWidth).map((l) => `${s.gray}${l}${s.reset}`));
  if (entry.fact_note) body.push(...wrap(entry.fact_note, textWidth).map((l) => `${s.red}${l}${s.reset}`));
  if (!body.length) body.push(`${s.dim}Pas de récit pour cette étape.${s.reset}`);

  const room = height - lines.length;
  if (body.length > room) body.splice(room - 1, Infinity, `${s.dim}… suite dans les détails [↵]${s.reset}`);
  lines.push(...body.map((l) => '  ' + l));
  while (lines.length < height) lines.push('');
  return lines;
}

export function staticTimeline({ meta, entries, session }, width = 80, s = plain) {
  const lines = header(meta, session, s, width);
  if (!entries.length) lines.push(`${s.dim}Prêt${s.reset}`);
  // Chaque entrée est encadrée par une ligne pointillée, partagée entre deux entrées voisines.
  for (const e of entries) lines.push(separator(width, s), ...entryLines(e, width, s));
  if (entries.length) lines.push(separator(width, s));
  if (session.ended_at) lines.push('', ...footerSummary(entries, s));
  return lines.join('\n');
}

// ─── En-tête ───────────────────────────────────────────────────────────────
// Façade de téléscripteur : un cadre en filets, une plaque signalétique pour le
// logo, des voyants en majuscules et, sous l'appareil, une bande perforée.
// Sans `tick`, l'en-tête est statique (replay --print, tests). Avec `tick`
// (compteur d'images de l'interface), le logo se frappe lettre par lettre sur
// sa plaque puis, tant que la session est en direct, le dégradé de la plaque
// ondule, un reflet la parcourt, le voyant pulse et la bande défile.

const LOGO = 'TELEX';
const LOGO_GRADIENT = [230, 224, 225, 189, 195]; // crème → rose → lavande → bleu pâle
const PULSE = [240, 244, 248, 252, 230, 230, 252, 248, 244, 240];
const PLATE_INK = 236; // lettres gravées sur la plaque
const PLATE_BLANK = 238; // emplacement pas encore frappé
const TAPE_INK = 230;
export const HEADER_LINES = 6;

const fg = (s, n) => (s.reset ? `${ESC}38;5;${n}m` : '');
const bg = (s, n) => (s.reset ? `${ESC}48;5;${n}m` : '');

function elapsed(from, to) {
  const secs = Math.max(0, Math.floor((to - Date.parse(from)) / 1000));
  const p = (n) => String(n).padStart(2, '0');
  const h = Math.floor(secs / 3600);
  return `${h ? `${h}:` : ''}${p(Math.floor(secs / 60) % 60)}:${p(secs % 60)}`;
}

const TYPED = LOGO.length * 2; // images nécessaires pour frapper le logo

// Plaque « T E L E X » : chaque lettre sur un fond de la palette.
// Sans couleurs, la plaque est simplement entre crochets.
function plate(s, tick, live) {
  const shown = tick == null ? LOGO.length : Math.min(LOGO.length, Math.floor(tick / 2) + 1);
  const moving = live && tick != null && tick >= TYPED;
  // Le dégradé glisse d'une lettre toutes les 3 images ; un reflet traverse la plaque toutes les ~2 s.
  const phase = moving ? Math.floor((tick - TYPED) / 3) : 0;
  const shine = moving ? (tick - TYPED) % 14 : -1;
  const tint = (i) => (i === shine ? 231 : LOGO_GRADIENT[(i + phase) % LOGO_GRADIENT.length]);
  const cells = [...LOGO].map((ch, i) => {
    if (i < shown) return `${bg(s, tint(i))}${fg(s, PLATE_INK)} ${ch}`;
    // Curseur de télescripteur sur l'emplacement suivant.
    return `${bg(s, PLATE_BLANK)}${fg(s, 230)} ${i === shown ? '▌' : ' '}`;
  });
  const end = `${bg(s, shown === LOGO.length ? tint(LOGO.length - 1) : PLATE_BLANK)} ${s.reset}`;
  return s.reset ? `${cells.join('')}${end}` : `[${cells.join('')} ]`;
}

// Code Baudot (ITA2), trous 1 à 5 ; les caractères hors alphabet passent en espace.
const ITA2 = {
  A: '11000', B: '10011', C: '01110', D: '10010', E: '10000', F: '10110', G: '01011', H: '00101', I: '01100',
  J: '11010', K: '11110', L: '01001', M: '00111', N: '00110', O: '00011', P: '01101', Q: '11101', R: '01010',
  S: '10100', T: '00001', U: '11100', V: '01111', W: '11001', X: '10111', Y: '10101', Z: '10001', ' ': '00100',
};

// Bande perforée sur deux lignes de braille (8 rangées de points) : bord, trous 1-2,
// entraînement, trous 3-5, bord. Une colonne de points par caractère.
function tape(text, width, s, offset) {
  const codes = [...text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()].map((ch) => ITA2[ch] ?? ITA2[' ']);
  const rows = (code) => [false, code[0] === '1', code[1] === '1', true, code[2] === '1', code[3] === '1', code[4] === '1', false];
  const DOT = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]]; // [colonne][rangée] dans une cellule braille
  const lines = ['', ''];
  for (let cell = 0; cell < width; cell++) {
    const bits = [0, 0];
    for (const col of [0, 1]) {
      const r = rows(codes[(cell * 2 + col + offset) % codes.length]);
      r.forEach((on, row) => { if (on) bits[row >> 2] |= DOT[col][row & 3]; });
    }
    lines[0] += String.fromCharCode(0x2800 + bits[0]);
    lines[1] += String.fromCharCode(0x2800 + bits[1]);
  }
  return lines.map((l) => `${fg(s, TAPE_INK)}${s.dim}${l}${s.reset}`);
}

function fit(text, width) {
  return visibleLength(text) <= width ? text : [...text].slice(0, Math.max(0, width - 1)).join('') + '…';
}

export function header(meta, session, s = style, width = 80, tick = null) {
  const agent = { claude: 'Claude Code', codex: 'Codex' }[meta.agent] || meta.agent;
  const live = !session.ended_at;
  const w = Math.max(20, width - 1); // largeur du cadre, une colonne de moins que l'écran
  const inner = w - 4; // « │ » … « │ »
  const line = (n) => `${s.gray}${'─'.repeat(Math.max(0, n))}${s.reset}`;
  const side = `${s.gray}│${s.reset}`;
  const row = (left, right = '') => {
    const gap = Math.max(1, inner - visibleLength(left) - visibleLength(right));
    return `${side} ${left}${' '.repeat(gap)}${right} ${side}`;
  };

  // Filet du haut, avec l'étiquette gravée de l'appareil.
  const label = ' TÉLÉSCRIPTEUR ';
  const top = w >= label.length + 6
    ? `${s.gray}╭─${s.reset}${s.dim}${label}${s.reset}${line(w - 3 - label.length)}${s.gray}╮${s.reset}`
    : `${s.gray}╭${s.reset}${line(w - 2)}${s.gray}╮${s.reset}`;

  const logo = plate(s, tick, live);
  const dot = live ? `${fg(s, tick == null ? 230 : PULSE[tick % PULSE.length])}●${s.reset}` : `${s.gray}■${s.reset}`;
  const state = live ? `${fg(s, 230)}EN DIRECT${s.reset}` : `${s.gray}SESSION TERMINÉE${s.reset}`;
  const chrono = meta.started_at && (tick != null || !live)
    ? `  ${fg(s, 195)}${elapsed(meta.started_at, live ? Date.now() : Date.parse(session.ended_at))}${s.reset}` : '';
  let badge = `${dot} ${state}${chrono}`;
  if (visibleLength(logo) + visibleLength(badge) + 1 > inner) badge = `${dot} ${state}`;
  if (visibleLength(logo) + visibleLength(badge) + 1 > inner) badge = dot;

  const project = fit(String(meta.project), Math.max(4, inner - 30));
  const info = `${s.dim}PROJET ▸${s.reset} ${s.white}${project}${s.reset}   ${s.dim}AGENT ▸${s.reset} ${s.white}${agent}${s.reset}`;
  const infoRow = visibleLength(info) <= inner ? info : `${s.white}${fit(`${project} · ${agent}`, inner)}${s.reset}`;

  const bottom = `${s.gray}╰${s.reset}${line(w - 2)}${s.gray}╯${s.reset}`;
  // La bande sort de l'appareil et avance d'une colonne par image tant que la session est en direct.
  const feed = live && tick != null ? tick : 0;
  return [top, row(logo, badge), row(infoRow), bottom, ...tape(`TELEX ${meta.project} ${agent} `, w, s, feed)];
}

// Barre de boutons du bas. Chaque bouton : { id, key, label, active, disabled } ;
// sans id, c'est une simple indication. Si la barre déborde, les libellés disparaissent.
export function buttonBar(buttons, width, { focus = null, info = '', s = style } = {}) {
  const text = (b, withLabel) => ` ${b.key}${withLabel && b.label ? ' ' + b.label : ''} `;
  const withLabel = 1 + buttons.reduce((n, b) => n + visibleLength(text(b, true)) + 1, 0) <= width;
  let line = ' ';
  let col = 2;
  for (const b of buttons) {
    const t = text(b, withLabel);
    if (col + visibleLength(t) - 1 > width) break;
    let look = s.dim;
    if (b.id && b.id === focus) look = s.inverse + s.bold;
    else if (b.active) look = s.bold + s.underline;
    else if (b.id && !b.disabled) look = '';
    const key = look === '' ? `${s.amber}${b.key}${s.reset}` : b.key;
    line += `${look} ${key}${withLabel && b.label ? ' ' + b.label : ''} ${s.reset} `;
    col += visibleLength(t) + 1;
  }
  const room = width - col;
  if (info && visibleLength(info) + 2 <= room) line += ' '.repeat(room - visibleLength(info)) + `${s.dim}${info}${s.reset}`;
  return line;
}

export function footerSummary(entries, s = style) {
  const n = (st) => entries.filter((e) => e.status === st).length;
  const parts = [`${n('done')} étape${n('done') > 1 ? 's' : ''} réalisée${n('done') > 1 ? 's' : ''}`];
  if (n('validated')) parts.push(`${n('validated')} vérification${n('validated') > 1 ? 's' : ''} exécutée${n('validated') > 1 ? 's' : ''}`);
  if (n('failed')) parts.push(`${n('failed')} erreur${n('failed') > 1 ? 's' : ''}`);
  if (n('replaced')) parts.push(`${n('replaced')} approche${n('replaced') > 1 ? 's' : ''} remplacée${n('replaced') > 1 ? 's' : ''}`);
  if (n('running')) parts.push(`${n('running')} non terminée${n('running') > 1 ? 's' : ''}`);
  return [`${s.dim}Bilan : ${parts.join(' · ')}${s.reset}`];
}
