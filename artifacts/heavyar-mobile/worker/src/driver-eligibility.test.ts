import { describe, expect, test } from 'bun:test';
import { driverDiscoveryMarket, driverEligibility } from './driver-eligibility';

const profile = { active: true, moderationStatus: 'approved', countryCode: 'SA', availabilityStatus: 'offline', trustStatus: 'unverified' };
const account = { role: 'driver', emailVerified: true, accountStatus: 'active' };
const market = driverDiscoveryMarket('SA', null);
describe('public driver baseline eligibility', () => {
  test('offline and unverified trust are not unconditional blockers', () => {
    expect(driverEligibility(profile, account, market, {}).discoverable).toBe(true);
  });
  test('store review is excluded even when approved and email verified', () => {
    expect(driverEligibility(profile, { ...account, accountPurpose: 'store_review' }, market, {}).reasons).toEqual(['store_review']);
  });
  test('inactive pending driver with unverified email has all three actual blockers', () => {
    expect(driverEligibility({ ...profile, active: false, moderationStatus: 'pending_review' }, { ...account, emailVerified: false }, market, {}).reasons)
      .toEqual(['inactive', 'pending_review', 'email_verification_required']);
  });
  test('email policy can explicitly disable the email requirement', () => {
    for (const policy of [{ enabled: false }, { requireBeforeDriverActivation: false }]) {
      expect(driverEligibility(profile, { ...account, emailVerified: false }, market, policy).discoverable).toBe(true);
    }
  });
  test('market defaults, explicit disablement and exact country matching', () => {
    expect(driverDiscoveryMarket('AE', null)?.marketplaceAvailable).toBe(false);
    expect(driverDiscoveryMarket('AE', { enabled: true, marketplaceAvailable: true })?.marketplaceAvailable).toBe(true);
    for (const value of [null, driverDiscoveryMarket('SA', { enabled: false }), driverDiscoveryMarket('SA', { marketplaceAvailable: false }), driverDiscoveryMarket('AE', { enabled: true, marketplaceAvailable: true })]) {
      expect(driverEligibility(profile, account, value, {}).reasons).toContain('market_unavailable');
    }
    expect(driverDiscoveryMarket('sa', null)).toBeNull();
  });
  test('canonical account restrictions cannot be bypassed by a profile', () => {
    for (const value of [null, { ...account, role: 'provider' }, { ...account, isActive: false }, { ...account, accountStatus: 'restricted' }, { ...account, accountStatus: 'deletion_requested' }, { ...account, accountStatus: 'suspended' }]) {
      expect(driverEligibility(profile, value, market, {}).discoverable).toBe(false);
    }
  });
});