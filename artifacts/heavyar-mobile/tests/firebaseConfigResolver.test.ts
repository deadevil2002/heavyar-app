import { describe, expect, it } from 'vitest';
import { resolveFirebaseConfig, type FirebasePublicConfig } from '../services/firebaseConfigResolver';

const extra: FirebasePublicConfig = {
  apiKey: 'extra-key',
  authDomain: 'heavyar-app.firebaseapp.com',
  projectId: 'heavyar-app',
  storageBucket: 'heavyar-app.firebasestorage.app',
  messagingSenderId: '894313164992',
  appId: '1:894313164992:web:ec7ecdea9fa4630d96fd25',
};

describe('Firebase public config selection', () => {
  it('uses checked-in extra config for native production', () => {
    expect(resolveFirebaseConfig('android', false, { apiKey: 'dev-key' }, extra)).toEqual(extra);
  });

  it('allows EXPO_PUBLIC values to override extra config for web/development', () => {
    expect(resolveFirebaseConfig('web', true, { ...extra, apiKey: 'dev-key' }, extra).apiKey).toBe('dev-key');
  });

  it('rejects a config for another Firebase project', () => {
    expect(() => resolveFirebaseConfig('ios', false, undefined, { ...extra, projectId: 'other-project' })).toThrow('non-Heavyar');
  });

  it('requires every public SDK field', () => {
    const incomplete = { ...extra };
    delete (incomplete as Partial<FirebasePublicConfig>).appId;
    expect(() => resolveFirebaseConfig('android', false, undefined, incomplete)).toThrow('appId');
  });
});