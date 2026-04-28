<script>
  /**
   * Atom — central nucleus + 3 elliptical orbital rings at different
   * tilts, with electrons traveling along each. Vibe: scientific,
   * Bohr-model nostalgia.
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
  let time = 0;
  let breathPhase = 0;
  let colors = $state(resolveThemeColors());

  // Three ring orientations: each is a unit circle in 3D, defined by
  // two perpendicular basis vectors (u, v). Choosing them as rotated
  // axis pairs gives clean planar orbits at distinct tilts.
  const RINGS = [
    { uYaw: 0,        uPitch: 0,    speed: 1.4, radius: 0.95 },
    { uYaw: 1.05,     uPitch: 0.3,  speed: 1.0, radius: 1.05 },
    { uYaw: -1.05,    uPitch: 0.6,  speed: 1.7, radius: 0.85 }
  ];

  function ringBasis(yaw, pitch) {
    // Basis: u in XY-plane rotated by yaw; v perpendicular, tilted by pitch.
    const u = [Math.cos(yaw), 0, Math.sin(yaw)];
    // v starts as Y-axis, then rotated around u by pitch.
    // For simplicity construct v via cross + rotation:
    const ax = [0, 1, 0];
    // Project ax onto plane perp to u (Gram-Schmidt)
    const dot = ax[0] * u[0] + ax[1] * u[1] + ax[2] * u[2];
    const v0 = [ax[0] - dot * u[0], ax[1] - dot * u[1], ax[2] - dot * u[2]];
    // Normalize
    const vlen = Math.hypot(v0[0], v0[1], v0[2]) || 1;
    const v = [v0[0] / vlen, v0[1] / vlen, v0[2] / vlen];
    // Apply pitch via Rodrigues rotation around u
    const c = Math.cos(pitch), s = Math.sin(pitch);
    // w = u × v
    const w = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0]
    ];
    return {
      u,
      v: [v[0] * c + w[0] * s, v[1] * c + w[1] * s, v[2] * c + w[2] * s]
    };
  }

  // Per-ring electrons. 1 main electron + a trail.
  let electrons = []; // {ringIdx, phase, color, life}
  let burstFlash = 0;
  let burstColor = null;

  function spawnElectron(ringIdx, color) {
    electrons.push({ ringIdx, phase: Math.random() * Math.PI * 2, color, life: 1 });
  }

  function onBurst(type) {
    const color = colors[TYPE_COLORS[type] || 'muted'];
    activity = Math.min(1, activity + 0.18);
    burstFlash = 1;
    burstColor = color;
    // Spawn an extra electron on a random ring
    spawnElectron(Math.floor(Math.random() * RINGS.length), color);
  }

  // Camera rotation so we get a slow tumble, not a static plan view.
  let camYaw = 0;
  let camPitch = 0;

  function rotateCam(p) {
    let [x, y, z] = p;
    const cy = Math.cos(camYaw), sy = Math.sin(camYaw);
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    return [x, y, z];
  }

  function draw() {
    const dt = 0.016;
    time += dt;
    activity *= 0.992;
    breathPhase += (1.5 + activity * 1.5) * dt;
    burstFlash *= 0.93;
    camYaw += (0.20 + activity * 0.3) * dt;
    camPitch = Math.sin(time * 0.13) * 0.4;

    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const baseScale = Math.min(width, height) * 0.30;
    const camDepth = 3.5;

    // Resolve ring bases (cached but recomputing each frame is cheap enough)
    const bases = RINGS.map(r => ringBasis(r.uYaw, r.uPitch));

    // Render orbital paths back-to-front by their average projected depth.
    // For each ring, sample many points to draw the ellipse.
    const ringSegments = RINGS.map((r, idx) => {
      const { u, v } = bases[idx];
      const SAMPLES = 64;
      const pts = [];
      let depthSum = 0;
      for (let i = 0; i <= SAMPLES; i++) {
        const t = (i / SAMPLES) * Math.PI * 2;
        const ct = Math.cos(t), st = Math.sin(t);
        const p = [
          (u[0] * ct + v[0] * st) * r.radius,
          (u[1] * ct + v[1] * st) * r.radius,
          (u[2] * ct + v[2] * st) * r.radius
        ];
        const rp = rotateCam(p);
        const f = camDepth / (camDepth - rp[2]);
        pts.push({ x: cx + rp[0] * baseScale * f, y: cy + rp[1] * baseScale * f, depth: rp[2] });
        depthSum += rp[2];
      }
      return { pts, avgDepth: depthSum / pts.length };
    });
    ringSegments.sort((a, b) => a.avgDepth - b.avgDepth);

    // Draw rings with depth-fading alpha along the path
    for (const ring of ringSegments) {
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      for (let i = 0; i < ring.pts.length - 1; i++) {
        const a = ring.pts[i];
        const b = ring.pts[i + 1];
        const t = ((a.depth + b.depth) / 2 + 1) / 2;
        ctx.strokeStyle = rgba(colors.accent, 0.10 + t * 0.30);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Always have one electron per ring as ambient + extras from bursts
    while (electrons.length < RINGS.length) {
      spawnElectron(electrons.length, colors.accent);
    }

    electrons = electrons.filter((e) => {
      e.phase += RINGS[e.ringIdx].speed * (1 + activity * 0.6) * dt;
      e.life -= 0.002;
      if (e.life < 0.05) return false;
      const r = RINGS[e.ringIdx];
      const { u, v } = bases[e.ringIdx];
      const ct = Math.cos(e.phase), st = Math.sin(e.phase);
      const p3 = [
        (u[0] * ct + v[0] * st) * r.radius,
        (u[1] * ct + v[1] * st) * r.radius,
        (u[2] * ct + v[2] * st) * r.radius
      ];
      const rp = rotateCam(p3);
      const f = camDepth / (camDepth - rp[2]);
      const x = cx + rp[0] * baseScale * f;
      const y = cy + rp[1] * baseScale * f;
      const t = (rp[2] + 1) / 2;
      const radius = (3 + t * 2) * Math.min(f, 2);
      const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
      halo.addColorStop(0, rgba(e.color, 0.55 * e.life));
      halo.addColorStop(1, rgba(e.color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(e.color, 0.95 * e.life);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });

    // Nucleus — small jittery cluster
    const nucleusR = 6 + Math.sin(breathPhase) * 1.5 + activity * 6 + burstFlash * 5;
    const nucleusColor = burstColor && burstFlash > 0.05 ? burstColor : colors.accent;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucleusR * 3);
    halo.addColorStop(0, rgba(nucleusColor, 0.65));
    halo.addColorStop(0.5, rgba(nucleusColor, 0.25));
    halo.addColorStop(1, rgba(nucleusColor, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, nucleusR * 3, 0, Math.PI * 2);
    ctx.fill();
    // Tiny jittery proton/neutron specks
    for (let i = 0; i < 5; i++) {
      const a = time * 3 + i * 1.7;
      const jx = cx + Math.cos(a) * nucleusR * 0.5;
      const jy = cy + Math.sin(a * 1.3) * nucleusR * 0.5;
      ctx.fillStyle = rgba(nucleusColor, 0.95);
      ctx.beginPath();
      ctx.arc(jx, jy, 1.6, 0, Math.PI * 2);
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
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Atom</span>
  </div>
</div>
