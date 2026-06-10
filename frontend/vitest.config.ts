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
      include: [
        'src/api/**',
        'src/lib/**',
        'src/components/ui/**',
        'src/components/form/**',
        'src/features/**',
      ],
      exclude: [
        'src/api/types.ts',
        'src/api/index.ts',
        'src/features/showcase/**', // dev-only kit gallery
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 75,
        branches: 65,
        // phase-8 gate (#76): every candidate feature folder holds its own
        'src/features/**': { lines: 80 },
      },
    },
  },
});
