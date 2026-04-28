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
  // Icosahedron geometry — 12 vertices on a unit sphere, 30 edges. Rotating
  // wireframe at the center reads as "the system is thinking" with real
  // dimensionality instead of a flat circle.
  const PHI = (1 + Math.sqrt(5)) / 2;
  // prettier-ignore
  const ICO_VERTS = [
    [-1,  PHI, 0], [ 1,  PHI, 0], [-1, -PHI, 0], [ 1, -PHI, 0],
    [ 0, -1,  PHI], [ 0,  1,  PHI], [ 0, -1, -PHI], [ 0,  1, -PHI],
    [ PHI, 0, -1], [ PHI, 0,  1], [-PHI, 0, -1], [-PHI, 0,  1]
  ].map(([x, y, z]) => {
    // Normalize to unit sphere so radius is consistent.
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
  });
  // prettier-ignore
  const ICO_EDGES = [
    [0,1],[0,5],[0,7],[0,10],[0,11],
    [1,5],[1,7],[1,8],[1,9],
    [2,3],[2,4],[2,6],[2,10],[2,11],
    [3,4],[3,6],[3,8],[3,9],
    [4,5],[4,9],[4,11],
    [5,9],[5,11],
    [6,7],[6,8],[6,10],
    [7,8],[7,10],
    [8,9],
    [10,11]
  ];

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
  function queueBurst(type, label) {
    const key = `${type}|${label || ''}`;
    const pending = pendingGroup.get(key);
    if (pending) {
      pending.count++;
      return;
    }
    const entry = { type, label, count: 1, timer: null };
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

    activity = Math.min(1, activity + 0.12 * sizeBoost);
    ripples.push({ born: time, color, maxRadius: (50 + eventRate * 25) * sizeBoost });
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

    // Core glow — halo grows hard with activity. At rest ~22px, at full
    // activity ~70px. Breath frequency speeds up too so a busy bird is
    // visibly hyperventilating, not just bigger.
    const breathFreq = 2 + activity * 3.5;
    const coreSize = 22 + Math.sin(time * breathFreq) * 6 + activity * 50;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
    coreGrad.addColorStop(0, rgba(colors.accent, 0.15 + activity * 0.18));
    coreGrad.addColorStop(1, rgba(colors.accent, 0));
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
    ctx.fill();

    // 3D wireframe icosahedron core — three layered motions:
    //   1. The planet's own spin: stable, faster, two-axis tumble.
    //   2. The camera orbiting it: slower, wandering — combined sine
    //      waves at non-rational frequencies make the path feel
    //      organic instead of a perfect circle.
    //   3. The camera distance: mostly cruising (~3.5–4.3 units away),
    //      with brief fly-bys that dive close (~1.15 units, just outside
    //      the unit-sphere surface). When close, the near-side vertices
    //      get massive scaling factors → close nodes pop big in your face,
    //      far nodes shrink — gives the "almost hit it" sensation.
    // Edges sort back-to-front so closer ones render brighter; vertex
    // dots and stroke width scale with the projection factor too, so
    // proximity reads in size as well as brightness.
    // Every motion scales with activity. Calm bird → barely moves;
    // busy bird → tumbles, swings wide, dives close, vibrates with
    // excitement. Eased with a² for the dive depth so moderate
    // activity stays cool and the chaos really sells at peak.
    const a2 = activity * activity;

    // Planet spin: 0.45–1.85 / 0.65–3.05 rad·s⁻¹ — at peak it spins
    // fast enough that the eye reads "blur" rather than rotation.
    const planetAx = time * (0.45 + activity * 1.4);
    const planetAy = time * (0.65 + activity * 2.4);

    // Camera orbit: amplitude grows so swings sweep wider when busy.
    const camYaw =
      time * (0.18 + activity * 0.4) + Math.sin(time * 0.13) * (0.6 + activity * 0.8);
    const camPitch =
      Math.sin(time * 0.09) * (0.4 + activity * 0.5) + Math.cos(time * 0.21) * 0.2;

    // Fly-bys: more frequent (lower pow exponent → wider spike windows)
    // and dive deeper as activity climbs. Idle: rare 8th-power spikes
    // dive to ~1.15. Peak: 5th-power spikes dive to ~1.05 (a hair off
    // the unit-sphere surface) so close vertices truly fly past.
    const flyByExp = 8 - activity * 3;
    const flyByDive = 2.4 + a2 * 1.1;
    const camCruise = 3.8 + Math.sin(time * 0.11) * 0.5;
    const flyByTrigger = Math.pow(Math.max(0, Math.sin(time * 0.18 + 1.3)), flyByExp);
    const camDist = Math.max(1.05, camCruise - flyByTrigger * flyByDive);

    // Sphere radius pulses faster with activity (breathFreq from halo
    // section above), and the activity-driven growth term jumps from
    // ×6 to ×14 so a busy bird is visibly bigger.
    const sphereRadius = 14 + Math.sin(time * breathFreq) * 1.5 + activity * 14;

    // Excitement wobble — high-frequency origin jitter that only kicks
    // in at moderate-to-high activity (a²) so a calm bird sits still
    // but a busy one visibly vibrates.
    const wobbleAmp = a2 * 3;
    const drawCx = cx + Math.sin(time * 47) * wobbleAmp;
    const drawCy = cy + Math.cos(time * 41) * wobbleAmp;

    const projected = ICO_VERTS.map(v => {
      const planet = rotateXYZ(v, planetAx, planetAy);
      const orbit = rotateXYZ(planet, camPitch, camYaw);
      return project(orbit, drawCx, drawCy, sphereRadius, camDist);
    });
    const edgesByDepth = ICO_EDGES
      .map(([a, b]) => ({ a, b, mid: (projected[a].depth + projected[b].depth) / 2 }))
      .sort((p, q) => p.mid - q.mid);

    for (const { a, b, mid } of edgesByDepth) {
      const pa = projected[a];
      const pb = projected[b];
      // Skip edges crossing behind the camera (cheap clipping insurance).
      if (pa.f <= 0.1 || pb.f <= 0.1) continue;
      const t = (mid + 1) / 2;
      const alpha = 0.18 + t * 0.77 * (0.55 + activity * 0.45);
      const fAvg = (pa.f + pb.f) / 2;
      ctx.strokeStyle = rgba(colors.accent, alpha);
      ctx.lineWidth = (0.7 + t * 0.9) * Math.min(fAvg, 2.5);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    // Vertex dots — only the camera-facing ones, scaled by projection
    // factor so a near-miss vertex pops big and bright.
    for (const p of projected) {
      if (p.depth < 0.1) continue;
      const t = (p.depth + 1) / 2;
      const sizeBoost = Math.min(p.f, 5); // cap so peak dives don't render plate-sized dots
      ctx.fillStyle = rgba(colors.accent, 0.4 + t * 0.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (1.2 + t * 1.1) * sizeBoost, 0, Math.PI * 2);
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
      const changeType = data?.change_type || 'change';
      const type =
        changeType === 'unlink' ? 'file_delete' :
        changeType === 'add' ? 'file_create' : 'file_edit';
      queueBurst(type, label);
    };

    websocketService.on('agent-event', handleAgentEvent);
    websocketService.on('file-changed', handleFileChange);

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

</div>
