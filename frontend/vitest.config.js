import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({
      hot: false,
      compilerOptions: {
        dev: false,
        generate: 'client'
      }
    })
  ],

  test: {
    // Test environment
    environment: 'jsdom',

    // Global test setup
    globals: true,

    // Include test files
    include: ['src/**/*.{test,spec}.{js,ts}'],

    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.{idea,git,cache,output,temp}/**'
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.test.js',
        'src/**/*.spec.js'
      ]
    },

    // Setup files
    setupFiles: ['./src/test/setup.js'],

    // Reporter
    reporter: ['verbose', 'html'],

    // Benchmark
    benchmark: {
      include: ['src/**/*.bench.{js,ts}']
    }
  },

  resolve: {
    alias: {
      '$lib': '/src/lib'
    },
    conditions: ['browser']
  }
});
