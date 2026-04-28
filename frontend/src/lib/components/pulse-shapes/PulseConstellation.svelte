<script>
  /**
   * Constellation — drifting nodes connected by proximity-based links.
   * Vibe: networked, cerebral, neural.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../../services/websocket.js';
  import { resolveThemeColors, rgba, TYPE_COLORS, eventToType, fileChangeToType } from './_shared.js';

  let canvas;
  let ctx;
  let animId;
  let width = 0;
  let height = 0;
  let colors = $state(resolveThemeColors());

  const NODES = 26;
  let nodes = [];

  function initNodes() {
    nodes = Array.from({ length: NODES }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      glow: 0,
      color: colors.accent
    }));
  }

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    if (nodes.length === 0) return;
    const n = nodes[Math.floor(Math.random() * nodes.length)];
    n.glow = 1;
    n.color = color;
    // Send a tiny shockwave: nudge nearby nodes slightly outward.
    for (const m of nodes) {
      if (m === n) continue;
      const dx = m.x - n.x;
      const dy = m.y - n.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 120) {
        m.vx += (dx / d) * 0.15;
        m.vy += (dy / d) * 0.15;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const linkDist = Math.min(width, height) * 0.32;

    // Update + draw lines
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      a.x += a.vx;
      a.y += a.vy;
      a.vx *= 0.985;
      a.vy *= 0.985;
      // Wrap around edges so the field stays full
      if (a.x < -10) a.x = width + 10;
      if (a.x > width + 10) a.x = -10;
      if (a.y < -10) a.y = height + 10;
      if (a.y > height + 10) a.y = -10;
      // Drift back toward gentle base velocity
      a.vx += ((Math.random() - 0.5) * 0.02);
      a.vy += ((Math.random() - 0.5) * 0.02);
      a.glow *= 0.95;

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          const t = 1 - d / linkDist;
          const alpha = t * 0.18 + (a.glow + b.glow) * 0.15;
          ctx.strokeStyle = rgba(colors.accent, alpha);
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Draw nodes on top
    for (const n of nodes) {
      const r = 1.8 + n.glow * 4;
      const haloR = r * 4;
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, haloR);
      grad.addColorStop(0, rgba(n.color, 0.35 + n.glow * 0.5));
      grad.addColorStop(1, rgba(n.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, haloR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(n.color, 0.85 + n.glow * 0.15);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    animId = requestAnimationFrame(draw);
  }

  function handleResize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    if (nodes.length === 0) initNodes();
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    handleResize();
    animId = requestAnimationFrame(draw);

    const onAgent = d => onBurst(eventToType(d));
    const onFile = d => onBurst(fileChangeToType(d));
    websocketService.on('agent-event', onAgent);
    websocketService.on('file-changed', onFile);

    const themeObs = new MutationObserver(() => { colors = resolveThemeColors(); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      websocketService.off('agent-event', onAgent);
      websocketService.off('file-changed', onFile);
      themeObs.disconnect();
      resizeObs.disconnect();
    };
  });
</script>

<div class="relative w-full h-full rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
  <canvas bind:this={canvas} class="absolute inset-0 w-full h-full"></canvas>
  <div class="absolute top-3 left-4 pointer-events-none">
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Constellation</span>
  </div>
</div>
