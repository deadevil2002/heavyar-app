import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  SERVICE_QUOTE_PAGE_MAX,
  SERVICE_RFQ_CAS_BOUNDARY,
  SERVICE_RFQ_PRODUCTION_ACTIVATION,
  SERVICE_RFQ_RUNTIME,
  ServiceRfqError,
  cancelTestOnlyRfq,
  createTestOnlyRfq,
  expireTestOnlyRfq,
  expireTestOnlyQuote,
  openTestOnlyRfq,
  oversightCanViewPrivateRfq,
  pageSyntheticQuoteSummaries,
  parseTestOnlyQuoteInput,
  parseTestOnlyRfqDraftInput,
  providerCanManageFutureQuote,
  provisionallySelectTestOnlyQuote,
  quoteVersionState,
  reviseTestOnlyQuote,
  submitTestOnlyQuote,
  withdrawTestOnlyQuote,
  type ActiveCustomerAuthority,
  type FutureProviderAuthority,
  type FutureOversightAuthority,
  type QuoteComparisonViewer,
} from './service-rfq';

const RFQ_ID = `rfq_${'R'.repeat(43)}`;
const QUOTE_A = `quote_${'A'.repeat(43)}`;
const QUOTE_B = `quote_${'B'.repeat(43)}`;
const CUSTOMER_UID = 'customer_12345678';
const PROVIDER_UID = 'provider_12345678';
const NOW = '2026-10-14T12:00:00.000Z';

const customer: ActiveCustomerAuthority = {
  actorUid: CUSTOMER_UID,
  role: 'customer',
  accountState: 'active',
  revoked: false,
  accountPurpose: 'standard',
};

const provider = (patch: Partial<FutureProviderAuthority> = {}): FutureProviderAuthority => ({
  actorUid: PROVIDER_UID,
  accountState: 'active',
  revoked: false,
  accountPurpose: 'standard',
  serviceKind: 'operator',
  principal: { kind: 'individual', providerUid: PROVIDER_UID },
  eligibility: { state: 'verified_eligible', source: 'future_authoritative_source' },
  ...patch,
});
const invitedProviders = [{ profileId: 'operator_12345678', principal: { kind: 'individual' as const, providerUid: PROVIDER_UID } }];

const oversight = (patch: Partial<FutureOversightAuthority> = {}): FutureOversightAuthority => ({
  actorUid: 'staff_12345678',
  firebaseAccountState: 'active',
  revoked: false,
  accountPurpose: 'standard',
  staffState: 'active',
  permissions: ['service_rfqs.view_private'],
  authoritySource: 'future_authoritative_live_staff',
  ...patch,
});

const customerViewer: QuoteComparisonViewer = { kind: 'customer', customer };

const operatorRequest = {
  clientDraftId: 'draft_12345678',
  contractVersion: 1,
  expectedRevision: null,
  equipmentSkill: 'excavators',
  requestedStartAt: '2026-11-01T05:00:00.000Z',
  requestedEndAt: '2026-11-01T14:00:00.000Z',
  matchingRegion: { countryCode: 'SA', region: 'riyadh' },
  workSite: { lat: 24.7136, lng: 46.6753, instructions: 'Private gate' },
  notes: 'Private customer requirements',
};

