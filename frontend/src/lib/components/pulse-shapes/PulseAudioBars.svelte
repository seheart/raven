<script>
  /**
   * AudioBars — radial spectrum analyzer ring around a pulsing core.
   * Vibe: musical, rhythmic, concert.
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

  const BARS = 72;
  const phases = Array.from({ length: BARS }, (_, i) => i * 0.27);
  // Per-bar boost from bursts — like an EQ band lighting up.
  const boost = new Float32Array(BARS);
  let burstColor = null;
  let burstColorLife = 0;

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.18);
    burstColor = color;
    burstColorLife = 1;
    // Light up a band of adjacent bars
    const center = Math.floor(Math.random() * BARS);
    const span = 7;
    for (let d = -span; d <= span; d++) {
      const i = (center + d + BARS) % BARS;
      boost[i] = Math.max(boost[i], 1 - Math.abs(d) / span);
    }
  }

  function draw() {
    const dt = 0.016;
    time += dt;
    activity *= 0.99;
    burstColorLife *= 0.96;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const innerR = Math.min(width, height) * 0.10;
    const maxBar = Math.min(width, height) * 0.20;

    const barColor = burstColor && burstColorLife > 0.05 ? burstColor : colors.accent;

    for (let i = 0; i < BARS; i++) {
      const ang = (i / BARS) * Math.PI * 2 - Math.PI / 2;
      const wave =
        Math.abs(Math.sin(time * 1.3 + phases[i])) * 0.45 +
        Math.abs(Math.sin(time * 0.8 + phases[i] * 2.1)) * 0.25;
      boost[i] *= 0.92;
      const len = innerR + (wave + activity * 0.4 + boost[i] * 0.6) * maxBar;
      const x1 = cx + Math.cos(ang) * innerR;
      const y1 = cy + Math.sin(ang) * innerR;
      const x2 = cx + Math.cos(ang) * len;
      const y2 = cy + Math.sin(ang) * len;
      const t = (len - innerR) / maxBar;
      ctx.strokeStyle = rgba(barColor, 0.25 + t * 0.5 + boost[i] * 0.3);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Pulsing core
    const breath = 0.5 + Math.sin(time * 1.6) * 0.12;
    const coreR = innerR * (breath + activity * 0.4);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 1.6);
    grad.addColorStop(0, rgba(barColor, 0.75));
    grad.addColorStop(0.6, rgba(barColor, 0.25));
    grad.addColorStop(1, rgba(barColor, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(barColor, 0.95);
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 0.45, 0, Math.PI * 2);
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Audio Bars</span>
  </div>
</div>
