// Mise en forme texte de la timeline, partagée par l'interface interactive
// et l'affichage statique (replay --print, tests).
import { SYMBOL } from './timeline.js';

const ESC = '\x1b[';
export const style = {
  reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, inverse: `${ESC}7m`,
  green: `${ESC}32m`, red: `${ESC}31m`, amber: `${ESC}33m`, gray: `${ESC}90m`, cyan: `${ESC}36m`,
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

// Lignes d'une entrée, sans marge de sélection.
export function entryLines(entry, width, s = style) {
  const color = s[STATUS_COLOR[entry.status]];
  const textWidth = Math.max(20, width - INDENT);
  const pad = ' '.repeat(INDENT);
  const [first, ...rest] = wrap(entry.title, textWidth);
  const lines = [`${s.gray}${clock(entry.ts)}${s.reset}  ${color}${SYMBOL[entry.status]}${s.reset}  ${entry.status === 'replaced' ? s.dim : s.bold}${first}${s.reset}`];
  for (const r of rest) lines.push(`${pad}${s.bold}${r}${s.reset}`);
  if (entry.narrative) {
    lines.push('');
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

export function staticTimeline({ meta, entries, session }, width = 80, s = plain) {
  const lines = header(meta, session, s);
  if (!entries.length) lines.push(`${s.dim}En attente de la première étape…${s.reset}`);
  entries.forEach((e, i) => {
    if (i) lines.push('');
    lines.push(...entryLines(e, width, s));
  });
  if (session.ended_at) lines.push('', ...footerSummary(entries, s));
  return lines.join('\n');
}

export function header(meta, session, s = style) {
  const agent = { claude: 'Claude Code', codex: 'Codex' }[meta.agent] || meta.agent;
  const live = session.ended_at ? `${s.gray}■ session terminée${s.reset}` : `${s.amber}●${s.reset} ${s.dim}en direct${s.reset}`;
  return [
    `${s.bold}TELEX${s.reset}   ${live}`,
    `${s.dim}Projet :${s.reset} ${meta.project}`,
    `${s.dim}Agent  :${s.reset} ${agent}`,
    '',
  ];
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
