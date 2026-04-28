<script>
  /**
   * Helix — two strands rotating around a vertical axis with rungs
   * between them. Vibe: bio, structured, DNA.
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
  let helixAngle = 0;
  let colors = $state(resolveThemeColors());

  const STEPS = 26;
  const flash = new Float32Array(STEPS);
  const flashColor = new Array(STEPS).fill(null);

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.16);
    const i = Math.floor(Math.random() * STEPS);
    flash[i] = 1;
    flashColor[i] = color;
  }

  function draw() {
    const dt = 0.016;
    time += dt;
    activity *= 0.992;
    helixAngle += (0.55 + activity * 0.6) * dt;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.13;
    const totalH = Math.min(width, height) * 0.62;
    const stepH = totalH / (STEPS - 1);

    const aPts = [];
    const bPts = [];
    for (let i = 0; i < STEPS; i++) {
      const phaseA = helixAngle + (i / (STEPS - 1)) * Math.PI * 4;
      const phaseB = phaseA + Math.PI;
      const y = cy - totalH / 2 + i * stepH;
      // Slight lateral breathing on the radius
      const breath = 1 + Math.sin(time * 0.9 + i * 0.2) * 0.04;
      const r = radius * breath;
      aPts.push({ x: cx + Math.cos(phaseA) * r, y, depth: Math.sin(phaseA) });
      bPts.push({ x: cx + Math.cos(phaseB) * r, y, depth: Math.sin(phaseB) });
    }

    // Rungs (back to front by midpoint depth)
    const rungs = [];
    for (let i = 0; i < STEPS; i++) {
      rungs.push({ i, mid: (aPts[i].depth + bPts[i].depth) / 2 });
    }
    rungs.sort((p, q) => p.mid - q.mid);
    for (const { i, mid } of rungs) {
      flash[i] *= 0.93;
      const a = aPts[i];
      const b = bPts[i];
      const t = (mid + 1) / 2;
      const fcolor = flash[i] > 0.05 && flashColor[i] ? flashColor[i] : colors.accent;
      ctx.strokeStyle = rgba(fcolor, 0.15 + t * 0.35 + flash[i] * 0.55);
      ctx.lineWidth = 1 + flash[i] * 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Strand polylines
    for (const strand of [aPts, bPts]) {
      for (let i = 0; i < strand.length - 1; i++) {
        const p = strand[i];
        const q = strand[i + 1];
        const t = ((p.depth + q.depth) / 2 + 1) / 2;
        ctx.strokeStyle = rgba(colors.accent, 0.25 + t * 0.6);
        ctx.lineWidth = 1.4 + t * 1.1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      // Strand dots
      for (const p of strand) {
        const t = (p.depth + 1) / 2;
        ctx.fillStyle = rgba(colors.accent, 0.45 + t * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6 + t * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Helix</span>
  </div>
</div>
