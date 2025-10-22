import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],

  clearScreen: false,

  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
  },

  envPrefix: ['VITE_'],

  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
  },
})
