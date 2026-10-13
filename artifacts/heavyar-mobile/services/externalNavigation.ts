import { ActionSheetIOS, Linking, Platform } from 'react-native';
import { navigationUrls, type PreciseLocation } from './location';

export type NavigationResult = 'opened' | 'cancelled' | 'unavailable';

async function openWithFallback(primary: string, fallback: string): Promise<NavigationResult> {
  try {
    await Linking.openURL(primary);
    return 'opened';
  } catch {
    try {
      await Linking.openURL(fallback);
      return 'opened';
    } catch {
      return 'unavailable';
    }
  }
}

export async function openExternalDirections(
  location: Pick<PreciseLocation, 'lat' | 'lng'>,
  label: string,
  language: 'ar' | 'en',
): Promise<NavigationResult> {
  const urls = navigationUrls(location, label);
  if (Platform.OS === 'android') {
    // The geo VIEW intent delegates selection to Android's installed-app resolver.
    return openWithFallback(urls.android, urls.browser);
  }
  if (Platform.OS !== 'ios') return openWithFallback(urls.browser, urls.browser);

  const candidates: { label: string; url: string }[] = [
    { label: language === 'ar' ? 'خرائط Apple' : 'Apple Maps', url: urls.apple },
  ];
  const [google, waze] = await Promise.all([
    Linking.canOpenURL('comgooglemaps://').catch(() => false),
    Linking.canOpenURL('waze://').catch(() => false),
  ]);
  if (google) candidates.push({ label: 'Google Maps', url: urls.google });
  if (waze) candidates.push({ label: 'Waze', url: urls.waze });
  if (candidates.length === 1) return openWithFallback(candidates[0].url, urls.browser);

  return new Promise(resolve => {
    const cancel = language === 'ar' ? 'إلغاء' : 'Cancel';
    ActionSheetIOS.showActionSheetWithOptions({
      title: language === 'ar' ? 'افتح الاتجاهات باستخدام' : 'Open directions with',
      options: [...candidates.map(item => item.label), cancel],
      cancelButtonIndex: candidates.length,
    }, index => {
      const choice = candidates[index];
      if (!choice) return resolve('cancelled');
      void openWithFallback(choice.url, urls.browser).then(resolve);
    });
  });
}
