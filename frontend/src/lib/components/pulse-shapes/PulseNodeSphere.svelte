<script>
  /**
   * NodeSphere — ~80 nodes evenly distributed on a unit sphere via
   * Fibonacci spiral, each linked to its K nearest neighbors so the
   * mesh stays well-formed as the sphere rotates. Vibe: dense, alive,
   * networked-3D — kept the icosahedron's three-dimensional feel but
   * with many more nodes for a "thinking surface" sensation.
   */
  import { onMount } from 'svelte';
  import { websocketService } from '../../services/websocket.js';
  import { resolveThemeColors, rgba, TYPE_COLORS, eventToType, fileChangeToType } from './_shared.js';

  let canvas;
  let ctx;
  let animId;
  let width = 0;
  let height = 0;
  let activity = 0;
  let yawAngle = 0;
  let pitchAngle = 0;
  let breathPhase = 0;
  let time = 0;
  let colors = $state(resolveThemeColors());

  const NODE_COUNT = 80;
  const NEIGHBORS = 4;

  // Fibonacci-sphere distribution — each point's golden-angle stride
  // gives near-optimal even spacing on the unit sphere.
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

  // K-nearest-neighbor edges. Stored as undirected pairs (a < b).
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

  // Adjacency for burst propagation.
  const ADJ = (() => {
    const m = Array.from({ length: NODE_COUNT }, () => []);
    for (const [a, b] of EDGES) {
      m[a].push(b);
      m[b].push(a);
    }
    return m;
  })();

  // Per-node glow + color tint from bursts. Glow propagates outward
  // one BFS step per ~80ms, so a burst feels like it spreads through
  // the surface instead of just lighting one dot.
  const glow = new Float32Array(NODE_COUNT);
  const glowColor = new Array(NODE_COUNT).fill(null);
  let pendingPropagation = []; // {indices: number[], color, at: number}

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.16);
    const start = Math.floor(Math.random() * NODE_COUNT);
    glow[start] = 1;
    glowColor[start] = color;
    // Schedule two waves of propagation
    pendingPropagation.push({ from: [start], color, at: time + 0.08, depth: 0 });
  }

  function rotate(v, yaw, pitch) {
    const [x, y, z] = v;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return [x1, y2, z2];
  }

  function draw() {
    const dt = 0.016;
    time += dt;
    activity *= 0.992;
    yawAngle += (0.35 + activity * 0.6) * dt;
    pitchAngle += (0.18 + activity * 0.3) * dt;
    breathPhase += (1.4 + activity * 1.6) * dt;

    // Process scheduled glow propagation steps.
    pendingPropagation = pendingPropagation.filter(p => {
      if (time < p.at) return true;
      const next = new Set();
      for (const idx of p.from) {
        for (const nb of ADJ[idx]) {
          if (glow[nb] < 0.5) {
            glow[nb] = Math.max(glow[nb], 0.7 - p.depth * 0.25);
            glowColor[nb] = p.color;
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

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const sphereR = Math.min(width, height) * 0.28 + Math.sin(breathPhase) * 3 + activity * 12;
    const camDepth = 3.2;

    // Project all nodes
    const proj = NODES.map((v, i) => {
      const r = rotate(v, yawAngle, pitchAngle);
      const f = camDepth / (camDepth - r[2]); // weak perspective
      glow[i] *= 0.96;
      return {
        x: cx + r[0] * sphereR * f,
        y: cy + r[1] * sphereR * f,
        depth: r[2],
        f,
        glow: glow[i],
        glowColor: glowColor[i]
      };
    });

    // Edges back-to-front
    const edgeData = EDGES.map(([a, b]) => ({
      a, b, mid: (proj[a].depth + proj[b].depth) / 2
    })).sort((p, q) => p.mid - q.mid);

    for (const { a, b, mid } of edgeData) {
      const pa = proj[a];
      const pb = proj[b];
      if (pa.f <= 0.1 || pb.f <= 0.1) continue;
      const t = (mid + 1) / 2;
      const glowBoost = (pa.glow + pb.glow) * 0.35;
      const alpha = 0.08 + t * 0.32 + glowBoost;
      ctx.strokeStyle = rgba(colors.accent, alpha);
      ctx.lineWidth = 0.6 + t * 0.6;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    // Nodes — only draw camera-facing ones for clarity
    for (const p of proj) {
      if (p.depth < -0.05) continue; // small overlap so the rim fills in
      const t = (p.depth + 1) / 2;
      const baseColor = p.glow > 0.05 && p.glowColor ? p.glowColor : colors.accent;
      const r = (1.1 + t * 1.6 + p.glow * 2) * Math.min(p.f, 2.2);
      const alpha = 0.4 + t * 0.5 + p.glow * 0.3;

      // Halo only when glowing — keeps the scene from getting muddy.
      if (p.glow > 0.05) {
        const haloR = r * 4;
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
        halo.addColorStop(0, rgba(baseColor, 0.4 * p.glow));
        halo.addColorStop(1, rgba(baseColor, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = rgba(baseColor, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Node Sphere</span>
  </div>
</div>
