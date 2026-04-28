<script>
  /**
   * LatticeCube — 4×4×4 grid of nodes connected to immediate neighbors.
   * Bursts propagate through the lattice via BFS hops. Vibe: crystalline,
   * matrix, grid-of-thought.
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

  const N = 4; // 4×4×4 = 64 nodes
  const VERTS = [];
  const EDGES = [];
  const ADJ = [];

  (function build() {
    const idx = (x, y, z) => x * N * N + y * N + z;
    const half = (N - 1) / 2;
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
          VERTS.push([(x - half) / half, (y - half) / half, (z - half) / half]);
          ADJ.push([]);
        }
      }
    }
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
          const i = idx(x, y, z);
          if (x + 1 < N) { const j = idx(x + 1, y, z); EDGES.push([i, j]); ADJ[i].push(j); ADJ[j].push(i); }
          if (y + 1 < N) { const j = idx(x, y + 1, z); EDGES.push([i, j]); ADJ[i].push(j); ADJ[j].push(i); }
          if (z + 1 < N) { const j = idx(x, y, z + 1); EDGES.push([i, j]); ADJ[i].push(j); ADJ[j].push(i); }
        }
      }
    }
  })();

  const glow = new Float32Array(VERTS.length);
  const glowColor = new Array(VERTS.length).fill(null);
  let pending = [];

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.16);
    const start = Math.floor(Math.random() * VERTS.length);
    glow[start] = 1;
    glowColor[start] = color;
    pending.push({ from: [start], color, at: time + 0.08, depth: 0 });
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
    time += dt;
    activity *= 0.992;
    yawAngle += (0.30 + activity * 0.5) * dt;
    pitchAngle += (0.20 + activity * 0.3) * dt;
    breathPhase += (1.2 + activity * 1.5) * dt;

    pending = pending.filter(p => {
      if (time < p.at) return true;
      const next = new Set();
      for (const i of p.from) {
        for (const nb of ADJ[i]) {
          if (glow[nb] < 0.5) {
            glow[nb] = Math.max(glow[nb], 0.7 - p.depth * 0.2);
            glowColor[nb] = p.color;
            next.add(nb);
          }
        }
      }
      if (p.depth >= 3 || next.size === 0) return false;
      p.from = Array.from(next);
      p.at = time + 0.08;
      p.depth++;
      return true;
    });

    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.18 + Math.sin(breathPhase) * 2 + activity * 6;
    const camDepth = 3.5;

    const proj = VERTS.map((v, i) => {
      const r = rotate(v, yawAngle, pitchAngle);
      const f = camDepth / (camDepth - r[2]);
      glow[i] *= 0.95;
      return {
        x: cx + r[0] * scale * f,
        y: cy + r[1] * scale * f,
        depth: r[2],
        f,
        glow: glow[i],
        glowColor: glowColor[i]
      };
    });

    const ed = EDGES.map(([a, b]) => ({
      a, b, mid: (proj[a].depth + proj[b].depth) / 2
    })).sort((p, q) => p.mid - q.mid);

    for (const { a, b, mid } of ed) {
      const pa = proj[a];
      const pb = proj[b];
      const t = (mid + 1) / 2;
      const glowBoost = (pa.glow + pb.glow) * 0.35;
      const c = (pa.glow + pb.glow) > 0.1
        ? (pa.glow > pb.glow ? pa.glowColor : pb.glowColor) || colors.accent
        : colors.accent;
      ctx.strokeStyle = rgba(c, 0.10 + t * 0.25 + glowBoost);
      ctx.lineWidth = 0.6 + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    for (const p of proj) {
      const t = (p.depth + 1) / 2;
      const baseColor = p.glow > 0.05 && p.glowColor ? p.glowColor : colors.accent;
      const r = (1.0 + t * 1.2 + p.glow * 1.6) * Math.min(p.f, 2.2);
      if (p.glow > 0.1) {
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
        halo.addColorStop(0, rgba(baseColor, 0.45 * p.glow));
        halo.addColorStop(1, rgba(baseColor, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba(baseColor, 0.4 + t * 0.4 + p.glow * 0.3);
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Lattice Cube</span>
  </div>
</div>
