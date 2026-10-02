import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [{
    name: 'native-logo-test-asset',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/app/(tabs)/(home)/index.tsx')) {
        return code.replaceAll("require('@/assets/images/logo.png')", "'test-logo'");
      }
    },
  }],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'bun:test': 'vitest',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: [
      'tests/firestore.rules.test.ts',
      'tests/authTransitionIntegration.test.tsx',
      'tests/discoveryInteraction.test.tsx',
      'tests/equipmentCardRendering.test.tsx',
      'tests/roleAwareDiscovery.test.tsx',
      'tests/roleHomeSearch.test.tsx',
      'tests/requestSubscription.test.tsx',
    ],
  },
});
