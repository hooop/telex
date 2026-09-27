// Mise en forme texte de la timeline, partagée par l'interface interactive
// et l'affichage statique (replay --print, tests).
import { isStandaloneCheck, SYMBOL } from './timeline.js';
import { agentLabel } from './agents.js';
import { sanitize } from './sanitize.js';

const ESC = '\x1b[';
// Couleurs nommées par leur rôle (palette 256 couleurs).
export const style = {
  // Pas de gras : `bold` reste vide pour que tous ses usages s'affichent en graisse normale.
  reset: `${ESC}0m`, bold: '', dim: `${ESC}2m`, underline: `${ESC}4m`, inverse: `${ESC}7m`,
  ok: `${ESC}38;5;195m`, //       bleu pâle : étape réalisée ou vérifiée, ajout dans un diff
  error: `${ESC}38;5;225m`, //    rose pâle : erreur, fait contradictoire, retrait dans un diff
  accent: `${ESC}38;5;230m`, //   crème : étape en cours, touches, sélection
  muted: `${ESC}2;38;5;231m`, //  blanc atténué : détails secondaires, filets
  bright: `${ESC}38;5;231m`, //   blanc : heures, logo, informations principales
  check: `${ESC}38;5;49m`, //     vert : icône ✓
  cross: `${ESC}38;5;196m`, //    rouge : icône ✕
};

export const plain = Object.fromEntries(Object.keys(style).map((k) => [k, '']));

// Couleur de l'icône de chaque statut.
export const ICON_COLOR = { running: 'accent', done: 'check', validated: 'check', failed: 'cross', replaced: 'muted' };

export const INDENT = 13; // "HH:MM:SS  ●  "

