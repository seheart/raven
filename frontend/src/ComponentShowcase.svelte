<script>
  import { Button } from './lib/components/ui/index.js';
</script>

<div class="min-h-screen bg-white p-8">
  <div class="max-w-4xl mx-auto space-y-8">

    <!-- Header -->
    <header class="border-b border-gray-200 pb-6">
      <h1 class="text-4xl font-bold text-gray-900">
        Raven UI Component Library
      </h1>
      <p class="text-sm text-gray-600 mt-2">
        Built from scratch with Tailwind CSS - Complete control, zero dependencies
      </p>
    </header>

    <!-- Button Variants Section -->
    <section class="bg-gray-50 border border-gray-200 rounded-lg p-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">
        Button Variants
      </h2>

      <div class="space-y-6">
        <div>
          <h3 class="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">
            Primary
          </h3>
          <div class="flex gap-3 flex-wrap">
            <Button variant="primary">Primary Button</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </div>

        <div>
          <h3 class="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">
            Secondary
          </h3>
          <div class="flex gap-3 flex-wrap">
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="secondary" disabled>Disabled</Button>
          </div>
        </div>

        <div>
          <h3 class="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">
            Ghost
          </h3>
          <div class="flex gap-3 flex-wrap">
            <Button variant="ghost">Ghost Button</Button>
            <Button variant="ghost" disabled>Disabled</Button>
          </div>
        </div>

        <div>
          <h3 class="text-sm font-medium text-gray-500 mb-2 uppercase tracking-wide">
            Danger
          </h3>
          <div class="flex gap-3 flex-wrap">
            <Button variant="danger">Danger Button</Button>
            <Button variant="danger" disabled>Disabled</Button>
          </div>
        </div>
      </div>
    </section>

    <!-- Button Sizes Section -->
    <section class="bg-gray-50 border border-gray-200 rounded-lg p-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">
        Button Sizes
      </h2>

      <div class="flex items-center gap-3 flex-wrap">
        <Button size="sm">Small</Button>
        <Button size="md">Medium (Default)</Button>
        <Button size="lg">Large</Button>
      </div>
    </section>

    <!-- Interactive Demo Section -->
    <section class="bg-gray-50 border border-gray-200 rounded-lg p-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-4">
        Interactive Demo
      </h2>

      <div class="flex gap-3 flex-wrap">
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
    <section class="bg-gray-100 border border-gray-200 rounded-lg p-8">
      <h2 class="text-lg font-semibold text-gray-900 mb-3">
        Component Architecture
      </h2>
      <ul class="list-disc list-inside text-sm text-gray-700 space-y-2">
        <li>Pure Tailwind CSS utilities</li>
        <li>Svelte 5 runes ($props)</li>
        <li>Accessible (focus states, disabled handling)</li>
        <li>Customizable via class prop</li>
        <li>Zero external dependencies</li>
      </ul>
    </section>

  </div>
</div>
