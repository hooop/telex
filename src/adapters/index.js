// Adaptateurs d'agents. Chacun sait seulement comment lancer le VRAI CLI de
// l'agent avec le serveur MCP telex et les consignes de timeline. Le reste
// (événements, timeline, stockage) est commun.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { agentInstructions, TOOL_NAME } from '../instructions.js';
import { agentLabel } from '../agents.js';
import { TELEX_HOME } from '../store.js';

export const TELEX_BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/telex.js');

// Cherche un exécutable dans le PATH donné.
export function which(bin, searchPath = process.env.PATH || '') {
  for (const dir of searchPath.split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, bin);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return file;
    } catch { /* absent de ce dossier */ }
  }
  return null;
}

// Repli : un shell de connexion voit aussi le PATH défini dans ~/.profile.
function whichLoginShell(bin) {
  try {
    return execFileSync('/bin/sh', ['-lc', `command -v ${bin}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim() || null;
  } catch {
    return null;
  }
}

function mcpServer(sessionDir, agent) {
  return {
    command: process.execPath,
    args: [TELEX_BIN, 'mcp'],
    env: { TELEX_SESSION_DIR: sessionDir, TELEX_AGENT: agent, TELEX_HOME },
  };
}

const claude = {
  id: 'claude',
  label: agentLabel('claude'),
  bin: 'claude',
  installHint: 'Installez Claude Code (https://docs.claude.com/claude-code) puis vérifiez que « claude --version » fonctionne.',
  locate: () => which('claude') || whichLoginShell('claude'),
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
    return ['--mcp-config', mcpFile, '--settings', settingsFile, '--append-system-prompt', agentInstructions()];
  },
};

const codex = {
  id: 'codex',
  label: agentLabel('codex'),
  bin: 'codex',
  installHint: 'Installez Codex CLI (https://github.com/openai/codex) puis vérifiez que « codex --version » fonctionne.',
  locate: () => which('codex') || whichLoginShell('codex'),
  prepare(sessionDir) {
    const server = mcpServer(sessionDir, 'codex');
    const env = Object.entries(server.env).map(([k, v]) => `${k}=${tomlStr(v)}`).join(', ');
    return [
      '-c', `mcp_servers.telex.command=${tomlStr(server.command)}`,
      '-c', `mcp_servers.telex.args=[${server.args.map(tomlStr).join(', ')}]`,
      '-c', `mcp_servers.telex.env={ ${env} }`,
      '-c', 'mcp_servers.telex.default_tools_approval_mode="approve"',
      '-c', `developer_instructions=${tomlStr(agentInstructions())}`,
    ];
  },
};

export const ADAPTERS = { claude, codex };

export function tomlStr(s) {
  return JSON.stringify(String(s)); // une chaîne JSON est une chaîne TOML basique valide
}

export function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
