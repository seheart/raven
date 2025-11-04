<!--
  ProjectBadge - Reusable project badge component with color coding

  Props:
  - project: string (required) - Project name to display
  - size: 'small' | 'medium' | 'large' (default: 'small')
  - showDot: boolean (default: false) - Show colored dot instead of background
-->
<script>
  import { getProjectColor } from './utils/projectFilter.js';

  export let project;
  export let size = 'small';
  export let showDot = false;

  $: projectColor = getProjectColor(project);
</script>

{#if showDot}
  <span class="project-badge-with-dot {size}" role="status" aria-label="Project: {project}">
    <span class="project-dot" style="background-color: {projectColor};" aria-hidden="true"></span>
    <span class="project-name">{project}</span>
  </span>
{:else}
  <span
    class="project-badge {size}"
    style="background-color: {projectColor}20; border-color: {projectColor}; color: {projectColor};"
    role="status"
    aria-label="Project: {project}"
  >
    {project}
  </span>
{/if}

<style>
  .project-badge {
    padding: var(--space-xs) var(--space-lg);
    border-radius: var(--radius);
    font-size: 11px;
    font-weight: 600;
    text-transform: lowercase;
    font-family: var(--mono);
    border: 1px solid;
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
  }

  .project-badge.small {
    padding: var(--space-xs) var(--space-md);
    font-size: 11px;
    border-radius: var(--radius);
  }

  .project-badge.medium {
    padding: var(--space-sm) var(--space-lg);
    font-size: 11px;
    border-radius: var(--radius-sm);
  }

  .project-badge.large {
    padding: var(--space-md) var(--space-xl);
    font-size: 13px;
    border-radius: var(--radius);
    font-weight: 700;
  }

  .project-badge-with-dot {
    display: inline-flex;
    align-items: center;
    gap: var(--space-md);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .project-badge-with-dot.small {
    gap: var(--space-sm);
    font-size: 11px;
  }

  .project-badge-with-dot.medium {
    gap: var(--space-md);
    font-size: 12px;
  }

  .project-badge-with-dot.large {
    gap: var(--space-lg);
    font-size: 11px;
  }

  .project-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 4px currentColor;
  }

  .project-badge-with-dot.small .project-dot {
    width: 6px;
    height: 6px;
  }

  .project-badge-with-dot.medium .project-dot {
    width: 8px;
    height: 8px;
  }

  .project-badge-with-dot.large .project-dot {
    width: 10px;
    height: 10px;
  }

  .project-name {
    text-transform: lowercase;
  }
</style>
