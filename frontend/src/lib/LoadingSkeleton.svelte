<script>
  export let type = 'text'; // 'text', 'card', 'list', 'chart'
  export let count = 1;
  export let height = 'auto';
  export let width = '100%';
</script>

<div role="status" aria-live="polite" aria-busy="true" aria-label="Loading content">
{#if type === 'text'}
  {#each Array(count) as _, i (i)}
    <div class="skeleton skeleton-text" style="width: {width}; height: {height}" aria-hidden="true"></div>
  {/each}
{:else if type === 'card'}
  {#each Array(count) as _, i (i)}
    <div class="skeleton skeleton-card" aria-hidden="true">
      <div class="skeleton-header"></div>
      <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line" style="width: 80%"></div>
        <div class="skeleton-line" style="width: 60%"></div>
      </div>
    </div>
  {/each}
{:else if type === 'list'}
  <div class="skeleton skeleton-list" aria-hidden="true">
    {#each Array(count) as _, i (i)}
      <div class="skeleton-list-item">
        <div class="skeleton-icon"></div>
        <div class="skeleton-content">
          <div class="skeleton-line" style="width: 70%"></div>
          <div class="skeleton-line skeleton-small" style="width: 40%"></div>
        </div>
      </div>
    {/each}
  </div>
{:else if type === 'chart'}
  <div class="skeleton skeleton-chart" style="height: {height || '200px'}" aria-hidden="true">
    <div class="skeleton-bars">
      {#each Array(8) as _, i (i)}
        <div class="skeleton-bar" style="height: {Math.random() * 60 + 20}%"></div>
      {/each}
    </div>
  </div>
{/if}
</div>

<style>
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--surface) 0%,
      var(--surface-2) 50%,
      var(--surface) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;
  }

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  .skeleton-text {
    height: 16px;
    margin-bottom: 8px;
  }

  .skeleton-card {
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 6px;
  }

  .skeleton-header {
    height: 20px;
    width: 150px;
    background: linear-gradient(
      90deg,
      var(--surface-2) 0%,
      var(--bg) 50%,
      var(--surface-2) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;
    margin-bottom: 12px;
  }

  .skeleton-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-line {
    height: 14px;
    background: linear-gradient(
      90deg,
      var(--surface-2) 0%,
      var(--bg) 50%,
      var(--surface-2) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;
  }

  .skeleton-small {
    height: 12px;
  }

  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-list-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .skeleton-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(
      90deg,
      var(--surface-2) 0%,
      var(--bg) 50%,
      var(--surface-2) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .skeleton-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .skeleton-chart {
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    display: flex;
    align-items: flex-end;
  }

  .skeleton-bars {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    width: 100%;
    height: 100%;
  }

  .skeleton-bar {
    flex: 1;
    background: linear-gradient(
      90deg,
      var(--surface-2) 0%,
      var(--bg) 50%,
      var(--surface-2) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 4px 4px 0 0;
  }

  /* Stagger animation for more natural feel */
  .skeleton-list-item:nth-child(1) { animation-delay: 0s; }
  .skeleton-list-item:nth-child(2) { animation-delay: 0.1s; }
  .skeleton-list-item:nth-child(3) { animation-delay: 0.2s; }
  .skeleton-list-item:nth-child(4) { animation-delay: 0.3s; }
  .skeleton-list-item:nth-child(5) { animation-delay: 0.4s; }

  .skeleton-bar:nth-child(odd) { animation-delay: 0.2s; }
</style>
