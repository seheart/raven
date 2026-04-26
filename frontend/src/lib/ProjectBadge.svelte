<!--
  ProjectBadge - Reusable project badge component with color coding

  Props:
  - project: string (required) - Project name to display
  - size: 'small' | 'medium' | 'large' (default: 'small')
-->
<script>
  import { getProjectColor } from './utils/projectFilter.js';

  export let project;
  export let size = 'small';

  $: projectColor = getProjectColor(project);
</script>

<span
  class="project-badge {size}"
  style="background-color: {projectColor}20; border-color: {projectColor}; color: {projectColor};"
  role="status"
  aria-label="Project: {project}"
>
  {project}
</span>

<style>
  .project-badge {
    padding: var(--spacing-xs) var(--spacing-lg);
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
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: 11px;
    border-radius: var(--radius);
  }

  .project-badge.medium {
    padding: var(--spacing-sm) var(--spacing-lg);
    font-size: 11px;
    border-radius: var(--radius-sm);
  }

  .project-badge.large {
    padding: var(--spacing-md) var(--spacing-xl);
    font-size: 13px;
    border-radius: var(--radius);
    font-weight: 700;
  }
</style>
