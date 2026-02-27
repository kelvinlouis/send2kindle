import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      include: ['src/**/*.js', 'send2kindle.js'],
    },
  },
});
