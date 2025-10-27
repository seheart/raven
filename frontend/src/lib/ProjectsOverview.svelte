<script>
  import { logger } from './logger.js';
  import { onMount, onDestroy } from 'svelte';
  import { websocketService } from './websocket.js';
  import { dataService } from './dataService.js';

  let projectsData = [];
  let availableProjects = [];
  let loading = true;

  async function loadProjectsOverview() {
    try {
      // Use dataService - it handles caching and deduplication
      const [projects, events] = await Promise.all([
        dataService.fetchProjects(),
        dataService.fetchFileEvents(500)
      ]);

      availableProjects = projects;

      // Aggregate stats per project
      const projectStats = {};

      for (const project of availableProjects) {
        const projectName = project.name || project; // Handle both object and string formats
        const projectEvents = events.filter(e => e.project === projectName);

        // Get most recent event timestamp
        const lastEvent = projectEvents.length > 0
          ? projectEvents[0].timestamp
          : null;

        // Count recent events (last hour)
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const recentCount = projectEvents.filter(e => e.timestamp > oneHourAgo).length;

        projectStats[projectName] = {
          name: projectName,
          active: recentCount > 0,
          lastActivity: lastEvent,
          eventCount: projectEvents.length,
          recentChanges: recentCount
        };
      }

      // Convert to array and sort by last activity (most recent first)
      projectsData = availableProjects
        .map(project => {
          const name = project.name || project;
          return projectStats[name] || {
            name,
            active: false,
            lastActivity: null,
            eventCount: 0,
            recentChanges: 0
          };
        })
        .sort((a, b) => {
          if (!a.lastActivity) return 1;
          if (!b.lastActivity) return -1;
          return new Date(b.lastActivity) - new Date(a.lastActivity);
        });

      loading = false;
    } catch (error) {
      logger.error('Error loading projects overview:', error);
      loading = false;
    }
  }

  function selectProject(projectName) {
    // No longer using project filter - Raven shows all projects
    logger.info(`Selected project: ${projectName}`);
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return 'no activity';

    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  // WebSocket handler for file changes
  const handleFileChanged = () => {
    // Update projects overview when files change
    loadProjectsOverview();
  };

  onMount(() => {
    // Initial load only
    loadProjectsOverview();

    // Listen for file changes via WebSocket for real-time updates
    websocketService.on('file-changed', handleFileChanged);
  });

  onDestroy(() => {
    websocketService.off('file-changed', handleFileChanged);
  });
</script>

<div class="projects-overview">
  <div class="header">
    <h3>Projects ({availableProjects.length})</h3>
    <button class="view-all" style="visibility: hidden;">
      View All
    </button>
  </div>

  {#if loading}
    <div class="loading">Loading projects...</div>
  {:else if projectsData.length === 0}
    <div class="empty">No projects found</div>
  {:else}
    <div class="projects-grid">
      {#each projectsData as project}
        <button
          class="project-card"
          on:click={() => selectProject(project.name)}
        >
          <div class="project-header">
            <div class="project-name">
              {project.name}
            </div>
            <div class="status-indicator" class:active={project.active}></div>
          </div>
          <div class="project-stats">
            <div class="stat">
              <span class="stat-label">Recent</span>
              <span class="stat-value">{project.recentChanges}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Activity</span>
              <span class="stat-value">{formatRelativeTime(project.lastActivity)}</span>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .projects-overview {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  h3 {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .view-all {
    padding: 4px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--accent);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .view-all:hover {
    background: var(--accent);
    color: white;
  }

  .loading, .empty {
    text-align: center;
    padding: 32px;
    color: var(--muted);
    font-size: 13px;
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .project-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .project-card:hover {
    border-color: var(--accent);
    background: var(--surface-3);
    transform: translateY(-2px);
  }

  .project-card.selected {
    border-color: var(--accent);
    background: var(--surface-3);
    box-shadow: 0 0 0 2px var(--accent-dim);
  }

  .project-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .project-name {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted);
  }

  .status-indicator.active {
    background: var(--success);
    box-shadow: 0 0 4px var(--success);
  }

  .project-stats {
    display: flex;
    gap: 16px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
  }
</style>
