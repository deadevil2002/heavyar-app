import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localizedPolicyLink, policyConfirmationComplete, requiredPolicyConfirmations } from '../services/policyAcceptanceTransition';

describe('new-client policy re-acceptance', () => {
  test('requires base policies and explicit legal capacity for every role', () => {
    expect(requiredPolicyConfirmations('customer')).toEqual(['terms', 'privacy', 'acceptableUse', 'refundPolicy', 'legalCapacity']);
    expect(policyConfirmationComplete('customer', { terms: true, privacy: true, acceptableUse: true, refundPolicy: true })).toBe(false);
    expect(policyConfirmationComplete('customer', { terms: true, privacy: true, acceptableUse: true, refundPolicy: true, legalCapacity: true })).toBe(true);
  });

  test('adds provider authority and role-specific terms without cross-role leakage', () => {
    expect(requiredPolicyConfirmations('provider')).toContain('providerTerms');
    expect(requiredPolicyConfirmations('provider')).toContain('businessAuthority');
    expect(requiredPolicyConfirmations('provider')).not.toContain('driverTerms');
    expect(requiredPolicyConfirmations('driver')).toContain('driverTerms');
    expect(requiredPolicyConfirmations('driver')).not.toContain('providerTerms');
    expect(localizedPolicyLink('driverTerms', 'ar')).toBe('https://heavyar.com/driver-terms');
    expect(localizedPolicyLink('driverTerms', 'en')).toBe('https://heavyar.com/en/driver-terms');
  });

  test('root gate and screen expose all policy links and preserve state on failure', () => {
    const root = readFileSync(join(process.cwd(), 'app/_layout.tsx'), 'utf8');
    const screen = readFileSync(join(process.cwd(), 'components/PolicyReacceptanceScreen.tsx'), 'utf8');
    const auth = readFileSync(join(process.cwd(), 'contexts/AuthContext.tsx'), 'utf8');
    expect(root).toContain("policyAcceptanceState === 'legacy_unversioned'");
    for (const key of ['terms', 'privacy', 'acceptableUse', 'refundPolicy', 'providerTerms', 'driverTerms', 'legalCapacity', 'businessAuthority']) expect(screen).toContain(key);
    expect(screen).toContain('setError(true)');
    expect(auth.indexOf("setPolicyAcceptanceState('current')")).toBeGreaterThan(auth.indexOf('await fetchAccountProfileStatus()'));
  });
});
