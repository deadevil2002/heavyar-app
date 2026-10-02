import AsyncStorage from '@react-native-async-storage/async-storage';

// Account-scoped state only. Device preferences such as language, layout view,
// theme, and the stable installation id intentionally survive logout/deletion.
export const ACCOUNT_LOCAL_STORAGE_KEYS = [
  'heavyar_user_profile',
  'heavyar_password_reset_at',
  'heavyar_installation_push_token',
] as const;

export async function clearAccountLocalStorage(): Promise<void> {
  await AsyncStorage.multiRemove([...ACCOUNT_LOCAL_STORAGE_KEYS]);
}
