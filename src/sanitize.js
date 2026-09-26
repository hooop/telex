// Neutralisation des séquences de contrôle du terminal.
// Le texte affiché vient de sources non fiables : récit de l'agent (qui peut subir
// une injection de prompt), sortie des commandes observées, contenu des fichiers du
// projet dans les diffs. Une séquence d'échappement laissée telle quelle pourrait
// changer le titre de la fenêtre, écrire dans le presse-papiers (OSC 52) ou déplacer
// le curseur pour effacer ou maquiller une ligne de la timeline.

const ESCAPE_SEQUENCES = new RegExp([
  '\\x1b\\[[0-?]*[ -/]*[@-~]', //          CSI : couleurs, déplacements du curseur, effacements
  '\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)?', // OSC : titre, presse-papiers, liens
  '\\x1b[PX^_][^\\x1b]*(?:\\x1b\\\\)?', //   DCS, SOS, PM, APC
  '\\x1b[\\s\\S]?', //                      autres séquences à deux caractères
  '\\x9b[0-?]*[ -/]*[@-~]', //              CSI sur un octet (C1)
].join('|'), 'g');

// Caractères de contrôle C0 et C1, sauf le saut de ligne ; retour chariot compris
// (barres de progression), et marques de direction bidi qui maquillent l'ordre du texte.
const CONTROL_CHARS = /[\x00-\x09\x0b-\x1f\x7f-\x9f‎‏‪-‮⁦-⁩]/g;

export function sanitize(text) {
  if (text == null) return text;
  return String(text).replace(ESCAPE_SEQUENCES, '').replace(/\t/g, '    ').replace(CONTROL_CHARS, '');
}
