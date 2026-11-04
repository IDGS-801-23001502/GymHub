import { defineConfig } from 'vitest/config';

/** Cobertura total: pruebas unitarias + e2e contra las bases *_test (npm run test:cov:total). */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/entorno-e2e.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', '**/*.spec.ts', 'src/main.ts', 'src/cli/**'],
      reporter: ['text-summary', 'json-summary', 'html'],
    },
  },
});
