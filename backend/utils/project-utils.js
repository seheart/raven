import { normalize } from 'path';

const AGENT_COLORS = {
  claude: '#FF6B35',
  gpt: '#10A37F',
  gemini: '#4285F4',
  ollama: '#F39C12',
  default: '#6b7280'
};

export function getAgentColor(agentName) {
  const lowerName = (agentName || '').toLowerCase();
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (lowerName.includes(key)) return color;
  }
  return AGENT_COLORS.default;
}

/**
 * Detect which project a file belongs to based on its path
 * @param {string} filepath - Absolute file path
 * @param {Map<string,string>} projectPaths - Map of projectName -> absolute path
 * @returns {string|null} - Project name or null if not found
 */
export function detectProjectFromPath(filepath, projectPaths) {
  const normalizedPath = normalize(filepath);

  const sortedProjects = Array.from(projectPaths.entries()).sort((a, b) => {
    return b[1].length - a[1].length;
  });

  for (const [projectName, projectPath] of sortedProjects) {
    const normalizedProjectPath = normalize(projectPath);
    if (
      normalizedPath.startsWith(normalizedProjectPath + '/') ||
      normalizedPath === normalizedProjectPath
    ) {
      return projectName;
    }
  }

  return null;
}
