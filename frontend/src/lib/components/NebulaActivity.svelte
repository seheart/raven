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
  let width = 0;
  let height = 0;
  let time = 0;
  let activity = 0;
  let ripples = [];

  // Accumulated angles / phases. We integrate angular velocity over dt
  // every frame instead of multiplying `time × coefficient`. The naïve
  // form snaps the whole rotation forward whenever activity changes
  // (because `time` has already accumulated), causing flash-rotations.
  let planetAngleX = 0;
  let planetAngleY = 0;
  let camYawAngle = 0;
  let breathPhase = 0;

  let eventTimestamps = [];
  let eventRate = 0;
  let gridColor = 'rgba(100,100,140,0.04)'; // cached, updated on theme change
  let statusText = $state('Idle');
  let eventsPerMin = $state(0);

  const MAX_PARTICLES = 350;
  const TRAIL_LEN = 5;
  const GROUP_WINDOW_MS = 200;
  const LABEL_LIFE_DECAY = 0.0005; // ~3.3s @ 60fps

  // Coalesce identical events fired within GROUP_WINDOW_MS into one bigger burst.
  const pendingGroup = new Map(); // key -> { type, label, count, timer }

  // ── 3D wireframe core ────────────────────────────────────────────────────
  // Node-sphere geometry — N nodes evenly distributed on a unit sphere via
  // Fibonacci spiral (no pole-clustering), each connected to its K nearest
  // neighbors. The mesh holds shape under rotation and reads as a denser
  // "thinking surface" than the original 12-vertex icosahedron.
  const NODE_COUNT = 50;
  const NEIGHBORS = 3;

  const NODES = (() => {
    const phi = Math.PI * (3 - Math.sqrt(5));
    const arr = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const y = 1 - (i / (NODE_COUNT - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const t = phi * i;
      arr.push([Math.cos(t) * r, y, Math.sin(t) * r]);
    }
    return arr;
  })();

  // K-nearest-neighbor edges, undirected (a < b).
  const EDGES = (() => {
    const set = new Set();
    for (let i = 0; i < NODES.length; i++) {
      const a = NODES[i];
      const dists = [];
      for (let j = 0; j < NODES.length; j++) {
        if (i === j) continue;
        const b = NODES[j];
        const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        dists.push({ j, d: dx * dx + dy * dy + dz * dz });
      }
      dists.sort((p, q) => p.d - q.d);
      for (let m = 0; m < NEIGHBORS; m++) {
        const lo = Math.min(i, dists[m].j);
        const hi = Math.max(i, dists[m].j);
        set.add(lo * 1000 + hi);
      }
    }
    return Array.from(set).map(k => [Math.floor(k / 1000), k % 1000]);
  })();

  // Adjacency list — used to propagate burst glow along edges.
  const ADJ = (() => {
    const m = Array.from({ length: NODE_COUNT }, () => []);
    for (const [a, b] of EDGES) {
      m[a].push(b);
      m[b].push(a);
    }
    return m;
  })();

  // Per-node burst glow + propagation queue. A burst lights one node;
  // glow then spreads 2 hops outward via BFS, one hop per ~80ms, so
  // each event ripples through a small patch of the surface.
  const nodeGlow = new Float32Array(NODE_COUNT);
  const nodeGlowColor = new Array(NODE_COUNT).fill(null);
  let nodeGlowQueue = [];

  function rotateXYZ(v, ax, ay) {
    // Rotate around Y first, then X. Two axes give a tumbling motion that
    // shows every face over a full cycle.
    let [x, y, z] = v;
    const cy = Math.cos(ay), sy = Math.sin(ay);
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    const cx = Math.cos(ax), sx = Math.sin(ax);
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    return [x, y, z];
  }

  function project(v, originX, originY, scale, depth) {
    // Simple weak-perspective projection — depth pushes farther verts smaller.
    const [x, y, z] = v;
    const f = depth / (depth - z);
    return {
      x: originX + x * scale * f,
      y: originY + y * scale * f,
      depth: z, // -1..1, higher means closer (positive z toward camera)
      f
    };
  }


  // Fallback values — only used if CSS-var lookup fails. Resolved values
  // come from --accent, --success, etc. via resolveColors() below, so the
  // canvas re-tints automatically when the theme changes. design-system-allow: hex
  let colors = {
    accent: '#a47eff',
    success: '#5fc88a',
    error: '#ef5d6e',
    warning: '#f5b045',
    muted: '#7a6a8e'
  };

  function resolveColors() {
    // Read from <html> not <body> — the dark class lives on
    // documentElement (Tailwind v4 token-cascade requirement).
    const s = getComputedStyle(document.documentElement);
    colors.accent = s.getPropertyValue('--accent').trim() || colors.accent;
    colors.warning = s.getPropertyValue('--warning').trim() || colors.warning;
    colors.muted = s.getPropertyValue('--muted').trim() || colors.muted;

    // Override success/error with vibrant variants for the pulse only.
    // The theme's --success / --error are intentionally muted for UI
    // surfaces, but at small particle sizes they read too close to the
    // grey of routine tool calls. Edits and deletes are the highest-
    // signal events on the dashboard — they need to pop.
    // design-system-allow: hex
    colors.success = '#22dd66';
    // design-system-allow: hex
    colors.error = '#ff3b4a';

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
    api_call: 'muted',
    user_message: 'accent',
    assistant_message: 'accent',
    assistant_text: 'accent',
    assistant: 'accent',
    human: 'accent',
    model_load: 'accent',
    file_edit: 'success',
    file_create: 'success',
    file_add: 'success',
    file_delete: 'error',
    // Backend emits agent_events with event_type='tool_error' for failed tool
    // calls (e.g. Ollama 5xx); 'error' is the catch-all alias used elsewhere.
    tool_error: 'error',
    syntax_error: 'error',
    error: 'error',
    pattern_warning: 'warning',
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

  // Group identical bursts (same type+label) within a 200ms window. `count`
  // is summed (so back-to-back saves combine line counts), reducing visual
  // noise during edit storms.
  function queueBurst(type, label, count = 1) {
    const key = `${type}|${label || ''}`;
    const pending = pendingGroup.get(key);
    if (pending) {
      pending.count += count;
      return;
    }
    const entry = { type, label, count, timer: null };
    entry.timer = setTimeout(() => {
      pendingGroup.delete(key);
      spawnBurst(entry.type, entry.label, entry.count);
    }, GROUP_WINDOW_MS);
    pendingGroup.set(key, entry);
  }

  function spawnBurst(type, label, count = 1) {
    recordEvent();
    const color = colors[TYPE_COLORS[type] || 'muted'];
    const cx = width / 2;
    const cy = height / 2;
    // For file edits `count` is characters changed. Sqrt scaling so a
    // typo (3 chars) still reads as a small puff (~3 particles → floor 4),
    // a paragraph rewrite (~500 chars) feels substantial (~45 particles),
    // and a refactor (5000+ chars) becomes a real explosion (capped 100).
    // Linear-by-char would saturate at the cap after ~80 chars and lose
    // all signal across orders of magnitude. Ripple/core still scale
    // logarithmically so the visual size doesn't grow unbounded.
    const sizeBoost = Math.min(2.5, 1 + Math.log2(Math.max(1, count)));
    const particleCount = Math.min(100, Math.max(4, Math.round(Math.sqrt(count) * 2)));
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
      // Sign the count so adds and deletes are distinguishable in side-by-side
      // bursts (e.g. an edit shows `foo.ts +12` next to `foo.ts −5`).
      const sign =
        type === 'file_delete' ? '−' :
        type === 'file_edit' || type === 'file_create' || type === 'file_add' ? '+' : '×';
      const text = count > 1 || sign === '+' || sign === '−' ? `${label} ${sign}${count}` : label;
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

    activity = Math.min(1, activity + 0.12 * sizeBoost);
    ripples.push({ born: time, color, maxRadius: (50 + eventRate * 25) * sizeBoost });

    // Light a random node on the sphere and queue propagation 2 hops out.
    const startNode = Math.floor(Math.random() * NODE_COUNT);
    nodeGlow[startNode] = 1;
    nodeGlowColor[startNode] = color;
    nodeGlowQueue.push({ from: [startNode], color, at: time + 0.08, depth: 0 });
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
    const dt = 0.016;
    time += dt;
    ctx.clearRect(0, 0, width, height);
    updateEventRate();
    activity *= 0.998;

    // Integrate angular velocities. Velocity blends with activity; the
    // accumulated angle keeps moving smoothly even as the velocity
    // changes underneath it, so an activity spike speeds up rotation
    // gracefully instead of teleporting forward.
    planetAngleX += (0.45 + activity * 0.8) * dt;
    planetAngleY += (0.65 + activity * 1.2) * dt;
    camYawAngle += (0.18 + activity * 0.25) * dt;
    breathPhase += (2 + activity * 2.5) * dt;

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

    // Core glow — halo grows with activity. Breath uses the integrated
    // breathPhase so the rhythm doesn't jump phase when activity shifts
    // its frequency.
    const coreSize = 22 + Math.sin(breathPhase) * 6 + activity * 50;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
    coreGrad.addColorStop(0, rgba(colors.accent, 0.15 + activity * 0.18));
    coreGrad.addColorStop(1, rgba(colors.accent, 0));
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
    ctx.fill();

    // 3D node-sphere core — two layered motions:
    //   1. The planet's own spin: stable, faster, two-axis tumble.
    //   2. The camera orbiting it: slower, wandering — combined sine
    //      waves at non-rational frequencies make the path feel
    //      organic instead of a perfect circle.
    // Camera distance is fixed (no fly-by dives): with 50 nodes a deep
    // dive would balloon many vertices simultaneously and read as
    // chaotic instead of "near miss".
    // Edges sort back-to-front so closer ones render brighter; vertex
    // dots also scale with projection factor so proximity reads in size.
    // Bursts light a random node and propagate glow 2 hops outward
    // along edges, so each event spreads through a small patch of the
    // surface instead of just flashing one dot.
    const a2 = activity * activity;

    const planetAx = planetAngleX;
    const planetAy = planetAngleY;
    const camYaw = camYawAngle + Math.sin(time * 0.13) * (0.5 + activity * 0.6);
    const camPitch =
      Math.sin(time * 0.09) * (0.35 + activity * 0.4) + Math.cos(time * 0.21) * 0.18;
    const camDist = 3.2;

    const sphereRadius = 18 + Math.sin(breathPhase) * 2 + activity * 16;

    // Excitement wobble — gentle origin drift that only kicks in at
    // moderate-to-high activity (a²). Frequencies kept low (~1-2 Hz
    // visible) so it reads as breathing-with-life, not vibrating.
    const wobbleAmp = a2 * 1.2;
    const drawCx = cx + Math.sin(time * 11) * wobbleAmp;
    const drawCy = cy + Math.cos(time * 9) * wobbleAmp;

    // Process scheduled glow propagation steps (one BFS hop per ~80ms).
    nodeGlowQueue = nodeGlowQueue.filter(p => {
      if (time < p.at) return true;
      const next = new Set();
      for (const idx of p.from) {
        for (const nb of ADJ[idx]) {
          if (nodeGlow[nb] < 0.5) {
            nodeGlow[nb] = Math.max(nodeGlow[nb], 0.7 - p.depth * 0.25);
            nodeGlowColor[nb] = p.color;
            next.add(nb);
          }
        }
      }
      if (p.depth >= 2 || next.size === 0) return false;
      p.from = Array.from(next);
      p.at = time + 0.08;
      p.depth++;
      return true;
    });

    const projected = NODES.map((v, i) => {
      const planet = rotateXYZ(v, planetAx, planetAy);
      const orbit = rotateXYZ(planet, camPitch, camYaw);
      nodeGlow[i] *= 0.96;
      return {
        ...project(orbit, drawCx, drawCy, sphereRadius, camDist),
        glow: nodeGlow[i],
        glowColor: nodeGlowColor[i]
      };
    });
    const edgesByDepth = EDGES
      .map(([a, b]) => ({ a, b, mid: (projected[a].depth + projected[b].depth) / 2 }))
      .sort((p, q) => p.mid - q.mid);

    for (const { a, b, mid } of edgesByDepth) {
      const pa = projected[a];
      const pb = projected[b];
      if (pa.f <= 0.1 || pb.f <= 0.1) continue;
      const t = (mid + 1) / 2;
      const glowBoost = (pa.glow + pb.glow) * 0.35;
      const fAvg = (pa.f + pb.f) / 2;
      ctx.strokeStyle = rgba(colors.accent, 0.10 + t * 0.42 + glowBoost);
      ctx.lineWidth = (0.5 + t * 0.6) * Math.min(fAvg, 2.5);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    // Vertex dots — camera-facing only (small overlap so the rim fills
    // in). Halo only when glowing, so the scene stays clean at rest.
    for (const p of projected) {
      if (p.depth < -0.05) continue;
      const t = (p.depth + 1) / 2;
      const baseColor = p.glow > 0.05 && p.glowColor ? p.glowColor : colors.accent;
      const r = (0.6 + t * 0.7 + p.glow * 1.4) * Math.min(p.f, 2.2);

      if (p.glow > 0.1) {
        const haloR = r * 4;
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
        halo.addColorStop(0, rgba(baseColor, 0.4 * p.glow));
        halo.addColorStop(1, rgba(baseColor, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = rgba(baseColor, 0.4 + t * 0.45 + p.glow * 0.3);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

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
      queueBurst(type, label);
    };

    const handleFileChange = data => {
      const label = data?.file?.split('/').pop() || data?.filepath?.split('/').pop() || '';
      const charsAdded = data?.chars_added || 0;
      const charsRemoved = data?.chars_removed || 0;

      // Per-character bursts: a long single-line minified file or a multi-
      // hundred-character HTML edit gets a burst proportional to actual
      // scope, not just newlines crossed. spawnBurst's sqrt scaling keeps
      // a 5000-char refactor visually intense without saturating the
      // canvas. Edits show both colors because the diff library splits a
      // line replacement into removed-bytes + added-bytes.
      if (charsAdded > 0) queueBurst('file_edit', label, charsAdded);
      if (charsRemoved > 0) queueBurst('file_delete', label, charsRemoved);
      if (charsAdded === 0 && charsRemoved === 0) {
        const changeType = data?.change_type || 'change';
        const type =
          changeType === 'unlink' ? 'file_delete' :
          changeType === 'add' ? 'file_create' : 'file_edit';
        queueBurst(type, label);
      }
    };

    // Errors and warnings are first-class signal — without these the pulse
    // never goes red even when the backend is detecting real problems.
    const handleSyntaxError = data => {
      const label = data?.filepath?.split('/').pop() || data?.error_type || 'syntax';
      queueBurst('syntax_error', label);
    };
    const handleAppError = data => {
      const label = data?.component || data?.error_type || 'error';
      queueBurst('error', label);
    };
    const handlePatternWarning = data => {
      const label = data?.filepath?.split('/').pop() || data?.warning_type || 'warning';
      queueBurst('pattern_warning', label);
    };

    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('file-changed', handleFileChange);
    websocketService.on('syntax-error', handleSyntaxError);
    websocketService.on('app-error', handleAppError);
    websocketService.on('pattern-warning', handlePatternWarning);

    let themeDebounce;
    const themeObs = new MutationObserver(() => {
      clearTimeout(themeDebounce);
      themeDebounce = setTimeout(resolveColors, 100);
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const resizeObs = new ResizeObserver(() => handleResize());
    resizeObs.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(themeDebounce);
      pendingGroup.forEach(p => clearTimeout(p.timer));
      pendingGroup.clear();
      websocketService.off('agent-event', handleAgentEvent);
      websocketService.off('file-changed', handleFileChange);
      websocketService.off('syntax-error', handleSyntaxError);
      websocketService.off('app-error', handleAppError);
      websocketService.off('pattern-warning', handlePatternWarning);
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
      <!-- design-system-allow: hex (matches the vibrant burst color) -->
      <span class="w-1.5 h-1.5 rounded-full" style="background: #22dd66;"></span>
      Edits
    </span>
    <span class="flex items-center gap-1.5">
      <!-- design-system-allow: hex (matches the vibrant burst color) -->
      <span class="w-1.5 h-1.5 rounded-full" style="background: #ff3b4a;"></span>
      Deletes
    </span>
  </div>

</div>
