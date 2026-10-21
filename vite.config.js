import { defineConfig } from 'vite';
import { maskToolServer } from './tools/mask-tool/server.js';

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
  // The mask tool (tools/mask-tool/, dev server only) saves masks through this API.
  plugins: [maskToolServer()],
  optimizeDeps: {
    // Transformers.js loads its ONNX runtime files itself; pre-bundling breaks that.
    exclude: ['@huggingface/transformers'],
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
