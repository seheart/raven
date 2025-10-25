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
 * Filter an array of items by project
 *
 * @param {Array} items - Array of items to filter
 * @param {string} projectFilter - The filter value ('all' or specific project name)
 * @returns {Array} Filtered array of items
 *
 * @example
 * const events = [{project: 'raven', ...}, {project: 'ant312', ...}];
 * const filtered = filterByProject(events, 'raven'); // Returns only raven events
 */
export function filterByProject(items, projectFilter) {
  if (!Array.isArray(items)) return [];

  return items.filter(item => {
    // If item has no project field, only show in "all" view
    if (!item.project) {
      return projectFilter === ALL_PROJECTS;
    }

    // Show all projects or match specific project
    return projectFilter === ALL_PROJECTS || item.project === projectFilter;
  });
}

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
 * Check if a project name matches the current filter
 *
 * @param {string} projectName - The project name to check
 * @param {string} filterValue - The filter value ('all' or project name)
 * @returns {boolean} Whether the project matches the filter
 *
 * @example
 * matchesFilter('raven', 'all'); // true
 * matchesFilter('raven', 'raven'); // true
 * matchesFilter('raven', 'ant312'); // false
 */
export function matchesFilter(projectName, filterValue) {
  if (!projectName) return filterValue === ALL_PROJECTS;
  return filterValue === ALL_PROJECTS || projectName === filterValue;
}

/**
 * Project color palette for visual coding
 * Uses a deterministic hash to assign consistent colors
 */
const PROJECT_COLORS = [
  '#7aa2f7', // blue
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
 * Get recently active projects from localStorage
 *
 * @param {number} limit - Maximum number of recent projects to return
 * @returns {Array<string>} Array of recent project names
 */
export function getRecentProjects(limit = 5) {
  try {
    const recent = JSON.parse(localStorage.getItem('raven-recent-projects') || '[]');
    return recent.slice(0, limit);
  } catch {
    return [];
  }
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
    console.error('Failed to save recent project:', error);
  }
}

/**
 * Get standardized empty state message
 *
 * @param {string} itemType - Type of items (e.g., "events", "changes", "triggers")
 * @param {string} projectFilter - Current project filter value
 * @param {number} totalCount - Total count before filtering (optional)
 * @returns {object} Message object with primary and hint text
 *
 * @example
 * getEmptyStateMessage('events', 'raven', 50);
 * // Returns: { primary: 'No events for project "raven"', hint: '50 events in other projects' }
 */
export function getEmptyStateMessage(itemType, projectFilter, totalCount = 0) {
  if (projectFilter === ALL_PROJECTS) {
    return {
      primary: `No ${itemType} yet`,
      hint: `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} will appear here when available`
    };
  }

  const primary = `No ${itemType} for project "${projectFilter}"`;
  const hint = totalCount > 0
    ? `${totalCount} ${itemType} in other projects`
    : `Try selecting "All Projects" to see all ${itemType}`;

  return { primary, hint };
}
