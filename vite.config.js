import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build can be served from any folder of a static host.
  base: './',
  server: {
    port: 8080,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    // Phaser alone is over 1 MB minified; this is expected for a game bundle.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
