// Erreurs destinées à l'utilisateur, et journal des erreurs des processus qui n'ont
// pas de console visible (serveur MCP, hook) : sessions/<id>/errors.jsonl, que la
// timeline affiche en bas de l'écran.
import fs from 'node:fs';
import path from 'node:path';
import { redact } from './redact.js';

// Erreur attendue (session introuvable, agent absent…) : son message suffit, sans trace.
export class TelexError extends Error {
  constructor(message, { hint, exitCode = 1, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'TelexError';
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

export function debugEnabled() {
  return /^(1|true|yes|oui)$/i.test(process.env.TELEX_DEBUG || '');
}

// Une ligne claire, la piste de résolution, et la trace seulement avec TELEX_DEBUG=1.
export function formatError(err) {
  const known = err instanceof TelexError;
  const lines = [`telex : ${known ? err.message : `erreur inattendue : ${err?.message ?? err}`}`];
  if (err?.hint) lines.push(err.hint);
  if (debugEnabled()) lines.push('', String(err?.stack ?? err));
  else if (!known) lines.push('Relancez avec TELEX_DEBUG=1 pour afficher la trace complète.');
  return lines.join('\n');
}

export function reportError(err) {
  process.stderr.write(formatError(err) + '\n');
  process.exitCode = err instanceof TelexError ? err.exitCode : 1;
}

export function logError(sessionDir, source, err) {
  if (!sessionDir) return;
  const entry = {
    type: 'error',
    ts: new Date().toISOString(),
    source,
    message: redact(String(err?.message ?? err)).slice(0, 500),
    stack: err?.stack ? redact(err.stack).slice(0, 4000) : undefined,
  };
  try {
    fs.appendFileSync(path.join(sessionDir, 'errors.jsonl'), JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch { /* journal lui-même indisponible (session supprimée…) : rien de plus à faire */ }
}
