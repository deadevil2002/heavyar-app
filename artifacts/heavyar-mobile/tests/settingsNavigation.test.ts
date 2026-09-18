import { describe, expect, it, vi } from 'vitest';
import { backFromSettings, handleSettingsHardwareBack, type SettingsFallback } from '../services/settingsNavigation';

describe('Settings history-aware back', () => {
  for (const fallback of ['/settings', '/(tabs)/profile'] as SettingsFallback[]) {
    it(`pops real history instead of navigating to ${fallback}`, () => {
      const router = { canGoBack: () => true, back: vi.fn(), replace: vi.fn() };
      backFromSettings(router, fallback);
      expect(router.back).toHaveBeenCalledOnce();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it(`replaces a cold entry with ${fallback}, without a back loop`, () => {
      const router = { canGoBack: () => false, back: vi.fn(), replace: vi.fn() };
      backFromSettings(router, fallback);
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledExactlyOnceWith(fallback);
    });

    it(`handles Android cold-entry Back with ${fallback}`, () => {
      const router = { canGoBack: () => false, back: vi.fn(), replace: vi.fn() };
      expect(handleSettingsHardwareBack(router, fallback)).toBe(true);
      expect(router.replace).toHaveBeenCalledExactlyOnceWith(fallback);
      expect(router.back).not.toHaveBeenCalled();
    });
  }
  it('leaves Android stack popping to Expo Router when history exists', () => {
    const router = { canGoBack: () => true, back: vi.fn(), replace: vi.fn() };
    expect(handleSettingsHardwareBack(router, '/settings')).toBe(false);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});