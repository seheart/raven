<script>
  /**
   * NeuralActivityGraph — Force-directed AI heartbeat
   *
   * Real force-directed graph physics:
   * - Coulomb repulsion between all nodes (inverse-square)
   * - Spring attraction along edges (Hooke's law)
   * - Gravity toward center (linear)
   * - Type affinity: same-type nodes attract, forming natural clusters
   * - Edges represent real relationships: temporal proximity + type match
   *
   * Every node is a real event. The graph self-organizes.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../services/websocket.js';

  let canvas;
  let ctx;
  let animId;
  let nodes = [];
  let edges = []; // { source, target, strength, born }
  let width = 0;
  let height = 0;
  let mouseX = -1000;
  let mouseY = -1000;

  // Event tracking
  let eventTimestamps = [];
  let eventRate = 0;
  let coreBreathPhase = 0;
  let ripples = [];

  let statusText = $state('Idle');
  let eventsPerMin = $state(0);
  let nodeCount = $state(0);
  let edgeCount = $state(0);

  const MAX_NODES = 200;
  const MAX_EDGES = 400;

  // Physics constants
  const REPULSION = 800; // Coulomb constant (higher = stronger push)
  const SPRING_K = 0.008; // Spring stiffness (Hooke's law)
  const SPRING_REST = 80; // Rest length of springs
  const GRAVITY = 0.0003; // Gravity toward center
  const DAMPING = 0.92; // Velocity damping per frame
  const AFFINITY_BOOST = 1.8; // Extra spring strength for same-type edges
  const DT = 1.0; // Simulation timestep

  // Type categories for clustering
  const TYPE_GROUPS = {
    tool_call: 'tool',
    tool_result: 'tool',
    inference: 'tool',
    user_message: 'chat',
    assistant_message: 'chat',
    assistant: 'chat',
    human: 'chat',
    file_create: 'file',
    file_edit: 'file',
    file_add: 'file',
    file_delete: 'delete',
    error: 'delete',
    warning: 'tool'
  };

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
    user_message: 'accent',
    assistant_message: 'accent',
    assistant: 'accent',
    human: 'accent',
    file_create: 'success',
    file_edit: 'success',
    file_add: 'success',
    file_delete: 'error',
    error: 'error',
    tool_call: 'muted',
    tool_result: 'muted',
    inference: 'muted',
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
    nodeCount = nodes.length;
    edgeCount = edges.length;
    if (eventRate > 2) statusText = 'High Activity';
    else if (eventRate > 0.5) statusText = 'Active';
    else if (eventRate > 0.1) statusText = 'Low Activity';
    else statusText = 'Idle';
  }

  function buildEdges(newNode) {
    const now = performance.now();
    const newGroup = TYPE_GROUPS[newNode.type] || 'tool';
    let added = 0;

    // Connect to recent nodes — wider 15s window, stronger for same type
    for (let i = nodes.length - 1; i >= 0 && edges.length < MAX_EDGES && added < 4; i--) {
      const other = nodes[i];
      if (other === newNode) continue;

      const timeDelta = Math.abs(newNode.born - other.born);
      if (timeDelta > 15000) continue;

      const otherGroup = TYPE_GROUPS[other.type] || 'tool';
      const sameGroup = newGroup === otherGroup;
      const temporalWeight = 1 - timeDelta / 15000;

      // High cross-event connection rate to build mesh, not islands
      const connectChance = sameGroup ? 0.6 : 0.35;
      if (Math.random() > connectChance * (0.3 + temporalWeight * 0.7)) continue;

      const strength = (0.5 + temporalWeight * 0.5) * (sameGroup ? AFFINITY_BOOST : 1.0);

      edges.push({
        source: newNode,
        target: other,
        strength,
        restLength: SPRING_REST * (0.6 + Math.random() * 0.8), // vary rest length 60-140%
        born: now,
        lifetime: Math.min(newNode.lifetime, other.lifetime),
        sameGroup
      });
      added++;
    }
  }

  function spawnEventNode(type, label) {
    recordEvent();

    const colorKey = EVENT_COLORS[type] || 'muted';
    const color = colors[colorKey];
    const cx = width / 2;
    const cy = height / 2;

    // Vary spawn count: 1-4 depending on event type and randomness
    const base = type === 'tool_call' || type === 'tool_result' ? 1 : 2;
    const count = base + Math.floor(Math.random() * 2); // 1-2 for tools, 2-3 for others
    const baseAngle = Math.random() * Math.PI * 2;
    const spawnedNodes = [];

    for (let i = 0; i < count; i++) {
      if (nodes.length >= MAX_NODES) {
        const idx = nodes.findIndex(n => !n.isCore);
        if (idx >= 0) {
          const dead = nodes[idx];
          edges = edges.filter(e => e.source !== dead && e.target !== dead);
          nodes.splice(idx, 1);
        }
      }

      // Wider angular spread for variety
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 0.4 + eventRate * 0.12 + Math.random() * 0.35;
      const offset = 8 + Math.random() * 20;

      const node = {
        x: cx + Math.cos(angle) * offset,
        y: cy + Math.sin(angle) * offset,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        fx: 0,
        fy: 0,
        radius: i === 0 ? 2.5 + Math.min(eventRate, 3) * 0.5 : 1 + Math.random() * 1.5,
        color,
        alpha: 1,
        born: performance.now() + i * 50,
        lifetime: 12000 + Math.random() * 8000,
        label: i === 0 ? (label || '').slice(0, 24) : '',
        labelAlpha: 1,
        type,
        isCore: false
      };

      nodes.push(node);
      spawnedNodes.push(node);
    }

    // Only partially connect within burst — chain, not full mesh
    for (let i = 0; i < spawnedNodes.length - 1; i++) {
      if (edges.length < MAX_EDGES) {
        edges.push({
          source: spawnedNodes[i],
          target: spawnedNodes[i + 1],
          strength: AFFINITY_BOOST,
          restLength: SPRING_REST * (0.4 + Math.random() * 0.5),
          born: performance.now(),
          lifetime: Math.min(spawnedNodes[i].lifetime, spawnedNodes[i + 1].lifetime),
          sameGroup: true
        });
      }
    }

    // Build edges to existing graph
    for (const n of spawnedNodes) {
      buildEdges(n);
    }

    // Ripple
    ripples.push({
      born: performance.now(),
      color,
      maxRadius: 50 + eventRate * 25
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

    const baseSize = 4 + eventRate * 3;
    const breathe = Math.sin(coreBreathPhase) * 0.3 + 0.7;
    const coreSize = baseSize * breathe;

    const glowRadius = 20 + eventRate * 25;
    const glowAlpha = 0.08 + eventRate * 0.06;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    grad.addColorStop(0, colorWithAlpha(colors.accent, glowAlpha));
    grad.addColorStop(1, colorWithAlpha(colors.accent, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colorWithAlpha(colors.accent, 0.6 + eventRate * 0.15);
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colorWithAlpha(colors.accent, 0.9);
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Ripples
    ripples = ripples.filter(r => {
      const age = now - r.born;
      const duration = 900;
      if (age > duration) return false;
      const p = age / duration;
      const radius = p * r.maxRadius;
      ctx.strokeStyle = colorWithAlpha(r.color, (1 - p) * 0.3);
      ctx.lineWidth = (1 - p) * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });
  }

  function simulate(now) {
    const cx = width / 2;
    const cy = height / 2;

    // Reset forces
    for (const n of nodes) {
      n.fx = 0;
      n.fy = 0;
    }

    // 1. Gravity — pull toward center (linear)
    for (const n of nodes) {
      const dx = cx - n.x;
      const dy = cy - n.y;
      n.fx += dx * GRAVITY;
      n.fy += dy * GRAVITY;
    }

    // 2. Coulomb repulsion — all pairs (inverse-square, capped)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 1) distSq = 1;
        const dist = Math.sqrt(distSq);

        // Coulomb: F = k / d²
        const force = Math.min(REPULSION / distSq, 2); // cap to prevent explosions
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        a.fx += fx;
        a.fy += fy;
        b.fx -= fx;
        b.fy -= fy;
      }
    }

    // 3. Spring attraction along edges (Hooke's law)
    for (const edge of edges) {
      const a = edge.source;
      const b = edge.target;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // F = k * (dist - restLength) — Hooke's law
      const rest = edge.restLength || SPRING_REST;
      const displacement = dist - rest;
      const force = SPRING_K * displacement * edge.strength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      a.fx += fx;
      a.fy += fy;
      b.fx -= fx;
      b.fy -= fy;
    }

    // 4. Mouse repulsion
    for (const n of nodes) {
      const mx = n.x - mouseX;
      const my = n.y - mouseY;
      const md = Math.sqrt(mx * mx + my * my);
      if (md < 100 && md > 0) {
        const force = (100 - md) * 0.002;
        n.fx += (mx / md) * force;
        n.fy += (my / md) * force;
      }
    }

    // 5. Integrate: Velocity Verlet
    for (const n of nodes) {
      const age = now - n.born;

      // Fade
      const fadeIn = Math.min(1, age / 300);
      const fadeOutStart = n.lifetime - 2500;
      const fadeOut = age > fadeOutStart ? Math.max(0, 1 - (age - fadeOutStart) / 2500) : 1;
      n.alpha = fadeIn * fadeOut;
      n.labelAlpha = Math.max(0, 1 - age / 3000);

      // Apply forces
      n.vx = (n.vx + n.fx * DT) * DAMPING;
      n.vy = (n.vy + n.fy * DT) * DAMPING;
      n.x += n.vx * DT;
      n.y += n.vy * DT;

      // Boundary
      const margin = 15;
      if (n.x < margin) {
        n.x = margin;
        n.vx *= -0.5;
      }
      if (n.x > width - margin) {
        n.x = width - margin;
        n.vx *= -0.5;
      }
      if (n.y < margin) {
        n.y = margin;
        n.vy *= -0.5;
      }
      if (n.y > height - margin) {
        n.y = height - margin;
        n.vy *= -0.5;
      }
    }

    // Cull dead nodes and their edges
    nodes = nodes.filter(n => {
      const age = now - n.born;
      if (age > n.lifetime) {
        edges = edges.filter(e => e.source !== n && e.target !== n);
        return false;
      }
      return true;
    });

    // Cull dead edges
    edges = edges.filter(e => {
      const age = now - e.born;
      return age < e.lifetime;
    });
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    updateEventRate();
    simulate(now);

    // Draw edges
    for (const edge of edges) {
      const a = edge.source;
      const b = edge.target;
      const edgeAge = now - edge.born;
      const edgeFade =
        edgeAge > edge.lifetime - 2000
          ? Math.max(0, 1 - (edgeAge - (edge.lifetime - 2000)) / 2000)
          : 1;
      const alpha = Math.min(a.alpha, b.alpha) * edgeFade * edge.strength;

      if (alpha < 0.01) continue;

      // Thicker lines for same-group (affinity) edges
      ctx.strokeStyle = colorWithAlpha(a.color, alpha * 0.35);
      ctx.lineWidth = edge.sameGroup ? alpha * 1.4 : alpha * 0.7;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Draw nodes
    for (const n of nodes) {
      if (n.alpha < 0.01) continue;

      // Glow
      const glowSize = n.radius * 4;
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowSize);
      grad.addColorStop(0, colorWithAlpha(n.color, n.alpha * 0.45));
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

      // Label
      if (n.label && n.labelAlpha > 0.05) {
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = colorWithAlpha(n.color, n.labelAlpha * 0.5);
        ctx.fillText(n.label, n.x + n.radius + 4, n.y + 3);
      }
    }

    // Core + ripples on top
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

    const handleAgentEvent = data => {
      const type = data?.event_type || data?.type || 'tool_call';
      const label =
        data?.file?.split('/').pop() || data?.message?.split(' ')[0] || data?.agent_name || type;
      spawnEventNode(type, label);
    };

    const handleFileChange = data => {
      const label = data?.file?.split('/').pop() || data?.filepath?.split('/').pop() || '';
      const changeType = data?.change_type || 'change';
      if (changeType === 'unlink') spawnEventNode('file_delete', label);
      else if (changeType === 'add') spawnEventNode('file_create', label);
      else spawnEventNode('file_edit', label);
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
  <!-- Top-right: stats -->
  <div
    class="absolute top-3 right-4 pointer-events-none text-[9px] text-[var(--muted)] font-mono flex gap-3"
  >
    <span>{eventsPerMin} events/min</span>
    <span>{nodeCount} nodes</span>
    <span>{edgeCount} edges</span>
  </div>
  <!-- Bottom-right: legend -->
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
