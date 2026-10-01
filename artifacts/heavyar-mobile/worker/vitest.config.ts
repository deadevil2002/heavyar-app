import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  resolve: { alias: { 'bun:test': 'vitest' } },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['src/*-emulator.test.ts'],
  },
});
