<script>
  /**
   * Torus — particles flowing along a tilted donut. Vibe: cosmic
   * energy field, magnetic.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../../services/websocket.js';
  import {
    resolveThemeColors,
    rgba,
    TYPE_COLORS,
    eventToType,
    fileChangeToType
  } from './_shared.js';

  let canvas;
  let ctx;
  let animId;
  let width = 0;
  let height = 0;
  let activity = 0;
  let torusYaw = 0;
  let colors = $state(resolveThemeColors());

  const PARTICLE_COUNT = 140;
  let particles = [];

  function initParticles() {
    particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      u: Math.random() * Math.PI * 2,
      v: Math.random() * Math.PI * 2,
      uSpeed: 0.005 + Math.random() * 0.018,
      vSpeed: 0.003 + Math.random() * 0.01,
      color: colors.accent,
      colorLife: 0
    }));
  }

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.2);
    // Recolor a chunk of particles briefly
    for (let i = 0; i < 20; i++) {
      const p = particles[Math.floor(Math.random() * particles.length)];
      if (p) {
        p.color = color;
        p.colorLife = 1;
      }
    }
  }

  function draw() {
    const dt = 0.016;
    activity *= 0.992;
    torusYaw += (0.32 + activity * 0.4) * dt;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const minSide = Math.min(width, height);
    const R = minSide * 0.2;
    const r = minSide * 0.07;
    const tilt = 1.05; // ~60° — see torus from above-the-plane
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const cyaw = Math.cos(torusYaw);
    const syaw = Math.sin(torusYaw);

    const projected = [];
    for (const p of particles) {
      p.u += p.uSpeed + activity * 0.005;
      p.v += p.vSpeed + activity * 0.003;
      p.colorLife *= 0.97;

      const cu = Math.cos(p.u),
        su = Math.sin(p.u);
      const cv = Math.cos(p.v),
        sv = Math.sin(p.v);
      const x = (R + r * cv) * cu;
      const y = (R + r * cv) * su;
      const z = r * sv;

      // Tilt (rotate around X)
      const yt = y * ct - z * st;
      const zt = y * st + z * ct;

      // Yaw (rotate around Y)
      const xy = x * cyaw + zt * syaw;
      const zy = -x * syaw + zt * cyaw;

      const color = p.colorLife > 0.05 ? p.color : colors.accent;
      projected.push({
        x: cx + xy,
        y: cy + yt,
        depth: zy,
        color,
        life: p.colorLife
      });
    }

    projected.sort((a, b) => a.depth - b.depth);
    const depthMax = R + r;
    for (const p of projected) {
      const t = (p.depth + depthMax) / (depthMax * 2);
      const radius = 0.8 + t * 1.6 + p.life * 0.8;
      const alpha = 0.25 + t * 0.55 + p.life * 0.2;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 4);
      grad.addColorStop(0, rgba(p.color, alpha * 0.6));
      grad.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(p.color, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
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
    if (particles.length === 0) initParticles();
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    handleResize();
    animId = requestAnimationFrame(draw);

    const onAgent = d => onBurst(eventToType(d));
    const onFile = d => onBurst(fileChangeToType(d));
    websocketService.on('agent-event', onAgent);
    websocketService.on('file-changed', onFile);

    const themeObs = new MutationObserver(() => {
      colors = resolveThemeColors();
    });
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

<div
  class="relative w-full h-full rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--surface)]"
>
  <canvas bind:this={canvas} class="absolute inset-0 w-full h-full"></canvas>
  <div class="absolute top-3 left-4 pointer-events-none">
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Torus</span>
  </div>
</div>
