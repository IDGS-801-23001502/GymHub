import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/entorno-e2e.ts'],
    // Un solo archivo a la vez: comparten la base de prueba
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
