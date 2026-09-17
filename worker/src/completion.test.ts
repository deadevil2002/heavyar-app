import { describe, expect, test } from 'bun:test';
import {
  availabilityAllows, campaignRecipients, chunk, enabledConfiguredGateways,
  gatewayRegistry, hasPermission,
  ownerTransferAllowed, publicDriverProfile, rangesOverlap, transitionDriverRequest,
} from './completion';

describe('trusted completion primitives', () => {
  test('staff roles grant only their explicit permissions', () => {
    expect(hasPermission('marketing', 'marketing.campaign')).toBe(true);
    expect(hasPermission('marketing', 'finance.mutate')).toBe(false);
  });

  test('date overlap and availability checks are inclusive and bounded', () => {
    expect(rangesOverlap({ from: '2025-01-01', until: '2025-01-03' }, { from: '2025-01-03', until: '2025-01-04' })).toBe(true);
    expect(JSON.stringify(availabilityAllows({ from: '2025-01-01', until: '2025-12-31' }, { from: '2025-02-01', until: '2025-02-03' }))).toBe(JSON.stringify({ ok: true }));
    expect(availabilityAllows({ from: '2025-01-01', until: '2025-12-31', blocked: [{ from: '2025-02-02', until: '2025-02-04' }] }, { from: '2025-02-01', until: '2025-02-03' }).ok).toBe(false);
  });

  test('driver responses omit private contact fields', () => {
    const result = publicDriverProfile({ uid: 'd1', displayName: 'Driver', phone: '+966', email: 'private@example.test', city: 'Riyadh' });
    expect(JSON.stringify(result)).toBe(JSON.stringify({ uid: 'd1', displayName: 'Driver', city: 'Riyadh' }));
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
});