<script>
  /**
   * Plasma — a fluid, breathing blob. Closed perimeter modulated by
   * three layered sines per vertex. Vibe: biological, lava-lamp.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../../services/websocket.js';
  import { resolveThemeColors, rgba, TYPE_COLORS, eventToType, fileChangeToType } from './_shared.js';

  let canvas;
  let ctx;
  let animId;
  let width = 0;
  let height = 0;
  let time = 0;
  let activity = 0;
  let colors = $state(resolveThemeColors());

  const POINTS = 48;
  const phases = Array.from({ length: POINTS }, () => Math.random() * Math.PI * 2);
  // Per-point burst impulse — bumps perimeter outward when something happens.
  const impulses = new Float32Array(POINTS);
  let burstColor = null;
  let burstColorLife = 0;

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.18);
    burstColor = color;
    burstColorLife = 1;
    // Push out a contiguous arc of points so the bump localizes.
    const center = Math.floor(Math.random() * POINTS);
    const span = 5;
    for (let d = -span; d <= span; d++) {
      const i = (center + d + POINTS) % POINTS;
      impulses[i] += (1 - Math.abs(d) / span) * 0.4;
    }
  }

  function draw() {
    const dt = 0.016;
    time += dt;
    activity *= 0.992;
    burstColorLife *= 0.97;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const baseR = Math.min(width, height) * 0.22;

    const blobColor = burstColor && burstColorLife > 0.05
      ? burstColor
      : colors.accent;

    // Compute perimeter points
    const pts = [];
    for (let i = 0; i < POINTS; i++) {
      const ang = (i / POINTS) * Math.PI * 2;
      const noise =
        Math.sin(time * 0.6 + phases[i]) * 0.10 +
        Math.sin(time * 1.1 + phases[i] * 1.7) * 0.07 +
        Math.sin(time * 1.9 + phases[i] * 0.4) * 0.04;
      impulses[i] *= 0.94;
      const r = baseR * (1 + noise + activity * 0.25 + impulses[i]);
      pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
    }

    // Smooth path via midpoint quadratic curves
    ctx.beginPath();
    const last = pts[pts.length - 1];
    ctx.moveTo((last.x + pts[0].x) / 2, (last.y + pts[0].y) / 2);
    for (let i = 0; i < POINTS; i++) {
      const cur = pts[i];
      const next = pts[(i + 1) % POINTS];
      const mx = (cur.x + next.x) / 2;
      const my = (cur.y + next.y) / 2;
      ctx.quadraticCurveTo(cur.x, cur.y, mx, my);
    }
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.3);
    grad.addColorStop(0, rgba(blobColor, 0.65 + activity * 0.25));
    grad.addColorStop(0.55, rgba(blobColor, 0.22));
    grad.addColorStop(1, rgba(blobColor, 0));
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = rgba(blobColor, 0.45 + activity * 0.3);
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Inner highlight — gives a wet sheen
    const hi = ctx.createRadialGradient(
      cx - baseR * 0.3, cy - baseR * 0.3, 0,
      cx - baseR * 0.3, cy - baseR * 0.3, baseR * 0.6
    );
    hi.addColorStop(0, rgba('#ffffff', 0.18));
    hi.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = hi;
    ctx.fill();

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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Plasma</span>
  </div>
</div>
