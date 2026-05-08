import { logger } from '../logger.js';
/**
 * Project Filter Utilities
 *
 * Shared utilities for filtering data by project across all views.
 * Ensures consistent filtering logic throughout the application.
 */

/**
 * Constant for "all projects" filter value
 * @type {string}
 */
export const ALL_PROJECTS = 'all';

/**
 * Validate a filter value against available projects
 *
 * @param {string} filterValue - The filter value to validate
 * @param {Array<string>} availableProjects - Array of available project names
 * @returns {string} Valid filter value (returns 'all' if invalid)
 *
 * @example
 * const validated = validateFilterValue('deleted-project', ['raven', 'ant312']);
 * // Returns 'all' because 'deleted-project' not in available list
 */
export function validateFilterValue(filterValue, availableProjects) {
  if (!filterValue) return ALL_PROJECTS;
  if (filterValue === ALL_PROJECTS) return ALL_PROJECTS;

  return availableProjects.includes(filterValue) ? filterValue : ALL_PROJECTS;
}

/**
 * Project color palette for visual coding
 * Uses a deterministic hash to assign consistent colors
 */
const PROJECT_COLORS = [
  'var(--info)', // blue
  '#bb9af7', // purple
  '#9ece6a', // green
  '#e0af68', // yellow
  '#f7768e', // red
  '#73daca', // teal
  '#ff9e64', // orange
  '#b4f9f8', // cyan
  '#c0caf5', // light blue
  '#ff007c' // pink
];

/**
 * Get a consistent color for a project name
 *
 * @param {string} projectName - The project name
 * @returns {string} Hex color code
 *
 * @example
 * getProjectColor('raven'); // Returns consistent color for 'raven'
 */
/** @public */
export function getProjectColor(projectName) {
  if (!projectName) return PROJECT_COLORS[0];

  // Simple hash function for consistent color assignment
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % PROJECT_COLORS.length;
  return PROJECT_COLORS[index];
}

/**
 * Add a project to the recent projects list
 *
 * @param {string} projectName - The project name to add
 */
export function addRecentProject(projectName) {
  if (!projectName || projectName === ALL_PROJECTS) return;

  try {
    let recent = JSON.parse(localStorage.getItem('raven-recent-projects') || '[]');

    // Remove if already exists (to move to front)
    recent = recent.filter(p => p !== projectName);

    // Add to front
    recent.unshift(projectName);

    // Keep only last 10
    recent = recent.slice(0, 10);

    localStorage.setItem('raven-recent-projects', JSON.stringify(recent));
  } catch (error) {
    logger.error('Failed to save recent project:', error);
  }
}
