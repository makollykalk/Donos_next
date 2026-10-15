import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@donos/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
      '@donos/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
      '@donos/domain-core': fileURLToPath(new URL('./packages/domain-core/src/index.ts', import.meta.url)),
      '@donos/domain-billing': fileURLToPath(new URL('./packages/domain-billing/src/index.ts', import.meta.url)),
      '@donos/auth-client': fileURLToPath(new URL('./packages/auth-client/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: false,
  },
});