const transportRequest = {
  clientDraftId: 'draft_87654321',
  contractVersion: 1,
  expectedRevision: null,
  equipmentCategory: 'excavators',
  loadWeightKg: 10_000,
  loadDimensionsMm: { length: 8_000, width: 2_500, height: 3_000 },
  origin: { region: { countryCode: 'SA', region: 'riyadh' }, pin: { lat: 24.7136, lng: 46.6753, instructions: 'Private pickup' } },
  destination: { region: { countryCode: 'SA', region: 'eastern' }, pin: { lat: 26.4207, lng: 50.0888, instructions: 'Private delivery' } },
  requestedPickupWindow: { startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T07:00:00.000Z' },
  requestedDeliveryBy: '2026-11-02T14:00:00.000Z',
};

const operatorDraft = {
  contractVersion: 1,
  serviceKind: 'operator',
  preparedRequest: operatorRequest,
  expiresAt: '2026-11-05T12:00:00.000Z',
};

const validQuote = {
  contractVersion: 1,
  expectedQuoteRevision: null,
  serviceScope: 'Qualified excavator operator for the requested shift',
  schedule: { startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T13:00:00.000Z' },
  inclusions: ['Operator time', 'Basic PPE'],
  exclusions: ['Fuel', 'Equipment rental'],
  serviceCategory: 'excavators',
  availability: 'declared_available',
  currency: 'SAR',
  baseServicePriceMinor: 120_000,
  optionalComponents: [{ code: 'travel', label: 'Declared travel allowance', amountMinor: 10_000 }],
  expiresAt: '2026-10-20T12:00:00.000Z',
};

function openedOperatorRfq(...authorities: FutureProviderAuthority[]) {
  const invitedAuthorities = authorities.length > 0 ? authorities : [provider()];
  return openTestOnlyRfq(
    createTestOnlyRfq(operatorDraft, {
      rfqId: RFQ_ID,
      customer,
      invitedProviders: invitedAuthorities.map((authority, index) => ({
        profileId: `operator_${String(index + 1).padStart(8, '0')}`,
        principal: authority.principal,
      })),
      now: NOW,
    }),
    customer,
    0,
    'open-request-0001',
    '2026-10-14T12:01:00.000Z',
  );
}

function withQuote(id = QUOTE_A, authority = provider(), input: unknown = validQuote, additionalAuthorities: FutureProviderAuthority[] = []) {
  return submitTestOnlyQuote(openedOperatorRfq(authority, ...additionalAuthorities), input, {
    quoteId: id,
    authority,
    expectedRfqRevision: 1,
    idempotencyKey: `submit-${id.slice(-8)}`,
    now: '2026-10-14T12:02:00.000Z',
  });
}

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error('Expected error');
  } catch (error) {
    expect(error instanceof ServiceRfqError).toBe(true);
    expect((error as ServiceRfqError).code).toBe(code);
  }
}

