<script>
  /**
   * WireframeGlobe — classic Earth-grid sphere: meridians (longitude)
   * and parallels (latitude) drawn as smooth wireframe lines, with
   * nodes at every grid intersection. Vibe: cartographic, structured.
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
  let time = 0;
  let colors = $state(resolveThemeColors());

  const LATS = 7;   // parallels (excluding poles)
  const LONGS = 16; // meridians

  // Build grid vertex array. Index = lat * LONGS + lng.
  // Latitude 0 is north pole-adjacent, lat (LATS-1) is south pole-adjacent.
  const VERTS = (() => {
    const arr = [];
    for (let i = 0; i < LATS; i++) {
      const phi = ((i + 1) / (LATS + 1)) * Math.PI; // skip exact poles to avoid degenerate ring
      const y = Math.cos(phi);
      const r = Math.sin(phi);
      for (let j = 0; j < LONGS; j++) {
        const theta = (j / LONGS) * Math.PI * 2;
        arr.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
      }
    }
    return arr;
  })();

  // Edges: along longitude (between lat rings), along latitude (around each ring).
  const EDGES = (() => {
    const e = [];
    for (let i = 0; i < LATS; i++) {
      for (let j = 0; j < LONGS; j++) {
        const a = i * LONGS + j;
        const right = i * LONGS + ((j + 1) % LONGS);
        e.push([a, right, 'lat']);
        if (i < LATS - 1) {
          const down = (i + 1) * LONGS + j;
          e.push([a, down, 'lng']);
        }
      }
    }
    return e;
  })();

  const glow = new Float32Array(VERTS.length);
  const glowColor = new Array(VERTS.length).fill(null);

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.16);
    // Light up a random vertex AND the entire ring of latitude + meridian
    // through it — that's what makes a globe-style burst recognizable.
    const i = Math.floor(Math.random() * VERTS.length);
    const lat = Math.floor(i / LONGS);
    const lng = i % LONGS;
    for (let j = 0; j < LONGS; j++) {
      const k = lat * LONGS + j;
      glow[k] = Math.max(glow[k], 0.65);
      glowColor[k] = color;
    }
    for (let l = 0; l < LATS; l++) {
      const k = l * LONGS + lng;
      glow[k] = Math.max(glow[k], 0.65);
      glowColor[k] = color;
    }
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
    time += dt;
    activity *= 0.992;
    yawAngle += (0.32 + activity * 0.5) * dt;
    pitchAngle += (0.10 + activity * 0.15) * dt;

    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const sphereR = Math.min(width, height) * 0.30 + activity * 8;
    const camDepth = 3.5;

    const proj = VERTS.map((v, i) => {
      const r = rotate(v, yawAngle, pitchAngle);
      const f = camDepth / (camDepth - r[2]);
      glow[i] *= 0.95;
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
    const ed = EDGES.map(([a, b, kind]) => ({
      a, b, kind, mid: (proj[a].depth + proj[b].depth) / 2
    })).sort((p, q) => p.mid - q.mid);

    for (const { a, b, kind, mid } of ed) {
      const pa = proj[a];
      const pb = proj[b];
      if (pa.f <= 0.1 || pb.f <= 0.1) continue;
      const t = (mid + 1) / 2;
      const glowBoost = (pa.glow + pb.glow) * 0.35;
      const baseColor = (pa.glow + pb.glow) > 0.1 && (pa.glowColor || pb.glowColor)
        ? (pa.glow > pb.glow ? pa.glowColor : pb.glowColor)
        : colors.accent;
      // Meridians slightly brighter than parallels — gives the globe more
      // structure than a uniform grid.
      const baseAlpha = kind === 'lng' ? 0.20 : 0.12;
      ctx.strokeStyle = rgba(baseColor, baseAlpha + t * 0.32 + glowBoost);
      ctx.lineWidth = 0.7 + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    // Intersection nodes — only camera-facing
    for (const p of proj) {
      if (p.depth < -0.05) continue;
      const t = (p.depth + 1) / 2;
      const baseColor = p.glow > 0.05 && p.glowColor ? p.glowColor : colors.accent;
      const r = (1 + t * 1 + p.glow * 1.8) * Math.min(p.f, 2.2);
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Wireframe Globe</span>
  </div>
</div>
