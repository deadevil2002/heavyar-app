import { mergeConfig, defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  define: {
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('test-api-key'),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify('heavyar-app.firebaseapp.com'),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('heavyar-app'),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify('heavyar-app.appspot.com'),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify('000000000000'),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:000000000000:web:test'),
  },
  resolve: { alias: { 'bun:test': 'vitest' } },
  test: {
    environment: 'node',
    include: [
      'src/lib/account-integrity.test.ts',
      'src/lib/early-access.test.ts',
      'src/lib/early-access-live.integration.test.tsx',
      'src/components/ui/switch-contract.test.ts',
    ],
  },
}));
