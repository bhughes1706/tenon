import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tenon',
        short_name: 'Tenon',
        description: 'Parametric woodworking design and job management',
        theme_color: '#9a6420',
        background_color: '#f9f8f6',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        runtimeCaching: [
          {
            // workbox matches urlPattern against the FULL URL (e.g. "https://host/api/x"),
            // not a path — a bare /^\/api\// regex never matches and this rule was dead.
            // Exclude /api/events: it's the SSE stream and must never be cached/handled.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && url.pathname !== '/api/events',
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 10 }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  // Geometry evaluator runs in an ES module worker (Manifold WASM) — chunk 9.
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    // Don't let esbuild pre-bundle manifold-3d: its glue locates the kernel via
    // `new URL("manifold.wasm", import.meta.url)`, and pre-bundling into
    // .vite/deps/ doesn't copy the .wasm next to it, breaking resolution (and
    // forcing a mid-load re-optimize + page reload). Served as a real ESM module
    // the URL resolves against node_modules, which Vite serves. Rollup handles
    // the same pattern at build time (emits the .wasm as a hashed asset).
    exclude: ['manifold-3d']
  }
})
