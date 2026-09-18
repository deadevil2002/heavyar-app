import type { Router } from 'expo-router';

export type SettingsFallback = '/settings' | '/(tabs)/profile';

// Preserve the actual caller (including registration/legal flows). A cold
// deep link has no stack to pop; replace it rather than creating a back loop.
export function backFromSettings(
  router: Pick<Router, 'canGoBack' | 'back' | 'replace'>,
  fallback: SettingsFallback,
) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function handleSettingsHardwareBack(
  router: Pick<Router, 'canGoBack' | 'back' | 'replace'>,
  fallback: SettingsFallback,
): boolean {
  if (router.canGoBack()) return false;
  backFromSettings(router, fallback);
  return true;
}