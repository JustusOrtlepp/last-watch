import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5273, strictPort: true },
  preview: { host: '127.0.0.1', port: 4273, strictPort: true },
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    // Relative to the --dir passed by the npm scripts (tests/unit, tests/fairness).
    include: ['**/*.test.ts'],
  },
});
