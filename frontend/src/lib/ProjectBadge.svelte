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
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: lowercase;
    font-family: var(--mono);
    border: 1px solid;
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
  }

  .project-badge.small {
    padding: 2px 6px;
    font-size: 9px;
    border-radius: 8px;
  }

  .project-badge.medium {
    padding: 4px 10px;
    font-size: 11px;
    border-radius: 12px;
  }

  .project-badge.large {
    padding: 6px 14px;
    font-size: 13px;
    border-radius: 14px;
    font-weight: 700;
  }

  .project-badge-with-dot {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .project-badge-with-dot.small {
    gap: 4px;
    font-size: 10px;
  }

  .project-badge-with-dot.medium {
    gap: 6px;
    font-size: 12px;
  }

  .project-badge-with-dot.large {
    gap: 8px;
    font-size: 14px;
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
