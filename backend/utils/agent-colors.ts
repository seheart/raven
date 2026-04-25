export const AGENT_COLORS: Record<string, string> = {
  claude: '#FF6B35',
  codex: '#10A37F',
  gpt: '#10A37F',
  gemini: '#4285F4',
  ollama: '#F39C12',
  llama: '#8B5CF6',
  mistral: '#E11D48',
  codellama: '#7C3AED',
  deepseek: '#0EA5E9',
  qwen: '#14B8A6',
  phi: '#6366F1',
  starcoder: '#D97706',
  'lm-studio': '#22C55E',
  'local-model': '#A855F7',
  aider: '#8B5CF6',
  cursor: '#10B981',
  copilot: '#0EA5E9',
  default: '#6b7280'
};

export function getAgentColor(agentName: string): string {
  const lowerName = agentName.toLowerCase();
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (lowerName.includes(key)) return color;
  }
  return AGENT_COLORS.default;
}
