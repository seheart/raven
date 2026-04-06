<script>
  /**
   * Waveform — Radial pulse visualization
   * Concentric rings pulse outward from center.
   * Amplitude and frequency driven by event rate.
   * Like a heartbeat monitor crossed with sonar.
   */
  import { onMount } from 'svelte';

  let { eventFeed = [] } = $props();
  let canvas;
  let ctx;
  let animId;
  let width = 0;
  let height = 0;
  let time = 0;
  let pulses = []; // { born, color, intensity }
  let lastEventCount = 0;
  let waveHistory = new Float32Array(200).fill(0); // rolling amplitude
  let waveIdx = 0;

  let colors = { accent: '#6b8eff', success: '#22c55e', error: '#ef4444', muted: '#8888a0' };

  function resolveColors() {
    const s = getComputedStyle(document.body);
    colors.accent = s.getPropertyValue('--accent').trim() || colors.accent;
    colors.success = s.getPropertyValue('--success').trim() || colors.success;
    colors.error = s.getPropertyValue('--error').trim() || colors.error;
    colors.muted = s.getPropertyValue('--muted').trim() || colors.muted;
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
    user_message: 'accent',
    assistant_message: 'accent',
    file_edit: 'success',
    file_create: 'success',
    file_delete: 'error',
    error: 'error'
  };

  function draw() {
    time += 0.016;
    ctx.clearRect(0, 0, width, height);

    // Grid
    const s = getComputedStyle(document.body);
    const bg = s.getPropertyValue('--surface').trim();
    const bgRgb = hexToRgb(bg);
    const gridColor =
      bgRgb && (bgRgb.r + bgRgb.g + bgRgb.b) / 3 > 128
        ? 'rgba(0,0,0,0.03)'
        : 'rgba(100,100,140,0.04)';
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
    const maxRadius = Math.min(width, height) * 0.45;

    // Process new events -> create pulses
    if (eventFeed.length > lastEventCount) {
      for (let i = lastEventCount; i < eventFeed.length; i++) {
        const type = eventFeed[i].type;
        const color = colors[TYPE_COLORS[type] || 'muted'];
        pulses.push({ born: time, color, intensity: 0.6 + Math.random() * 0.4 });
        // Record amplitude spike
        waveHistory[waveIdx % waveHistory.length] = 0.8 + Math.random() * 0.2;
      }
      lastEventCount = eventFeed.length;
    }

    // Decay wave history
    waveHistory[waveIdx % waveHistory.length] *= 0.97;
    waveIdx++;

    // Draw radial pulses (sonar rings)
    pulses = pulses.filter(p => {
      const age = time - p.born;
      if (age > 3) return false;
      const progress = age / 3;
      const radius = progress * maxRadius;
      const alpha = (1 - progress) * p.intensity * 0.4;

      ctx.strokeStyle = rgba(p.color, alpha);
      ctx.lineWidth = (1 - progress) * 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      return true;
    });

    // Draw radial waveform — amplitude ring
    const points = waveHistory.length;
    const baseRadius = 30;

    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const idx = (waveIdx + i) % points;
      const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
      const amp = waveHistory[idx] * 40;
      // Add subtle sine modulation for life
      const wobble = Math.sin(time * 3 + angle * 4) * 2;
      const r = baseRadius + amp + wobble;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(colors.accent, 0.5);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fill with subtle glow
    ctx.fillStyle = rgba(colors.accent, 0.03);
    ctx.fill();

    // Horizontal waveform at bottom (EKG style)
    const waveY = height - 40;
    const waveW = width - 40;
    ctx.beginPath();
    ctx.moveTo(20, waveY);
    for (let i = 0; i < points; i++) {
      const idx = (waveIdx + i) % points;
      const x = 20 + (i / points) * waveW;
      const amp = waveHistory[idx] * 25;
      const y = waveY - amp;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(colors.accent, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Baseline
    ctx.strokeStyle = rgba(colors.muted, 0.15);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(20, waveY);
    ctx.lineTo(20 + waveW, waveY);
    ctx.stroke();

    // Core
    const breath = 4 + Math.sin(time * 2) * 1.5;
    ctx.fillStyle = rgba(colors.accent, 0.7);
    ctx.beginPath();
    ctx.arc(cx, cy, breath, 0, Math.PI * 2);
    ctx.fill();

    // Outer glow
    const glowR = 12 + Math.sin(time * 2) * 3;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    grad.addColorStop(0, rgba(colors.accent, 0.12));
    grad.addColorStop(1, rgba(colors.accent, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fill();

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
    resolveColors();
    handleResize();
    animId = requestAnimationFrame(draw);

    const themeObs = new MutationObserver(() => resolveColors());
    themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const resizeObs = new ResizeObserver(() => handleResize());
    resizeObs.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animId);
      themeObs.disconnect();
      resizeObs.disconnect();
    };
  });
</script>

<div
  class="relative w-full rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--surface)]"
  style="height: 260px;"
>
  <canvas bind:this={canvas} class="absolute inset-0 w-full h-full"></canvas>
  <div class="absolute top-3 left-4 pointer-events-none">
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
      >2. Waveform</span
    >
    <span class="text-[9px] text-[var(--muted)] font-mono ml-2">Radial pulse + EKG heartbeat</span>
  </div>
</div>
