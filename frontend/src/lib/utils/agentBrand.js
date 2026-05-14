// Per-agent brand identity — color + display name, keyed by case-insensitive
// substring match on the agent name. The hex values are intentionally fixed
// (vendor brand colors, not theme tokens) and don't flip with dark mode.
// design-system-allow: hex

const BRAND = {
  'claude-code': { color: '#FF6B35', name: 'Claude Code' },
  claude: { color: '#FF6B35', name: 'Claude' },
  cursor: { color: '#10b981', name: 'Cursor' },
  copilot: { color: '#0ea5e9', name: 'Copilot' },
  aider: { color: '#8b5cf6', name: 'Aider' },
  chatgpt: { color: '#10a37f', name: 'ChatGPT' },
  gpt: { color: '#10a37f', name: 'GPT' },
  ollama: { color: '#06b6d4', name: 'Ollama' },
  llama: { color: '#8B5CF6', name: 'Llama' },
  mistral: { color: '#E11D48', name: 'Mistral' },
  codellama: { color: '#7C3AED', name: 'Code Llama' },
  deepseek: { color: '#0EA5E9', name: 'DeepSeek' },
  qwen: { color: '#14B8A6', name: 'Qwen' },
  phi: { color: '#6366F1', name: 'Phi' },
  starcoder: { color: '#D97706', name: 'StarCoder' },
  'lm-studio': { color: '#22C55E', name: 'LM Studio' },
  'local-model': { color: '#A855F7', name: 'Local Model' },
  manual: { color: '#6b7280', name: 'Manual' }
};

const DEFAULT = { color: '#9ca3af', name: 'Unknown' };

// Per-subagent-type brand colors — matches Claude Code's built-in agent types.
// Keyed exactly (not substring-matched) because type names are short and stable.
/** @type {Record<string, string>} */
const SUBAGENT_TYPE = {
  'general-purpose': '#FF6B35',
  Explore: '#10A37F',
  Plan: '#4285F4',
  'code-reviewer': '#F39C12'
};

// Rotating palette for unknown agents in charts — keeps lines visually distinct
// when getAgentColor can't match a brand. Order matters: most distinct first.
export const FALLBACK_AGENT_PALETTE = ['#10A37F', '#4285F4', '#A855F7', '#EC4899'];

/**
 * Look up brand color + display name by agent identifier.
 * Case-insensitive substring match — passes "Claude Code 4.6" or "claude-code-1m" all match the
 * "claude-code" entry. Always returns an object with color and name.
 *
 * @param {string} agentName
 * @returns {{ color: string, name: string }}
 */
export function getAgentBrand(agentName) {
  const lower = (agentName || '').toLowerCase();
  for (const [key, config] of Object.entries(BRAND)) {
    if (lower.includes(key)) return config;
  }
  return DEFAULT;
}

/**
 * Just the brand color, with optional fallback (useful for inline styles
 * where a literal color string is needed).
 *
 * @param {string} agentName
 * @param {string} [fallback]
 * @returns {string}
 */
export function getAgentColor(agentName, fallback) {
  return getAgentBrand(agentName)?.color ?? fallback ?? DEFAULT.color;
}

/**
 * Look up color for a subagent type (general-purpose, Explore, Plan, code-reviewer).
 * Falls back to neutral gray for unknown types.
 *
 * @param {string} type
 * @returns {string}
 */
export function getSubagentTypeColor(type) {
  return SUBAGENT_TYPE[type] || '#6b7280';
}
