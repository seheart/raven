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

    // Environment options for jsdom
    environmentOptions: {
      jsdom: {
        resources: 'usable',
        url: 'http://localhost:9000'
      }
    },

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
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/**/*.test.js',
        'src/**/*.spec.js',
        'src/test/**',
        'src/mocks/**',
        'vite.config.js',
        'vitest.config.js'
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60
      }
    },

    // Global setup (runs once before all tests)
    globalSetup: ['./src/test/global-setup.js'],

    // Setup files (runs before each test file)
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
