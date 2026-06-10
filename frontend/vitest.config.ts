import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/api/**', 'src/lib/**', 'src/components/ui/**', 'src/components/form/**'],
      exclude: ['src/api/types.ts', 'src/api/index.ts', '**/*.d.ts'],
      thresholds: { lines: 80, statements: 80, functions: 75, branches: 65 },
    },
  },
});
