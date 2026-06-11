import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/*.test.mjs'], // e2e specs belong to Playwright, not vitest
  },
});
