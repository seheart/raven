<script>
  import { onMount, onDestroy } from 'svelte';
  import { formatShortDateTime } from './timeFormat.js';

  export let events = [];
  export let onTimeRangeChange = (start, end) => {};

  let sliderRef;
  let isDragging = false;
  let startHandle = 0; // 0-100 percentage
  let endHandle = 100; // 0-100 percentage
  let dragTarget = null; // 'start', 'end', or 'range'
  let dragStartX = 0;
  let dragStartValue = 0;

  // Memoization cache for sorted events (avoids re-sorting on every reactive update)
  let cachedEvents = null;
  let cachedSortedEvents = [];

  // Optimized: Only sort when events array actually changes
  $: {
    if (events !== cachedEvents) {
      cachedEvents = events;
      cachedSortedEvents = [...(events || [])].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }
  }

  $: sortedEvents = cachedSortedEvents;

  $: minTime = sortedEvents.length > 0 && sortedEvents[0]?.timestamp ? new Date(sortedEvents[0].timestamp).getTime() : Date.now();
  $: maxTime = sortedEvents.length > 0 ? new Date(sortedEvents[sortedEvents.length - 1]?.timestamp).getTime() : Date.now();
  $: timeRange = maxTime - minTime || 1;

  $: startTime = minTime + (startHandle / 100) * timeRange;
  $: endTime = minTime + (endHandle / 100) * timeRange;

  $: {
    // Notify parent of time range changes
    onTimeRangeChange(startTime, endTime);
  }

  // Memoization cache for event density
  let cachedDensityEvents = null;
  let cachedDensityResult = [];
  let cachedMinTime = null;
  let cachedTimeRange = null;

  // Calculate event density for visualization (memoized)
  $: {
    // Only recalculate if events, minTime, or timeRange changed
    if (sortedEvents !== cachedDensityEvents || minTime !== cachedMinTime || timeRange !== cachedTimeRange) {
      cachedDensityEvents = sortedEvents;
      cachedMinTime = minTime;
      cachedTimeRange = timeRange;
      cachedDensityResult = calculateDensity(sortedEvents, 100, minTime, timeRange);
    }
  }

  $: eventDensity = cachedDensityResult;

  function calculateDensity(events, buckets, min, range) {
    if (events.length === 0) return new Array(buckets).fill(0);

    const density = new Array(buckets).fill(0);
    events.forEach(event => {
      const timestamp = new Date(event.timestamp).getTime();
      const position = ((timestamp - min) / range) * buckets;
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
    return formatShortDateTime(timestamp);
  }

  onMount(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  });

  onDestroy(() => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  });
</script>

<div class="timeline-slider" role="region" aria-label="Timeline filter">
  <div class="timeline-header">
    <span class="timeline-label" id="timeline-label">Timeline</span>
    <button class="reset-btn" on:click={resetRange} aria-label="Reset timeline range to show all events">
      <span aria-hidden="true">🔄</span> Reset
    </button>
  </div>

  <div class="slider-container" bind:this={sliderRef} aria-labelledby="timeline-label" aria-describedby="timeline-info">
    <!-- Event density visualization -->
    <div class="density-bars" aria-hidden="true">
      {#each eventDensity || [] as density, i (i)}
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
      aria-hidden="true"
    ></div>

    <!-- Track -->
    <div class="slider-track" aria-hidden="true"></div>

    <!-- Start handle -->
    <div
      class="slider-handle start-handle"
      style="left: {startHandle}%"
      on:mousedown={(e) => handleMouseDown(e, 'start')}
      role="slider"
      aria-label="Timeline start"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(startHandle)}
      aria-valuetext={formatDate(startTime)}
      tabindex="0"
    >
      <div class="handle-label" aria-hidden="true">{formatDate(startTime)}</div>
    </div>

    <!-- End handle -->
    <div
      class="slider-handle end-handle"
      style="left: {endHandle}%"
      on:mousedown={(e) => handleMouseDown(e, 'end')}
      role="slider"
      aria-label="Timeline end"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(endHandle)}
      aria-valuetext={formatDate(endTime)}
      tabindex="0"
    >
      <div class="handle-label" aria-hidden="true">{formatDate(endTime)}</div>
    </div>
  </div>

  <div class="timeline-info" id="timeline-info" role="status" aria-live="polite">
    <span class="info-text">
      Showing {(sortedEvents || []).filter(e => {
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

  .timeline-header {
    padding: 0 8px;
  }

  .timeline-label {
    font-weight: 600;
    color: var(--text);
    font-size: 14px;
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

  .slider-handle:focus {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
