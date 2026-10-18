import { describe, expect, test } from 'bun:test';
import {
  SERVICE_CONTRACT_TEST_TERMS_VERSION,
  acceptTestOnlyServiceContract,
  cancelTestOnlyServiceContract,
  expireTestOnlyServiceContract,
  isServiceContractAggregate,
  serviceContractPrivateView,
  type ServiceContractAggregate,
} from './service-contract';
import {
  createTestOnlyRfq,
  openTestOnlyRfq,
  provisionallySelectTestOnlyQuote,
  submitTestOnlyQuote,
  withdrawTestOnlyQuote,
  type ActiveCustomerAuthority,
  type FutureProviderAuthority,
} from './service-rfq';

const customer: ActiveCustomerAuthority = {
  actorUid: 'customer-contract-0001', role: 'customer', accountState: 'active', revoked: false, accountPurpose: 'standard',
};
const provider: FutureProviderAuthority = {
  actorUid: 'provider-contract-0001', accountState: 'active', revoked: false, accountPurpose: 'standard', serviceKind: 'operator',
  principal: { kind: 'individual', providerUid: 'provider-contract-0001' },
  eligibility: { state: 'verified_eligible', source: 'future_authoritative_source' },
};
const CONTRACT_ID = `contract_${'C'.repeat(43)}`;
const RFQ_ID = `rfq_${'R'.repeat(43)}`;
const QUOTE_ID = `quote_${'Q'.repeat(43)}`;
const TERMS = SERVICE_CONTRACT_TEST_TERMS_VERSION;
const T0 = '2026-10-18T08:00:00.000Z';
const T1 = '2026-10-18T08:01:00.000Z';
const T2 = '2026-10-18T08:02:00.000Z';

function selectedRfq() {
  let rfq = createTestOnlyRfq({
    contractVersion: 1,
    serviceKind: 'operator',
    preparedRequest: {
      clientDraftId: 'draft-contract-0001', contractVersion: 1, expectedRevision: null, equipmentSkill: 'excavators',
      requestedStartAt: '2026-10-20T08:00:00.000Z', requestedEndAt: '2026-10-20T16:00:00.000Z',
      matchingRegion: { countryCode: 'SA', region: 'riyadh' }, workSite: { lat: 24.7, lng: 46.6 },
    },
    expiresAt: '2026-10-22T08:00:00.000Z',
  }, {
    rfqId: RFQ_ID, customer, invitedProviders: [{ profileId: 'operator_profile_0001', principal: provider.principal }], now: T0,
  });
  rfq = openTestOnlyRfq(rfq, customer, 0, 'open-contract-0001', T0);
  rfq = submitTestOnlyQuote(rfq, {
    contractVersion: 1, expectedQuoteRevision: null, serviceScope: 'Qualified operator for the selected shift',
    schedule: { startAt: '2026-10-20T08:00:00.000Z', endAt: '2026-10-20T16:00:00.000Z' },
    inclusions: ['Operator time'], exclusions: ['Equipment rental'], serviceCategory: 'excavators',
    availability: 'declared_available', currency: 'SAR', baseServicePriceMinor: 125_000,
    optionalComponents: [{ code: 'travel', label: 'Travel', amountMinor: 5_000 }], expiresAt: '2026-10-19T08:00:00.000Z',
  }, { quoteId: QUOTE_ID, authority: provider, expectedRfqRevision: 1, idempotencyKey: 'quote-contract-0001', now: T0 });
  return provisionallySelectTestOnlyQuote(rfq, QUOTE_ID, customer, provider, 2, 'select-contract-0001', T0);
}

function accept(
  existing: ServiceContractAggregate | null,
  actorRole: 'customer' | 'provider',
  expectedContractRevision: number,
  idempotencyKey: string,
  now = T1,
  overrides: Partial<Parameters<typeof acceptTestOnlyServiceContract>[2]> = {},
) {
  return acceptTestOnlyServiceContract(existing, selectedRfq(), {
    contractId: CONTRACT_ID, actorRole, actorUid: actorRole === 'customer' ? customer.actorUid : provider.actorUid,
    customer, provider, quoteId: QUOTE_ID, quoteVersion: 1, termsVersion: TERMS,
    expectedContractRevision, idempotencyKey, now, ...overrides,
  });
}

