<script>
  /**
   * NebulaStrip — slim ambient burst band that lives in the chrome.
   *
   * Built as the "always-on" sibling to NebulaActivity (which is the full
   * 3D nebula visible only on the Live page). Same event sources — agent
   * events and file changes via WebSocket — but rendered as a horizontal
   * scroll of light bursts that drift up and fade. ~40px tall, fits between
   * VitalsStrip and the page body, present everywhere.
   *
   * The aesthetic is "I see you working." A burst per character on edits
   * means you watch raven react to your typing in real time. Counts since
   * load are kept in the corner because integers are satisfying.
   */

  import { onMount } from 'svelte';
  import { websocketService } from '../services/websocket.js';

  let canvas;
  let ctx;
  let animId;
  let width = 0;
  let height = 0;
  let particles = [];
  let totalBursts = $state(0);
  let recentBursts = $state(0);
  const recentTimestamps = [];

  // Match NebulaActivity's color semantics so bursts read the same here
  // as on the full nebula page. Edits/deletes use vibrant variants
  // because muted theme colors disappear at small particle sizes.
  let colors = {
    accent: '#a47eff',
    success: '#22dd66',
    error: '#ff3b4a',
    warning: '#f5b045',
    muted: '#7a6a8e'
  };

  const TYPE_COLORS = {
    tool_call: 'muted',
    tool_result: 'muted',
    inference: 'muted',
    user_message: 'accent',
    assistant_message: 'accent',
    assistant: 'accent',
    file_edit: 'success',
    file_create: 'success',
    file_add: 'success',
    file_delete: 'error',
    error: 'error',
    warning: 'warning'
  };

  const MAX_PARTICLES = 200;

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }

  function rgba(hex, a) {
    const rgb = hexToRgb(hex);
    return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${a})` : `rgba(150,150,200,${a})`;
  }

  function resolveColors() {
    const s = getComputedStyle(document.documentElement);
    colors.accent = s.getPropertyValue('--accent').trim() || colors.accent;
    colors.warning = s.getPropertyValue('--warning').trim() || colors.warning;
    colors.muted = s.getPropertyValue('--muted').trim() || colors.muted;
  }

  function spawnBurst(type, count = 1) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    // Sqrt scaling matches NebulaActivity so a burst here feels like the
    // same event there: typo = puff, paragraph = bigger puff, refactor = pop.
    // Cap is lower because the strip is short — keep it clean at high volume.
    const particleCount = Math.min(20, Math.max(2, Math.round(Math.sqrt(count) * 1.5)));
    // Each burst's origin is a random x; particles drift up and outward.
    const originX = 40 + Math.random() * (width - 80);
    const originY = height - 4;

    for (let i = 0; i < particleCount && particles.length < MAX_PARTICLES; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const speed = 0.6 + Math.random() * 1.4;
      particles.push({
        x: originX + (Math.random() - 0.5) * 8,
        y: originY,
        vx: Math.cos(angle) * speed * 0.4,
        vy: Math.sin(angle) * speed,
        radius: 0.8 + Math.random() * 1.4,
        color,
        life: 1,
        decay: 0.012 + Math.random() * 0.008
      });
    }

    totalBursts += 1;
    const now = Date.now();
    recentTimestamps.push(now);
    while (recentTimestamps.length > 0 && now - recentTimestamps[0] > 60_000) {
      recentTimestamps.shift();
    }
    recentBursts = recentTimestamps.length;
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    particles = particles.filter(p => {
      p.life -= p.decay;
      if (p.life <= 0) return false;
      p.x += p.vx;
      p.y += p.vy;
      p.vy *= 0.985; // gentle deceleration so bursts don't shoot off
      p.vx *= 0.985;

      const glowSize = p.radius * 3.5;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
      grad.addColorStop(0, rgba(p.color, p.life * 0.5));
      grad.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba(p.color, p.life * 0.85);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });

    animId = requestAnimationFrame(draw);
  }

  function handleResize() {
    if (!canvas?.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    resolveColors();
    handleResize();
    animId = requestAnimationFrame(draw);

    // Listen to the same event streams as the full nebula. char-level
    // bursts on file changes — `chars_added`/`chars_removed` come from
    // raven's diff engine — so live typing actually shows.
    const handleAgentEvent = data => {
      const type = data?.event_type || data?.type || 'tool_call';
      spawnBurst(type, 1);
    };

    const handleFileChange = data => {
      const charsAdded = data?.chars_added || 0;
      const charsRemoved = data?.chars_removed || 0;
      if (charsAdded > 0) spawnBurst('file_edit', charsAdded);
      if (charsRemoved > 0) spawnBurst('file_delete', charsRemoved);
      if (charsAdded === 0 && charsRemoved === 0) {
        const changeType = data?.change_type || 'change';
        const t =
          changeType === 'unlink'
            ? 'file_delete'
            : changeType === 'add'
              ? 'file_create'
              : 'file_edit';
        spawnBurst(t, 1);
      }
    };

    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('file-changed', handleFileChange);

    let themeDebounce;
    const themeObs = new MutationObserver(() => {
      clearTimeout(themeDebounce);
      themeDebounce = setTimeout(resolveColors, 100);
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const resizeObs = new ResizeObserver(() => handleResize());
    resizeObs.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(themeDebounce);
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('file-changed', handleFileChange);
      themeObs.disconnect();
      resizeObs.disconnect();
    };
  });
</script>

<div
  class="relative w-full h-10 border-b border-[var(--border)] bg-[var(--bg)] overflow-hidden"
  title="Nebula strip — every dot is an agent event or file change. Always on."
>
  <canvas bind:this={canvas} class="absolute inset-0 w-full h-full"></canvas>
  <div
    class="absolute top-1 right-3 pointer-events-none flex items-center gap-3 text-[9px] font-mono text-[var(--muted)] uppercase tracking-wide"
  >
    <span title="Bursts in the last 60 seconds">{recentBursts}/min</span>
    <span class="text-[var(--border)]">·</span>
    <span title="Bursts since this page loaded">{totalBursts.toLocaleString()} total</span>
  </div>
</div>
