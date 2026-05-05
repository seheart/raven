/**
 * Centralized project label resolution.
 *
 * Every surface that shows a project name should run it through here so
 * we get a single rule for "displayName if set, name if not." Keeps the
 * fallback consistent and lets us change the resolution policy in one
 * place if it ever needs to (e.g. emoji-prefix, mission-suffix).
 */

/**
 * @param {object|string|null|undefined} project - either the full project
 *   object or just a project name string. Strings pass through unchanged
 *   so callers that only have a name from an event can still use this.
 * @returns {string}
 */
export function projectLabel(project) {
  if (!project) return '';
  if (typeof project === 'string') return project;
  return project.displayName || project.name || '';
}

/**
 * Resolve a project's display label given a name and a known-projects list.
 * Useful when the caller has a project_name from an event row and a separate
 * projects list from /api/projects.
 *
 * @param {string} name
 * @param {Array<{name: string, displayName?: string}>} projects
 * @returns {string}
 */
export function resolveProjectLabel(name, projects) {
  if (!name) return '';
  const match = projects?.find?.(p => p.name === name);
  return match?.displayName || name;
}
