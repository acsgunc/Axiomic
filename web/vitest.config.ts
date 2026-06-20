/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dedicated Vitest config so the test runner does not pull in the PWA / WASM
// plugins from vite.config.ts (which assume a browser build context).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/store/**', 'src/components/**'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/wasm/**'],
    },
  },
});
