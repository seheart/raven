import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
  // for more information about preprocessors
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Enable Svelte 4 compatibility mode in Svelte 5
    // Allows legacy syntax (export let, onMount, onDestroy, etc.)
    compatibility: {
      componentApi: 4
    }
  }
};
