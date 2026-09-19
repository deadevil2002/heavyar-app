import { describe, expect, test } from 'bun:test';
import { evaluateCanonicalCompleteness } from './integrity';

const auth = { uid: 'uid-1', email: 'user@example.com' };
const base = { uid: 'uid-1', email: 'user@example.com', role: 'customer', nameEn: 'Customer', countryCode: 'SA', region: 'Riyadh', city: 'Riyadh' };
describe('canonical account integrity', () => {
  test('recognizes complete canonical roles', () => {
    expect(evaluateCanonicalCompleteness(auth, base).state).toBe('authenticated_complete');
    expect(evaluateCanonicalCompleteness(auth, { ...base, role: 'provider', providerType: 'company', providerOnboardingCompleted: true }).state).toBe('authenticated_complete');
    expect(evaluateCanonicalCompleteness(auth, { ...base, role: 'driver' }, { uid: 'uid-1' }).state).toBe('authenticated_complete');
  });
  test('fails closed for missing role or role-specific profile', () => {
    expect(evaluateCanonicalCompleteness(auth, { ...base, role: undefined }).missingFields.includes('canonical_role')).toBe(true);
    expect(evaluateCanonicalCompleteness(auth, { ...base, role: 'driver' }).missingFields.includes('driver_profile')).toBe(true);
    expect(evaluateCanonicalCompleteness(auth, null).state).toBe('provisioning_incomplete');
  });
});