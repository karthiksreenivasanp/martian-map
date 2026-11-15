import { defineConfig } from 'vite';

export default defineConfig({
  base: '/martian-map/',
  server: {
    port: 5173,
    host: true
  },
  esbuild: {
    drop: ['console', 'debugger']
  },
  build: {
    target: 'esnext',
    sourcemap: false
  }
});
