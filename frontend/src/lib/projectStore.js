import { writable } from 'svelte/store';

/**
 * Active project name
 * @type {import('svelte/store').Writable<string>}
 */
export const activeProject = writable('Loading...');

/**
 * List of available projects
 * @type {import('svelte/store').Writable<string[]>}
 */
export const availableProjects = writable([]);

/**
 * Project switching status
 * @type {import('svelte/store').Writable<{loading: boolean, error: string|null}>}
 */
export const projectStatus = writable({ loading: false, error: null });
