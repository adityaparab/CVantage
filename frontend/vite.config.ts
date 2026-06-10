import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      // dev-only: the prod build is served by the NestJS server itself (#10.1)
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
