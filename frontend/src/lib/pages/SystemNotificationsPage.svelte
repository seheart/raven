<script>
  /**
   * Notifications Page - System alerts history
   */
  import { onMount } from 'svelte';

  let notifications = $state([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const res = await fetch('http://localhost:3030/api/notifications?limit=50');
      notifications = await res.json();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  });

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">🔔 Notifications</h1>
    <p class="text-base text-[var(--muted)] font-sans mb-6">
      System alerts and notification history
    </p>

    {#if loading}
      <div class="space-y-3">
        {#each Array(5) as _, i (i)}
          <div
            class="h-20 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse"
          ></div>
        {/each}
      </div>
    {:else if notifications.length === 0}
      <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center">
        <div class="text-4xl mb-3">🔕</div>
        <p class="text-[var(--text)] font-sans mb-2">No notifications</p>
        <p class="text-sm text-[var(--muted)] font-sans">All quiet here!</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each notifications as notification, i (notification.id || i)}
          <div
            class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex gap-3 items-start"
          >
            <div class="text-2xl">🔔</div>
            <div class="flex-1">
              <div class="font-semibold text-[var(--text)] font-sans text-sm mb-1">
                {notification.title || 'Notification'}
              </div>
              <div class="text-sm text-[var(--muted)] font-sans">
                {notification.message || notification.text}
              </div>
              <div class="text-xs text-[var(--muted)] font-mono mt-2">
                {formatTime(notification.timestamp)}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
