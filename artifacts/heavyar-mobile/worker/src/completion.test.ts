import { describe, expect, test } from 'bun:test';
import {
  availabilityAllows, campaignRecipients, chunk, enabledConfiguredGateways,
  gatewayRegistry, hasPermission,
  identityIntegrationMayEnable, identityIntegrationRegistry, normalizeStaffRole,
  ownerTransferAllowed, publicDriverProfile, rangesOverlap, transitionDriverRequest,
} from './completion';
import { invitationRole, isFreshReauthentication, pendingAndUnexpired } from './authority';

describe('trusted completion primitives', () => {
  test('staff roles grant only their explicit permissions', () => {
    expect(hasPermission('marketing', 'marketing.campaign')).toBe(true);
    expect(hasPermission('marketing', 'finance.mutate')).toBe(false);
    expect(hasPermission('payouts', 'payouts.mutate')).toBe(true);
    expect(hasPermission('payouts', 'finance.read')).toBe(false);
    expect(hasPermission('moderator', 'moderation.manage')).toBe(true);
    expect(normalizeStaffRole('owner')).toBe('owner');
    expect(normalizeStaffRole('unknown')).toBe(null);
  });

  test('date overlap and availability checks are inclusive and bounded', () => {
    expect(rangesOverlap({ from: '2025-01-01', until: '2025-01-03' }, { from: '2025-01-03', until: '2025-01-04' })).toBe(true);
    expect(JSON.stringify(availabilityAllows({ from: '2025-01-01', until: '2025-12-31' }, { from: '2025-02-01', until: '2025-02-03' }))).toBe(JSON.stringify({ ok: true }));
    expect(availabilityAllows({ from: '2025-01-01', until: '2025-12-31', blocked: [{ from: '2025-02-02', until: '2025-02-04' }] }, { from: '2025-02-01', until: '2025-02-03' }).ok).toBe(false);
  });

  test('driver responses omit private contact fields', () => {
    const result = publicDriverProfile({ id: 'drv_opaque', uid: 'd1', displayName: 'Driver', phone: '+966', email: 'private@example.test', countryCode: 'SA', city: 'Riyadh', trustStatus: 'verified', rating: 5 });
    expect(JSON.stringify(result)).toBe(JSON.stringify({ id: 'drv_opaque', displayName: 'Driver', countryCode: 'SA', city: 'Riyadh' }));
  });

  test('driver requests use a finite canonical transition graph', () => {
    expect(transitionDriverRequest('open', 'accepted')).toBe(true);
    expect(transitionDriverRequest('declined', 'accepted')).toBe(false);
  });

  test('gateway output exposes capabilities, not credentials', () => {
    const registry = gatewayRegistry({ TAP_SECRET_KEY_TEST: 'test-secret', MOYASAR_SECRET_KEY: 'secret' });
    expect(registry.tap.configured).toBe(true);
    expect(registry.moyasar.adapterAvailable).toBe(false);
    expect(enabledConfiguredGateways(registry, { tap: true, moyasar: true }).length).toBe(1);
    expect(JSON.stringify(registry).includes('test-secret')).toBe(false);
  });

  test('campaign recipients honor opt-out and chunking', () => {
    const recipients = campaignRecipients([
      { uid: 'a', role: 'customer' }, { uid: 'b', role: 'provider', marketingOptOut: true }, { uid: 'c', role: 'provider' },
    ], { audience: 'providers' });
    expect(JSON.stringify(recipients)).toBe(JSON.stringify(['c']));
    expect(JSON.stringify(chunk(['a', 'b', 'c'], 2))).toBe(JSON.stringify([['a', 'b'], ['c']]));
  });

  test('owner transfer requires recent authentication and a different target', () => {
    expect(ownerTransferAllowed('owner', 'target', Date.now() - 60_000)).toBe(true);
    expect(ownerTransferAllowed('owner', 'target', Date.now() - 6 * 60_000)).toBe(false);
    expect(ownerTransferAllowed('owner', 'owner', Date.now())).toBe(false);
  });

  test('owner cannot be granted through a staff invitation and authority expiry is fail-closed', () => {
    expect(invitationRole('owner')).toBe(null);
    expect(invitationRole('moderator')).toBe('moderator');
    expect(pendingAndUnexpired({ status: 'pending', expiresAt: new Date(Date.now() - 1).toISOString() })).toBe(false);
    expect(isFreshReauthentication(Date.now() - 6 * 60_000)).toBe(false);
  });

  test('Nafath readiness cannot be enabled by test configuration or a secret alone', () => {
    const missingAdapter = identityIntegrationRegistry({
      RABET_NAFATH_CLIENT_ID: 'configured', RABET_NAFATH_CLIENT_SECRET: 'configured',
      RABET_NAFATH_BASE_URL: 'https://sandbox.invalid', RABET_NAFATH_CALLBACK_URL: 'https://callback.invalid',
      RABET_NAFATH_JWK_CONFIGURED: 'true',
    }).nafath_rabet;
    expect(identityIntegrationMayEnable(missingAdapter)).toBe(false);
    expect(missingAdapter.status).toBe('waiting_for_activation');
  });
});