describe('Launch Packet 1 immutable service contract acceptance', () => {
  test('records customer then provider consent against one exact snapshot and stops at pending payment', () => {
    const first = accept(null, 'customer', 0, 'accept-customer-0001');
    const snapshot = JSON.stringify(first.snapshot);
    const complete = accept(first, 'provider', 1, 'accept-provider-0001', T2);
    expect(complete.status).toBe('pending_payment');
    expect(complete.customerAcceptance?.actorUid).toBe(customer.actorUid);
    expect(complete.providerAcceptance?.actorUid).toBe(provider.actorUid);
    expect(complete.snapshot.quoteSnapshot.quotedServicePriceMinor).toBe(130_000);
    expect(complete.snapshot.quoteSnapshot.currency).toBe('SAR');
    expect(JSON.stringify(complete.snapshot)).toBe(snapshot);
    expect(complete.paymentState).toBe('not_verified');
    expect(complete.bookingState).toBe('not_confirmed');
    expect(complete.executionAuthorized).toBe(false);
    expect(complete.settlementEnabled).toBe(false);
    expect(isServiceContractAggregate(complete)).toBe(true);
  });

  test('supports the opposite acceptance order without converting provisional selection silently', () => {
    const first = accept(null, 'provider', 0, 'accept-provider-0002');
    expect(first.status).toBe('awaiting_acceptances');
    expect(first.customerAcceptance).toBeNull();
    const complete = accept(first, 'customer', 1, 'accept-customer-0002', T2);
    expect(complete.status).toBe('pending_payment');
  });

  test('is actor-bound idempotent and rejects stale, conflicting, or duplicate acceptance', () => {
    const first = accept(null, 'customer', 0, 'accept-customer-0003');
    expect(accept(first, 'customer', 0, 'accept-customer-0003')).toBe(first);
    expect(() => accept(first, 'customer', 1, 'accept-customer-0003')).toThrow();
    expect(() => accept(first, 'customer', 0, 'accept-customer-other')).toThrow('STALE_CONTRACT_REVISION');
    expect(() => accept(first, 'customer', 1, 'accept-customer-other')).toThrow('CONTRACT_ALREADY_ACCEPTED');
  });

  test('rejects mismatched quote, version, terms, and actor identity', () => {
    expect(() => accept(null, 'customer', 0, 'accept-mismatch-0001', T1, { quoteId: `quote_${'X'.repeat(43)}` })).toThrow('CONTRACT_SELECTION_MISMATCH');
    expect(() => accept(null, 'customer', 0, 'accept-mismatch-0002', T1, { quoteVersion: 2 })).toThrow('CONTRACT_SELECTION_MISMATCH');
    expect(() => accept(null, 'customer', 0, 'accept-mismatch-0003', T1, { termsVersion: 'owner-terms-v1' })).toThrow('INVALID_CONTRACT_ACCEPTANCE');
    expect(() => accept(null, 'customer', 0, 'accept-mismatch-0004', T1, { actorUid: provider.actorUid })).toThrow('CONTRACT_ACTOR_NOT_AUTHORIZED');
  });

  test('rejects suspended, revoked, unverified, and wrong-account providers', () => {
    for (const authority of [
      { ...provider, accountState: 'suspended' as const },
      { ...provider, revoked: true },
      { ...provider, eligibility: { state: 'unverified' as const, source: 'self_declared' as const } },
      { ...provider, actorUid: 'provider-contract-wrong', principal: { kind: 'individual' as const, providerUid: 'provider-contract-wrong' } },
    ]) {
      expect(() => accept(null, 'provider', 0, `reject-provider-${authority.actorUid}`, T1, { provider: authority, actorUid: authority.actorUid }))
        .toThrow('CONTRACT_PROVIDER_NOT_AUTHORIZED');
    }
  });

  test('rejects expired or withdrawn selected quotations and stale snapshots', () => {
    expect(() => accept(null, 'customer', 0, 'accept-expired-0001', '2026-10-19T08:00:00.000Z')).toThrow('CONTRACT_QUOTE_EXPIRED');
    const selected = selectedRfq();
    const withdrawn = withdrawTestOnlyQuote(selected, QUOTE_ID, provider, selected.rfq.revision, 0, 'withdraw-selected-0001', T1);
    expect(() => acceptTestOnlyServiceContract(null, withdrawn, {
      contractId: CONTRACT_ID, actorRole: 'provider', actorUid: provider.actorUid, customer, provider,
      quoteId: QUOTE_ID, quoteVersion: 1, termsVersion: TERMS, expectedContractRevision: 0,
      idempotencyKey: 'accept-withdrawn-0001', now: T2,
    })).toThrow('CONTRACT_QUOTE_NOT_ACTIVE');
    const first = accept(null, 'customer', 0, 'accept-stale-0001');
    const altered = { ...selectedRfq(), rfq: { ...selectedRfq().rfq, requirementsSnapshot: { equipmentSkill: 'cranes' } } };
    expect(() => acceptTestOnlyServiceContract(first, altered, {
      contractId: CONTRACT_ID, actorRole: 'provider', actorUid: provider.actorUid, customer, provider,
      quoteId: QUOTE_ID, quoteVersion: 1, termsVersion: TERMS, expectedContractRevision: 1,
      idempotencyKey: 'accept-stale-provider-0001', now: T2,
    })).toThrow('CONTRACT_SNAPSHOT_STALE');
  });

  test('preserves immutable snapshot and audit evidence on cancellation and expiry', () => {
    const first = accept(null, 'customer', 0, 'accept-before-cancel-0001');
    const cancelled = cancelTestOnlyServiceContract(first, selectedRfq(), {
      actorRole: 'provider', actorUid: provider.actorUid, customer, provider, expectedContractRevision: 1,
      idempotencyKey: 'cancel-contract-0001', now: T2,
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.snapshot).toBe(first.snapshot);
    const waiting = accept(null, 'provider', 0, 'accept-before-expire-0001');
    const expired = expireTestOnlyServiceContract(waiting, '2026-10-19T08:00:00.000Z');
    expect(expired.status).toBe('expired');
    expect(expired.providerAcceptance).toEqual(waiting.providerAcceptance);
  });

  test('private view excludes actor identities and never claims payment, booking, signing, or execution', () => {
    const complete = accept(accept(null, 'customer', 0, 'accept-view-customer'), 'provider', 1, 'accept-view-provider', T2);
    const view = serviceContractPrivateView(complete, 'customer');
    expect(JSON.stringify(view)).not.toContain(customer.actorUid);
    expect(JSON.stringify(view)).not.toContain(provider.actorUid);
    expect(view.status).toBe('pending_payment');
    expect(view.paymentState).toBe('not_verified');
    expect(view.legallyBinding).toBe(false);
    expect(view.productionEnabled).toBe(false);
  });
});
