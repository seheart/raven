<script>
  import { onMount } from 'svelte';
  import { logger } from '../logger.js';
  import { api } from '../apiClient.js';
  import { API_CONFIG } from '../../config.js';
  import { websocketService } from '../services/websocket.js';

  /**
   * About Page - Information about Raven
   * Modern, clean layout with theme-aware design
   */

  let sessionId = $state('Loading...');
  let websocketConnected = $state(false);

  // Get dynamic URLs
  const backendUrl = $derived(API_CONFIG.BASE_URL || window.location.origin);
  const frontendUrl = $derived(window.location.origin);

  // Load session ID from API
  async function loadSessionId() {
    try {
      const data = await api.get('/session-id');
      sessionId = data.session_id || 'Unknown';
    } catch (error) {
      sessionId = 'Offline';
      logger.error('Failed to load session ID:', error);
    }
  }

  // Check WebSocket status
  onMount(() => {
    loadSessionId();
    websocketConnected = websocketService.isConnected();

    // Listen for connection changes
    const updateStatus = () => {
      websocketConnected = websocketService.isConnected();
    };
    websocketService.on('connect', updateStatus);
    websocketService.on('disconnect', updateStatus);

    return () => {
      websocketService.off('connect', updateStatus);
      websocketService.off('disconnect', updateStatus);
    };
  });
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="text-center mb-12 pb-8 border-b-2 border-[var(--border)]">
      <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-3">About Raven</h1>
      <p class="text-sm text-[var(--muted)] font-sans">
        Production-Ready AI Agent Monitoring Platform - v2.0.1
      </p>
    </div>

    <!-- Main Content -->
    <div class="space-y-12">
      <!-- What is Raven? -->
      <section>
        <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">
          What is Raven?
        </h2>
        <div class="space-y-4 text-sm text-[var(--text)] leading-relaxed font-sans">
          <p>
            Raven is a <strong class="text-[var(--text-heading)]"
              >production-ready monitoring platform</strong
            > for AI coding agents like Claude Code. Track file changes, agent activity, system metrics,
            and events across 13+ projects simultaneously—all from a single, elegant dashboard with real-time
            updates.
          </p>
          <p>
            Built for developers who need comprehensive visibility into AI-assisted development,
            Raven provides instant insights with interactive Chart.js visualizations, pattern
            recognition, and developer persona tracking. Local-first, privacy-focused, and requiring
            no cloud dependencies.
          </p>
        </div>
      </section>

      <!-- Features Grid -->
      <section>
        <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-6">
          Features
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)] transition-all"
          >
            <div class="text-2xl mb-3"></div>
            <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
              Interactive Analytics
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">
              18+ pages with Chart.js visualizations, theme-aware colors, and accessibility
              compliance
            </p>
          </div>

          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)] transition-all"
          >
            <div class="text-2xl mb-3"></div>
            <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
              Multi-Project Monitoring
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">
              Monitor 13+ projects simultaneously with auto-discovery and instant filtering
            </p>
          </div>

          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)] transition-all"
          >
            <div class="text-2xl mb-3"></div>
            <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
              Multi-Agent Support
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">
              Track Claude, Ollama, LM Studio, and custom agents with telemetry API
            </p>
          </div>

          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)] transition-all"
          >
            <div class="text-2xl mb-3"></div>
            <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
              Developer Insights
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">
              Activity heatmaps, language breakdown, and workflow pattern analysis
            </p>
          </div>

          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)] transition-all"
          >
            <div class="text-2xl mb-3"></div>
            <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
              Real-Time Performance
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">
              WebSocket updates, system metrics, and process-level monitoring
            </p>
          </div>

          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--accent)] transition-all"
          >
            <div class="text-2xl mb-3"></div>
            <h3 class="text-sm font-semibold text-[var(--text-heading)] mb-2">
              Production Quality
            </h3>
            <p class="text-sm text-[var(--muted)] font-sans">
              575+ tests, enterprise security, 94% less memory usage than v1.4
            </p>
          </div>
        </div>
      </section>

      <!-- Tech Stack -->
      <section>
        <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-6">
          Tech Stack
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 class="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-3">
              Backend
            </h3>
            <div class="flex flex-wrap gap-2">
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >Node.js</span
              >
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >Express</span
              >
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >Socket.io</span
              >
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >SQLite</span
              >
            </div>
          </div>

          <div>
            <h3 class="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-3">
              Frontend
            </h3>
            <div class="flex flex-wrap gap-2">
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >Svelte 5</span
              >
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >Tailwind v4</span
              >
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >Vite</span
              >
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >Chart.js</span
              >
            </div>
          </div>

          <div>
            <h3 class="text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-3">
              Real-Time
            </h3>
            <div class="flex flex-wrap gap-2">
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >WebSockets</span
              >
              <span
                class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-xs text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                >Live Metrics</span
              >
            </div>
          </div>
        </div>
      </section>

      <!-- Current Session -->
      <section>
        <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-6">
          Current Session
        </h2>
        <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >Version</span
              >
              <span class="text-sm font-semibold text-[var(--text)]">2.0.1-corvus</span>
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >Session ID</span
              >
              <span class="text-sm font-mono font-semibold text-[var(--text)]"
                >{typeof sessionId === 'string'
                  ? sessionId.slice(0, 8) + '...'
                  : 'Loading...'}</span
              >
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >Backend URL</span
              >
              <span class="text-sm font-mono text-[var(--text)]">{backendUrl}</span>
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >Frontend URL</span
              >
              <span class="text-sm font-mono text-[var(--text)]">{frontendUrl}</span>
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >WebSocket Status</span
              >
              <span
                class="text-sm font-semibold {websocketConnected
                  ? 'text-[var(--success)]'
                  : 'text-[var(--error)]'} flex items-center gap-2"
              >
                <span
                  class="w-2 h-2 rounded-full {websocketConnected
                    ? 'bg-[var(--success)]'
                    : 'bg-[var(--error)]'} animate-pulse"
                ></span>
                {websocketConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                >Real-Time Updates</span
              >
              <span class="text-sm font-semibold text-[var(--success)] flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-[var(--success)]"></span>
                Enabled
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Use Cases -->
      <section>
        <h2 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-6">
          Use Cases
        </h2>
        <div class="space-y-3">
          <div
            class="flex items-start gap-3 p-4 bg-[var(--surface)] border-l-3 border-l-[var(--accent)] rounded-r-lg"
          >
            <span class="text-[var(--accent)] mt-0.5">▸</span>
            <p class="text-sm text-[var(--text)] font-sans">
              Monitor Claude Code's resource usage during intensive coding tasks
            </p>
          </div>

          <div
            class="flex items-start gap-3 p-4 bg-[var(--surface)] border-l-3 border-l-[var(--accent)] rounded-r-lg"
          >
            <span class="text-[var(--accent)] mt-0.5">▸</span>
            <p class="text-sm text-[var(--text)] font-sans">
              Track performance impact of AI-generated code builds and tests
            </p>
          </div>

          <div
            class="flex items-start gap-3 p-4 bg-[var(--surface)] border-l-3 border-l-[var(--accent)] rounded-r-lg"
          >
            <span class="text-[var(--accent)] mt-0.5">▸</span>
            <p class="text-sm text-[var(--text)] font-sans">
              Set alerts for when your AI agent exceeds resource thresholds
            </p>
          </div>

          <div
            class="flex items-start gap-3 p-4 bg-[var(--surface)] border-l-3 border-l-[var(--accent)] rounded-r-lg"
          >
            <span class="text-[var(--accent)] mt-0.5">▸</span>
            <p class="text-sm text-[var(--text)] font-sans">
              Analyze session history to optimize AI agent workflows
            </p>
          </div>

          <div
            class="flex items-start gap-3 p-4 bg-[var(--surface)] border-l-3 border-l-[var(--accent)] rounded-r-lg"
          >
            <span class="text-[var(--accent)] mt-0.5">▸</span>
            <p class="text-sm text-[var(--text)] font-sans">
              Debug agent behavior with real-time event streaming
            </p>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <section class="text-center pt-8 border-t-2 border-[var(--border)]">
        <p class="text-sm text-[var(--muted)] italic mb-4 font-sans">
          Built with for real-time AI agent monitoring
        </p>
        <a
          href="https://github.com/seheart/raven"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block px-6 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--accent)] text-sm font-semibold hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-all no-underline"
        >
          View on GitHub →
        </a>
      </section>
    </div>
  </div>
</div>
