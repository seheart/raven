<script>
  /**
   * PulsingMesh — Node-Sphere relative where every edge is a quadratic
   * curve that bows outward (away from sphere center) by an amount that
   * pulses with the breath phase + activity. The sphere visibly inhales
   * and exhales as a soft membrane. Vibe: organic, breathing surface.
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
  let colors = $state(resolveThemeColors());

  const NODE_COUNT = 60;
  const NEIGHBORS = 4;

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
    // Per-edge phase offset so the membrane doesn't pulse uniformly.
    return Array.from(set).map(k => ({
      a: Math.floor(k / 1000),
      b: k % 1000,
      phase: Math.random() * Math.PI * 2
    }));
  })();

  const glow = new Float32Array(NODE_COUNT);
  const glowColor = new Array(NODE_COUNT).fill(null);

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.18);
    const i = Math.floor(Math.random() * NODE_COUNT);
    glow[i] = 1;
    glowColor[i] = color;
  }

  function rotate(v, yaw, pitch) {
    const [x, y, z] = v;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  }

  function draw() {
    const dt = 0.016;
    activity *= 0.992;
    yawAngle += (0.30 + activity * 0.5) * dt;
    pitchAngle += (0.15 + activity * 0.25) * dt;
    breathPhase += (1.6 + activity * 1.4) * dt;

    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const sphereR = Math.min(width, height) * 0.26;
    const camDepth = 3.4;

    const proj = NODES.map((v, i) => {
      const r = rotate(v, yawAngle, pitchAngle);
      const f = camDepth / (camDepth - r[2]);
      glow[i] *= 0.96;
      return {
        x: cx + r[0] * sphereR * f,
        y: cy + r[1] * sphereR * f,
        depth: r[2],
        f,
        glow: glow[i],
        glowColor: glowColor[i],
        // Keep 3D for control-point math
        v3: r
      };
    });

    // Draw bowed edges. Control point is the edge midpoint pushed
    // outward along the direction (mid - sphereCenter), magnitude
    // depends on breath + activity + per-edge phase.
    const ed = EDGES.map(e => ({
      ...e, mid: (proj[e.a].depth + proj[e.b].depth) / 2
    })).sort((p, q) => p.mid - q.mid);

    for (const { a, b, phase, mid } of ed) {
      const pa = proj[a];
      const pb = proj[b];
      const t = (mid + 1) / 2;
      const glowBoost = (pa.glow + pb.glow) * 0.35;

      // Compute mid in 3D, then push outward.
      const m3 = [
        (pa.v3[0] + pb.v3[0]) / 2,
        (pa.v3[1] + pb.v3[1]) / 2,
        (pa.v3[2] + pb.v3[2]) / 2
      ];
      // Outward direction = normalize(m3) since sphere is centered at origin
      const len = Math.hypot(m3[0], m3[1], m3[2]) || 1;
      const out = [m3[0] / len, m3[1] / len, m3[2] / len];
      // Bow magnitude — pulses per-edge so the surface ripples
      const bow = 0.10 + Math.sin(breathPhase + phase) * 0.06 + activity * 0.10;
      const cp3 = [m3[0] + out[0] * bow, m3[1] + out[1] * bow, m3[2] + out[2] * bow];
      // Project control point
      const fcp = camDepth / (camDepth - cp3[2]);
      const cpx = cx + cp3[0] * sphereR * fcp;
      const cpy = cy + cp3[1] * sphereR * fcp;

      const c = (pa.glow + pb.glow) > 0.1
        ? (pa.glow > pb.glow ? pa.glowColor : pb.glowColor) || colors.accent
        : colors.accent;
      ctx.strokeStyle = rgba(c, 0.10 + t * 0.30 + glowBoost);
      ctx.lineWidth = 0.7 + t * 0.6;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.quadraticCurveTo(cpx, cpy, pb.x, pb.y);
      ctx.stroke();
    }

    // Nodes
    for (const p of proj) {
      if (p.depth < -0.05) continue;
      const t = (p.depth + 1) / 2;
      const baseColor = p.glow > 0.05 && p.glowColor ? p.glowColor : colors.accent;
      const r = (1.1 + t * 1.4 + p.glow * 1.8) * Math.min(p.f, 2.2);
      if (p.glow > 0.1) {
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
        halo.addColorStop(0, rgba(baseColor, 0.4 * p.glow));
        halo.addColorStop(1, rgba(baseColor, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba(baseColor, 0.4 + t * 0.5 + p.glow * 0.3);
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Pulsing Mesh</span>
  </div>
</div>
