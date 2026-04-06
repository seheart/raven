<script>
  /**
   * Flow Field — Perlin noise-driven particle streams
   * Particles follow curved paths through a noise field.
   * Speed and density driven by activity. Looks like wind or currents.
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
  let lastEventCount = 0;
  let activity = 0;

  const MAX_PARTICLES = 400;
  const FIELD_SCALE = 0.003;

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

  // Simple 2D noise (hash-based, good enough for flow field)
  function noise2d(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    function hash(x, y) {
      let h = x * 374761393 + y * 668265263;
      h = (h ^ (h >> 13)) * 1274126177;
      return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
    }

    const n00 = hash(ix, iy);
    const n10 = hash(ix + 1, iy);
    const n01 = hash(ix, iy + 1);
    const n11 = hash(ix + 1, iy + 1);

    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sy;
  }

  function getFlowAngle(x, y, t) {
    const n = noise2d(x * FIELD_SCALE + t * 0.3, y * FIELD_SCALE + t * 0.15);
    return n * Math.PI * 4;
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

  function spawnParticles(type, count) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    const cx = width / 2;
    const cy = height / 2;

    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      // Spawn near center with some spread
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 40;
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        prevX: 0,
        prevY: 0,
        speed: 0.5 + Math.random() * 1.5,
        color,
        life: 1,
        decay: 0.002 + Math.random() * 0.003,
        size: 0.8 + Math.random() * 1.5
      });
    }
  }

  // Maintain ambient flow particles
  function ensureAmbient() {
    while (particles.length < 60) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        prevX: 0,
        prevY: 0,
        speed: 0.3 + Math.random() * 0.5,
        color: colors.muted,
        life: Math.random(),
        decay: 0.001 + Math.random() * 0.002,
        size: 0.5 + Math.random() * 0.8
      });
    }
  }

  function draw() {
    time += 0.016;

    // Semi-transparent clear for trail effect
    const s = getComputedStyle(document.body);
    const bg = s.getPropertyValue('--surface').trim() || '#1a1a2e';
    const bgRgb = hexToRgb(bg);
    if (bgRgb) {
      ctx.fillStyle = `rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0.08)`;
    } else {
      ctx.fillStyle = 'rgba(26,26,46,0.08)';
    }
    ctx.fillRect(0, 0, width, height);

    // Grid (very faint, drawn rarely)
    if (Math.floor(time * 60) % 120 === 0) {
      const gridColor =
        bgRgb && (bgRgb.r + bgRgb.g + bgRgb.b) / 3 > 128
          ? 'rgba(0,0,0,0.02)'
          : 'rgba(100,100,140,0.02)';
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
    }

    // Process events
    if (eventFeed.length > lastEventCount) {
      for (let i = lastEventCount; i < eventFeed.length; i++) {
        spawnParticles(eventFeed[i].type, 5 + Math.floor(Math.random() * 8));
      }
      lastEventCount = eventFeed.length;
      activity = Math.min(1, activity + 0.2);
    }
    activity *= 0.995;

    ensureAmbient();

    // Update particles
    particles = particles.filter(p => {
      p.life -= p.decay;
      if (p.life <= 0) return false;
      if (p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10) return false;

      p.prevX = p.x;
      p.prevY = p.y;

      // Follow flow field
      const angle = getFlowAngle(p.x, p.y, time);
      const speed = p.speed * (0.8 + activity * 1.5);
      p.x += Math.cos(angle) * speed;
      p.y += Math.sin(angle) * speed;

      // Draw as line segment (trail)
      ctx.strokeStyle = rgba(p.color, p.life * 0.6);
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.prevX, p.prevY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      // Head glow
      ctx.fillStyle = rgba(p.color, p.life * 0.4);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
      ctx.fill();

      return true;
    });

    // Core
    const cx = width / 2;
    const cy = height / 2;
    const coreR = 4 + Math.sin(time * 2) * 1 + activity * 5;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
    grad.addColorStop(0, rgba(colors.accent, 0.2 + activity * 0.1));
    grad.addColorStop(1, rgba(colors.accent, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(colors.accent, 0.8);
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 0.5, 0, Math.PI * 2);
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

    // Clear trails on resize
    const bg = getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#1a1a2e';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    resolveColors();
    handleResize();
    animId = requestAnimationFrame(draw);

    const themeObs = new MutationObserver(() => {
      resolveColors();
      handleResize();
    });
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
      >3. Flow Field</span
    >
    <span class="text-[9px] text-[var(--muted)] font-mono ml-2">Noise-driven particle streams</span>
  </div>
</div>
