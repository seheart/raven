<script>
  /**
   * Theme-aware Mermaid diagram. Pass the source as a string.
   *
   * Mermaid is loaded lazily via dynamic import so the ~1 MB chunk only
   * lands when an about-class page renders. Tokens come from CSS vars on
   * documentElement, and the diagram re-initializes when the dark class
   * toggles (we observe documentElement, not body — see app.css note).
   *
   * @typedef {Object} Props
   * @property {string} source            — Mermaid flowchart source
   * @property {string} [ariaLabel]       — accessible label
   * @property {import('svelte').Snippet} [fallback]   — rendered when JS / Mermaid fails
   */

  import { onMount, onDestroy } from 'svelte';

  /** @type {Props} */
  let { source, ariaLabel = 'Architecture diagram', fallback } = $props();

  let mermaid;
  let observer;
  let renderToken = 0;
  let error = $state(null);
  let svg = $state('');

  function readTokens() {
    const s = getComputedStyle(document.documentElement);
    const v = name => s.getPropertyValue(name).trim();
    return {
      bg: v('--bg') || '#08050d',
      surface: v('--surface') || '#110a1c',
      surface2: v('--surface-2') || '#190f29',
      border: v('--border') || '#2a1d3d',
      text: v('--text') || '#c8b8d8',
      muted: v('--muted') || '#7a6a8e',
      accent: v('--accent') || '#a47eff',
      accentSubtle: v('--accent-subtle') || 'rgba(164,126,255,0.14)',
      success: v('--success') || '#5fc88a',
      successSubtle: v('--success-subtle') || 'rgba(95,200,138,0.12)',
      warning: v('--warning') || '#f5b045',
      warningSubtle: v('--warning-subtle') || 'rgba(245,176,69,0.12)',
      info: v('--info') || '#6b9bff',
      infoSubtle: v('--info-subtle') || 'rgba(107,155,255,0.12)'
    };
  }

  async function render() {
    const my = ++renderToken;
    try {
      if (!mermaid) {
        const mod = await import('mermaid');
        mermaid = mod.default;
      }
      if (my !== renderToken) return; // a newer render started; bail

      const t = readTokens();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'base',
        fontFamily: 'JetBrains Mono, monospace',
        themeVariables: {
          background: t.bg,
          primaryColor: t.accentSubtle,
          primaryBorderColor: t.accent,
          primaryTextColor: t.text,
          secondaryColor: t.surface2,
          tertiaryColor: t.surface,
          lineColor: t.muted,
          textColor: t.text,
          mainBkg: t.surface2
        },
        themeCSS: [
          `.node.accent  rect, .node.accent  polygon, .node.accent  path { fill: ${t.accentSubtle};  stroke: ${t.accent}; }`,
          `.node.success rect, .node.success polygon, .node.success path { fill: ${t.successSubtle}; stroke: ${t.success}; }`,
          `.node.warning rect, .node.warning polygon, .node.warning path { fill: ${t.warningSubtle}; stroke: ${t.warning}; }`,
          `.node.info    rect, .node.info    polygon, .node.info    path { fill: ${t.infoSubtle};    stroke: ${t.info}; }`,
          `.node.neutral rect, .node.neutral polygon, .node.neutral path { fill: ${t.surface2};      stroke: ${t.border}; }`,
          `.node .nodeLabel, .edgeLabel { color: ${t.text}; background: transparent !important; }`,
          `.edgeLabel rect { fill: ${t.bg}; }`,
          `.flowchart-link { stroke: ${t.muted}; }`,
          `.cluster rect { fill: transparent; stroke: ${t.border}; stroke-dasharray: 4 4; }`,
          `.cluster .cluster-label { color: ${t.muted}; font-size: 12px; }`
        ].join('\n')
      });

      const id = 'mermaid-' + my;
      const result = await mermaid.render(id, source);
      if (my !== renderToken) return;
      svg = result.svg;
      error = null;
    } catch (e) {
      error = e?.message || String(e);
      svg = '';
    }
  }

  onMount(() => {
    render();
    observer = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.attributeName === 'class') {
          render();
          break;
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });

  onDestroy(() => {
    if (observer) observer.disconnect();
    renderToken++;
  });
</script>

<div class="mermaid-host" role="img" aria-label={ariaLabel}>
  {#if error && fallback}
    {@render fallback()}
  {:else if svg}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- Mermaid output is generated from author-controlled source strings, not user input -->
    {@html svg}
  {/if}
</div>

<style>
  .mermaid-host {
    width: 100%;
    overflow-x: auto;
  }
  .mermaid-host :global(svg) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0 auto;
  }
</style>
