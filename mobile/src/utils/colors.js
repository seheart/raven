// Tokyo Night color palette matching Raven web UI
export const COLORS = {
  // Base colors
  background: '#1a1b26',
  surface: '#24283b',
  surfaceLight: '#2f3549',

  // Text colors
  text: '#c0caf5',
  textMuted: '#565f89',
  textBright: '#a9b1d6',

  // Accent colors
  primary: '#7aa2f7',
  success: '#9ece6a',
  warning: '#e0af68',
  error: '#f7768e',
  info: '#7dcfff',

  // Project badge colors (matching web UI)
  projectColors: [
    '#7aa2f7', // blue
    '#bb9af7', // purple
    '#f7768e', // red
    '#e0af68', // orange
    '#9ece6a', // green
    '#7dcfff', // cyan
    '#ff9e64', // bright orange
    '#73daca', // teal
    '#c0caf5', // lavender
    '#2ac3de', // sky blue
  ],
};

// Get a consistent color for a project name
export const getProjectColor = (projectName) => {
  if (!projectName) return COLORS.textMuted;

  // Simple hash function to get consistent color
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % COLORS.projectColors.length;
  return COLORS.projectColors[index];
};
