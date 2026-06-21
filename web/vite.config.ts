import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// COOP/COEP headers enable cross-origin isolation, which unlocks
// SharedArrayBuffer and (future) WASM threads for parallel backtests.
const crossOriginIsolation = {
  name: 'cross-origin-isolation',
  configureServer(server: any) {
    server.middlewares.use((_req: any, res: any, next: any) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
    });
  },
  configurePreviewServer(server: any) {
    server.middlewares.use((_req: any, res: any, next: any) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      next();
    });
  },
};

export default defineConfig({
  // The Tauri desktop shell connects to a fixed dev URL (http://localhost:5173).
  // `strictPort` makes Vite fail loudly if 5173 is taken instead of silently
  // moving to 5174 — which would leave the desktop window loading stale/blank
  // content from whatever already occupies 5173.
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    crossOriginIsolation,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Axiomic',
        short_name: 'Axiomic',
        description: 'Browser-first stock analysis powered by Rust + WebAssembly.',
        theme_color: '#0b0f17',
        background_color: '#0b0f17',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // The WASM core and DuckDB bundles can exceed the default cache limit.
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,wasm,svg,png,woff2}'],
      },
    }),
  ],
  // DuckDB-WASM ships prebuilt bundles that should not be pre-bundled by esbuild.
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['lightweight-charts'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