describe('M2-D4 RFQ and quote foundation', () => {
  test('keeps Production activation disabled while exposing the source-only durable Worker boundary', () => {
    expect(SERVICE_RFQ_PRODUCTION_ACTIVATION).toBe('disabled_pending_commercial_and_regulatory_approval');
    expect(SERVICE_RFQ_RUNTIME).toBe('worker_authoritative_firestore_source_only');
    const index = fs.readFileSync(path.join(import.meta.dirname, 'index.ts'), 'utf8');
    expect(index).toContain("from './service-rfq'");
    expect(index).toContain("path === '/api/service-rfqs'");
    expect(index).toContain('serviceRfqActivationOverride !== true');
  });

  test('creates immutable operator and transporter RFQ drafts from existing prepared-request contracts', () => {
    const operator = createTestOnlyRfq(operatorDraft, { rfqId: RFQ_ID, customer, invitedProviders, now: NOW });
    expect(operator.rfq).toMatchObject({ serviceKind: 'operator', status: 'draft', version: 1, revision: 0, customerUid: CUSTOMER_UID });
    expect((operator.rfq.requirementsSnapshot.workSite as { lat: number }).lat).toBe(24.7136);
    expect(Object.isFrozen(operator.rfq.requirementsSnapshot)).toBe(true);
    const transporter = createTestOnlyRfq({
      contractVersion: 1,
      serviceKind: 'transporter',
      preparedRequest: transportRequest,
      expiresAt: '2026-11-05T12:00:00.000Z',
    }, { rfqId: `rfq_${'T'.repeat(43)}`, customer, invitedProviders: [{ profileId: 'transporter_12345678', principal: { kind: 'individual', providerUid: PROVIDER_UID } }], now: NOW });
    expect(transporter.rfq.serviceKind).toBe('transporter');
    expect((transporter.rfq.requirementsSnapshot.origin as { pin: { lat: number } }).pin.lat).toBe(24.7136);
    expect(parseTestOnlyRfqDraftInput({ ...operatorDraft, customerUid: 'forged' })).toBeNull();
    expect(parseTestOnlyRfqDraftInput({ ...operatorDraft, rfqId: RFQ_ID })).toBeNull();
    expect(() => createTestOnlyRfq(operatorDraft, { rfqId: 'forged', customer, invitedProviders, now: NOW })).toThrow('INVALID_RFQ');
  });

  test('strictly validates integer SAR quote components without financial-policy calculations', () => {
    expect(parseTestOnlyQuoteInput(validQuote)).toMatchObject({ baseServicePriceMinor: 120_000, currency: 'SAR' });
    expect(parseTestOnlyQuoteInput({ ...validQuote, providerUid: PROVIDER_UID })).toBeNull();
    expect(parseTestOnlyQuoteInput({ ...validQuote, baseServicePriceMinor: 1.5 })).toBeNull();
    expect(parseTestOnlyQuoteInput({ ...validQuote, baseServicePriceMinor: -1 })).toBeNull();
    expect(parseTestOnlyQuoteInput({ ...validQuote, currency: 'USD' })).toBeNull();
    expect(parseTestOnlyQuoteInput({ ...validQuote, optionalComponents: [{ code: 'tax', label: 'VAT', amountMinor: Number.MAX_SAFE_INTEGER }] })).toBeNull();
    expect(parseTestOnlyQuoteInput({ ...validQuote, inclusions: ['Fuel'], exclusions: ['fuel'] })).toBeNull();
    expectCode(() => submitTestOnlyQuote(openedOperatorRfq(), { ...validQuote, serviceCategory: 'cranes' }, {
      quoteId: QUOTE_A,
      authority: provider(),
      expectedRfqRevision: 1,
      idempotencyKey: 'mismatched-scope-01',
      now: '2026-10-14T12:02:00.000Z',
    }), 'QUOTE_SERVICE_MISMATCH');
  });

  test('requires live authoritative provider eligibility and a separate future commercial delegation', () => {
    expect(providerCanManageFutureQuote(provider(), 'operator')).toBe(true);
    expect(providerCanManageFutureQuote(provider({ revoked: true }), 'operator')).toBe(false);
    expect(providerCanManageFutureQuote(provider({ accountPurpose: 'store_review' }), 'operator')).toBe(false);
    expect(providerCanManageFutureQuote(provider({ eligibility: { state: 'unverified', source: 'self_declared' } }), 'operator')).toBe(false);
    const organization: FutureProviderAuthority = provider({
      actorUid: 'employee_12345678',
      principal: { kind: 'organization', organizationId: `org_${'O'.repeat(43)}` },
      organizationState: 'active',
      membership: { uid: 'employee_12345678', role: 'employee', status: 'active', operationalCapabilities: ['operators.manage'] },
    });
    expect(providerCanManageFutureQuote(organization, 'operator')).toBe(false);
    expect(providerCanManageFutureQuote({
      ...organization,
      commercialQuoteDelegation: { approvedByOwner: true, capability: 'operator_quotes.manage' },
    }, 'operator')).toBe(true);
    expect(providerCanManageFutureQuote({ ...organization, membership: { ...organization.membership!, role: 'owner' } }, 'operator')).toBe(true);
    expect(oversightCanViewPrivateRfq(oversight())).toBe(true);
    expect(oversightCanViewPrivateRfq(oversight({ staffState: 'revoked' }))).toBe(false);
    expectCode(() => submitTestOnlyQuote(openedOperatorRfq(), validQuote, {
      quoteId: QUOTE_A,
      authority: provider({ actorUid: 'forged_actor_123', principal: { kind: 'individual', providerUid: PROVIDER_UID } }),
      expectedRfqRevision: 1,
      idempotencyKey: 'forged-provider-01',
      now: '2026-10-14T12:02:00.000Z',
    }), 'PROVIDER_NOT_AUTHORIZED');
  });

  test('creates, revises, supersedes and preserves immutable quote snapshots with idempotent retries', () => {
    const opened = openedOperatorRfq();
    const first = submitTestOnlyQuote(opened, validQuote, {
      quoteId: QUOTE_A,
      authority: provider(),
      expectedRfqRevision: 1,
      idempotencyKey: 'submit-quote-0001',
      now: '2026-10-14T12:02:00.000Z',
    });
    expect(first.quotes[0].snapshots[0].quotedServicePriceMinor).toBe(130_000);
    expect(Object.isFrozen(first.quotes[0].snapshots[0])).toBe(true);
    expect(submitTestOnlyQuote(first, validQuote, {
      quoteId: QUOTE_A,
      authority: provider(),
      expectedRfqRevision: 1,
      idempotencyKey: 'submit-quote-0001',
      now: '2026-10-14T12:02:00.000Z',
    })).toBe(first);
    expectCode(() => submitTestOnlyQuote(first, { ...validQuote, baseServicePriceMinor: 119_000 }, {
      quoteId: QUOTE_A,
      authority: provider(),
      expectedRfqRevision: 1,
      idempotencyKey: 'submit-quote-0001',
      now: '2026-10-14T12:02:00.000Z',
    }), 'IDEMPOTENCY_CONFLICT');
    const originalSnapshot = first.quotes[0].snapshots[0];
    const revisedInput = { ...validQuote, expectedQuoteRevision: 0, baseServicePriceMinor: 110_000 };
    const revised = reviseTestOnlyQuote(first, QUOTE_A, revisedInput, {
      authority: provider(), expectedRfqRevision: 2, idempotencyKey: 'revise-quote-0001', now: '2026-10-14T12:03:00.000Z',
    });
    expect(revised.quotes[0].snapshots).toHaveLength(2);
    expect(revised.quotes[0].snapshots[0]).toBe(originalSnapshot);
    expect(revised.quotes[0].snapshots[1].quotedServicePriceMinor).toBe(120_000);
    expect(quoteVersionState(revised.quotes[0], 1)).toBe('superseded');
    expect(quoteVersionState(revised.quotes[0], 2)).toBe('active');
    expectCode(() => reviseTestOnlyQuote(revised, QUOTE_A, revisedInput, {
      authority: provider(), expectedRfqRevision: 2, idempotencyKey: 'revise-quote-stale', now: '2026-10-14T12:04:00.000Z',
    }), 'STALE_QUOTE_REVISION');
  });

  test('authorizes the live actor before every idempotent replay and scopes keys to actor, principal and RFQ', () => {
    const opened = openedOperatorRfq();
    expect(openTestOnlyRfq(opened, customer, 0, 'open-request-0001', '2026-10-14T12:01:00.000Z')).toBe(opened);
    expectCode(() => openTestOnlyRfq(opened, {
      ...customer,
      actorUid: 'unrelated_customer_123',
    }, 0, 'open-request-0001', '2026-10-14T12:01:00.000Z'), 'CUSTOMER_NOT_AUTHORIZED');
    expectCode(() => openTestOnlyRfq(opened, {
      ...customer,
      accountState: 'restricted',
    } as unknown as ActiveCustomerAuthority, 0, 'open-request-0001', '2026-10-14T12:01:00.000Z'), 'CUSTOMER_NOT_AUTHORIZED');

    const organizationId = `org_${'I'.repeat(43)}`;
    const firstEmployee = provider({
      actorUid: 'employee_first_1234',
      principal: { kind: 'organization', organizationId },
      organizationState: 'active',
      membership: { uid: 'employee_first_1234', role: 'employee', status: 'active', operationalCapabilities: [] },
      commercialQuoteDelegation: { approvedByOwner: true, capability: 'operator_quotes.manage' },
    });
    const organizationOpened = openedOperatorRfq(firstEmployee);
    const submitted = submitTestOnlyQuote(organizationOpened, validQuote, {
      quoteId: QUOTE_A,
      authority: firstEmployee,
      expectedRfqRevision: 1,
      idempotencyKey: 'organization-replay-01',
      now: '2026-10-14T12:02:00.000Z',
    });
    expect(submitTestOnlyQuote(submitted, validQuote, {
      quoteId: QUOTE_A,
      authority: firstEmployee,
      expectedRfqRevision: 1,
      idempotencyKey: 'organization-replay-01',
      now: '2026-10-14T12:02:00.000Z',
    })).toBe(submitted);

    const otherEmployee: FutureProviderAuthority = {
      ...firstEmployee,
      actorUid: 'employee_other_1234',
      membership: { ...firstEmployee.membership!, uid: 'employee_other_1234' },
    };
    expectCode(() => submitTestOnlyQuote(submitted, validQuote, {
      quoteId: QUOTE_A,
      authority: otherEmployee,
      expectedRfqRevision: 1,
      idempotencyKey: 'organization-replay-01',
      now: '2026-10-14T12:02:00.000Z',
    }), 'IDEMPOTENCY_ACTOR_MISMATCH');
    expectCode(() => submitTestOnlyQuote(submitted, validQuote, {
      quoteId: QUOTE_A,
      authority: { ...firstEmployee, membership: { ...firstEmployee.membership!, status: 'revoked' } },
      expectedRfqRevision: 1,
      idempotencyKey: 'organization-replay-01',
      now: '2026-10-14T12:02:00.000Z',
    }), 'PROVIDER_NOT_AUTHORIZED');
    expectCode(() => submitTestOnlyQuote(submitted, validQuote, {
      quoteId: QUOTE_A,
      authority: { ...firstEmployee, accountState: 'suspended' },
      expectedRfqRevision: 1,
      idempotencyKey: 'organization-replay-01',
      now: '2026-10-14T12:02:00.000Z',
    }), 'PROVIDER_NOT_AUTHORIZED');
  });

  test('supports withdrawal and expiry while rejecting stale or invalid lifecycle transitions', () => {
    const state = withQuote();
    const withdrawn = withdrawTestOnlyQuote(state, QUOTE_A, provider(), 2, 0, 'withdraw-quote-0001', '2026-10-14T12:04:00.000Z');
    expect(withdrawn.quotes[0].status).toBe('withdrawn');
    expectCode(() => withdrawTestOnlyQuote(withdrawn, QUOTE_A, provider(), 3, 1, 'withdraw-quote-0002', '2026-10-14T12:05:00.000Z'), 'QUOTE_NOT_ACTIVE');
    expectCode(() => expireTestOnlyQuote(state, QUOTE_A, provider(), 2, 0, 'expire-quote-early', '2026-10-15T12:00:00.000Z'), 'QUOTE_NOT_EXPIRED');
    const expired = expireTestOnlyQuote(state, QUOTE_A, provider(), 2, 0, 'expire-quote-0001', '2026-10-20T12:00:01.000Z');
    expect(expired.quotes[0].status).toBe('expired');
  });

  test('prevents cross-organization quote revision even for another active organization owner', () => {
    const organizationA: FutureProviderAuthority = provider({
      actorUid: 'owner_a_12345678',
      principal: { kind: 'organization', organizationId: `org_${'A'.repeat(43)}` },
      organizationState: 'active',
      membership: { uid: 'owner_a_12345678', role: 'owner', status: 'active', operationalCapabilities: [] },
    });
    const organizationB: FutureProviderAuthority = provider({
      actorUid: 'owner_b_12345678',
      principal: { kind: 'organization', organizationId: `org_${'B'.repeat(43)}` },
      organizationState: 'active',
      membership: { uid: 'owner_b_12345678', role: 'owner', status: 'active', operationalCapabilities: [] },
    });
    const state = withQuote(QUOTE_A, organizationA);
    expectCode(() => reviseTestOnlyQuote(state, QUOTE_A, { ...validQuote, expectedQuoteRevision: 0 }, {
      authority: organizationB,
      expectedRfqRevision: 2,
      idempotencyKey: 'cross-org-revise',
      now: '2026-10-14T12:03:00.000Z',
    }), 'PROVIDER_NOT_AUTHORIZED');
  });

  test('uses revision fencing for a single provisional selection and rechecks provider revocation', () => {
    const state = withQuote();
    expectCode(() => provisionallySelectTestOnlyQuote(state, QUOTE_A, customer, provider({ revoked: true }), 2, 'select-revoked-0001', '2026-10-14T12:04:00.000Z'), 'PROVIDER_AUTHORITY_REVOKED');
    const firstWinner = provisionallySelectTestOnlyQuote(state, QUOTE_A, customer, provider(), 2, 'select-quote-0001', '2026-10-14T12:04:00.000Z');
    expect(firstWinner.rfq.status).toBe('provisionally_selected');
    expect(firstWinner.provisionalSelection).toEqual({ quoteId: QUOTE_A, quoteVersion: 1, selectedAt: '2026-10-14T12:04:00.000Z' });
    expect(provisionallySelectTestOnlyQuote(firstWinner, QUOTE_A, customer, provider(), 2, 'select-quote-0001', '2026-10-14T12:04:00.000Z')).toBe(firstWinner);
    expectCode(() => provisionallySelectTestOnlyQuote(
      firstWinner, QUOTE_A, customer, provider({ revoked: true }), 2, 'select-quote-0001', '2026-10-14T12:04:00.000Z',
    ), 'PROVIDER_AUTHORITY_REVOKED');
    expectCode(() => provisionallySelectTestOnlyQuote(
      firstWinner,
      QUOTE_A,
      { ...customer, revoked: true } as unknown as ActiveCustomerAuthority,
      provider(),
      2,
      'select-quote-0001',
      '2026-10-14T12:04:00.000Z',
    ), 'CUSTOMER_NOT_AUTHORIZED');
    expectCode(() => provisionallySelectTestOnlyQuote(firstWinner, QUOTE_A, customer, provider(), 2, 'select-race-0002', '2026-10-14T12:04:01.000Z'), 'STALE_RFQ_REVISION');
    expect('booking' in firstWinner).toBe(false);
    expect('payment' in firstWinner).toBe(false);
    expect('dispatch' in firstWinner).toBe(false);
    expect('notifications' in firstWinner).toBe(false);
  });

  test('rejects expired and withdrawn selection and never selects a superseded quote snapshot', () => {
    const active = withQuote();
    expectCode(() => provisionallySelectTestOnlyQuote(
      active, QUOTE_A, customer, provider(), 2, 'select-expired-0001', '2026-10-20T12:00:00.000Z',
    ), 'QUOTE_EXPIRED');

    const withdrawn = withdrawTestOnlyQuote(
      active, QUOTE_A, provider(), 2, 0, 'withdraw-before-select', '2026-10-14T12:04:00.000Z',
    );
    expectCode(() => provisionallySelectTestOnlyQuote(
      withdrawn, QUOTE_A, customer, provider(), 3, 'select-withdrawn-01', '2026-10-14T12:05:00.000Z',
    ), 'INVALID_SELECTION_TRANSITION');

    const revised = reviseTestOnlyQuote(active, QUOTE_A, {
      ...validQuote,
      expectedQuoteRevision: 0,
      baseServicePriceMinor: 110_000,
    }, {
      authority: provider(),
      expectedRfqRevision: 2,
      idempotencyKey: 'revise-before-select',
      now: '2026-10-14T12:03:00.000Z',
    });
    expect(quoteVersionState(revised.quotes[0], 1)).toBe('superseded');
    const selected = provisionallySelectTestOnlyQuote(
      revised, QUOTE_A, customer, provider(), 3, 'select-current-version', '2026-10-14T12:04:00.000Z',
    );
    expect(selected.provisionalSelection?.quoteVersion).toBe(2);
  });

  test('documents transactional CAS while each deterministic aggregate permits one provisional selection', () => {
    const secondAuthority = provider({ actorUid: 'provider_87654321', principal: { kind: 'individual', providerUid: 'provider_87654321' } });
    let base = withQuote(QUOTE_A, provider(), validQuote, [secondAuthority]);
    base = submitTestOnlyQuote(base, {
      ...validQuote,
      baseServicePriceMinor: 90_000,
      optionalComponents: [],
      serviceScope: 'Second synthetic operator proposal',
    }, {
      quoteId: QUOTE_B,
      authority: secondAuthority,
      expectedRfqRevision: 2,
      idempotencyKey: 'submit-cas-quote-b',
      now: '2026-10-14T12:03:00.000Z',
    });

    const branchA = provisionallySelectTestOnlyQuote(
      base, QUOTE_A, customer, provider(), 3, 'select-cas-branch-a', '2026-10-14T12:04:00.000Z',
    );
    const branchB = provisionallySelectTestOnlyQuote(
      base, QUOTE_B, customer, secondAuthority, 3, 'select-cas-branch-b', '2026-10-14T12:04:00.000Z',
    );
    expect(branchA.provisionalSelection?.quoteId).toBe(QUOTE_A);
    expect(branchB.provisionalSelection?.quoteId).toBe(QUOTE_B);
    expect([branchA.provisionalSelection].filter(Boolean)).toHaveLength(1);
    expect([branchB.provisionalSelection].filter(Boolean)).toHaveLength(1);
    expectCode(() => provisionallySelectTestOnlyQuote(
      branchA, QUOTE_B, customer, secondAuthority, 3, 'select-cas-sequential', '2026-10-14T12:04:01.000Z',
    ), 'STALE_RFQ_REVISION');
    expect(SERVICE_RFQ_CAS_BOUNDARY).toBe('firestore_transaction_required');
  });

  test('keeps cancellation non-binding and rejects cancellation after provisional selection', () => {
    const open = openedOperatorRfq();
    const cancelled = cancelTestOnlyRfq(open, customer, 1, 'cancel-rfq-0001', '2026-10-14T12:02:00.000Z');
    expect(cancelled.rfq.status).toBe('cancelled');
    const selected = provisionallySelectTestOnlyQuote(withQuote(), QUOTE_A, customer, provider(), 2, 'select-before-cancel', '2026-10-14T12:04:00.000Z');
    expectCode(() => cancelTestOnlyRfq(selected, customer, 3, 'cancel-selected-0001', '2026-10-14T12:05:00.000Z'), 'INVALID_RFQ_TRANSITION');
    const expired = expireTestOnlyRfq(openedOperatorRfq(), 1, '2026-11-05T12:00:00.000Z');
    expect(expired.rfq.status).toBe('expired');
    expectCode(() => expireTestOnlyRfq(openedOperatorRfq(), 1, '2026-10-15T12:00:00.000Z'), 'INVALID_RFQ_TRANSITION');
  });

  test('builds bounded stable sanitized comparison pages without N+1 enrichment or private locations', () => {
    const secondAuthority = provider({ actorUid: 'provider_87654321', principal: { kind: 'individual', providerUid: 'provider_87654321' } });
    let state = withQuote(QUOTE_A, provider(), validQuote, [secondAuthority]);
    state = submitTestOnlyQuote(state, { ...validQuote, baseServicePriceMinor: 90_000, optionalComponents: [], serviceScope: 'Second synthetic operator proposal' }, {
      quoteId: QUOTE_B,
      authority: secondAuthority,
      expectedRfqRevision: 2,
      idempotencyKey: 'submit-quote-b001',
      now: '2026-10-14T12:03:00.000Z',
    });
    const first = pageSyntheticQuoteSummaries(state, customerViewer, { limit: 1, now: '2026-10-14T12:04:00.000Z' });
    expect(first.quotes).toHaveLength(1);
    expect(first.quotes[0].quoteId).toBe(QUOTE_B);
    expect(typeof first.nextCursor).toBe('string');
    const second = pageSyntheticQuoteSummaries(state, customerViewer, { limit: 1, cursor: first.nextCursor!, now: '2026-10-14T12:04:00.000Z' });
    expect(second.quotes.map(item => item.quoteId)).toEqual([QUOTE_A]);
    expect(JSON.stringify([...first.quotes, ...second.quotes])).not.toMatch(/customerUid|providerUid|organizationId|workSite|origin|destination|lat|lng|Private gate/);
    expect(() => pageSyntheticQuoteSummaries(state, customerViewer, { limit: SERVICE_QUOTE_PAGE_MAX + 1, now: NOW })).toThrow('INVALID_COMPARISON_PAGE');
    expect(() => pageSyntheticQuoteSummaries(state, customerViewer, { limit: 1, cursor: `${first.nextCursor}forged`, now: NOW })).toThrow('INVALID_COMPARISON_PAGE');
  });

  test('requires the live RFQ customer or explicit authoritative staff for every quote comparison', () => {
    const state = withQuote();
    const own = pageSyntheticQuoteSummaries(state, customerViewer, { now: '2026-10-14T12:04:00.000Z' });
    expect(own.quotes[0]).toMatchObject({
      quoteId: QUOTE_A,
      baseServicePriceMinor: 120_000,
      quotedServicePriceMinor: 130_000,
    });
    expect(JSON.stringify(own)).not.toMatch(/customerUid|providerUid|organizationId|principal|actorUid|workSite|lat|lng/);

    const unrelatedCustomer: QuoteComparisonViewer = {
      kind: 'customer',
      customer: { ...customer, actorUid: 'unrelated_customer_123' },
    };
    expectCode(() => pageSyntheticQuoteSummaries(state, unrelatedCustomer, { now: NOW }), 'CUSTOMER_NOT_AUTHORIZED');
    expectCode(() => pageSyntheticQuoteSummaries(state, undefined, { now: NOW }), 'COMPARISON_VIEWER_NOT_AUTHORIZED');
    expectCode(() => pageSyntheticQuoteSummaries(
      state,
      { kind: 'provider', authority: provider() } as unknown as QuoteComparisonViewer,
      { now: NOW },
    ), 'COMPARISON_VIEWER_NOT_AUTHORIZED');
    expectCode(() => pageSyntheticQuoteSummaries(
      state,
      { kind: 'organization_employee', actorUid: 'employee_12345678' } as unknown as QuoteComparisonViewer,
      { now: NOW },
    ), 'COMPARISON_VIEWER_NOT_AUTHORIZED');
    for (const invalidCustomer of [
      { ...customer, revoked: true },
      { ...customer, accountState: 'suspended' },
      { ...customer, accountPurpose: 'store_review' },
    ]) {
      expectCode(() => pageSyntheticQuoteSummaries(
        state,
        { kind: 'customer', customer: invalidCustomer as unknown as ActiveCustomerAuthority },
        { now: NOW },
      ), 'CUSTOMER_NOT_AUTHORIZED');
    }

    expect(pageSyntheticQuoteSummaries(
      state,
      { kind: 'oversight', staff: oversight() },
      { now: NOW },
    ).quotes).toHaveLength(1);
    for (const invalidStaff of [
      oversight({ firebaseAccountState: 'disabled' }),
      oversight({ revoked: true }),
      oversight({ staffState: 'revoked' }),
      oversight({ accountPurpose: 'store_review' }),
      oversight({ permissions: [] }),
    ]) {
      expectCode(() => pageSyntheticQuoteSummaries(
        state,
        { kind: 'oversight', staff: invalidStaff },
        { now: NOW },
      ), 'COMPARISON_VIEWER_NOT_AUTHORIZED');
    }
  });

  test('keeps operator and transporter requirements distinct', () => {
    const transportAuthority = provider({ serviceKind: 'transporter' });
    const transport = openTestOnlyRfq(createTestOnlyRfq({
      contractVersion: 1,
      serviceKind: 'transporter',
      preparedRequest: transportRequest,
      expiresAt: '2026-11-05T12:00:00.000Z',
    }, { rfqId: `rfq_${'T'.repeat(43)}`, customer, invitedProviders: [{ profileId: 'transporter_12345678', principal: { kind: 'individual', providerUid: PROVIDER_UID } }], now: NOW }), customer, 0, 'open-transport-01', '2026-10-14T12:01:00.000Z');
    const transportQuote = {
      ...validQuote,
      serviceScope: 'Lowbed transport for the declared load only',
      schedule: { startAt: '2026-11-01T06:00:00.000Z', endAt: '2026-11-02T12:00:00.000Z' },
      serviceCategory: 'lowbed',
    };
    const quoted = submitTestOnlyQuote(transport, transportQuote, {
      quoteId: QUOTE_A, authority: transportAuthority, expectedRfqRevision: 1, idempotencyKey: 'submit-transport-01', now: '2026-10-14T12:02:00.000Z',
    });
    expect(quoted.quotes[0].serviceKind).toBe('transporter');
    expectCode(() => submitTestOnlyQuote(openedOperatorRfq(), validQuote, {
      quoteId: QUOTE_A, authority: transportAuthority, expectedRfqRevision: 1, idempotencyKey: 'wrong-service-0001', now: '2026-10-14T12:02:00.000Z',
    }), 'PROVIDER_NOT_AUTHORIZED');
  });
});
