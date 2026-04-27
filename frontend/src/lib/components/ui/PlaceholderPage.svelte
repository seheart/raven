<!-- design-system-skip: infrastructure component, not a user-facing primitive -->
<script>
  /**
   * Placeholder Page Component
   * Generic placeholder for pages under development
   */

  let { title = 'Coming Soon', description = 'This page is under development.' } = $props();
</script>

<div class="p-6 flex items-center justify-center min-h-[400px]">
  <div class="text-center max-w-md">
    <div class="text-6xl mb-4"></div>
    <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-2">{title}</h1>
    <p class="text-[var(--muted)]">{description}</p>
  </div>
</div>
