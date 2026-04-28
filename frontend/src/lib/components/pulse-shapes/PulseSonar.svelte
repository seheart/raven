<script>
  /**
   * Sonar — concentric rings expanding outward from a pulsing core.
   * Vibe: zen, meditative, deep-space ping.
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
  let lastAmbient = 0;
  let colors = $state(resolveThemeColors());

  let rings = [];

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.18);
    rings.push({ born: time, color, life: 1.6, isAmbient: false });
  }

  function draw() {
    const dt = 0.016;
    time += dt;
    activity *= 0.992;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) * 0.46;

    // Spawn ambient rings on a slow cadence so it never feels dead.
    const ambientGap = 1.4 - activity * 0.5; // faster pings when busy
    if (time - lastAmbient > ambientGap) {
      rings.push({ born: time, color: colors.accent, life: 3.4, isAmbient: true });
      lastAmbient = time;
    }

    rings = rings.filter(r => {
      const age = time - r.born;
      if (age > r.life) return false;
      const p = age / r.life;
      const radius = p * maxR;
      const alpha = (1 - p) * (r.isAmbient ? 0.28 : 0.65);
      ctx.strokeStyle = rgba(r.color, alpha);
      ctx.lineWidth = 1 + (1 - p) * (r.isAmbient ? 1 : 2);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });

    // Pulsing core — slow breath plus activity-driven swell
    const breath = Math.sin(time * 1.2) * 4;
    const coreR = 14 + breath + activity * 24;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.8);
    halo.addColorStop(0, rgba(colors.accent, 0.7));
    halo.addColorStop(0.5, rgba(colors.accent, 0.25));
    halo.addColorStop(1, rgba(colors.accent, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(colors.accent, 0.95);
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 0.4, 0, Math.PI * 2);
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Sonar</span>
  </div>
</div>
