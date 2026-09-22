// Adaptateurs d'agents. Chacun sait seulement comment lancer le VRAI CLI de
// l'agent avec le serveur MCP telex et les consignes de timeline. Le reste
// (événements, timeline, stockage) est commun.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { AGENT_INSTRUCTIONS, TOOL_NAME } from '../instructions.js';

export const TELEX_BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/telex.js');

function which(bin) {
  try {
    return execFileSync('/bin/sh', ['-lc', `command -v ${bin}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function mcpServer(sessionDir, agent) {
  return {
    command: process.execPath,
    args: [TELEX_BIN, 'mcp'],
    env: { TELEX_SESSION_DIR: sessionDir, TELEX_AGENT: agent },
  };
}

const claude = {
  id: 'claude',
  label: 'Claude Code',
  bin: 'claude',
  locate: () => which('claude'),
  // Tout passe par des options de lancement : la configuration de l'utilisateur
  // (~/.claude, .claude/ du projet) n'est jamais modifiée.
  prepare(sessionDir) {
    const mcpFile = path.join(sessionDir, 'claude-mcp.json');
    const settingsFile = path.join(sessionDir, 'claude-settings.json');
    const server = mcpServer(sessionDir, 'claude');
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { telex: { type: 'stdio', ...server } } }, null, 2), { mode: 0o600 });
    const hookCommand = `TELEX_SESSION_DIR=${shq(sessionDir)} ${shq(process.execPath)} ${shq(TELEX_BIN)} hook claude`;
    const hook = [{ matcher: 'Bash', hooks: [{ type: 'command', command: hookCommand, timeout: 10 }] }];
    fs.writeFileSync(settingsFile, JSON.stringify({
      permissions: { allow: [`mcp__telex__${TOOL_NAME}`] },
      hooks: { PostToolUse: hook, PostToolUseFailure: hook },
    }, null, 2), { mode: 0o600 });
    return ['--mcp-config', mcpFile, '--settings', settingsFile, '--append-system-prompt', AGENT_INSTRUCTIONS];
  },
  observes: ['commandes shell (hook PostToolUse)', 'fichiers (instantanés)'],
};

const codex = {
  id: 'codex',
  label: 'Codex',
  bin: 'codex',
  locate: () => which('codex'),
  prepare(sessionDir) {
    const server = mcpServer(sessionDir, 'codex');
    const env = Object.entries(server.env).map(([k, v]) => `${k}=${tomlStr(v)}`).join(', ');
    return [
      '-c', `mcp_servers.telex.command=${tomlStr(server.command)}`,
      '-c', `mcp_servers.telex.args=[${server.args.map(tomlStr).join(', ')}]`,
      '-c', `mcp_servers.telex.env={ ${env} }`,
      '-c', 'mcp_servers.telex.default_tools_approval_mode="approve"',
      '-c', `developer_instructions=${tomlStr(AGENT_INSTRUCTIONS)}`,
    ];
  },
  observes: ['fichiers (instantanés)'],
};

export const ADAPTERS = { claude, codex };

export function tomlStr(s) {
  return JSON.stringify(String(s)); // une chaîne JSON est une chaîne TOML basique valide
}

export function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
