import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],

  server: {
    port: 9000, // Raven monitoring dashboard - outside typical dev range
    strictPort: true, // Fail if port is taken (don't auto-increment)
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:9100', // Backend monitoring service
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:9100',
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
