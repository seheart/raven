<script>
  import { onMount } from 'svelte';

  export let events = [];
  export let onTimeRangeChange = (start, end) => {};

  let sliderRef;
  let isDragging = false;
  let startHandle = 0; // 0-100 percentage
  let endHandle = 100; // 0-100 percentage
  let dragTarget = null; // 'start', 'end', or 'range'
  let dragStartX = 0;
  let dragStartValue = 0;

  $: sortedEvents = [...events].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  $: minTime = sortedEvents.length > 0 ? new Date(sortedEvents[0].timestamp).getTime() : Date.now();
  $: maxTime = sortedEvents.length > 0 ? new Date(sortedEvents[sortedEvents.length - 1].timestamp).getTime() : Date.now();
  $: timeRange = maxTime - minTime || 1;

  $: startTime = minTime + (startHandle / 100) * timeRange;
  $: endTime = minTime + (endHandle / 100) * timeRange;

  $: {
    // Notify parent of time range changes
    onTimeRangeChange(startTime, endTime);
  }

  // Calculate event density for visualization
  $: eventDensity = calculateDensity(sortedEvents, 100);

  function calculateDensity(events, buckets) {
    if (events.length === 0) return new Array(buckets).fill(0);

    const density = new Array(buckets).fill(0);
    events.forEach(event => {
      const timestamp = new Date(event.timestamp).getTime();
      const position = ((timestamp - minTime) / timeRange) * buckets;
      const bucket = Math.min(Math.floor(position), buckets - 1);
      density[bucket]++;
    });

    // Normalize to 0-1
    const maxDensity = Math.max(...density, 1);
    return density.map(d => d / maxDensity);
  }

  function handleMouseDown(e, target) {
    if (!sliderRef) return;

    isDragging = true;
    dragTarget = target;
    dragStartX = e.clientX;

    if (target === 'start') {
      dragStartValue = startHandle;
    } else if (target === 'end') {
      dragStartValue = endHandle;
    }

    e.preventDefault();
  }

  function handleMouseMove(e) {
    if (!isDragging || !sliderRef) return;

    const rect = sliderRef.getBoundingClientRect();
    const deltaX = e.clientX - dragStartX;
    const deltaPercent = (deltaX / rect.width) * 100;

    if (dragTarget === 'start') {
      const newValue = Math.max(0, Math.min(endHandle - 1, dragStartValue + deltaPercent));
      startHandle = newValue;
    } else if (dragTarget === 'end') {
      const newValue = Math.max(startHandle + 1, Math.min(100, dragStartValue + deltaPercent));
      endHandle = newValue;
    }
  }

  function handleMouseUp() {
    isDragging = false;
    dragTarget = null;
  }

  function resetRange() {
    startHandle = 0;
    endHandle = 100;
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  onMount(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  });
</script>

<div class="timeline-slider">
  <div class="timeline-header">
    <span class="timeline-label">Timeline</span>
    <button class="reset-btn" on:click={resetRange} title="Reset timeline range">
      🔄 Reset
    </button>
  </div>

  <div class="slider-container" bind:this={sliderRef}>
    <!-- Event density visualization -->
    <div class="density-bars">
      {#each eventDensity as density, i}
        <div
          class="density-bar"
          style="height: {density * 100}%; left: {i}%; opacity: {density * 0.8 + 0.2}"
        ></div>
      {/each}
    </div>

    <!-- Selected range overlay -->
    <div
      class="range-overlay"
      style="left: {startHandle}%; width: {endHandle - startHandle}%"
    ></div>

    <!-- Track -->
    <div class="slider-track"></div>

    <!-- Start handle -->
    <div
      class="slider-handle start-handle"
      style="left: {startHandle}%"
      on:mousedown={(e) => handleMouseDown(e, 'start')}
    >
      <div class="handle-label">{formatDate(startTime)}</div>
    </div>

    <!-- End handle -->
    <div
      class="slider-handle end-handle"
      style="left: {endHandle}%"
      on:mousedown={(e) => handleMouseDown(e, 'end')}
    >
      <div class="handle-label">{formatDate(endTime)}</div>
    </div>
  </div>

  <div class="timeline-info">
    <span class="info-text">
      Showing {sortedEvents.filter(e => {
        const t = new Date(e.timestamp).getTime();
        return t >= startTime && t <= endTime;
      }).length} of {sortedEvents.length} events
    </span>
  </div>
</div>

<style>
  .timeline-slider {
    padding: 10px;
    background: var(--surface-2);
    border-radius: 6px;
    margin-bottom: 8px;
  }

  .timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .timeline-label {
    font-weight: 600;
    color: var(--text);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .reset-btn {
    padding: 4px 0.75rem;
    font-size: 11px;
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .reset-btn:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .slider-container {
    position: relative;
    height: 80px;
    margin: 1rem 0;
    user-select: none;
  }

  .density-bars {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    display: flex;
    gap: 1%;
  }

  .density-bar {
    flex: 1;
    background: var(--info);
    align-self: flex-end;
    border-radius: 2px 2px 0 0;
    transition: opacity 0.2s;
  }

  .range-overlay {
    position: absolute;
    top: 0;
    height: 100%;
    background: color-mix(in srgb, var(--info) 20%, transparent);
    border-left: 2px solid var(--info);
    border-right: 2px solid var(--info);
    pointer-events: none;
  }

  .slider-track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--surface-2);
    border-radius: 2px;
    transform: translateY(-50%);
  }

  .slider-handle {
    position: absolute;
    top: 50%;
    width: 16px;
    height: 24px;
    background: var(--info);
    border: 2px solid var(--text);
    border-radius: 4px;
    transform: translate(-50%, -50%);
    cursor: grab;
    z-index: 10;
    transition: background 0.2s;
  }

  .slider-handle:hover {
    background: var(--info);
  }

  .slider-handle:active {
    cursor: grabbing;
  }

  .handle-label {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 0.5rem;
    background: var(--surface);
    border: 1px solid var(--info);
    border-radius: 4px;
    font-size: 11px;
    color: var(--text);
    white-space: nowrap;
    margin-bottom: 0.5rem;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .slider-handle:hover .handle-label {
    opacity: 1;
  }

  .timeline-info {
    text-align: center;
    margin-top: 0.5rem;
  }

  .info-text {
    color: var(--muted);
    font-size: 11px;
  }
</style>
