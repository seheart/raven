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
    // Proxy API calls to backend server
    proxy: {
      '/api': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3030',
        changeOrigin: true,
      },
      '/telemetry': {
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
        manualChunks(id) {
          // Vendor chunks - split by library type
          if (id.includes('node_modules')) {
            // Core framework
            if (id.includes('svelte')) {
              return 'vendor-svelte'
            }
            // WebSocket and networking
            if (id.includes('socket.io-client')) {
              return 'vendor-socket'
            }
            // Markdown and content processing
            if (id.includes('marked') || id.includes('dompurify')) {
              return 'vendor-content'
            }
            // All other vendor code
            return 'vendor'
          }

          // Route-based code splitting for large panels
          if (id.includes('/lib/SessionReplay.svelte')) {
            return 'panel-session'
          }
          if (id.includes('/lib/PerformanceDashboard.svelte')) {
            return 'panel-performance'
          }
          if (id.includes('/lib/TriggersPanel.svelte')) {
            return 'panel-triggers'
          }
          if (id.includes('/lib/AgentsPanel.svelte')) {
            return 'panel-agents'
          }
          if (id.includes('/lib/ConversationsPanel.svelte')) {
            return 'panel-conversations'
          }

          // Keep core dashboard components in main bundle
          // Everything else will be in the entry chunk
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
