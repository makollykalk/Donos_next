import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@donos/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: false,
  },
});
