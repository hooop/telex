// Hook PostToolUse / PostToolUseFailure de Claude Code.
// Consigne les commandes shell réellement exécutées (tests, builds…) comme faits
// observés. Ne produit jamais de ligne de timeline : sert aux détails ([T], [Entrée]).
// Un hook ne doit jamais gêner l'agent : toute erreur est consignée dans la session,
// jamais renvoyée.
import path from 'node:path';
import { appendJsonl } from '../store.js';
import { redact } from '../redact.js';
import { sanitize } from '../sanitize.js';
import { logError } from '../errors.js';

const MAX_TAIL_LINES = 40;

export async function runClaudeHook() {
  const dir = process.env.TELEX_SESSION_DIR;
  if (!dir) return;
  try {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    recordCommand(dir, JSON.parse(raw));
  } catch (err) {
    logError(dir, 'hook Claude Code', err);
  }
}

export function recordCommand(dir, input) {
  if (input?.tool_name !== 'Bash') return;
  const command = input.tool_input?.command;
  if (!command) return;
  const failed = input.hook_event_name === 'PostToolUseFailure';
  const res = input.tool_response;
  let output = '';
  if (typeof res === 'string') output = res;
  else if (res) output = [res.stdout, res.stderr].filter(Boolean).join('\n');
  if (failed && input.error) output = [output, String(input.error)].filter(Boolean).join('\n');
  const clean = (text) => redact(sanitize(String(text)));

  appendJsonl(path.join(dir, 'observed.jsonl'), {
    type: 'command',
    ts: new Date().toISOString(),
    source: 'claude',
    command: clean(command).slice(0, 2000),
    description: input.tool_input?.description ? clean(input.tool_input.description).slice(0, 200) : undefined,
    ok: !failed && !res?.interrupted,
    output_tail: clean(String(output).split('\n').slice(-MAX_TAIL_LINES).join('\n')).slice(0, 6000),
  });
}
