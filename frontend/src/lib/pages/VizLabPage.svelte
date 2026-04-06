<script>
  /**
   * Visualization Lab — compare AI activity graph treatments
   * Simulates realistic event patterns to demo each visualization.
   */
  import { onMount } from 'svelte';
  import VizNebula from '../components/viz/VizNebula.svelte';
  import VizWaveform from '../components/viz/VizWaveform.svelte';
  import VizFlowField from '../components/viz/VizFlowField.svelte';

  // Shared event feed — all visualizations see the same events
  let eventFeed = $state([]);
  let eventCount = $state(0);
  let simInterval;
  let burstTimeout;

  const EVENT_TYPES = [
    'tool_call',
    'tool_call',
    'tool_call',
    'tool_result',
    'tool_result',
    'user_message',
    'assistant_message',
    'file_edit',
    'file_create',
    'file_delete',
    'error'
  ];

  // Simulate realistic AI work patterns
  function simulateWork() {
    // Random burst of 3-8 events (like a tool call sequence)
    const burstSize = 3 + Math.floor(Math.random() * 6);
    let delay = 0;

    for (let i = 0; i < burstSize; i++) {
      const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
      setTimeout(() => {
        eventFeed = [...eventFeed, { type, ts: Date.now() }];
        eventCount = eventFeed.length;
      }, delay);
      delay += 80 + Math.random() * 200; // Staggered within burst
    }

    // Schedule next burst — variable gaps like real AI work
    const gap = 800 + Math.random() * 2500;
    burstTimeout = setTimeout(simulateWork, delay + gap);
  }

  // Also run a steady background drip
  function startDrip() {
    simInterval = setInterval(() => {
      if (Math.random() > 0.4) {
        const type = Math.random() > 0.7 ? 'tool_call' : 'tool_result';
        eventFeed = [...eventFeed, { type, ts: Date.now() }];
        eventCount = eventFeed.length;
      }
    }, 600);
  }

  onMount(() => {
    simulateWork();
    startDrip();

    return () => {
      clearInterval(simInterval);
      clearTimeout(burstTimeout);
    };
  });
</script>

<div class="max-w-6xl mx-auto p-6">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Visualization Lab</h1>
    <p class="text-sm text-[var(--muted)] font-sans">
      Comparing AI activity graph treatments with simulated data.
      <span class="font-mono ml-2">{eventCount} events fired</span>
    </p>
  </div>

  <div class="space-y-6">
    <!-- 1. Nebula -->
    <div>
      <VizNebula {eventFeed} />
      <p class="text-xs text-[var(--muted)] mt-2 font-sans">
        Particle cloud with orbital drift. Events create blooms of glowing particles that swirl
        around a central core. No edges, no geometry — pure energy field.
      </p>
    </div>

    <!-- 2. Waveform -->
    <div>
      <VizWaveform {eventFeed} />
      <p class="text-xs text-[var(--muted)] mt-2 font-sans">
        Radial pulse rings + EKG heartbeat. Sonar-style rings expand on each event. Bottom waveform
        shows rolling activity amplitude. Clean, clinical, data-forward.
      </p>
    </div>

    <!-- 3. Flow Field -->
    <div>
      <VizFlowField {eventFeed} />
      <p class="text-xs text-[var(--muted)] mt-2 font-sans">
        Perlin noise flow field. Particles follow curved paths through a shifting vector field.
        Events spawn colored streams from center. Organic, never geometric, like ocean currents.
      </p>
    </div>
  </div>
</div>
