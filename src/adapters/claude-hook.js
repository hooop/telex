// Hook PostToolUse / PostToolUseFailure de Claude Code.
// Consigne les commandes shell réellement exécutées (tests, builds…) comme faits
// observés. Ne produit jamais de ligne de timeline : sert aux détails ([T], [Entrée]).
import path from 'node:path';
import { appendJsonl } from '../store.js';
import { redact } from '../redact.js';

const MAX_TAIL_LINES = 40;

export async function runClaudeHook() {
  const dir = process.env.TELEX_SESSION_DIR;
  if (!dir) return;
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch { return; }
  if (input.tool_name !== 'Bash') return;

  const command = input.tool_input?.command;
  if (!command) return;
  const failed = input.hook_event_name === 'PostToolUseFailure';
  const res = input.tool_response;
  let output = '';
  if (typeof res === 'string') output = res;
  else if (res) output = [res.stdout, res.stderr].filter(Boolean).join('\n');
  if (failed && input.error) output = [output, String(input.error)].filter(Boolean).join('\n');

  appendJsonl(path.join(dir, 'observed.jsonl'), {
    type: 'command',
    ts: new Date().toISOString(),
    source: 'claude',
    command: redact(command).slice(0, 2000),
    description: input.tool_input?.description ? redact(input.tool_input.description).slice(0, 200) : undefined,
    ok: !failed && !res?.interrupted,
    output_tail: redact(output.split('\n').slice(-MAX_TAIL_LINES).join('\n')).slice(0, 6000),
  });
}
