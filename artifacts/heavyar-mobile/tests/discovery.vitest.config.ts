import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['tests/discoveryInteraction.test.tsx', 'tests/equipmentCardRendering.test.tsx'] },
});