<script>
  /**
   * NeuralActivityGraph — AI heartbeat visualization
   *
   * Every node is a real event: tool call, file change, conversation message.
   * When AI is idle, the graph is nearly still — just a faint breathing core.
   * When AI is working, nodes radiate outward from center, forming a living mesh.
   * The density and energy are a direct reflection of current AI throughput.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../services/websocket.js';

  let canvas;
  let ctx;
  let animId;
  let nodes = [];
  let width = 0;
  let height = 0;
  let mouseX = -1000;
  let mouseY = -1000;

  // Rolling event rate tracker
  let eventTimestamps = []; // recent event times for rate calc
  let eventRate = 0; // events per second (smoothed)
  let coreBreathPhase = 0; // breathing animation phase

  // Status text
  let statusText = $state('Idle');
  let eventsPerMin = $state(0);

  const MAX_NODES = 120;
  const CONNECT_DIST = 110;

  // Color palette
  let colors = {
    accent: '#6b8eff',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    muted: '#8888a0',
    grid: 'rgba(100,100,140,0.04)',
    text: '#e0e0ec'
  };

  function resolveColors() {
    const s = getComputedStyle(document.body);
    colors.accent = s.getPropertyValue('--accent').trim() || colors.accent;
    colors.success = s.getPropertyValue('--success').trim() || colors.success;
    colors.error = s.getPropertyValue('--error').trim() || colors.error;
    colors.warning = s.getPropertyValue('--warning').trim() || colors.warning;
    colors.muted = s.getPropertyValue('--muted').trim() || colors.muted;
    colors.text = s.getPropertyValue('--text').trim() || colors.text;

    const bg = s.getPropertyValue('--surface').trim();
    const bgRgb = hexToRgb(bg);
    if (bgRgb) {
      const brightness = (bgRgb.r + bgRgb.g + bgRgb.b) / 3;
      colors.grid = brightness > 128 ? 'rgba(0,0,0,0.035)' : 'rgba(100,100,140,0.04)';
    }
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }

  function colorWithAlpha(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (!rgb) return `rgba(150,150,200,${alpha})`;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  }

  const EVENT_COLORS = {
    tool_call: 'accent',
    tool_result: 'accent',
    user_message: 'accent',
    assistant_message: 'accent',
    file_change: 'success',
    error: 'error',
    warning: 'warning'
  };

  // Track event rate
  function recordEvent() {
    const now = Date.now();
    eventTimestamps.push(now);
    // Keep last 60s of timestamps
    eventTimestamps = eventTimestamps.filter(t => now - t < 60000);
  }

  function updateEventRate() {
    const now = Date.now();
    eventTimestamps = eventTimestamps.filter(t => now - t < 60000);
    // Events in last 10s, normalized to per-second
    const recent = eventTimestamps.filter(t => now - t < 10000).length;
    const target = recent / 10;
    // Smooth toward target
    eventRate += (target - eventRate) * 0.05;

    eventsPerMin = eventTimestamps.length;

    if (eventRate > 2) statusText = 'High Activity';
    else if (eventRate > 0.5) statusText = 'Active';
    else if (eventRate > 0.1) statusText = 'Low Activity';
    else statusText = 'Idle';
  }

  function spawnEventNode(type, label) {
    recordEvent();

    if (nodes.length >= MAX_NODES) {
      // Remove the oldest non-core node
      const idx = nodes.findIndex(n => !n.isCore);
      if (idx >= 0) nodes.splice(idx, 1);
    }

    const colorKey = EVENT_COLORS[type] || 'muted';
    const color = colors[colorKey];

    // Spawn from center with outward velocity
    const cx = width / 2;
    const cy = height / 2;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + eventRate * 0.15 + Math.random() * 0.2;
    // Slight offset from center so they don't stack
    const offset = 10 + Math.random() * 20;

    nodes.push({
      x: cx + Math.cos(angle) * offset,
      y: cy + Math.sin(angle) * offset,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.5 + Math.min(eventRate, 3) * 0.5,
      color,
      alpha: 1,
      born: performance.now(),
      lifetime: 8000 + Math.random() * 6000,
      label: (label || '').slice(0, 24),
      labelAlpha: 1,
      type,
      isCore: false
    });
  }

  function drawGrid() {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.5;
    const spacing = 40;

    for (let x = 0; x < width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawCore(now) {
    const cx = width / 2;
    const cy = height / 2;

    coreBreathPhase += 0.015 + eventRate * 0.01;

    // Core intensity scales with activity
    const baseSize = 4 + eventRate * 3;
    const breathe = Math.sin(coreBreathPhase) * 0.3 + 0.7;
    const coreSize = baseSize * breathe;

    // Outer glow — bigger when active
    const glowRadius = 20 + eventRate * 25;
    const glowAlpha = 0.08 + eventRate * 0.06;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    grad.addColorStop(0, colorWithAlpha(colors.accent, glowAlpha));
    grad.addColorStop(1, colorWithAlpha(colors.accent, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Core dot
    ctx.fillStyle = colorWithAlpha(colors.accent, 0.6 + eventRate * 0.15);
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright point
    ctx.fillStyle = colorWithAlpha(colors.accent, 0.9);
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);

    drawGrid();
    updateEventRate();

    // Update and cull event nodes
    nodes = nodes.filter(n => {
      const age = now - n.born;
      if (age > n.lifetime) return false;

      // Fade in fast, fade out slow
      const fadeIn = Math.min(1, age / 300);
      const fadeOutStart = n.lifetime - 2000;
      const fadeOut = age > fadeOutStart ? Math.max(0, 1 - (age - fadeOutStart) / 2000) : 1;
      n.alpha = fadeIn * fadeOut;
      n.labelAlpha = Math.max(0, 1 - age / 2500);

      // Slow drift outward from center, decelerating
      n.vx *= 0.999;
      n.vy *= 0.999;

      // Very gentle wander
      n.vx += (Math.random() - 0.5) * 0.003;
      n.vy += (Math.random() - 0.5) * 0.003;

      // Mouse repulsion
      const mx = n.x - mouseX;
      const my = n.y - mouseY;
      const md = Math.sqrt(mx * mx + my * my);
      if (md < 80 && md > 0) {
        const force = (80 - md) * 0.0008;
        n.vx += (mx / md) * force;
        n.vy += (my / md) * force;
      }

      n.x += n.vx;
      n.y += n.vy;

      // Soft boundary — keep on screen
      const margin = 20;
      if (n.x < margin) n.vx += 0.02;
      if (n.x > width - margin) n.vx -= 0.02;
      if (n.y < margin) n.vy += 0.02;
      if (n.y > height - margin) n.vy -= 0.02;

      return true;
    });

    // Draw connections between nearby nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONNECT_DIST) {
          const strength = (1 - dist / CONNECT_DIST) * Math.min(a.alpha, b.alpha);
          ctx.strokeStyle = colorWithAlpha(a.color, strength * 0.25);
          ctx.lineWidth = strength * 0.8;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Draw event nodes
    for (const n of nodes) {
      // Glow
      const glowSize = n.radius * 3;
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowSize);
      grad.addColorStop(0, colorWithAlpha(n.color, n.alpha * 0.4));
      grad.addColorStop(1, colorWithAlpha(n.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, glowSize, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.fillStyle = colorWithAlpha(n.color, n.alpha * 0.9);
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fill();

      // Label (tool name, filename, etc.)
      if (n.label && n.labelAlpha > 0.05) {
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = colorWithAlpha(n.color, n.labelAlpha * 0.5);
        ctx.fillText(n.label, n.x + n.radius + 4, n.y + 3);
      }
    }

    // Draw central AI core on top
    drawCore(now);

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
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }

  function handleMouseLeave() {
    mouseX = -1000;
    mouseY = -1000;
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    resolveColors();
    handleResize();

    animId = requestAnimationFrame(draw);

    // Every real event spawns a node
    const handleAgentEvent = data => {
      const type = data?.event_type || data?.type || 'tool_call';
      const label =
        data?.file?.split('/').pop() || data?.message?.split(' ')[0] || data?.agent_name || type;
      spawnEventNode(type, label);
    };

    const handleFileChange = data => {
      const label = data?.file?.split('/').pop() || '';
      spawnEventNode('file_change', label);
    };

    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('file-changed', handleFileChange);

    let themeDebounce;
    const themeObserver = new MutationObserver(() => {
      clearTimeout(themeDebounce);
      themeDebounce = setTimeout(resolveColors, 100);
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('file-changed', handleFileChange);
      themeObserver.disconnect();
      resizeObserver.disconnect();
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
    onmouseleave={handleMouseLeave}
  ></canvas>
  <!-- Top-left: title + status -->
  <div class="absolute top-3 left-4 pointer-events-none">
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
      >AI Activity</span
    >
    <span class="text-[9px] text-[var(--muted)] font-mono ml-2">{statusText}</span>
  </div>
  <!-- Top-right: throughput -->
  <div class="absolute top-3 right-4 pointer-events-none">
    <span class="text-[9px] text-[var(--muted)] font-mono">{eventsPerMin} events/min</span>
  </div>
  <!-- Bottom-right: legend -->
  <div
    class="absolute bottom-3 right-4 pointer-events-none flex items-center gap-3 text-[9px] font-mono text-[var(--muted)]"
  >
    <span class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full" style="background: var(--accent);"></span>
      Tools
    </span>
    <span class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full" style="background: var(--success);"></span>
      Files
    </span>
    <span class="flex items-center gap-1.5">
      <span class="w-1.5 h-1.5 rounded-full" style="background: var(--error);"></span>
      Errors
    </span>
  </div>
</div>
