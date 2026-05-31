// Raven page-layout primitives — every page should import from here.
// PageLayout = canonical shell, PageHeader = h1 + description,
// PageSection = grouped content with the small uppercase label,
// ProseBlock = max-width prose wrapper for paragraph copy inside sections,
// StatusBar = the RAVEN.SYSTEM :: brand prompt + live websocket dot strip.
// Header and Footer are imported directly from their .svelte files.
export { default as PageLayout } from './PageLayout.svelte';
export { default as PageHeader } from './PageHeader.svelte';
export { default as PageSection } from './PageSection.svelte';
export { default as ProseBlock } from './ProseBlock.svelte';
export { default as StatusBar } from './StatusBar.svelte';
