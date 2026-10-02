import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storage, multiRemove } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const multiRemove = vi.fn(async (keys: string[]) => {
    keys.forEach(key => storage.delete(key));
  });
  return { storage, multiRemove };
});
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { multiRemove },
}));

import { ACCOUNT_LOCAL_STORAGE_KEYS, clearAccountLocalStorage } from '../services/authLocalStorage';

describe('account-scoped local storage cleanup', () => {
  beforeEach(() => {
    storage.clear();
    multiRemove.mockClear();
  });

  it('removes only account data and preserves device UI preferences', async () => {
    await clearAccountLocalStorage();

    expect(multiRemove).toHaveBeenCalledWith([...ACCOUNT_LOCAL_STORAGE_KEYS]);
    expect(ACCOUNT_LOCAL_STORAGE_KEYS).not.toContain('heavyar_language');
    expect(ACCOUNT_LOCAL_STORAGE_KEYS).not.toContain('heavyar_equipment_view');
    expect(ACCOUNT_LOCAL_STORAGE_KEYS).not.toContain('heavyar_installation_id');
  });

  it.each(['ar', 'en'] as const)('preserves %s across repeated auth cleanup cycles', async language => {
    storage.set('heavyar_language', language);
    storage.set('heavyar_equipment_view', 'list');

    for (let cycle = 0; cycle < 2; cycle += 1) {
      storage.set('heavyar_user_profile', JSON.stringify({ uid: `fixture-${cycle}` }));
      storage.set('heavyar_installation_push_token', `token-${cycle}`);
      await clearAccountLocalStorage();

      expect(storage.get('heavyar_language')).toBe(language);
      expect(storage.get('heavyar_equipment_view')).toBe('list');
      expect(storage.has('heavyar_user_profile')).toBe(false);
      expect(storage.has('heavyar_installation_push_token')).toBe(false);
    }
  });
});
