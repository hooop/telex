// Noms affichés des agents pris en charge.
export const AGENT_LABELS = { claude: 'Claude Code', codex: 'Codex' };

export function agentLabel(id) {
  return AGENT_LABELS[id] || String(id ?? 'agent');
}
