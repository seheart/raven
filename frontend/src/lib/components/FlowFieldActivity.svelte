<script>
  /**
   * FlowFieldActivity — Perlin noise flow field driven by live AI events
   * Particles follow curved paths through a shifting vector field.
   * Events spawn colored streams from center. Organic, never geometric.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../services/websocket.js';

  let canvas;
  let ctx;
  let animId;
  let particles = [];
  let width = 0;
  let height = 0;
  let time = 0;
  let activity = 0;
  let bgRgbCache = null;

  // Event tracking
  let eventTimestamps = [];
  let eventRate = 0;

  let statusText = $state('Idle');
  let eventsPerMin = $state(0);

  const MAX_PARTICLES = 400;
  const FIELD_SCALE = 0.003;

  let colors = {
    accent: '#6b8eff',
    success: '#22c55e',
    error: '#ef4444',
    muted: '#8888a0',
    warning: '#f59e0b'
  };

  function resolveColors() {
    const s = getComputedStyle(document.body);
    colors.accent = s.getPropertyValue('--accent').trim() || colors.accent;
    colors.success = s.getPropertyValue('--success').trim() || colors.success;
    colors.error = s.getPropertyValue('--error').trim() || colors.error;
    colors.warning = s.getPropertyValue('--warning').trim() || colors.warning;
    colors.muted = s.getPropertyValue('--muted').trim() || colors.muted;

    const bg = s.getPropertyValue('--surface').trim() || '#1a1a2e';
    bgRgbCache = hexToRgb(bg);
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }

  function rgba(hex, a) {
    const rgb = hexToRgb(hex);
    return rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${a})` : `rgba(150,150,200,${a})`;
  }

  // Hash-based 2D noise with smooth interpolation
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
    inference: 'muted',
    user_message: 'accent',
    assistant_message: 'accent',
    assistant: 'accent',
    human: 'accent',
    file_edit: 'success',
    file_create: 'success',
    file_add: 'success',
    file_delete: 'error',
    error: 'error',
    warning: 'warning'
  };

  function recordEvent() {
    const now = Date.now();
    eventTimestamps.push(now);
    eventTimestamps = eventTimestamps.filter(t => now - t < 60000);
  }

  function updateEventRate() {
    const now = Date.now();
    eventTimestamps = eventTimestamps.filter(t => now - t < 60000);
    const recent = eventTimestamps.filter(t => now - t < 10000).length;
    const target = recent / 10;
    eventRate += (target - eventRate) * 0.05;
    eventsPerMin = eventTimestamps.length;

    if (eventRate > 2) statusText = 'High Activity';
    else if (eventRate > 0.5) statusText = 'Active';
    else if (eventRate > 0.1) statusText = 'Low Activity';
    else statusText = 'Idle';
  }

  function spawnParticles(type, label) {
    recordEvent();
    const color = colors[TYPE_COLORS[type] || 'muted'];
    const cx = width / 2;
    const cy = height / 2;
    const count = 4 + Math.floor(Math.random() * 6);

    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 30;
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        prevX: 0,
        prevY: 0,
        speed: 0.5 + Math.random() * 1.5,
        color,
        life: 1,
        decay: 0.002 + Math.random() * 0.003,
        size: 0.8 + Math.random() * 1.5,
        label: i === 0 ? (label || '').slice(0, 20) : '',
        labelLife: 1
      });
    }

    activity = Math.min(1, activity + 0.15);
  }

  function ensureAmbient() {
    while (particles.length < 50) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        prevX: 0,
        prevY: 0,
        speed: 0.2 + Math.random() * 0.4,
        color: colors.muted,
        life: Math.random(),
        decay: 0.001 + Math.random() * 0.002,
        size: 0.4 + Math.random() * 0.6,
        label: '',
        labelLife: 0
      });
    }
  }

  function draw() {
    time += 0.016;
    updateEventRate();

    // Trail fade — semi-transparent overlay
    if (bgRgbCache) {
      ctx.fillStyle = `rgba(${bgRgbCache.r},${bgRgbCache.g},${bgRgbCache.b},0.06)`;
    } else {
      ctx.fillStyle = 'rgba(26,26,46,0.06)';
    }
    ctx.fillRect(0, 0, width, height);

    activity *= 0.997;
    ensureAmbient();

    const cx = width / 2;
    const cy = height / 2;

    // Update and draw particles
    particles = particles.filter(p => {
      p.life -= p.decay;
      if (p.life <= 0) return false;
      if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) return false;

      p.prevX = p.x;
      p.prevY = p.y;

      // Follow flow field
      const angle = getFlowAngle(p.x, p.y, time);
      const speed = p.speed * (0.7 + activity * 1.8);
      p.x += Math.cos(angle) * speed;
      p.y += Math.sin(angle) * speed;

      // Trail line
      ctx.strokeStyle = rgba(p.color, p.life * 0.55);
      ctx.lineWidth = p.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.prevX, p.prevY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      // Head glow
      const glowSize = p.size * 2.5;
      ctx.fillStyle = rgba(p.color, p.life * 0.3);
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
      ctx.fill();

      // Label
      if (p.label && p.labelLife > 0.05) {
        p.labelLife -= 0.008;
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = rgba(p.color, p.labelLife * 0.5);
        ctx.fillText(p.label, p.x + p.size + 4, p.y + 3);
      }

      return true;
    });

    // Core glow
    const coreR = 4 + Math.sin(time * 2) * 1.5 + activity * 6;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4);
    grad.addColorStop(0, rgba(colors.accent, 0.15 + activity * 0.1));
    grad.addColorStop(1, rgba(colors.accent, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 4, 0, Math.PI * 2);
    ctx.fill();

    // Core dot
    ctx.fillStyle = rgba(colors.accent, 0.8);
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

    // Clear trails on resize
    if (bgRgbCache) {
      ctx.fillStyle = `rgb(${bgRgbCache.r},${bgRgbCache.g},${bgRgbCache.b})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function handleMouseMove(e) {
    // Spawn a few ambient particles near cursor for interactivity
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (Math.random() > 0.7 && particles.length < MAX_PARTICLES) {
      particles.push({
        x: mx + (Math.random() - 0.5) * 10,
        y: my + (Math.random() - 0.5) * 10,
        prevX: mx,
        prevY: my,
        speed: 0.3 + Math.random() * 0.5,
        color: colors.muted,
        life: 0.4 + Math.random() * 0.3,
        decay: 0.005 + Math.random() * 0.005,
        size: 0.5 + Math.random() * 0.8,
        label: '',
        labelLife: 0
      });
    }
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    resolveColors();
    handleResize();
    animId = requestAnimationFrame(draw);

    const handleAgentEvent = data => {
      const type = data?.event_type || data?.type || 'tool_call';
      const label =
        data?.file?.split('/').pop() || data?.message?.split(' ')[0] || data?.agent_name || type;
      spawnParticles(type, label);
    };

    const handleFileChange = data => {
      const label = data?.file?.split('/').pop() || data?.filepath?.split('/').pop() || '';
      const changeType = data?.change_type || 'change';
      if (changeType === 'unlink') spawnParticles('file_delete', label);
      else if (changeType === 'add') spawnParticles('file_create', label);
      else spawnParticles('file_edit', label);
    };

    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('file-changed', handleFileChange);

    let themeDebounce;
    const themeObs = new MutationObserver(() => {
      clearTimeout(themeDebounce);
      themeDebounce = setTimeout(() => {
        resolveColors();
        handleResize();
      }, 100);
    });
    themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const resizeObs = new ResizeObserver(() => handleResize());
    resizeObs.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('file-changed', handleFileChange);
      themeObs.disconnect();
      resizeObs.disconnect();
    };
  });
</script>

<div
  class="relative w-full rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--surface)]"
  style="height: 280px;"
>
  <canvas
    bind:this={canvas}
    class="absolute inset-0 w-full h-full cursor-crosshair"
    onmousemove={handleMouseMove}
  ></canvas>
  <div class="absolute top-3 left-4 pointer-events-none">
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
      >AI Activity</span
    >
    <span class="text-[9px] text-[var(--muted)] font-mono ml-2">{statusText}</span>
  </div>
  <div class="absolute top-3 right-4 pointer-events-none">
    <span class="text-[9px] text-[var(--muted)] font-mono">{eventsPerMin} events/min</span>
  </div>
  <div
    class="absolute bottom-3 right-4 pointer-events-none flex items-center gap-3 text-[9px] font-mono text-[var(--muted)]"
  >
    <span class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full" style="background: var(--muted);"></span>
      Tools
    </span>
    <span class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full" style="background: var(--accent);"></span>
      Chat
    </span>
    <span class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full" style="background: var(--success);"></span>
      Edits
    </span>
    <span class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full" style="background: var(--error);"></span>
      Deletes
    </span>
  </div>
</div>
