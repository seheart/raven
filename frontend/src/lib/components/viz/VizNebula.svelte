<script>
  /**
   * Nebula — Particle cloud visualization
   * No edges. Dense glowing particles that bloom and swirl.
   * Events create bursts, particles drift in a vortex field.
   */
  import { onMount } from 'svelte';

  let { eventFeed = [] } = $props();
  let canvas;
  let ctx;
  let animId;
  let particles = [];
  let width = 0;
  let height = 0;
  let time = 0;
  let eventRate = 0;
  let lastEventCount = 0;

  const MAX_PARTICLES = 300;

  let colors = { accent: '#6b8eff', success: '#22c55e', error: '#ef4444', muted: '#8888a0' };

  function resolveColors() {
    const s = getComputedStyle(document.body);
    colors.accent = s.getPropertyValue('--accent').trim() || colors.accent;
    colors.success = s.getPropertyValue('--success').trim() || colors.success;
    colors.error = s.getPropertyValue('--error').trim() || colors.error;
    colors.muted = s.getPropertyValue('--muted').trim() || colors.muted;
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }

  function rgba(hex, a) {
    const rgb = hexToRgb(hex);
    return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${a})` : `rgba(150,150,200,${a})`;
  }

  const TYPE_COLORS = {
    tool_call: 'muted',
    tool_result: 'muted',
    user_message: 'accent',
    assistant_message: 'accent',
    file_edit: 'success',
    file_create: 'success',
    file_delete: 'error',
    error: 'error'
  };

  function spawnBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    const cx = width / 2;
    const cy = height / 2;
    const count = 3 + Math.floor(Math.random() * 4);
    const burstAngle = Math.random() * Math.PI * 2;

    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const angle = burstAngle + (Math.random() - 0.5) * 1.2;
      const speed = 0.8 + Math.random() * 1.5;
      const dist = 5 + Math.random() * 15;
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1 + Math.random() * 2.5,
        color,
        life: 1,
        decay: 0.003 + Math.random() * 0.004,
        orbit: 0.002 + Math.random() * 0.003 * (Math.random() > 0.5 ? 1 : -1)
      });
    }
  }

  function draw() {
    time += 0.016;
    ctx.clearRect(0, 0, width, height);

    // Subtle grid
    const s = getComputedStyle(document.body);
    const bg = s.getPropertyValue('--surface').trim();
    const bgRgb = hexToRgb(bg);
    const gridColor =
      bgRgb && (bgRgb.r + bgRgb.g + bgRgb.b) / 3 > 128
        ? 'rgba(0,0,0,0.03)'
        : 'rgba(100,100,140,0.04)';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const cx = width / 2;
    const cy = height / 2;

    // Process new events
    if (eventFeed.length > lastEventCount) {
      for (let i = lastEventCount; i < eventFeed.length; i++) {
        spawnBurst(eventFeed[i].type);
      }
      lastEventCount = eventFeed.length;
    }

    // Update event rate
    eventRate += ((eventFeed.length > lastEventCount - 3 ? 1 : 0) - eventRate) * 0.05;

    // Core glow
    const coreSize = 15 + Math.sin(time * 2) * 3 + eventRate * 10;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
    coreGrad.addColorStop(0, rgba(colors.accent, 0.15));
    coreGrad.addColorStop(1, rgba(colors.accent, 0));
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
    ctx.fill();

    // Core dot
    const breath = 3 + Math.sin(time * 2) * 1;
    ctx.fillStyle = rgba(colors.accent, 0.7);
    ctx.beginPath();
    ctx.arc(cx, cy, breath, 0, Math.PI * 2);
    ctx.fill();

    // Update particles
    particles = particles.filter(p => {
      p.life -= p.decay;
      if (p.life <= 0) return false;

      // Orbital rotation around center
      const dx = p.x - cx;
      const dy = p.y - cy;
      const cos = Math.cos(p.orbit);
      const sin = Math.sin(p.orbit);
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      p.x = cx + rx + p.vx;
      p.y = cy + ry + p.vy;

      // Decelerate
      p.vx *= 0.993;
      p.vy *= 0.993;

      // Draw glow
      const glowSize = p.radius * 4;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
      grad.addColorStop(0, rgba(p.color, p.life * 0.5));
      grad.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = rgba(p.color, p.life * 0.8);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      return true;
    });

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
    resolveColors();
    handleResize();
    animId = requestAnimationFrame(draw);

    const themeObs = new MutationObserver(() => resolveColors());
    themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const resizeObs = new ResizeObserver(() => handleResize());
    resizeObs.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      themeObs.disconnect();
      resizeObs.disconnect();
    };
  });
</script>

<div
  class="relative w-full rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--surface)]"
  style="height: 260px;"
>
  <canvas bind:this={canvas} class="absolute inset-0 w-full h-full"></canvas>
  <div class="absolute top-3 left-4 pointer-events-none">
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">1. Nebula</span>
    <span class="text-[9px] text-[var(--muted)] font-mono ml-2"
      >Particle cloud with vortex drift</span
    >
  </div>
</div>
