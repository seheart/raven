<script>
  /**
   * NebulaActivity — Particle cloud AI heartbeat
   * No edges, no geometry. Glowing particles bloom from center
   * and swirl in orbital vortex. Pure energy field.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../services/websocket.js';

  let canvas;
  let ctx;
  let animId;
  let particles = [];
  let labels = []; // burst-origin labels, decoupled from particles
  let icons = []; // burst-origin tool icons
  let width = 0;
  let height = 0;
  let time = 0;
  let activity = 0;
  let ripples = [];

  let eventTimestamps = [];
  let eventRate = 0;
  let gridColor = 'rgba(100,100,140,0.04)'; // cached, updated on theme change
  let statusText = $state('Idle');
  let eventsPerMin = $state(0);
  let ticker = $state([]); // last N events shown as scrolling text under canvas

  const MAX_PARTICLES = 350;
  const TRAIL_LEN = 5;
  const TICKER_MAX = 5;
  const GROUP_WINDOW_MS = 200;
  const LABEL_LIFE_DECAY = 0.0005; // ~3.3s @ 60fps

  // Coalesce identical events fired within GROUP_WINDOW_MS into one bigger burst.
  const pendingGroup = new Map(); // key -> { type, label, icon, count, timer }

  const TOOL_ICONS = {
    Read: '📖',
    Write: '📝',
    Edit: '✏️',
    Bash: '⚡',
    Grep: '🔍',
    Glob: '✱',
    WebFetch: '🌐',
    WebSearch: '🔎',
    Task: '🤖'
  };
  const TYPE_ICONS = {
    file_create: '+',
    file_add: '+',
    file_delete: '−',
    file_edit: '~',
    user_message: '›',
    assistant_message: '‹',
    error: '!',
    warning: '?'
  };

  let colors = {
    accent: '#6b8eff',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    muted: '#8888a0'
  };

  function resolveColors() {
    const s = getComputedStyle(document.body);
    colors.accent = s.getPropertyValue('--accent').trim() || colors.accent;
    colors.success = s.getPropertyValue('--success').trim() || colors.success;
    colors.error = s.getPropertyValue('--error').trim() || colors.error;
    colors.warning = s.getPropertyValue('--warning').trim() || colors.warning;
    colors.muted = s.getPropertyValue('--muted').trim() || colors.muted;

    const bg = s.getPropertyValue('--surface').trim();
    const bgRgb = hexToRgb(bg);
    gridColor =
      bgRgb && (bgRgb.r + bgRgb.g + bgRgb.b) / 3 > 128
        ? 'rgba(0,0,0,0.03)'
        : 'rgba(100,100,140,0.04)';
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

  // Group identical bursts (same type+label) within a 200ms window into one
  // bigger burst with a count badge. Reduces visual noise during edit storms.
  function queueBurst(type, label, icon) {
    const key = `${type}|${label || ''}|${icon || ''}`;
    const pending = pendingGroup.get(key);
    if (pending) {
      pending.count++;
      return;
    }
    const entry = { type, label, icon, count: 1, timer: null };
    entry.timer = setTimeout(() => {
      pendingGroup.delete(key);
      spawnBurst(entry.type, entry.label, entry.icon, entry.count);
    }, GROUP_WINDOW_MS);
    pendingGroup.set(key, entry);
  }

  function spawnBurst(type, label, icon, count = 1) {
    recordEvent();
    const color = colors[TYPE_COLORS[type] || 'muted'];
    const cx = width / 2;
    const cy = height / 2;
    // Bigger bursts when grouped — particles, ripple, and core all scale.
    const sizeBoost = Math.min(2, 1 + Math.log2(count));
    const particleCount = Math.floor((4 + Math.floor(Math.random() * 5)) * sizeBoost);
    const burstAngle = Math.random() * Math.PI * 2;

    for (let i = 0; i < particleCount && particles.length < MAX_PARTICLES; i++) {
      const angle = burstAngle + (Math.random() - 0.5) * 1.5;
      const speed = 0.6 + Math.random() * 1.8 + eventRate * 0.3;
      const dist = 5 + Math.random() * 15;
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1 + Math.random() * 2.5,
        color,
        life: 1,
        decay: 0.0006 + Math.random() * 0.001,
        orbit: (0.001 + Math.random() * 0.004) * (Math.random() > 0.5 ? 1 : -1),
        trail: [] // ring buffer of recent positions for comet effect
      });
    }

    if (label) {
      const text = count > 1 ? `${label} ×${count}` : label;
      labels.push({
        text: text.slice(0, 32),
        x: cx + (Math.random() - 0.5) * 20,
        y: cy + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.25 - Math.random() * 0.2, // float upward
        color,
        life: 1
      });
    }
    if (icon) {
      icons.push({
        char: icon,
        x: cx,
        y: cy,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -0.15,
        color,
        life: 1
      });
    }

    activity = Math.min(1, activity + 0.12 * sizeBoost);
    ripples.push({ born: time, color, maxRadius: (50 + eventRate * 25) * sizeBoost });
  }

  function pushTicker(label, color) {
    if (!label) return;
    ticker = [{ text: label, color, ts: Date.now() }, ...ticker].slice(0, TICKER_MAX);
  }

  // Keep a faint ambient cloud so it's never empty
  function ensureAmbient() {
    const cx = width / 2;
    const cy = height / 2;
    while (particles.length < 25) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 80;
      particles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        radius: 0.5 + Math.random() * 1,
        color: colors.muted,
        life: 0.2 + Math.random() * 0.3,
        decay: 0.0008 + Math.random() * 0.001,
        orbit: (0.0005 + Math.random() * 0.002) * (Math.random() > 0.5 ? 1 : -1),
        trail: null // ambient particles skip trails for perf
      });
    }
  }

  function draw() {
    time += 0.016;
    ctx.clearRect(0, 0, width, height);
    updateEventRate();
    activity *= 0.998;

    // Grid (gridColor cached, updated on theme change)
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

    ensureAmbient();

    // Core glow — scales with activity
    const coreSize = 18 + Math.sin(time * 2) * 4 + activity * 20;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
    coreGrad.addColorStop(0, rgba(colors.accent, 0.12 + activity * 0.08));
    coreGrad.addColorStop(1, rgba(colors.accent, 0));
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
    ctx.fill();

    // Core dot
    const breath = 3 + Math.sin(time * 2) * 1.2 + activity * 2;
    ctx.fillStyle = rgba(colors.accent, 0.7);
    ctx.beginPath();
    ctx.arc(cx, cy, breath, 0, Math.PI * 2);
    ctx.fill();

    // Ripples
    ripples = ripples.filter(r => {
      const age = time - r.born;
      if (age > 1.2) return false;
      const p = age / 1.2;
      const radius = p * r.maxRadius;
      ctx.strokeStyle = rgba(r.color, (1 - p) * 0.25);
      ctx.lineWidth = (1 - p) * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });

    // Update particles
    particles = particles.filter(p => {
      p.life -= p.decay;
      if (p.life <= 0) return false;

      // Track position history for comet trail (only burst-size particles to
      // keep ambient cheap)
      if (p.trail && p.radius > 1) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > TRAIL_LEN) p.trail.shift();
      }

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
      p.vx *= 0.994;
      p.vy *= 0.994;

      // Comet trail — segments fade from old (transparent) to new (opaque)
      if (p.trail && p.trail.length > 1) {
        for (let i = 0; i < p.trail.length - 1; i++) {
          const segAlpha = (i / p.trail.length) * p.life * 0.35;
          ctx.strokeStyle = rgba(p.color, segAlpha);
          ctx.lineWidth = p.radius * (i / p.trail.length) * 0.9;
          ctx.beginPath();
          ctx.moveTo(p.trail[i].x, p.trail[i].y);
          ctx.lineTo(p.trail[i + 1].x, p.trail[i + 1].y);
          ctx.stroke();
        }
      }

      // Draw glow
      const glowSize = p.radius * 4;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
      grad.addColorStop(0, rgba(p.color, p.life * 0.45));
      grad.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
      ctx.fill();

      // Dot
      ctx.fillStyle = rgba(p.color, p.life * 0.8);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      return true;
    });

    // Burst-origin labels (decoupled from particles) — float up and fade
    labels = labels.filter(l => {
      l.life -= LABEL_LIFE_DECAY;
      if (l.life <= 0) return false;
      l.x += l.vx;
      l.y += l.vy;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(l.color, Math.min(1, l.life * 1.2) * 0.75);
      ctx.fillText(l.text, l.x, l.y);
      ctx.textAlign = 'start';
      return true;
    });

    // Tool icons at burst origin
    icons = icons.filter(ic => {
      ic.life -= LABEL_LIFE_DECAY * 1.4; // slightly faster than labels
      if (ic.life <= 0) return false;
      ic.x += ic.vx;
      ic.y += ic.vy;
      ctx.font = `${14 + ic.life * 6}px "Apple Color Emoji", "Noto Color Emoji", monospace`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, ic.life * 1.5);
      ctx.fillText(ic.char, ic.x, ic.y - 8);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'start';
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

  function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (Math.random() > 0.75 && particles.length < MAX_PARTICLES) {
      particles.push({
        x: mx,
        y: my,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 0.5 + Math.random() * 0.8,
        color: colors.muted,
        life: 0.3 + Math.random() * 0.2,
        decay: 0.006,
        orbit: (Math.random() - 0.5) * 0.004,
        trail: null
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
      const tool = data?.tool || data?.message?.match(/^(\w+)/)?.[1];
      const fileName = data?.file?.split('/').pop();
      const label =
        tool && fileName ? `${tool} · ${fileName}` :
        tool || fileName || data?.agent_name || type;
      const icon = TOOL_ICONS[tool] || TYPE_ICONS[type] || null;
      queueBurst(type, label, icon);
      pushTicker(label, colors[TYPE_COLORS[type] || 'muted']);
    };

    const handleFileChange = data => {
      const label = data?.file?.split('/').pop() || data?.filepath?.split('/').pop() || '';
      const changeType = data?.change_type || 'change';
      const type =
        changeType === 'unlink' ? 'file_delete' :
        changeType === 'add' ? 'file_create' : 'file_edit';
      const icon = TYPE_ICONS[type];
      queueBurst(type, label, icon);
      pushTicker(label, colors[TYPE_COLORS[type] || 'muted']);
    };

    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('file-changed', handleFileChange);

    let themeDebounce;
    const themeObs = new MutationObserver(() => {
      clearTimeout(themeDebounce);
      themeDebounce = setTimeout(resolveColors, 100);
    });
    themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const resizeObs = new ResizeObserver(() => handleResize());
    resizeObs.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(themeDebounce);
      pendingGroup.forEach(p => clearTimeout(p.timer));
      pendingGroup.clear();
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('file-changed', handleFileChange);
      themeObs.disconnect();
      resizeObs.disconnect();
    };
  });
</script>

<div
  class="relative w-full h-full rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--surface)]"
>
  <canvas
    bind:this={canvas}
    class="absolute inset-0 w-full h-full cursor-crosshair"
    onmousemove={handleMouseMove}
  ></canvas>
  <div class="absolute top-3 left-4 pointer-events-none">
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
      >AI Pulse</span
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

  {#if ticker.length > 0}
    <div
      class="absolute bottom-10 left-0 right-0 px-4 pointer-events-none overflow-hidden whitespace-nowrap text-[9px] font-mono"
    >
      {#each ticker as item, i (item.ts)}
        <span
          class="inline-block mr-3 transition-opacity"
          style="color: {item.color}; opacity: {1 - i * 0.18}"
        >
          {item.text}
        </span>
      {/each}
    </div>
  {/if}
</div>
