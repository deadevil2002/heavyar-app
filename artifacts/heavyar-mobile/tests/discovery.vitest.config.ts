import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // Metro resolves static require assets; jsdom has no native asset registry.
  plugins: [{
    name: 'native-logo-test-asset',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('/app/(tabs)/(home)/index.tsx')) {
        return code.replaceAll("require('@/assets/images/logo.png')", "'test-logo'");
      }
    },
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('../', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['tests/discoveryInteraction.test.tsx', 'tests/equipmentCardRendering.test.tsx', 'tests/roleAwareDiscovery.test.tsx', 'tests/roleHomeSearch.test.tsx', 'tests/requestSubscription.test.tsx'] },
});