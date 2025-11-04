<script>
  export let size = 'md'; // 'sm', 'md', 'lg'
  export let color = 'var(--accent)';
  export let label = 'Loading...';
</script>

<div class="loading-spinner loading-spinner-{size}" role="status" aria-live="polite">
  <svg class="spinner" viewBox="0 0 50 50" aria-label={label}>
    <circle
      class="path"
      cx="25"
      cy="25"
      r="20"
      fill="none"
      stroke={color}
      stroke-width="4"
    />
  </svg>
  <span class="sr-only">{label}</span>
</div>

<style>
  .loading-spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .loading-spinner-sm {
    width: var(--icon-sm);
    height: var(--icon-sm);
  }

  .loading-spinner-md {
    width: var(--icon-lg);
    height: var(--icon-lg);
  }

  .loading-spinner-lg {
    width: 48px;
    height: 48px;
  }

  .spinner {
    animation: spin-refresh 1s linear infinite;
  }

  .path {
    stroke-linecap: round;
    animation: dash 1.5s ease-in-out infinite;
  }

  @keyframes dash {
    0% {
      stroke-dasharray: 1, 150;
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: 90, 150;
      stroke-dashoffset: -35;
    }
    100% {
      stroke-dasharray: 90, 150;
      stroke-dashoffset: -124;
    }
  }

  /* Note: spin-refresh is defined globally in app.css */
</style>
