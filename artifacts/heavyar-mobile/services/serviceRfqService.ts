import type { OperatorRequestDraft } from './operatorService';
import type { TransportRequestDraft } from './transporterService';
import { request, WorkerError } from './workerClient';
import {
  decodeSyntheticQuoteComparisonPage,
  QuoteComparisonScopeGuard,
  type ServiceQuoteComparisonPage,
} from './serviceQuoteComparison';

export type ServiceRfqStatus = 'draft' | 'collecting_test_proposals' | 'provisionally_selected' | 'cancelled' | 'expired';
export type ServiceRfqSummary = {
  rfqId: string;
  serviceKind: 'operator' | 'transporter';
  status: ServiceRfqStatus;
  revision: number;
  quoteCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
export type ServiceRfqDetail = {
  access: 'customer' | 'provider';
  rfq: ServiceRfqSummary & {
    requirementsSnapshot: Readonly<Record<string, unknown>>;
    targetProfileIds: readonly string[];
    provisionalSelection: null | { quoteId: string; quoteVersion: number; selectedAt: string };
  };
  comparison: ServiceQuoteComparisonPage;
  contract: ServiceContractView | null;
};
export type ServiceContractView = {
  contractVersion: 1;
  contractId: string;
  rfqId: string;
  rfqRevisionAtSelection: number;
  serviceKind: 'operator' | 'transporter';
  status: 'awaiting_acceptances' | 'pending_payment' | 'cancelled' | 'expired';
  revision: number;
  participantRole: 'customer' | 'provider';
  selectedQuote: {
    quoteId: string;
    quoteVersion: number;
    serviceScope: string;
    schedule: { startAt: string; endAt: string };
    inclusions: readonly string[];
    exclusions: readonly string[];
    currency: 'SAR';
    quotedServicePriceMinor: number;
    expiresAt: string;
  };
  requirementsSnapshot: Readonly<Record<string, unknown>>;
  terms: { version: 'synthetic-local-test-v1'; source: 'synthetic_local_test_only'; approvedForProduction: false };
  customerAcceptance: null | { acceptedAt: string; termsVersion: 'synthetic-local-test-v1' };
  providerAcceptance: null | { acceptedAt: string; termsVersion: 'synthetic-local-test-v1' };
  paymentState: 'not_verified';
  bookingState: 'not_confirmed';
  executionAuthorized: false;
  settlementEnabled: false;
  createdAt: string;
  updatedAt: string;
  acceptanceExpiresAt: string;
  productionEnabled: false;
  legallyBinding: false;
};
export type ServiceQuoteDraft = {
  contractVersion: 1;
  expectedQuoteRevision: number | null;
  serviceScope: string;
  schedule: { startAt: string; endAt: string };
  inclusions: string[];
  exclusions: string[];
  serviceCategory: string;
  availability: 'declared_available' | 'declared_limited';
  currency: 'SAR';
  baseServicePriceMinor: number;
  optionalComponents: { code: string; label: string; amountMinor: number }[];
  expiresAt: string;
};
export type ServiceRfqDraft =
  | { contractVersion: 1; serviceKind: 'operator'; preparedRequest: OperatorRequestDraft; expiresAt: string }
  | { contractVersion: 1; serviceKind: 'transporter'; preparedRequest: TransportRequestDraft; expiresAt: string };

const SAFE_RFQ_ID = /^rfq_[A-Za-z0-9_-]{43}$/;
const SAFE_CONTRACT_ID = /^contract_[A-Za-z0-9_-]{43}$/;
const SAFE_QUOTE_ID = /^quote_[A-Za-z0-9_-]{43}$/;
const SAFE_PROFILE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function iso(value: unknown) {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}
function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}
function acceptance(value: unknown) {
  if (value === null) return null;
  const raw = record(value);
  if (!raw || !onlyKeys(raw, ['acceptedAt', 'termsVersion']) || !iso(raw.acceptedAt) || raw.termsVersion !== 'synthetic-local-test-v1') return undefined;
  return raw as ServiceContractView['customerAcceptance'];
}
export function decodeServiceContractView(value: unknown): ServiceContractView | null {
  // Older Worker responses predate Launch Packet 1 and safely behave as an
  // unavailable contract until the Worker-first release is complete.
  if (value === null || value === undefined) return null;
  const raw = record(value), quote = record(raw?.selectedQuote), schedule = record(quote?.schedule), terms = record(raw?.terms);
  const customerAcceptance = acceptance(raw?.customerAcceptance), providerAcceptance = acceptance(raw?.providerAcceptance);
  const requirementsSnapshot = record(raw?.requirementsSnapshot);
  const contractKeys = ['contractVersion', 'contractId', 'rfqId', 'rfqRevisionAtSelection', 'serviceKind', 'status', 'revision', 'participantRole', 'selectedQuote',
    'requirementsSnapshot', 'terms', 'customerAcceptance', 'providerAcceptance', 'paymentState', 'bookingState', 'executionAuthorized',
    'settlementEnabled', 'createdAt', 'updatedAt', 'acceptanceExpiresAt', 'productionEnabled', 'legallyBinding'];
  const quoteKeys = ['quoteId', 'quoteVersion', 'serviceScope', 'schedule', 'inclusions', 'exclusions', 'currency', 'quotedServicePriceMinor', 'expiresAt'];
  if (!raw || !onlyKeys(raw, contractKeys) || raw.contractVersion !== 1 || typeof raw.contractId !== 'string' || !SAFE_CONTRACT_ID.test(raw.contractId) ||
      typeof raw.rfqId !== 'string' || !SAFE_RFQ_ID.test(raw.rfqId) || !Number.isSafeInteger(raw.rfqRevisionAtSelection) || Number(raw.rfqRevisionAtSelection) < 1 ||
      !['operator', 'transporter'].includes(String(raw.serviceKind)) ||
      !['awaiting_acceptances', 'pending_payment', 'cancelled', 'expired'].includes(String(raw.status)) ||
      !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || !['customer', 'provider'].includes(String(raw.participantRole)) ||
      !quote || !onlyKeys(quote, quoteKeys) || typeof quote.quoteId !== 'string' || !SAFE_QUOTE_ID.test(quote.quoteId) ||
      !Number.isSafeInteger(quote.quoteVersion) || Number(quote.quoteVersion) < 1 || typeof quote.serviceScope !== 'string' ||
      quote.serviceScope.length < 5 || quote.serviceScope.length > 500 || !schedule || !onlyKeys(schedule, ['startAt', 'endAt']) ||
      !iso(schedule.startAt) || !iso(schedule.endAt) || Date.parse(schedule.endAt as string) <= Date.parse(schedule.startAt as string) ||
      !Array.isArray(quote.inclusions) || !Array.isArray(quote.exclusions) ||
      ![...quote.inclusions, ...quote.exclusions].every(item => typeof item === 'string' && item.length <= 180) || quote.currency !== 'SAR' ||
      !Number.isSafeInteger(quote.quotedServicePriceMinor) || Number(quote.quotedServicePriceMinor) <= 0 || !iso(quote.expiresAt) ||
      !requirementsSnapshot || !terms || !onlyKeys(terms, ['version', 'source', 'approvedForProduction']) ||
      terms.version !== 'synthetic-local-test-v1' || terms.source !== 'synthetic_local_test_only' || terms.approvedForProduction !== false ||
      customerAcceptance === undefined || providerAcceptance === undefined || raw.paymentState !== 'not_verified' || raw.bookingState !== 'not_confirmed' ||
      raw.executionAuthorized !== false || raw.settlementEnabled !== false || !iso(raw.createdAt) || !iso(raw.updatedAt) ||
      !iso(raw.acceptanceExpiresAt) || raw.productionEnabled !== false || raw.legallyBinding !== false) {
    throw new WorkerError('Invalid service contract response', 502, 'INVALID_SERVICE_CONTRACT_RESPONSE');
  }
  if ((raw.status === 'pending_payment') !== Boolean(customerAcceptance && providerAcceptance)) {
    throw new WorkerError('Invalid service contract response', 502, 'INVALID_SERVICE_CONTRACT_RESPONSE');
  }
  return raw as unknown as ServiceContractView;
}
const SUMMARY_KEYS = ['rfqId', 'serviceKind', 'status', 'revision', 'quoteCount', 'createdAt', 'updatedAt', 'expiresAt'] as const;
function summary(value: unknown, detail = false): ServiceRfqSummary | null {
  const raw = record(value);
  const allowed: readonly string[] = detail ? [...SUMMARY_KEYS, 'requirementsSnapshot', 'targetProfileIds', 'provisionalSelection'] : SUMMARY_KEYS;
  if (!raw || !Object.keys(raw).every(key => allowed.includes(key)) || typeof raw.rfqId !== 'string' || !SAFE_RFQ_ID.test(raw.rfqId) ||
      !['operator', 'transporter'].includes(String(raw.serviceKind)) ||
      !['draft', 'collecting_test_proposals', 'provisionally_selected', 'cancelled', 'expired'].includes(String(raw.status)) ||
      !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 || !Number.isSafeInteger(raw.quoteCount) || Number(raw.quoteCount) < 0 || Number(raw.quoteCount) > 20 ||
      !iso(raw.createdAt) || !iso(raw.updatedAt) || !iso(raw.expiresAt)) return null;
  return {
    rfqId: raw.rfqId,
    serviceKind: raw.serviceKind as ServiceRfqSummary['serviceKind'],
    status: raw.status as ServiceRfqStatus,
    revision: raw.revision as number,
    quoteCount: raw.quoteCount as number,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    expiresAt: raw.expiresAt as string,
  };
}

