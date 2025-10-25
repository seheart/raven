import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { compression } from 'vite-plugin-compression2'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    // Gzip compression
    compression({
      algorithm: 'gzip',
      exclude: [/\.(br)$/, /\.(gz)$/],
    }),
    // Brotli compression (better compression ratio)
    compression({
      algorithm: 'brotliCompress',
      exclude: [/\.(br)$/, /\.(gz)$/],
      deleteOriginalAssets: false,
    }),
  ],

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
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3030',
        ws: true,
      },
    },
  },

  envPrefix: ['VITE_'],

  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,

    // Code splitting configuration
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk - frequently used libraries
          'vendor': [
            'svelte',
            'socket.io-client',
          ],
        },
        // Optimize chunk names
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },

    // Chunk size warning limit
    chunkSizeWarningLimit: 1000,

    // Asset inlining threshold (8KB)
    assetsInlineLimit: 8192,
  },

  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['svelte', 'socket.io-client'],
    exclude: ['@sveltejs/vite-plugin-svelte'],
  },
})
