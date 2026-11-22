import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, host: true, proxy: { '/ws': { target: 'ws://127.0.0.1:3001', ws: true }, '/api': 'http://127.0.0.1:3001', '/auth': 'http://127.0.0.1:3001' } },
});