export function decodeServiceRfqDetail(value: unknown): ServiceRfqDetail {
  const raw = record(value), rfq = record(raw?.rfq), comparison = raw?.comparison;
  const requirementsSnapshot = record(rfq?.requirementsSnapshot);
  const decodedSummary = summary(rfq, true);
  const selection = record(rfq?.provisionalSelection);
  const selected = rfq?.provisionalSelection === null ? null : selection &&
    typeof selection.quoteId === 'string' && /^quote_[A-Za-z0-9_-]{43}$/.test(selection.quoteId) &&
    Number.isSafeInteger(selection.quoteVersion) && Number(selection.quoteVersion) >= 1 && iso(selection.selectedAt)
    ? selection as ServiceRfqDetail['rfq']['provisionalSelection'] : undefined;
  if (!raw || !['customer', 'provider'].includes(String(raw.access)) || !decodedSummary || !rfq ||
      !requirementsSnapshot || !Array.isArray(rfq.targetProfileIds) || rfq.targetProfileIds.length > 5 ||
      !rfq.targetProfileIds.every(item => typeof item === 'string' && SAFE_PROFILE_ID.test(item)) || selected === undefined) {
    throw new WorkerError('Invalid service RFQ response', 502, 'INVALID_SERVICE_RFQ_RESPONSE');
  }
  const decodedComparison = decodeSyntheticQuoteComparisonPage(comparison);
  if (decodedComparison.rfqId !== decodedSummary.rfqId || decodedComparison.serviceKind !== decodedSummary.serviceKind) {
    throw new WorkerError('Invalid service RFQ response', 502, 'INVALID_SERVICE_RFQ_RESPONSE');
  }
  const contract = decodeServiceContractView(raw.contract);
  if (contract && (contract.rfqId !== decodedSummary.rfqId || contract.serviceKind !== decodedSummary.serviceKind ||
      contract.participantRole !== raw.access || !selected || contract.selectedQuote.quoteId !== selected.quoteId ||
      contract.selectedQuote.quoteVersion !== selected.quoteVersion)) {
    throw new WorkerError('Invalid service RFQ response', 502, 'INVALID_SERVICE_RFQ_RESPONSE');
  }
  return {
    access: raw.access as ServiceRfqDetail['access'],
    rfq: { ...decodedSummary, requirementsSnapshot, targetProfileIds: rfq.targetProfileIds as string[], provisionalSelection: selected },
    comparison: decodedComparison,
    contract,
  };
}

