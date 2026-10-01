import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  resolve: { alias: { 'bun:test': 'vitest' } },
  test: {
    environment: 'node',
    include: ['src/*-emulator.test.ts'],
  },
});
