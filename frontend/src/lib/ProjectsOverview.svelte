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
      // Add timeout protection (10 seconds max to prevent indefinite hang)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Projects load timeout')), 10000)
      );

      // Use dataService - it handles caching and deduplication
      // Fetch both file events AND agent events to detect activity
      const dataPromise = Promise.all([
        dataService.fetchProjects(),
        dataService.fetchFileEvents(500),
        dataService.fetchAgentEvents(500).catch(() => [])
      ]);

      const [projects, fileEvents, agentEventsResponse] = await Promise.race([
        dataPromise,
        timeoutPromise
      ]);

      availableProjects = projects;

      // Combine file events and agent events
      const events = [...fileEvents];

      // Add agent events to the mix (they also have project and timestamp)
      if (Array.isArray(agentEventsResponse)) {
        agentEventsResponse.forEach(ae => {
          if (ae.project_name) {
            events.push({
              timestamp: ae.timestamp,
              project: ae.project_name,
              type: 'agent-event'
            });
          }
        });
      }

      // Sort all events by timestamp (newest first)
      events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Aggregate stats per project
      const projectStats = {};

      for (const project of availableProjects) {
        const projectName = project.name || project; // Handle both object and string formats
        const projectEvents = events.filter(e => e.project === projectName);

        // Get most recent event timestamp (from either file changes or agent activity)
        const lastEvent = projectEvents.length > 0
          ? projectEvents[0].timestamp
          : null;

        // Determine status based on recency
        let status = 'idle';
        if (lastEvent) {
          const timeSinceLastEvent = Date.now() - new Date(lastEvent).getTime();
          const fiveMinutesAgo = 5 * 60 * 1000; // 5 minutes
          const oneHourAgo = 60 * 60 * 1000; // 1 hour

          if (timeSinceLastEvent < fiveMinutesAgo) {
            status = 'active'; // Green - active right now
          } else if (timeSinceLastEvent < oneHourAgo) {
            status = 'recent'; // Blue - recently active
          }
          // else idle - grey
        }

        // Count recent events (last hour)
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const recentCount = projectEvents.filter(e => e.timestamp > oneHourAgo).length;

        projectStats[projectName] = {
          name: projectName,
          status: status,
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
            status: 'idle',
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
      if (error && error.message === 'Projects load timeout') {
        logger.warn('Projects load timed out (10s)');
      } else {
        logger.error('Error loading projects overview:', error);
      }
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

<section class="projects-overview" aria-labelledby="projects-heading">
  <div class="header">
    <h3 id="projects-heading"><span aria-hidden="true">📁</span> Projects ({availableProjects.length})</h3>
    <button class="view-all" style="visibility: hidden;" aria-hidden="true">
      View All
    </button>
  </div>

  {#if loading}
    <div class="loading" role="status" aria-live="polite" aria-busy="true">Loading projects...</div>
  {:else if projectsData.length === 0}
    <div class="empty" role="status">No projects found</div>
  {:else}
    <div class="projects-grid" role="list" aria-label="Available projects">
      {#each projectsData as project (project.name || project)}
        <button
          class="project-card"
          on:click={() => selectProject(project.name)}
          aria-label="{project.name}: {project.recentChanges} recent changes, last activity {formatRelativeTime(project.lastActivity)}, status: {project.status}"
        >
          <div class="project-header">
            <div class="project-name">
              {project.name}
            </div>
            <div
              class="project-status-dot"
              class:active={project.status === 'active'}
              class:recent={project.status === 'recent'}
              class:idle={project.status === 'idle'}
              role="status"
              aria-label="{project.status === 'active' ? 'Active now' : project.status === 'recent' ? 'Recently active' : 'Idle'}"
            ></div>
          </div>
          <div class="project-stats" role="group" aria-label="Project statistics">
            <div class="stat">
              <span class="stat-label">Recent</span>
              <span class="stat-value" aria-label="{project.recentChanges} recent changes">{project.recentChanges}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Activity</span>
              <span class="stat-value" aria-label="Last activity {formatRelativeTime(project.lastActivity)}">{formatRelativeTime(project.lastActivity)}</span>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .projects-overview {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  h3 {
    font-family: var(--mono);
    font-size: 11px;
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
    padding: 12px;
    color: var(--muted);
    font-size: 11px;
  }

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 6px;
  }

  .project-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 3px;
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

  /* (removed unused .project-card.selected) */

  .project-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .project-name {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .project-status-dot {
    width: 8px;
    height: 8px;
    min-width: 8px;
    min-height: 8px;
    border-radius: 50%;
    background: #9ca3af;
    flex-shrink: 0;
    display: block;
    padding: 0;
    transition: all 0.3s ease;
  }

  .project-status-dot.active {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  }

  .project-status-dot.recent {
    background: #3b82f6;
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.5);
  }

  .project-status-dot.idle {
    background: #6b7280;
    box-shadow: none;
  }

  .project-stats {
    display: flex;
    gap: 8px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-label {
    font-size: 11px;
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
