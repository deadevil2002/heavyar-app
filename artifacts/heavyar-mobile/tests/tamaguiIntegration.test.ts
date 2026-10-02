import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync('tamagui.config.ts', 'utf8');
const rootLayout = readFileSync('app/_layout.tsx', 'utf8');
const smokeCard = readFileSync('components/ui/tamagui-smoke-card.tsx', 'utf8');
const smokeRoute = readFileSync('app/tamagui-smoke.tsx', 'utf8');

describe('Tamagui runtime integration', () => {
  it('defines the Heavyar brand, layout, elevation, and theme foundations', () => {
    for (const value of ['#011130', '#0F4996', '#4389CC', '#F1B61D', '#FFFFFF', '#F7F9FC']) {
      expect(config).toContain(value);
    }
    for (const category of ['space:', 'size:', 'radius:', 'zIndex:', 'heavyarShadows', 'light:', 'dark:']) {
      expect(config).toContain(category);
    }
  });

  it('wraps the existing provider tree without changing its order', () => {
    const tamagui = rootLayout.indexOf('<TamaguiProvider');
    const query = rootLayout.indexOf('<QueryClientProvider');
    const gesture = rootLayout.indexOf('<GestureHandlerRootView');
    const language = rootLayout.indexOf('<LanguageProvider>');
    const auth = rootLayout.indexOf('<AuthProvider>');

    expect(tamagui).toBeGreaterThan(-1);
    expect(tamagui).toBeLessThan(query);
    expect(query).toBeLessThan(gesture);
    expect(gesture).toBeLessThan(language);
    expect(language).toBeLessThan(auth);
  });

  it('keeps the bilingual RTL/LTR smoke card outside the production route tree', () => {
    expect(smokeCard).toContain("direction?: 'rtl' | 'ltr'");
    expect(smokeCard).toContain("direction = 'rtl'");
    expect(smokeCard).toContain('Tamagui جاهز في HEAVYAR');
    expect(smokeCard).toContain('Tamagui is ready in HEAVYAR');
    expect(smokeCard).toContain('transition="200ms"');
    expect(config).toContain("@tamagui/config/v5-reanimated");
    expect(smokeRoute).toContain('if (!__DEV__)');
    expect(smokeRoute).toContain('<Redirect href="/" />');
    expect(rootLayout).not.toContain('TamaguiSmokeCard');
  });
});