export function clock(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function visibleLength(s) {
  return [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
}

// Tout texte venu de l'agent ou du projet passe par ici : les séquences de contrôle
// du terminal sont neutralisées avant affichage.
export function wrap(text, width) {
  const out = [];
  for (const para of sanitize(String(text)).split('\n')) {
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
  return `${s.muted}${'-'.repeat(Math.max(1, width - 1))}${s.reset}`;
}

// Rond à moitié rempli qui tourne (gauche, haut, droite, bas) pour une étape en cours,
// en alternant rose pâle et vert pâle à chaque image pour un effet scintillant.
const SPINNER = ['◐', '◓', '◑', '◒'];
const SPINNER_COLORS = [225, 194]; // rose pâle, vert pâle
export const SPINNER_TICKS = 1; // images d'animation par demi-rond

function symbol(entry, tick, s) {
  if (entry.status !== 'running' || tick == null) return `${s[ICON_COLOR[entry.status]]}${SYMBOL[entry.status]}${s.reset}`;
  const frame = Math.floor(tick / SPINNER_TICKS);
  const tint = s.reset ? `${ESC}38;5;${SPINNER_COLORS[frame % SPINNER_COLORS.length]}m` : '';
  return `${tint}${SPINNER[frame % SPINNER.length]}${s.reset}`;
}

// Lignes d'une entrée. `gutter` : colonnes de marge à gauche (repère de sélection),
// que la ligne pointillée recouvre pour traverser tout l'écran.
// `compact` : heure, symbole et titre seulement (le récit passe dans le panneau d'aperçu).
export function entryLines(entry, width, s = style, { tick = null, gutter = 0, compact = false } = {}) {
  const textWidth = Math.max(20, width - gutter - INDENT);
  const pad = ' '.repeat(gutter + INDENT);
  const [first, ...rest] = wrap(entry.title, textWidth);
  const lines = [`${' '.repeat(gutter)}${s.bright}${clock(entry.ts)}${s.reset}  ${symbol(entry, tick, s)}  ${entry.status === 'replaced' ? s.dim : s.bold}${first}${s.reset}`];
  for (const r of rest) lines.push(`${pad}${s.bold}${r}${s.reset}`);
  if (compact) return lines;
  if (entry.narrative) {
    lines.push(separator(width, s));
    for (const l of wrap(entry.narrative, textWidth)) lines.push(`${pad}${entry.status === 'replaced' ? s.dim : ''}${l}${s.reset}`);
  }
  if (entry.technical_detail) {
    lines.push('');
    for (const l of wrap(entry.technical_detail, textWidth)) lines.push(`${pad}${s.muted}${l}${s.reset}`);
  }
  if (entry.fact_note) {
    lines.push('');
    for (const l of wrap(entry.fact_note, textWidth)) lines.push(`${pad}${s.error}${l}${s.reset}`);
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
  else if (entry.end_ts && !isStandaloneCheck(entry)) info += ` · ${duration(Math.round((Date.parse(entry.end_ts) - Date.parse(entry.ts)) / 1000))}`;
  // Même habillage qu'une étape complète : pointillés, en-tête, pointillés, récit.
  const lines = [separator(width, s), `  ${s.bright}${info}${s.reset}`, separator(width, s)];

  const body = [];
  const dim = entry.status === 'replaced' ? s.dim : '';
  if (entry.narrative) body.push(...wrap(entry.narrative, textWidth).map((l) => `${dim}${l}${s.reset}`));
  if (entry.technical_detail) body.push(...wrap(entry.technical_detail, textWidth).map((l) => `${s.muted}${l}${s.reset}`));
  if (entry.fact_note) body.push(...wrap(entry.fact_note, textWidth).map((l) => `${s.error}${l}${s.reset}`));
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
// Des cases en tirets : la mascotte dans la sienne et, à sa droite, le logo avec
// le voyant en haut à droite, puis, sous un filet, la fiche de la session.
// Sans `tick`, l'en-tête est statique (replay --print,
// tests). Avec `tick` (compteur d'images de l'interface), le logo se frappe
// lettre par lettre puis, tant que la session est en direct, la mascotte cligne
// des yeux et le voyant pulse.

const LOGO = 'TELEX';
const PULSE = [240, 244, 248, 252, 230, 230, 252, 248, 244, 240];
export const HEADER_LINES = 6;

// Une couleur est un numéro de la palette 256 ou une valeur hexadécimale « #rrggbb ».
// L'hexadécimal s'affiche en 24 bits si le terminal les annonce (COLORTERM),
// sinon avec la teinte la plus proche de la palette 256.
const TRUECOLOR = /^(truecolor|24bit)$/i.test(process.env.COLORTERM || '');
const CUBE = [0, 95, 135, 175, 215, 255]; // niveaux du cube 6 × 6 × 6 (couleurs 16 à 231)

function palette256(rgb) {
  const near = (v) => CUBE.reduce((best, c, i) => (Math.abs(c - v) < Math.abs(CUBE[best] - v) ? i : best), 0);
  const cube = rgb.map(near);
  const level = Math.max(0, Math.min(23, Math.round(((rgb[0] + rgb[1] + rgb[2]) / 3 - 8) / 10))); // gris 232 à 255
  const gray = 8 + 10 * level;
  const dist = (other) => rgb.reduce((d, v, i) => d + (v - other[i]) ** 2, 0);
  return dist(cube.map((i) => CUBE[i])) <= dist([gray, gray, gray]) ? 16 + 36 * cube[0] + 6 * cube[1] + cube[2] : 232 + level;
}

function sgr(layer, color) {
  if (typeof color === 'number') return `${ESC}${layer};5;${color}m`;
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return TRUECOLOR ? `${ESC}${layer};2;${rgb.join(';')}m` : `${ESC}${layer};5;${palette256(rgb)}m`;
}

const fg = (s, color) => (s.reset ? sgr(38, color) : '');
const bg = (s, color) => (s.reset ? sgr(48, color) : '');

// Mascotte : une tête de 6 × 6 cases, visière sombre, deux yeux d'une case sur
// deux de haut, et deux oreilles larges d'une demi-case. Une case occupe une
// colonne sur une demi-ligne (▀ ▄), ce qui la garde à peu près carrée ; les
// oreilles sont des demi-blocs verticaux (▐ ▌). Sans couleurs, la visière reste vide.
const MASCOT_BODY = 255;
const MASCOT_VISOR = '#301300';
const MASCOT_EYE = '#ff9855';
const MASCOT_WIDTH = 8;
// Clignement : les yeux se ferment en un trait fin à mi-hauteur pendant BLINK_TICKS
// images toutes les BLINK_EVERY images (~4 s à 140 ms l'image).
const BLINK_EVERY = 30;
const BLINK_TICKS = 1;

function mascot(s, closed) {
  const body = (text) => `${fg(s, MASCOT_BODY)}${text}${s.reset}`;
  const eye = `${fg(s, MASCOT_EYE)}${closed ? '─' : '█'}`;
  return [
    ` ${body('▄████▄')} `,
    `${body('▐')}${bg(s, MASCOT_VISOR)} ${eye}  ${eye} ${s.reset}${body('▌')}`,
    ` ${body('▀████▀')} `,
  ];
}

function elapsed(from, to) {
  const secs = Math.max(0, Math.floor((to - Date.parse(from)) / 1000));
  const p = (n) => String(n).padStart(2, '0');
  const h = Math.floor(secs / 3600);
  return `${h ? `${h}:` : ''}${p(Math.floor(secs / 60) % 60)}:${p(secs % 60)}`;
}

// Logo « T E L E X », frappé lettre par lettre derrière un curseur de télescripteur.
function logo(s, tick) {
  const shown = tick == null ? LOGO.length : Math.min(LOGO.length, Math.floor(tick / 2) + 1);
  const cursor = shown < LOGO.length ? ` ${fg(s, 230)}▌` : '';
  return `${s.bright}${[...LOGO].slice(0, shown).join(' ')}${cursor}${s.reset}`;
}

function fit(text, width) {
  const clean = sanitize(text);
  return visibleLength(clean) <= width ? clean : [...clean].slice(0, Math.max(0, width - 1)).join('') + '…';
}

export function header(meta, session, s = style, width = 80, tick = null) {
  const agent = agentLabel(meta.agent);
  const live = !session.ended_at;
  const w = Math.max(20, width - 1); // une colonne de moins que l'écran
  // Sur un terminal trop étroit, la mascotte s'efface pour laisser la place au texte.
  const blink = live && tick != null && tick % BLINK_EVERY >= BLINK_EVERY - BLINK_TICKS;
  const cell = MASCOT_WIDTH + 2; // case de la mascotte, avant la barre « | »
  const face = w >= cell + 2 + 24 ? mascot(s, blink) : null;
  const room = face ? w - cell - 2 : w; // « | » puis une espace

  const title = logo(s, tick);
  const dot = live ? `${fg(s, tick == null ? 230 : PULSE[tick % PULSE.length])}●${s.reset}` : `${s.muted}■${s.reset}`;
  const state = live ? `${fg(s, 230)}EN DIRECT${s.reset}` : `${s.muted}SESSION ${session.interrupted ? 'INTERROMPUE' : 'TERMINÉE'}${s.reset}`;
  const chrono = meta.started_at && (tick != null || !live)
    ? `  ${fg(s, 195)}${elapsed(meta.started_at, live ? Date.now() : Date.parse(session.ended_at))}${s.reset}` : '';
  let badge = `${dot} ${state}${chrono}`;
  if (visibleLength(title) + 1 + visibleLength(badge) > room) badge = `${dot} ${state}`;
  if (visibleLength(title) + 1 + visibleLength(badge) > room) badge = dot;
  const top = `${title}${' '.repeat(Math.max(1, room - visibleLength(title) - visibleLength(badge)))}${badge}`;

  const project = fit(String(meta.project), Math.max(4, room - 31));
  const info = `${s.dim}PROJET ▸${s.reset} ${s.bright}${project}${s.reset}   ${s.dim}AGENT ▸${s.reset} ${s.bright}${agent}${s.reset}`;
  const infoRow = visibleLength(info) <= room ? info : `${s.bright}${fit(`${meta.project} · ${agent}`, room)}${s.reset}`;

  const rule = (n) => `${s.muted}${'-'.repeat(Math.max(0, n))}${s.reset}`;
  const cross = `${s.muted}+${s.reset}`;
  const bar = `${s.muted}|${s.reset}`;
  if (!face) return [rule(w), top, rule(w), infoRow, rule(w), ''];
  const border = `${rule(cell)}${cross}${rule(w - cell - 1)}`;
  return [
    border,
    ` ${face[0]} ${bar} ${top}`,
    ` ${face[1]} ${bar}${rule(w - cell - 1)}`,
    ` ${face[2]} ${bar} ${infoRow}`,
    border,
    '',
  ];
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
    const key = look === '' ? `${s.accent}${b.key}${s.reset}` : b.key;
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
