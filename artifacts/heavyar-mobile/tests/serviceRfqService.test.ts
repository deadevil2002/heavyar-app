import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/services/workerClient';
import {
  acceptServiceContract,
  createServiceRfq,
  decodeServiceContractView,
  decodeServiceRfqDetail,
  decodeServiceRfqList,
  ServiceRfqScopeGuard,
  submitServiceQuote,
} from '@/services/serviceRfqService';

vi.mock('@/services/workerClient', () => ({
  request: vi.fn(),
  WorkerError: class WorkerError extends Error {
    status: number; code: string;
    constructor(message: string, status = 500, code = 'WORKER_ERROR') { super(message); this.status = status; this.code = code; }
  },
}));

const mockedRequest = vi.mocked(request);
const RFQ_ID = `rfq_${'R'.repeat(43)}`;
const QUOTE_ID = `quote_${'Q'.repeat(43)}`;
const quote = {
  quoteId: QUOTE_ID, quoteVersion: 1, serviceKind: 'operator', serviceScope: 'Qualified operator service',
  schedule: { startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T13:00:00.000Z' }, inclusions: ['Operator time'],
  exclusions: ['Equipment rental'], serviceCategory: 'excavators', availability: 'declared_available', currency: 'SAR',
  baseServicePriceMinor: 120_000, optionalComponents: [], quotedServicePriceMinor: 120_000, expiresAt: '2026-10-20T12:00:00.000Z',
  status: 'active', eligibility: 'verified_by_future_authoritative_source',
};
const summary = {
  rfqId: RFQ_ID, serviceKind: 'operator', status: 'collecting_test_proposals', revision: 2, quoteCount: 1,
  createdAt: '2026-10-15T08:00:00.000Z', updatedAt: '2026-10-15T08:02:00.000Z', expiresAt: '2026-10-20T08:00:00.000Z',
};
const detail = {
  success: true, access: 'customer', rfq: { ...summary, requirementsSnapshot: { equipmentSkill: 'excavators' },
    targetProfileIds: ['operator_profile_0001'], provisionalSelection: null },
  comparison: { contractVersion: 1, rfqId: RFQ_ID, rfqVersion: 1, serviceKind: 'operator', quotes: [quote], nextCursor: null },
};

describe('M2-E1 mobile durable RFQ boundary', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('strictly decodes private details and rejects identity/location leakage in quote projections', () => {
    expect(decodeServiceRfqDetail(detail).comparison.quotes[0].quotedServicePriceMinor).toBe(120_000);
    expect(() => decodeServiceRfqDetail({ ...detail, comparison: { ...detail.comparison, quotes: [{ ...quote, providerUid: 'private' }] } })).toThrow();
    expect(() => decodeServiceRfqDetail({ ...detail, rfq: { ...detail.rfq, customerUid: 'private' } })).toThrow();
    expect(() => decodeServiceRfqList({ success: true, rfqs: [{ ...summary, ownerUid: 'private' }], nextCursor: null })).toThrow();
  });

  it('uses bounded authenticated Worker contracts without client-supplied actor identities', async () => {
    mockedRequest.mockResolvedValue(detail);
    const preparedRequest = {
      clientDraftId: 'draft_12345678', contractVersion: 1 as const, expectedRevision: null, equipmentSkill: 'excavators',
      requestedStartAt: '2026-11-01T05:00:00.000Z', requestedEndAt: '2026-11-01T13:00:00.000Z',
      matchingRegion: { countryCode: 'SA' as const, region: 'riyadh' }, workSite: { lat: 24.7, lng: 46.6 },
    };
    await createServiceRfq({ contractVersion: 1, serviceKind: 'operator', preparedRequest, expiresAt: '2026-10-20T08:00:00.000Z' },
      ['operator_profile_0001'], 'create:bounded-0001', 'customer-uid');
    expect(mockedRequest).toHaveBeenCalledWith('/api/service-rfqs', expect.objectContaining({ method: 'POST' }), true, 'customer-uid');
    const createBody = JSON.parse(String(mockedRequest.mock.calls[0][1]?.body));
    expect(createBody).not.toHaveProperty('customerUid');
    expect(createBody).not.toHaveProperty('providerUid');

    await submitServiceQuote(RFQ_ID, {
      contractVersion: 1, expectedQuoteRevision: null, serviceScope: quote.serviceScope, schedule: quote.schedule,
      inclusions: quote.inclusions, exclusions: quote.exclusions, serviceCategory: quote.serviceCategory,
      availability: 'declared_available', currency: 'SAR', baseServicePriceMinor: quote.baseServicePriceMinor,
      optionalComponents: [], expiresAt: quote.expiresAt,
    }, 2, 'submit:bounded-0001', 'provider-uid');
    const quoteBody = JSON.parse(String(mockedRequest.mock.calls[1][1]?.body));
    expect(quoteBody).not.toHaveProperty('providerUid');
    expect(quoteBody.quote.baseServicePriceMinor).toBe(120_000);
  });

  it('invalidates in-flight results across account changes', () => {
    const guard = new ServiceRfqScopeGuard();
    const customer = guard.begin('customer-a');
    const provider = guard.begin('provider-b');
    expect(customer.signal.aborted).toBe(true);
    expect(guard.isCurrent(customer)).toBe(false);
    expect(guard.isCurrent(provider)).toBe(true);
    guard.cancel();
    expect(guard.isCurrent(provider)).toBe(false);
  });

  it('strictly decodes a private pending-payment contract without accepting identities or payment claims', () => {
    const contract = {
      contractVersion: 1, contractId: `contract_${'C'.repeat(43)}`, rfqId: RFQ_ID, rfqRevisionAtSelection: 3, serviceKind: 'operator',
      status: 'pending_payment', revision: 2, participantRole: 'customer',
      selectedQuote: {
        quoteId: QUOTE_ID, quoteVersion: 1, serviceScope: quote.serviceScope, schedule: quote.schedule,
        inclusions: quote.inclusions, exclusions: quote.exclusions, currency: 'SAR', quotedServicePriceMinor: 120_000,
        expiresAt: quote.expiresAt,
      },
      requirementsSnapshot: { equipmentSkill: 'excavators', workSite: { lat: 24.7, lng: 46.6 } },
      terms: { version: 'synthetic-local-test-v1', source: 'synthetic_local_test_only', approvedForProduction: false },
      customerAcceptance: { acceptedAt: '2026-10-18T08:00:00.000Z', termsVersion: 'synthetic-local-test-v1' },
      providerAcceptance: { acceptedAt: '2026-10-18T08:01:00.000Z', termsVersion: 'synthetic-local-test-v1' },
      paymentState: 'not_verified', bookingState: 'not_confirmed', executionAuthorized: false, settlementEnabled: false,
      createdAt: '2026-10-18T08:00:00.000Z', updatedAt: '2026-10-18T08:01:00.000Z',
      acceptanceExpiresAt: quote.expiresAt, productionEnabled: false, legallyBinding: false,
    };
    expect(decodeServiceContractView(contract)?.selectedQuote.quotedServicePriceMinor).toBe(120_000);
    expect(() => decodeServiceContractView({ ...contract, customerUid: 'private-identity' })).toThrow();
    expect(() => decodeServiceContractView({ ...contract, paymentState: 'verified' })).toThrow();
    expect(() => decodeServiceContractView({ ...contract, executionAuthorized: true })).toThrow();
    expect(() => decodeServiceContractView({ ...contract, status: 'pending_payment', providerAcceptance: null })).toThrow();
  });

  it('submits only selected identifiers, terms version, revision, and idempotency key', async () => {
    mockedRequest.mockResolvedValue({ ...detail, contract: null, rfq: {
      ...detail.rfq, status: 'provisionally_selected', provisionalSelection: { quoteId: QUOTE_ID, quoteVersion: 1, selectedAt: '2026-10-18T08:00:00.000Z' },
    } });
    await acceptServiceContract(RFQ_ID, QUOTE_ID, 1, 0, 'accept-contract-0001', 'customer-uid');
    const call = mockedRequest.mock.calls[0];
    expect(call[0]).toBe(`/api/service-rfqs/${RFQ_ID}/contract/accept`);
    const body = JSON.parse(String(call[1]?.body));
    expect(body).toEqual({
      quoteId: QUOTE_ID, quoteVersion: 1, termsVersion: 'synthetic-local-test-v1', expectedContractRevision: 0,
      idempotencyKey: 'accept-contract-0001',
    });
    expect(body).not.toHaveProperty('amount');
    expect(body).not.toHaveProperty('actorUid');
  });
});
