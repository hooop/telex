// Serveur MCP stdio minimal (JSON-RPC 2.0, un message par ligne), sans dépendance.
// Lancé par l'agent lui-même ; il écrit dans la session désignée par TELEX_SESSION_DIR.
// Une erreur n'arrête jamais le serveur : elle est renvoyée à l'agent et consignée
// dans errors.jsonl, que la timeline affiche.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { appendJsonl, readMeta } from './store.js';
import { redact, redactDeep } from './redact.js';
import { sanitize } from './sanitize.js';
import { Workspace } from './workspace.js';
import { AGENT_INSTRUCTIONS, agentInstructions, TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA } from './instructions.js';
import { logError } from './errors.js';
import { VERSION } from './version.js';

const EVENTS = new Set(['start', 'complete', 'fail', 'replace', 'validate']);

// Versions du protocole MCP connues, de la plus ancienne à la plus récente. Une version
// demandée qu'on connaît est acceptée telle quelle ; sinon on propose la plus récente.
export const PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];

export function negotiateProtocol(requested) {
  return PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS.at(-1);
}

export function runMcpServer() {
  const dir = process.env.TELEX_SESSION_DIR;
  const eventsFile = dir && path.join(dir, 'events.jsonl');
  const logged = new Set(); // une erreur répétée n'est consignée qu'une fois
  const logOnce = (source, err) => {
    const key = `${source}:${err?.message}`;
    if (!logged.has(key)) { logged.add(key); logError(dir, source, err); }
  };

  let workspace = null;
  const getWorkspace = () => {
    if (!workspace) workspace = new Workspace(dir, readMeta(dir).cwd).init();
    return workspace;
  };

  const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.on('error', () => process.exit(0)); // l'agent a fermé le canal

  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return error(null, -32700, 'Message JSON invalide.'); }
    if (msg?.id === undefined) return; // notifications (initialized, cancelled…)
    try {
      handle(msg);
    } catch (err) {
      logOnce('serveur MCP', err);
      if (msg.method === 'tools/call') reply(msg.id, { content: [{ type: 'text', text: `telex : ${err.message}` }], isError: true });
      else error(msg.id, -32603, `Erreur interne de telex : ${err.message}`);
    }
  });

  function handle({ id, method, params }) {
    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: negotiateProtocol(params?.protocolVersion),
          capabilities: { tools: {} },
          serverInfo: { name: 'telex', version: VERSION },
          instructions: instructions(),
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
            // Claude Code diffère les outils MCP quand il y en a beaucoup : le modèle ne voit
            // alors que le nom et doit le charger avant usage, ce qu'il omet. On demande
            // que l'outil soit toujours chargé.
            _meta: { 'anthropic/alwaysLoad': true, 'anthropic/searchHint': 'timeline telex étape progression' },
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
  }

  function instructions() {
    try {
      return agentInstructions();
    } catch (err) {
      logOnce('consignes', err);
      return AGENT_INSTRUCTIONS;
    }
  }

  function handleUpdate(args) {
    if (!eventsFile) return { ok: false, text: 'telex inactif : aucune session (TELEX_SESSION_DIR absent).' };
    if (!fs.existsSync(eventsFile)) return { ok: false, text: 'telex : la session n’existe plus (supprimée ?). La timeline n’est plus alimentée.' };
    if (!EVENTS.has(args.event)) return { ok: false, text: `event doit être l'un de : ${[...EVENTS].join(', ')}` };
    if (!args.step_id || !args.title) return { ok: false, text: 'step_id et title sont requis.' };

    // Sans instantané, la ligne est tout de même écrite : seuls les fichiers et le diff manqueront.
    let tree = null;
    try {
      const ws = getWorkspace();
      if (!ws.available) logOnce('instantanés', ws.error);
      tree = ws.snapshot();
      if (tree === null && ws.lastError) logOnce('instantanés', ws.lastError);
    } catch (err) {
      logOnce('instantanés', err);
    }
    const text = (v, max) => sanitize(String(v)).slice(0, max);
    const clean = redactDeep({
      event: args.event,
      step_id: text(args.step_id, 80),
      title: text(args.title, 160),
      narrative: args.narrative ? text(args.narrative, 800) : undefined,
      technical_detail: args.technical_detail ? text(args.technical_detail, 800) : undefined,
      feature_id: args.feature_id ? text(args.feature_id, 80) : undefined,
      evidence: Array.isArray(args.evidence) ? args.evidence.slice(0, 12).map((e) => redact(text(e, 300))) : undefined,
    });
    appendJsonl(eventsFile, { type: 'step', ts: new Date().toISOString(), source: process.env.TELEX_AGENT || 'agent', tree, ...clean });
    return { ok: true, text: 'ok' };
  }
}
