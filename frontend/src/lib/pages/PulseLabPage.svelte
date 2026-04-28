<script>
  /**
   * Pulse Lab — temp page to compare the current AI Pulse against
   * 6 alternative shapes. All are wired to the same live websocket
   * events so they react in lockstep.
   */
  import NebulaActivity from '../components/NebulaActivity.svelte';
  import PulsePlasma from '../components/pulse-shapes/PulsePlasma.svelte';
  import PulseConstellation from '../components/pulse-shapes/PulseConstellation.svelte';
  import PulseAudioBars from '../components/pulse-shapes/PulseAudioBars.svelte';
  import PulseHelix from '../components/pulse-shapes/PulseHelix.svelte';
  import PulseTorus from '../components/pulse-shapes/PulseTorus.svelte';
  import PulseSonar from '../components/pulse-shapes/PulseSonar.svelte';
  import PulseNodeSphere from '../components/pulse-shapes/PulseNodeSphere.svelte';
  import PulseWireframeGlobe from '../components/pulse-shapes/PulseWireframeGlobe.svelte';
  import PulseRotatingCube from '../components/pulse-shapes/PulseRotatingCube.svelte';
  import PulseAtom from '../components/pulse-shapes/PulseAtom.svelte';
  import PulseLatticeCube from '../components/pulse-shapes/PulseLatticeCube.svelte';
  import PulsePulsingMesh from '../components/pulse-shapes/PulsePulsingMesh.svelte';

  const variants = [
    { name: 'Current (Nebula)', vibe: 'icosahedron, fly-bys, particle bursts', Component: NebulaActivity },
    { name: 'Node Sphere', vibe: '3D mesh of ~80 nodes, propagating glow', Component: PulseNodeSphere },
    { name: 'Pulsing Mesh', vibe: 'node sphere with bowed, breathing edges', Component: PulsePulsingMesh },
    { name: 'Wireframe Globe', vibe: 'lat/lng meridians, cartographic', Component: PulseWireframeGlobe },
    { name: 'Rotating Cube', vibe: 'subdivided cube wireframe, sci-fi HUD', Component: PulseRotatingCube },
    { name: 'Lattice Cube', vibe: '4×4×4 grid, propagation through lattice', Component: PulseLatticeCube },
    { name: 'Atom', vibe: 'nucleus + 3 orbital electron rings', Component: PulseAtom },
    { name: 'Plasma', vibe: 'fluid blob, biological, lava-lamp', Component: PulsePlasma },
    { name: 'Constellation', vibe: 'networked nodes, cerebral, neural', Component: PulseConstellation },
    { name: 'Audio Bars', vibe: 'radial spectrum, rhythmic, concert', Component: PulseAudioBars },
    { name: 'Helix', vibe: 'DNA strands, structured, bio', Component: PulseHelix },
    { name: 'Torus', vibe: 'flowing donut, cosmic, magnetic', Component: PulseTorus },
    { name: 'Sonar', vibe: 'concentric rings, zen, meditative', Component: PulseSonar }
  ];
</script>

<div class="min-h-screen bg-[var(--bg)] p-6 pb-20">
  <div class="max-w-[1600px] mx-auto">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">AI Pulse — Shape Lab</h1>
      <p class="text-sm text-[var(--muted)]">
        Live comparison of the current pulse against six alternative shapes. All variants subscribe
        to the same websocket events, so triggering activity anywhere in Raven will animate every
        panel at once.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {#each variants as v (v.name)}
        {@const Variant = v.Component}
        <div class="flex flex-col gap-2">
          <div class="h-[280px]">
            <Variant />
          </div>
          <div class="px-1">
            <div class="text-sm font-semibold text-[var(--text)]">{v.name}</div>
            <div class="text-xs text-[var(--muted)] font-mono">{v.vibe}</div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
