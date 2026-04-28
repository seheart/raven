<script>
  /**
   * RotatingCube — denser cube wireframe with subdivided edges and
   * a face-cross diagonal. Vibe: architectural, blocky, sci-fi HUD.
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
  let rollAngle = 0;
  let breathPhase = 0;
  let colors = $state(resolveThemeColors());

  // Build subdivided cube wireframe.
  // 8 corners + 3 nodes per edge = 8 + 12*3 = 44 nodes
  const SUB = 3; // points along each edge between corners (exclusive)

  const VERTS = [];
  const EDGES = [];

  (function build() {
    const corners = [];
    for (let z = -1; z <= 1; z += 2)
      for (let y = -1; y <= 1; y += 2)
        for (let x = -1; x <= 1; x += 2)
          corners.push([x, y, z]);

    // Map of "nodeKey" -> index. Lets us share subdivision points between
    // shared edges without duplicating.
    const nodeMap = new Map();
    function key(p) { return p.map(n => n.toFixed(3)).join(','); }
    function add(p) {
      const k = key(p);
      if (nodeMap.has(k)) return nodeMap.get(k);
      const idx = VERTS.length;
      VERTS.push(p);
      nodeMap.set(k, idx);
      return idx;
    }
    corners.forEach(add);

    // 12 cube edges (pairs of corner indices into the 8-corner array)
    const edgePairs = [
      [0,1],[2,3],[4,5],[6,7],   // X-axis edges
      [0,2],[1,3],[4,6],[5,7],   // Y-axis edges
      [0,4],[1,5],[2,6],[3,7]    // Z-axis edges
    ];
    for (const [a, b] of edgePairs) {
      const A = corners[a];
      const B = corners[b];
      // Build subdivision chain: A -> sub1 -> sub2 -> sub3 -> B
      let prev = a; // corner index in VERTS (corners are first 8)
      for (let i = 1; i <= SUB; i++) {
        const t = i / (SUB + 1);
        const p = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
        const cur = add(p);
        EDGES.push([prev, cur]);
        prev = cur;
      }
      EDGES.push([prev, b]);
    }

    // Add face-center cross diagonals on 3 visible-ish faces for extra
    // structure. Each face: connect midpoints of opposite edges.
    // Pick 3 face-cross sets that are easy: front (z=+1), right (x=+1), top (y=+1).
    function midpoint(a, b) {
      return add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    }
    // Front face (z=+1): corners 4,5,6,7 (with our z-major ordering: actually let me re-derive)
    // Our corners loop: z first slow, then y, then x — index = (z+1)/2*4 + (y+1)/2*2 + (x+1)/2
    // So z=+1 corners are 4,5,6,7. front cross: midpoint(4,7) ↔ midpoint(5,6)
    // Right face (x=+1): corners with x=+1: 1,3,5,7 → cross midpoint(1,7) ↔ midpoint(3,5)
    // Top face (y=+1): corners with y=+1: 2,3,6,7 → cross midpoint(2,7) ↔ midpoint(3,6)
    const cross = [
      [midpoint(corners[4], corners[7]), midpoint(corners[5], corners[6])],
      [midpoint(corners[1], corners[7]), midpoint(corners[3], corners[5])],
      [midpoint(corners[2], corners[7]), midpoint(corners[3], corners[6])]
    ];
    EDGES.push(...cross);
  })();

  const glow = new Float32Array(VERTS.length);
  const glowColor = new Array(VERTS.length).fill(null);

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.16);
    // Light up a corner and let it ripple to subdivision neighbors visually
    const corner = Math.floor(Math.random() * 8);
    glow[corner] = 1;
    glowColor[corner] = color;
    // Boost subdivision points on edges containing this corner
    for (const [a, b] of EDGES) {
      if (a === corner) {
        glow[b] = Math.max(glow[b], 0.55);
        glowColor[b] = color;
      } else if (b === corner) {
        glow[a] = Math.max(glow[a], 0.55);
        glowColor[a] = color;
      }
    }
  }

  function rotate(v, yaw, pitch, roll) {
    let [x, y, z] = v;
    // Yaw (Y-axis)
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    // Pitch (X-axis)
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    // Roll (Z-axis) — gives the cube a slight tumble
    const cr = Math.cos(roll), sr = Math.sin(roll);
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    return [x, y, z];
  }

  function draw() {
    const dt = 0.016;
    activity *= 0.992;
    yawAngle += (0.40 + activity * 0.6) * dt;
    pitchAngle += (0.28 + activity * 0.4) * dt;
    rollAngle += (0.07 + activity * 0.10) * dt;
    breathPhase += (1.2 + activity * 1.5) * dt;

    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.18 + Math.sin(breathPhase) * 2 + activity * 8;
    const camDepth = 3.5;

    const proj = VERTS.map((v, i) => {
      const r = rotate(v, yawAngle, pitchAngle, rollAngle);
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
      const c = pa.glow > 0.1 && pa.glowColor ? pa.glowColor
              : pb.glow > 0.1 && pb.glowColor ? pb.glowColor
              : colors.accent;
      ctx.strokeStyle = rgba(c, 0.18 + t * 0.45 + glowBoost);
      ctx.lineWidth = (0.9 + t * 0.8) * Math.min((pa.f + pb.f) / 2, 2);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    // Vertex dots — corners (first 8) get bigger dots than subdivisions.
    proj.forEach((p, i) => {
      if (p.depth < -0.05) return;
      const t = (p.depth + 1) / 2;
      const isCorner = i < 8;
      const baseColor = p.glow > 0.05 && p.glowColor ? p.glowColor : colors.accent;
      const r = ((isCorner ? 1.8 : 0.9) + t * 1.2 + p.glow * 1.8) * Math.min(p.f, 2.2);
      ctx.fillStyle = rgba(baseColor, 0.45 + t * 0.45 + p.glow * 0.3);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Rotating Cube</span>
  </div>
</div>
