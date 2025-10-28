import { writable, get } from 'svelte/store';
import { logger } from './logger.js';
/**
 * Global Project Filter Store
 *
 * Manages the currently selected project filter across all views.
 * "all" means show data from all projects, or select a specific project name.
 */

import {
  ALL_PROJECTS,
  matchesFilter,
  validateFilterValue,
  addRecentProject
} from './utils/projectFilter.js';

// Available projects (will be populated from API)
export const availableProjects = writable([]);

// Get initial filter from localStorage or default to "all"
const storedFilter = localStorage.getItem('raven-project-filter') || ALL_PROJECTS;

// Create the filter store
export const projectFilter = writable(storedFilter);

// Validate and persist filter changes
projectFilter.subscribe(value => {
  // Validate filter against available projects
  const projects = get(availableProjects);
  const validatedValue = validateFilterValue(value, projects);

  // If validation changed the value, update the store
  if (validatedValue !== value) {
    projectFilter.set(validatedValue);
    return;
  }

  // Persist to localStorage
  localStorage.setItem('raven-project-filter', value);

  // Add to recent projects
  addRecentProject(value);
});

// Validate stored filter when available projects change
availableProjects.subscribe(projects => {
  if (projects.length === 0) return;

  const currentFilter = get(projectFilter);
  const validatedFilter = validateFilterValue(currentFilter, projects);

  if (validatedFilter !== currentFilter) {
    logger.warn(`Project filter "${currentFilter}" not found, resetting to "all"`);
    projectFilter.set(validatedFilter);
  }
});

// Re-export utility for convenience
export { matchesFilter, ALL_PROJECTS };
