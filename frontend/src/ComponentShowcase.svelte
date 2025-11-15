<script>
  import { Button } from './lib/components/ui/index.js';
</script>

<div class="min-h-screen bg-night-bg p-3xl">
  <div class="max-w-4xl mx-auto space-y-3xl">

    <!-- Header -->
    <header class="border-b border-night-border pb-xl">
      <h1 class="text-4xl font-bold text-night-heading font-sans">
        Raven UI Component Library
      </h1>
      <p class="text-sm text-night-muted mt-md font-sans">
        Built from scratch with Tailwind CSS - Complete control, zero dependencies
      </p>
    </header>

    <!-- Button Variants Section -->
    <section class="bg-night-surface border border-night-border rounded p-3xl">
      <h2 class="text-2xl font-semibold text-night-heading mb-xl font-sans">
        Button Variants
      </h2>

      <div class="space-y-lg">
        <div>
          <h3 class="text-sm font-medium text-night-muted mb-md font-sans uppercase tracking-wide">
            Primary
          </h3>
          <div class="flex gap-md flex-wrap">
            <Button variant="primary">Primary Button</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </div>

        <div>
          <h3 class="text-sm font-medium text-night-muted mb-md font-sans uppercase tracking-wide">
            Secondary
          </h3>
          <div class="flex gap-md flex-wrap">
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="secondary" disabled>Disabled</Button>
          </div>
        </div>

        <div>
          <h3 class="text-sm font-medium text-night-muted mb-md font-sans uppercase tracking-wide">
            Ghost
          </h3>
          <div class="flex gap-md flex-wrap">
            <Button variant="ghost">Ghost Button</Button>
            <Button variant="ghost" disabled>Disabled</Button>
          </div>
        </div>

        <div>
          <h3 class="text-sm font-medium text-night-muted mb-md font-sans uppercase tracking-wide">
            Danger
          </h3>
          <div class="flex gap-md flex-wrap">
            <Button variant="danger">Danger Button</Button>
            <Button variant="danger" disabled>Disabled</Button>
          </div>
        </div>
      </div>
    </section>

    <!-- Button Sizes Section -->
    <section class="bg-night-surface border border-night-border rounded p-3xl">
      <h2 class="text-2xl font-semibold text-night-heading mb-xl font-sans">
        Button Sizes
      </h2>

      <div class="flex items-center gap-md flex-wrap">
        <Button size="sm">Small</Button>
        <Button size="md">Medium (Default)</Button>
        <Button size="lg">Large</Button>
      </div>
    </section>

    <!-- Interactive Demo Section -->
    <section class="bg-night-surface border border-night-border rounded p-3xl">
      <h2 class="text-2xl font-semibold text-night-heading mb-xl font-sans">
        Interactive Demo
      </h2>

      <div class="flex gap-md flex-wrap">
        <Button onclick={() => alert('Primary clicked!')}>
          Click Me
        </Button>
        <Button variant="secondary" onclick={() => alert('Secondary clicked!')}>
          Try This
        </Button>
        <Button variant="ghost" onclick={() => console.log('Ghost button clicked')}>
          Log to Console
        </Button>
      </div>
    </section>

    <!-- Component Info -->
    <section class="bg-night-surface-2 border border-night-border rounded p-3xl">
      <h2 class="text-lg font-semibold text-night-heading mb-md font-sans">
        Component Architecture
      </h2>
      <ul class="list-disc list-inside text-sm text-night-text space-y-sm font-mono">
        <li>Pure Tailwind CSS utilities</li>
        <li>Svelte 5 runes ($props)</li>
        <li>Accessible (focus states, disabled handling)</li>
        <li>Customizable via class prop</li>
        <li>Zero external dependencies</li>
      </ul>
    </section>

  </div>
</div>
