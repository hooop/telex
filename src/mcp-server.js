// Serveur MCP stdio minimal (JSON-RPC 2.0, un message par ligne), sans dépendance.
// Lancé par l'agent lui-même ; il écrit dans la session désignée par TELEX_SESSION_DIR.
import path from 'node:path';
import readline from 'node:readline';
import { appendJsonl, readMeta } from './store.js';
import { redact, redactDeep } from './redact.js';
import { Workspace } from './workspace.js';
import { AGENT_INSTRUCTIONS, TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA } from './instructions.js';

const EVENTS = new Set(['start', 'complete', 'fail', 'replace', 'validate']);

export function runMcpServer() {
  const dir = process.env.TELEX_SESSION_DIR;
  const eventsFile = dir && path.join(dir, 'events.jsonl');
  let workspace = null;
  const getWorkspace = () => {
    if (!workspace && dir) workspace = new Workspace(dir, readMeta(dir).cwd).init();
    return workspace;
  };

  const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const { id, method, params } = msg;
    if (id === undefined) return; // notifications (initialized, cancelled…)

    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'telex', version: '0.1.0' },
          instructions: AGENT_INSTRUCTIONS,
        });
      case 'ping':
        return reply(id, {});
      case 'tools/list':
        return reply(id, {
          tools: [{
            name: TOOL_NAME,
            description: TOOL_DESCRIPTION,
            inputSchema: TOOL_SCHEMA,
            annotations: { title: 'Timeline telex', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
          }],
        });
      case 'tools/call': {
        if (params?.name !== TOOL_NAME) return error(id, -32602, `Outil inconnu : ${params?.name}`);
        const result = handleUpdate(params.arguments || {});
        return reply(id, { content: [{ type: 'text', text: result.text }], isError: !result.ok });
      }
      default:
        return error(id, -32601, `Méthode non prise en charge : ${method}`);
    }
  });

  function handleUpdate(args) {
    if (!eventsFile) return { ok: false, text: 'telex inactif : aucune session (TELEX_SESSION_DIR absent).' };
    if (!EVENTS.has(args.event)) return { ok: false, text: `event doit être l'un de : ${[...EVENTS].join(', ')}` };
    if (!args.step_id || !args.title) return { ok: false, text: 'step_id et title sont requis.' };

    const ws = getWorkspace();
    const tree = ws?.snapshot() ?? null;
    const clean = redactDeep({
      event: args.event,
      step_id: String(args.step_id).slice(0, 80),
      title: String(args.title).slice(0, 160),
      narrative: args.narrative ? String(args.narrative).slice(0, 800) : undefined,
      technical_detail: args.technical_detail ? String(args.technical_detail).slice(0, 800) : undefined,
      feature_id: args.feature_id ? String(args.feature_id).slice(0, 80) : undefined,
      evidence: Array.isArray(args.evidence) ? args.evidence.slice(0, 12).map((e) => redact(String(e).slice(0, 300))) : undefined,
    });
    appendJsonl(eventsFile, { type: 'step', ts: new Date().toISOString(), source: process.env.TELEX_AGENT || 'agent', tree, ...clean });
    return { ok: true, text: 'ok' };
  }
}
