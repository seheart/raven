import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],

  server: {
    // Override RAVEN_FRONTEND_PORT/RAVEN_BACKEND_URL to run an isolated
    // instance (e.g. e2e on 9001 → 9101) without disturbing the dev session.
    port: parseInt(process.env.RAVEN_FRONTEND_PORT || '9000', 10),
    strictPort: true, // Fail if port is taken (don't auto-increment)
    host: true,
    proxy: {
      '/api': {
        target: process.env.RAVEN_BACKEND_URL || 'http://127.0.0.1:9100',
        changeOrigin: true
      },
      '/socket.io': {
        target: process.env.RAVEN_BACKEND_URL || 'http://127.0.0.1:9100',
        changeOrigin: true,
        ws: true
      }
    }
  },

  resolve: {
    alias: {
      $lib: '/src/lib'
    }
  }
});
