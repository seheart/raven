// Raven page-layout primitives — every page should import from here.
// PageLayout = canonical shell, PageHeader = h1 + description,
// PageSection = grouped content with the small uppercase label.
export { default as PageLayout } from './PageLayout.svelte';
export { default as PageHeader } from './PageHeader.svelte';
export { default as PageSection } from './PageSection.svelte';
export { default as ProseBlock } from './ProseBlock.svelte';

// Existing chrome
export { default as Header } from './Header.svelte';
export { default as Footer } from './Footer.svelte';
export { default as AgentsNav } from './AgentsNav.svelte';