export function decodeServiceRfqList(value: unknown) {
  const raw = record(value);
  if (!raw || raw.success !== true || !Array.isArray(raw.rfqs) || raw.rfqs.length > 20 ||
      raw.nextCursor !== null && (typeof raw.nextCursor !== 'string' || !SAFE_RFQ_ID.test(raw.nextCursor))) {
    throw new WorkerError('Invalid service RFQ list', 502, 'INVALID_SERVICE_RFQ_RESPONSE');
  }
  const rfqs = raw.rfqs.map(item => summary(item));
  if (rfqs.some(item => item === null)) throw new WorkerError('Invalid service RFQ list', 502, 'INVALID_SERVICE_RFQ_RESPONSE');
  return { rfqs: rfqs as ServiceRfqSummary[], nextCursor: raw.nextCursor as string | null };
}

export function serviceRfqIdempotencyKey(scope: string) {
  const safe = scope.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 24) || 'operation';
  return `${safe}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 14)}`;
}

export async function createServiceRfq(draft: ServiceRfqDraft, targetProfileIds: string[], idempotencyKey: string, expectedUid: string, signal?: AbortSignal) {
  const response = await request<unknown>('/api/service-rfqs', {
    method: 'POST', body: JSON.stringify({ draft, targetProfileIds, idempotencyKey }), signal,
  }, true, expectedUid);
  return decodeServiceRfqDetail(response);
}
export async function listServiceRfqs(expectedUid: string, cursor?: string, signal?: AbortSignal) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return decodeServiceRfqList(await request<unknown>(`/api/service-rfqs${query}`, { signal }, true, expectedUid));
}
export async function getServiceRfq(rfqId: string, expectedUid: string, signal?: AbortSignal) {
  return decodeServiceRfqDetail(await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}`, { signal }, true, expectedUid));
}
export async function submitServiceQuote(rfqId: string, quote: ServiceQuoteDraft, expectedRfqRevision: number, idempotencyKey: string, expectedUid: string, signal?: AbortSignal) {
  return decodeServiceRfqDetail(await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}/quotes`, {
    method: 'POST', body: JSON.stringify({ quote, expectedRfqRevision, idempotencyKey }), signal,
  }, true, expectedUid));
}
export async function reviseServiceQuote(rfqId: string, quoteId: string, quote: ServiceQuoteDraft, expectedRfqRevision: number, idempotencyKey: string, expectedUid: string, signal?: AbortSignal) {
  return decodeServiceRfqDetail(await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}/quotes/${encodeURIComponent(quoteId)}`, {
    method: 'PUT', body: JSON.stringify({ quote, expectedRfqRevision, idempotencyKey }), signal,
  }, true, expectedUid));
}
export async function withdrawServiceQuote(rfqId: string, quoteId: string, expectedRfqRevision: number, expectedQuoteRevision: number, idempotencyKey: string, expectedUid: string, signal?: AbortSignal) {
  return decodeServiceRfqDetail(await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}/quotes/${encodeURIComponent(quoteId)}/withdraw`, {
    method: 'POST', body: JSON.stringify({ expectedRfqRevision, expectedQuoteRevision, idempotencyKey }), signal,
  }, true, expectedUid));
}
export async function selectServiceQuote(rfqId: string, quoteId: string, expectedRfqRevision: number, idempotencyKey: string, expectedUid: string, signal?: AbortSignal) {
  return decodeServiceRfqDetail(await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}/selection`, {
    method: 'POST', body: JSON.stringify({ quoteId, expectedRfqRevision, idempotencyKey }), signal,
  }, true, expectedUid));
}
export async function cancelServiceRfq(rfqId: string, expectedRevision: number, idempotencyKey: string, expectedUid: string, signal?: AbortSignal) {
  return decodeServiceRfqDetail(await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}/cancel`, {
    method: 'POST', body: JSON.stringify({ expectedRevision, idempotencyKey }), signal,
  }, true, expectedUid));
}

export async function acceptServiceContract(
  rfqId: string,
  quoteId: string,
  quoteVersion: number,
  expectedContractRevision: number,
  idempotencyKey: string,
  expectedUid: string,
  signal?: AbortSignal,
) {
  return decodeServiceRfqDetail(await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}/contract/accept`, {
    method: 'POST',
    body: JSON.stringify({ quoteId, quoteVersion, termsVersion: 'synthetic-local-test-v1', expectedContractRevision, idempotencyKey }),
    signal,
  }, true, expectedUid));
}

export async function cancelServiceContract(
  rfqId: string,
  expectedContractRevision: number,
  idempotencyKey: string,
  expectedUid: string,
  signal?: AbortSignal,
) {
  return decodeServiceRfqDetail(await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}/contract/cancel`, {
    method: 'POST', body: JSON.stringify({ expectedContractRevision, idempotencyKey }), signal,
  }, true, expectedUid));
}

export class ServiceRfqScopeGuard extends QuoteComparisonScopeGuard {}
