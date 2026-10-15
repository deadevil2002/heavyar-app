import { parseOperatorRequestInput, prepareOperatorRequest } from './operator-marketplace';
import { parseTransportRequestInput, prepareTransportRequest } from './transporter-marketplace';

export const SERVICE_RFQ_CONTRACT_VERSION = 1 as const;
export const SERVICE_QUOTE_CONTRACT_VERSION = 1 as const;
export const SERVICE_QUOTE_PAGE_MAX = 20;
export const SERVICE_RFQ_PRODUCTION_ACTIVATION = 'disabled_pending_commercial_and_regulatory_approval' as const;
export const SERVICE_RFQ_RUNTIME = 'test_only_in_memory' as const;
export const SERVICE_RFQ_CAS_BOUNDARY = 'process_local_only_requires_authoritative_transaction_before_activation' as const;

const SAFE_RFQ_ID = /^rfq_[A-Za-z0-9_-]{43}$/;
const SAFE_QUOTE_ID = /^quote_[A-Za-z0-9_-]{43}$/;
const SAFE_UID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ORGANIZATION_ID = /^org_[A-Za-z0-9_-]{43}$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_RFQ_LIFETIME_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_QUOTE_COMPONENTS = 8;
const MAX_LIST_ITEMS = 12;
const MAX_OPERATION_HISTORY = 100;
const TRANSPORT_VEHICLE_CATEGORIES = ['lowbed', 'flatbed', 'trailer', 'recovery', 'other'] as const;

export type ServiceKind = 'operator' | 'transporter';
export type RfqStatus = 'draft' | 'collecting_test_proposals' | 'provisionally_selected' | 'cancelled' | 'expired';
export type QuoteStatus = 'active' | 'withdrawn' | 'expired';
export type QuoteAvailability = 'declared_available' | 'declared_limited';

export class ServiceRfqError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ServiceRfqError';
  }
}

export type ActiveCustomerAuthority = {
  actorUid: string;
  role: 'customer';
  accountState: 'active';
  revoked: false;
  accountPurpose: 'standard';
};

export type ProviderPrincipal =
  | { kind: 'individual'; providerUid: string }
  | { kind: 'organization'; organizationId: string };

export type FutureProviderAuthority = {
  actorUid: string;
  accountState: 'active' | 'suspended' | 'restricted' | 'deleted';
  revoked: boolean;
  accountPurpose: 'standard' | 'store_review';
  serviceKind: ServiceKind;
  principal: ProviderPrincipal;
  organizationState?: 'active' | 'suspended' | 'deleted';
  membership?: {
    uid: string;
    role: 'owner' | 'employee';
    status: 'active' | 'revoked';
    operationalCapabilities: readonly string[];
  };
  commercialQuoteDelegation?: {
    approvedByOwner: true;
    capability: 'operator_quotes.manage' | 'transporter_quotes.manage';
  };
  eligibility: {
    state: 'verified_eligible' | 'unverified' | 'ineligible';
    source: 'future_authoritative_source' | 'self_declared';
  };
};

export type FutureOversightAuthority = {
  actorUid: string;
  firebaseAccountState: 'active' | 'disabled';
  revoked: boolean;
  accountPurpose: 'standard' | 'store_review';
  staffState: 'active' | 'revoked' | 'missing';
  permissions: readonly string[];
  authoritySource: 'future_authoritative_live_staff';
};

export type QuoteComparisonViewer =
  | { kind: 'customer'; customer: ActiveCustomerAuthority }
  | { kind: 'oversight'; staff: FutureOversightAuthority };

export type ServiceRfq = {
  rfqId: string;
  contractVersion: 1;
  serviceKind: ServiceKind;
  customerUid: string;
  version: 1;
  revision: number;
  status: RfqStatus;
  requirementsSnapshot: Readonly<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type QuoteMoneyComponent = {
  code: string;
  label: string;
  amountMinor: number;
};

export type QuoteVersionSnapshot = {
  contractVersion: 1;
  quoteVersion: number;
  serviceScope: string;
  schedule: { startAt: string; endAt: string };
  inclusions: readonly string[];
  exclusions: readonly string[];
  serviceCategory: string;
  availability: QuoteAvailability;
  currency: 'SAR';
  baseServicePriceMinor: number;
  optionalComponents: readonly QuoteMoneyComponent[];
  quotedServicePriceMinor: number;
  expiresAt: string;
  createdAt: string;
};

export type QuoteProposal = {
  quoteId: string;
  rfqId: string;
  rfqVersion: 1;
  serviceKind: ServiceKind;
  principal: ProviderPrincipal;
  revision: number;
  currentVersion: number;
  status: QuoteStatus;
  snapshots: readonly QuoteVersionSnapshot[];
  updatedAt: string;
};

type OperationRecord = {
  key: string;
  operation: string;
  fingerprint: string;
  authorizationScope: string;
  resultingRevision: number;
};

export type ServiceRfqAggregate = {
  rfq: ServiceRfq;
  quotes: readonly QuoteProposal[];
  provisionalSelection: null | {
    quoteId: string;
    quoteVersion: number;
    selectedAt: string;
  };
  operationHistory: readonly OperationRecord[];
};

export type QuoteComparisonSummary = {
  quoteId: string;
  quoteVersion: number;
  serviceKind: ServiceKind;
  serviceScope: string;
  schedule: { startAt: string; endAt: string };
  inclusions: readonly string[];
  exclusions: readonly string[];
  serviceCategory: string;
  availability: QuoteAvailability;
  currency: 'SAR';
  baseServicePriceMinor: number;
  optionalComponents: readonly QuoteMoneyComponent[];
  quotedServicePriceMinor: number;
  expiresAt: string;
  status: 'active' | 'expired' | 'provisionally_selected';
  eligibility: 'verified_by_future_authoritative_source';
};

type DraftInput = {
  contractVersion: 1;
  serviceKind: ServiceKind;
  preparedRequest: unknown;
  expiresAt: string;
};

type QuoteInput = {
  contractVersion: 1;
  expectedQuoteRevision: number | null;
  serviceScope: string;
  schedule: { startAt: string; endAt: string };
  inclusions: string[];
  exclusions: string[];
  serviceCategory: string;
  availability: QuoteAvailability;
  currency: 'SAR';
  baseServicePriceMinor: number;
  optionalComponents: QuoteMoneyComponent[];
  expiresAt: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}

function boundedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return new Date(Date.parse(value)).toISOString();
}

function safeMinor(value: unknown, allowZero = false): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) ? value : null;
}

function checkedMinorSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || total > Number.MAX_SAFE_INTEGER - value) return null;
    total += value;
  }
  return total;
}

function textList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) return null;
  const result = value.map(item => boundedText(item, 1, 160));
  if (result.some(item => item === null)) return null;
  const normalized = result as string[];
  return new Set(normalized.map(item => item.toLocaleLowerCase('en'))).size === normalized.length ? normalized : null;
}

function dateRange(value: unknown): { startAt: string; endAt: string } | null {
  const raw = record(value);
  if (!raw || !onlyKeys(raw, ['startAt', 'endAt'])) return null;
  const startAt = timestamp(raw.startAt);
  const endAt = timestamp(raw.endAt);
  return startAt && endAt && Date.parse(endAt) > Date.parse(startAt) ? { startAt, endAt } : null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function assertIdempotencyKey(value: string) {
  if (!SAFE_IDEMPOTENCY_KEY.test(value)) throw new ServiceRfqError('INVALID_IDEMPOTENCY_KEY');
}

function priorOperation(
  state: ServiceRfqAggregate,
  key: string,
  operation: string,
  fingerprint: string,
  authorizationScope: string,
): ServiceRfqAggregate | null {
  assertIdempotencyKey(key);
  const prior = state.operationHistory.find(item => item.key === key);
  if (!prior) return null;
  if (prior.authorizationScope !== authorizationScope) throw new ServiceRfqError('IDEMPOTENCY_ACTOR_MISMATCH');
  if (prior.operation !== operation || prior.fingerprint !== fingerprint) throw new ServiceRfqError('IDEMPOTENCY_CONFLICT');
  return state;
}

function finishOperation(
  state: ServiceRfqAggregate,
  key: string,
  operation: string,
  fingerprint: string,
  authorizationScope: string,
): ServiceRfqAggregate {
  const operationHistory = [...state.operationHistory, {
    key, operation, fingerprint, authorizationScope, resultingRevision: state.rfq.revision,
  }].slice(-MAX_OPERATION_HISTORY);
  return deepFreeze({ ...state, operationHistory });
}

function assertCustomer(authority: ActiveCustomerAuthority, customerUid?: string) {
  if (!SAFE_UID.test(authority.actorUid) || authority.role !== 'customer' || authority.accountState !== 'active' ||
      authority.revoked !== false || authority.accountPurpose !== 'standard' || customerUid && authority.actorUid !== customerUid) {
    throw new ServiceRfqError('CUSTOMER_NOT_AUTHORIZED');
  }
}

function quoteCapability(kind: ServiceKind) {
  return kind === 'operator' ? 'operator_quotes.manage' as const : 'transporter_quotes.manage' as const;
}

function customerAuthorizationScope(state: ServiceRfqAggregate, authority: ActiveCustomerAuthority) {
  return `customer|${state.rfq.rfqId}|${authority.actorUid}`;
}

function providerAuthorizationScope(state: ServiceRfqAggregate, authority: FutureProviderAuthority) {
  const principal = authority.principal.kind === 'individual'
    ? `individual:${authority.principal.providerUid}`
    : `organization:${authority.principal.organizationId}`;
  return `provider|${state.rfq.rfqId}|${authority.actorUid}|${principal}`;
}

export function providerCanManageFutureQuote(authority: FutureProviderAuthority, expectedKind: ServiceKind): boolean {
  if (!SAFE_UID.test(authority.actorUid) || authority.accountState !== 'active' || authority.revoked || authority.accountPurpose !== 'standard' ||
      authority.serviceKind !== expectedKind || authority.eligibility.state !== 'verified_eligible' ||
      authority.eligibility.source !== 'future_authoritative_source') return false;
  if (authority.principal.kind === 'individual') return SAFE_UID.test(authority.principal.providerUid) && authority.principal.providerUid === authority.actorUid;
  if (!SAFE_ORGANIZATION_ID.test(authority.principal.organizationId) || authority.organizationState !== 'active' ||
      !authority.membership || authority.membership.uid !== authority.actorUid || authority.membership.status !== 'active') return false;
  if (authority.membership.role === 'owner') return true;
  return authority.membership.role === 'employee' && authority.commercialQuoteDelegation?.approvedByOwner === true &&
    authority.commercialQuoteDelegation.capability === quoteCapability(expectedKind);
}

export function oversightCanViewPrivateRfq(authority: FutureOversightAuthority): boolean {
  return SAFE_UID.test(authority.actorUid) && authority.firebaseAccountState === 'active' && !authority.revoked &&
    authority.accountPurpose === 'standard' && authority.staffState === 'active' &&
    authority.authoritySource === 'future_authoritative_live_staff' && authority.permissions.includes('service_rfqs.view_private');
}

function assertComparisonViewer(state: ServiceRfqAggregate, viewer: QuoteComparisonViewer | undefined) {
  if (viewer?.kind === 'customer') {
    assertCustomer(viewer.customer, state.rfq.customerUid);
    return;
  }
  if (viewer?.kind === 'oversight' && oversightCanViewPrivateRfq(viewer.staff)) return;
  throw new ServiceRfqError('COMPARISON_VIEWER_NOT_AUTHORIZED');
}

export function parseTestOnlyRfqDraftInput(value: unknown): DraftInput | null {
  const raw = record(value);
  if (!raw || !onlyKeys(raw, ['contractVersion', 'serviceKind', 'preparedRequest', 'expiresAt']) ||
      raw.contractVersion !== SERVICE_RFQ_CONTRACT_VERSION || !['operator', 'transporter'].includes(String(raw.serviceKind))) return null;
  const expiresAt = timestamp(raw.expiresAt);
  if (!expiresAt) return null;
  const preparedRequest = raw.serviceKind === 'operator'
    ? parseOperatorRequestInput(raw.preparedRequest)
    : parseTransportRequestInput(raw.preparedRequest);
  return preparedRequest ? { contractVersion: 1, serviceKind: raw.serviceKind as ServiceKind, preparedRequest, expiresAt } : null;
}

export function createTestOnlyRfq(
  value: unknown,
  server: { rfqId: string; customer: ActiveCustomerAuthority; now: string },
): ServiceRfqAggregate {
  const input = parseTestOnlyRfqDraftInput(value);
  const now = timestamp(server.now);
  assertCustomer(server.customer);
  if (!input || !SAFE_RFQ_ID.test(server.rfqId) || !now) throw new ServiceRfqError('INVALID_RFQ');
  const lifetime = Date.parse(input.expiresAt) - Date.parse(now);
  if (lifetime <= 0 || lifetime > MAX_RFQ_LIFETIME_MS) throw new ServiceRfqError('INVALID_RFQ_EXPIRY');
  const prepared = input.serviceKind === 'operator'
    ? prepareOperatorRequest(input.preparedRequest as NonNullable<ReturnType<typeof parseOperatorRequestInput>>, now)
    : prepareTransportRequest(input.preparedRequest as NonNullable<ReturnType<typeof parseTransportRequestInput>>, now);
  return deepFreeze({
    rfq: {
      rfqId: server.rfqId,
      contractVersion: 1,
      serviceKind: input.serviceKind,
      customerUid: server.customer.actorUid,
      version: 1,
      revision: 0,
      status: 'draft',
      requirementsSnapshot: prepared.requirementsSnapshot,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
    },
    quotes: [],
    provisionalSelection: null,
    operationHistory: [],
  });
}

export function openTestOnlyRfq(
  state: ServiceRfqAggregate,
  authority: ActiveCustomerAuthority,
  expectedRevision: number,
  idempotencyKey: string,
  nowValue: string,
): ServiceRfqAggregate {
  const now = timestamp(nowValue);
  const fingerprint = `open|${expectedRevision}`;
  assertCustomer(authority, state.rfq.customerUid);
  const authorizationScope = customerAuthorizationScope(state, authority);
  const prior = priorOperation(state, idempotencyKey, 'open', fingerprint, authorizationScope);
  if (prior) return prior;
  if (!now || state.rfq.revision !== expectedRevision) throw new ServiceRfqError('STALE_RFQ_REVISION');
  if (state.rfq.status !== 'draft' || Date.parse(now) >= Date.parse(state.rfq.expiresAt)) throw new ServiceRfqError('INVALID_RFQ_TRANSITION');
  return finishOperation(deepFreeze({
    ...state,
    rfq: { ...state.rfq, revision: expectedRevision + 1, status: 'collecting_test_proposals' as const, updatedAt: now },
  }), idempotencyKey, 'open', fingerprint, authorizationScope);
}

export function parseTestOnlyQuoteInput(value: unknown): QuoteInput | null {
  const raw = record(value);
  if (!raw || !onlyKeys(raw, [
    'contractVersion', 'expectedQuoteRevision', 'serviceScope', 'schedule', 'inclusions', 'exclusions',
    'serviceCategory', 'availability', 'currency', 'baseServicePriceMinor', 'optionalComponents', 'expiresAt',
  ]) || raw.contractVersion !== SERVICE_QUOTE_CONTRACT_VERSION ||
      raw.expectedQuoteRevision !== null && (!Number.isSafeInteger(raw.expectedQuoteRevision) || Number(raw.expectedQuoteRevision) < 0)) return null;
  const serviceScope = boundedText(raw.serviceScope, 5, 500);
  const schedule = dateRange(raw.schedule);
  const inclusions = textList(raw.inclusions);
  const exclusions = textList(raw.exclusions);
  const serviceCategory = typeof raw.serviceCategory === 'string' && SAFE_SLUG.test(raw.serviceCategory) ? raw.serviceCategory : null;
  const availability = ['declared_available', 'declared_limited'].includes(String(raw.availability)) ? raw.availability as QuoteAvailability : null;
  const baseServicePriceMinor = safeMinor(raw.baseServicePriceMinor);
  const expiresAt = timestamp(raw.expiresAt);
  if (!serviceScope || !schedule || !inclusions || !exclusions || !serviceCategory || !availability || raw.currency !== 'SAR' ||
      baseServicePriceMinor === null || !expiresAt || !Array.isArray(raw.optionalComponents) || raw.optionalComponents.length > MAX_QUOTE_COMPONENTS) return null;
  if (inclusions.some(item => exclusions.some(excluded => excluded.toLocaleLowerCase('en') === item.toLocaleLowerCase('en')))) return null;
  const optionalComponents: QuoteMoneyComponent[] = [];
  for (const candidate of raw.optionalComponents) {
    const component = record(candidate);
    if (!component || !onlyKeys(component, ['code', 'label', 'amountMinor']) || typeof component.code !== 'string' || !SAFE_SLUG.test(component.code)) return null;
    const label = boundedText(component.label, 1, 80);
    const amountMinor = safeMinor(component.amountMinor, true);
    if (!label || amountMinor === null) return null;
    optionalComponents.push({ code: component.code, label, amountMinor });
  }
  if (new Set(optionalComponents.map(item => item.code)).size !== optionalComponents.length ||
      checkedMinorSum([baseServicePriceMinor, ...optionalComponents.map(item => item.amountMinor)]) === null) return null;
  return {
    contractVersion: 1,
    expectedQuoteRevision: raw.expectedQuoteRevision as number | null,
    serviceScope,
    schedule,
    inclusions,
    exclusions,
    serviceCategory,
    availability,
    currency: 'SAR',
    baseServicePriceMinor,
    optionalComponents,
    expiresAt,
  };
}

function requestWindow(state: ServiceRfqAggregate): { startAt: string; endAt: string } {
  const snapshot = state.rfq.requirementsSnapshot as Record<string, unknown>;
  if (state.rfq.serviceKind === 'operator') return { startAt: String(snapshot.requestedStartAt), endAt: String(snapshot.requestedEndAt) };
  const pickup = snapshot.requestedPickupWindow as Record<string, unknown>;
  return { startAt: String(pickup.startAt), endAt: String(snapshot.requestedDeliveryBy) };
}

function makeQuoteSnapshot(input: QuoteInput, quoteVersion: number, createdAt: string): QuoteVersionSnapshot {
  const quotedServicePriceMinor = checkedMinorSum([input.baseServicePriceMinor, ...input.optionalComponents.map(item => item.amountMinor)]);
  if (quotedServicePriceMinor === null) throw new ServiceRfqError('INVALID_QUOTE_MONEY');
  return deepFreeze({
    contractVersion: 1,
    quoteVersion,
    serviceScope: input.serviceScope,
    schedule: input.schedule,
    inclusions: [...input.inclusions],
    exclusions: [...input.exclusions],
    serviceCategory: input.serviceCategory,
    availability: input.availability,
    currency: 'SAR',
    baseServicePriceMinor: input.baseServicePriceMinor,
    optionalComponents: input.optionalComponents.map(component => ({ ...component })),
    quotedServicePriceMinor,
    expiresAt: input.expiresAt,
    createdAt,
  });
}

function validateQuoteAgainstRfq(state: ServiceRfqAggregate, input: QuoteInput, now: string) {
  const requested = requestWindow(state);
  const requirements = state.rfq.requirementsSnapshot as Record<string, unknown>;
  if (Date.parse(input.schedule.startAt) < Date.parse(requested.startAt) || Date.parse(input.schedule.endAt) > Date.parse(requested.endAt) ||
      Date.parse(input.expiresAt) <= Date.parse(now) || Date.parse(input.expiresAt) > Date.parse(state.rfq.expiresAt)) {
    throw new ServiceRfqError('QUOTE_OUTSIDE_RFQ_BOUNDS');
  }
  if (state.rfq.serviceKind === 'operator' && input.serviceCategory !== requirements.equipmentSkill ||
      state.rfq.serviceKind === 'transporter' && !TRANSPORT_VEHICLE_CATEGORIES.includes(input.serviceCategory as (typeof TRANSPORT_VEHICLE_CATEGORIES)[number])) {
    throw new ServiceRfqError('QUOTE_SERVICE_MISMATCH');
  }
}

export function submitTestOnlyQuote(
  state: ServiceRfqAggregate,
  value: unknown,
  server: { quoteId: string; authority: FutureProviderAuthority; expectedRfqRevision: number; idempotencyKey: string; now: string },
): ServiceRfqAggregate {
  const input = parseTestOnlyQuoteInput(value);
  const now = timestamp(server.now);
  const fingerprint = `submit|${server.quoteId}|${server.expectedRfqRevision}|${JSON.stringify(input)}`;
  if (!providerCanManageFutureQuote(server.authority, state.rfq.serviceKind)) throw new ServiceRfqError('PROVIDER_NOT_AUTHORIZED');
  const authorizationScope = providerAuthorizationScope(state, server.authority);
  const prior = priorOperation(state, server.idempotencyKey, 'submit_quote', fingerprint, authorizationScope);
  if (prior) return prior;
  if (!input || !now || !SAFE_QUOTE_ID.test(server.quoteId)) throw new ServiceRfqError('INVALID_QUOTE');
  if (state.rfq.revision !== server.expectedRfqRevision) throw new ServiceRfqError('STALE_RFQ_REVISION');
  if (state.rfq.status !== 'collecting_test_proposals' || Date.parse(now) >= Date.parse(state.rfq.expiresAt)) throw new ServiceRfqError('RFQ_NOT_COLLECTING');
  if (input.expectedQuoteRevision !== null || state.quotes.some(item => item.quoteId === server.quoteId)) throw new ServiceRfqError('QUOTE_ALREADY_EXISTS');
  validateQuoteAgainstRfq(state, input, now);
  const quote: QuoteProposal = {
    quoteId: server.quoteId,
    rfqId: state.rfq.rfqId,
    rfqVersion: state.rfq.version,
    serviceKind: state.rfq.serviceKind,
    principal: { ...server.authority.principal },
    revision: 0,
    currentVersion: 1,
    status: 'active',
    snapshots: [makeQuoteSnapshot(input, 1, now)],
    updatedAt: now,
  };
  return finishOperation(deepFreeze({
    ...state,
    rfq: { ...state.rfq, revision: state.rfq.revision + 1, updatedAt: now },
    quotes: [...state.quotes, quote],
  }), server.idempotencyKey, 'submit_quote', fingerprint, authorizationScope);
}

function samePrincipal(left: ProviderPrincipal, right: ProviderPrincipal) {
  return left.kind === right.kind && (left.kind === 'individual'
    ? left.providerUid === (right as Extract<ProviderPrincipal, { kind: 'individual' }>).providerUid
    : left.organizationId === (right as Extract<ProviderPrincipal, { kind: 'organization' }>).organizationId);
}

export function reviseTestOnlyQuote(
  state: ServiceRfqAggregate,
  quoteId: string,
  value: unknown,
  server: { authority: FutureProviderAuthority; expectedRfqRevision: number; idempotencyKey: string; now: string },
): ServiceRfqAggregate {
  const input = parseTestOnlyQuoteInput(value);
  const now = timestamp(server.now);
  const fingerprint = `revise|${quoteId}|${server.expectedRfqRevision}|${JSON.stringify(input)}`;
  const quoteIndex = state.quotes.findIndex(item => item.quoteId === quoteId);
  const quote = state.quotes[quoteIndex];
  if (!quote || !providerCanManageFutureQuote(server.authority, state.rfq.serviceKind) ||
      !samePrincipal(quote.principal, server.authority.principal)) throw new ServiceRfqError('PROVIDER_NOT_AUTHORIZED');
  const authorizationScope = providerAuthorizationScope(state, server.authority);
  const prior = priorOperation(state, server.idempotencyKey, 'revise_quote', fingerprint, authorizationScope);
  if (prior) return prior;
  if (!input || !now || quote.status !== 'active') throw new ServiceRfqError('QUOTE_NOT_ACTIVE');
  if (state.rfq.revision !== server.expectedRfqRevision || input.expectedQuoteRevision !== quote.revision) throw new ServiceRfqError('STALE_QUOTE_REVISION');
  if (state.rfq.status !== 'collecting_test_proposals') throw new ServiceRfqError('PROVIDER_NOT_AUTHORIZED');
  validateQuoteAgainstRfq(state, input, now);
  const revised: QuoteProposal = {
    ...quote,
    revision: quote.revision + 1,
    currentVersion: quote.currentVersion + 1,
    snapshots: [...quote.snapshots, makeQuoteSnapshot(input, quote.currentVersion + 1, now)],
    updatedAt: now,
  };
  const quotes = state.quotes.map((item, index) => index === quoteIndex ? revised : item);
  return finishOperation(deepFreeze({
    ...state,
    rfq: { ...state.rfq, revision: state.rfq.revision + 1, updatedAt: now },
    quotes,
  }), server.idempotencyKey, 'revise_quote', fingerprint, authorizationScope);
}

export function quoteVersionState(quote: QuoteProposal, version: number): 'active' | 'superseded' | QuoteStatus {
  if (!Number.isSafeInteger(version) || version < 1 || version > quote.currentVersion) throw new ServiceRfqError('INVALID_QUOTE_VERSION');
  if (version < quote.currentVersion) return 'superseded';
  return quote.status;
}

function updateQuoteLifecycle(
  state: ServiceRfqAggregate,
  quoteId: string,
  authority: FutureProviderAuthority,
  expectedRfqRevision: number,
  expectedQuoteRevision: number,
  status: 'withdrawn' | 'expired',
  idempotencyKey: string,
  nowValue: string,
): ServiceRfqAggregate {
  const now = timestamp(nowValue);
  const fingerprint = `${status}|${quoteId}|${expectedRfqRevision}|${expectedQuoteRevision}`;
  const index = state.quotes.findIndex(item => item.quoteId === quoteId);
  const quote = state.quotes[index];
  if (!quote || !providerCanManageFutureQuote(authority, state.rfq.serviceKind) || !samePrincipal(quote.principal, authority.principal)) {
    throw new ServiceRfqError('PROVIDER_NOT_AUTHORIZED');
  }
  const authorizationScope = providerAuthorizationScope(state, authority);
  const prior = priorOperation(state, idempotencyKey, status, fingerprint, authorizationScope);
  if (prior) return prior;
  if (!now || quote.status !== 'active') throw new ServiceRfqError('QUOTE_NOT_ACTIVE');
  if (state.rfq.revision !== expectedRfqRevision || quote.revision !== expectedQuoteRevision) throw new ServiceRfqError('STALE_QUOTE_REVISION');
  if (status === 'expired' && Date.parse(now) < Date.parse(quote.snapshots[quote.currentVersion - 1].expiresAt)) {
    throw new ServiceRfqError('QUOTE_NOT_EXPIRED');
  }
  const updated = { ...quote, revision: quote.revision + 1, status, updatedAt: now };
  return finishOperation(deepFreeze({
    ...state,
    rfq: { ...state.rfq, revision: state.rfq.revision + 1, updatedAt: now },
    quotes: state.quotes.map((item, itemIndex) => itemIndex === index ? updated : item),
  }), idempotencyKey, status, fingerprint, authorizationScope);
}

export function withdrawTestOnlyQuote(
  state: ServiceRfqAggregate,
  quoteId: string,
  authority: FutureProviderAuthority,
  expectedRfqRevision: number,
  expectedQuoteRevision: number,
  idempotencyKey: string,
  now: string,
) {
  return updateQuoteLifecycle(state, quoteId, authority, expectedRfqRevision, expectedQuoteRevision, 'withdrawn', idempotencyKey, now);
}

export function expireTestOnlyQuote(
  state: ServiceRfqAggregate,
  quoteId: string,
  authority: FutureProviderAuthority,
  expectedRfqRevision: number,
  expectedQuoteRevision: number,
  idempotencyKey: string,
  now: string,
) {
  return updateQuoteLifecycle(state, quoteId, authority, expectedRfqRevision, expectedQuoteRevision, 'expired', idempotencyKey, now);
}

export function provisionallySelectTestOnlyQuote(
  state: ServiceRfqAggregate,
  quoteId: string,
  authority: ActiveCustomerAuthority,
  liveProviderAuthority: FutureProviderAuthority,
  expectedRfqRevision: number,
  idempotencyKey: string,
  nowValue: string,
): ServiceRfqAggregate {
  const now = timestamp(nowValue);
  const fingerprint = `select|${quoteId}|${expectedRfqRevision}`;
  assertCustomer(authority, state.rfq.customerUid);
  const quote = state.quotes.find(item => item.quoteId === quoteId);
  if (!quote || !providerCanManageFutureQuote(liveProviderAuthority, state.rfq.serviceKind) ||
      !samePrincipal(quote.principal, liveProviderAuthority.principal)) {
    throw new ServiceRfqError('PROVIDER_AUTHORITY_REVOKED');
  }
  const authorizationScope = customerAuthorizationScope(state, authority);
  const prior = priorOperation(state, idempotencyKey, 'provisional_selection', fingerprint, authorizationScope);
  if (prior) return prior;
  if (!now || state.rfq.revision !== expectedRfqRevision) throw new ServiceRfqError('STALE_RFQ_REVISION');
  if (state.rfq.status !== 'collecting_test_proposals' || state.provisionalSelection || quote.status !== 'active') {
    throw new ServiceRfqError('INVALID_SELECTION_TRANSITION');
  }
  const snapshot = quote.snapshots[quote.currentVersion - 1];
  if (Date.parse(now) >= Date.parse(snapshot.expiresAt)) throw new ServiceRfqError('QUOTE_EXPIRED');
  return finishOperation(deepFreeze({
    ...state,
    rfq: { ...state.rfq, revision: state.rfq.revision + 1, status: 'provisionally_selected' as const, updatedAt: now },
    provisionalSelection: { quoteId, quoteVersion: quote.currentVersion, selectedAt: now },
  }), idempotencyKey, 'provisional_selection', fingerprint, authorizationScope);
}

export function cancelTestOnlyRfq(
  state: ServiceRfqAggregate,
  authority: ActiveCustomerAuthority,
  expectedRevision: number,
  idempotencyKey: string,
  nowValue: string,
): ServiceRfqAggregate {
  const now = timestamp(nowValue);
  const fingerprint = `cancel|${expectedRevision}`;
  assertCustomer(authority, state.rfq.customerUid);
  const authorizationScope = customerAuthorizationScope(state, authority);
  const prior = priorOperation(state, idempotencyKey, 'cancel', fingerprint, authorizationScope);
  if (prior) return prior;
  if (!now || state.rfq.revision !== expectedRevision) throw new ServiceRfqError('STALE_RFQ_REVISION');
  if (!['draft', 'collecting_test_proposals'].includes(state.rfq.status)) throw new ServiceRfqError('INVALID_RFQ_TRANSITION');
  return finishOperation(deepFreeze({
    ...state,
    rfq: { ...state.rfq, revision: state.rfq.revision + 1, status: 'cancelled' as const, updatedAt: now },
  }), idempotencyKey, 'cancel', fingerprint, authorizationScope);
}

export function expireTestOnlyRfq(state: ServiceRfqAggregate, expectedRevision: number, nowValue: string): ServiceRfqAggregate {
  const now = timestamp(nowValue);
  if (!now || state.rfq.revision !== expectedRevision) throw new ServiceRfqError('STALE_RFQ_REVISION');
  if (!['draft', 'collecting_test_proposals'].includes(state.rfq.status) || Date.parse(now) < Date.parse(state.rfq.expiresAt)) {
    throw new ServiceRfqError('INVALID_RFQ_TRANSITION');
  }
  return deepFreeze({ ...state, rfq: { ...state.rfq, revision: state.rfq.revision + 1, status: 'expired' as const, updatedAt: now } });
}

function quoteSummary(state: ServiceRfqAggregate, quote: QuoteProposal, now: string): QuoteComparisonSummary | null {
  if (!['active', 'expired'].includes(quote.status)) return null;
  const snapshot = quote.snapshots[quote.currentVersion - 1];
  const selected = state.provisionalSelection?.quoteId === quote.quoteId && state.provisionalSelection.quoteVersion === quote.currentVersion;
  return {
    quoteId: quote.quoteId,
    quoteVersion: quote.currentVersion,
    serviceKind: quote.serviceKind,
    serviceScope: snapshot.serviceScope,
    schedule: snapshot.schedule,
    inclusions: snapshot.inclusions,
    exclusions: snapshot.exclusions,
    serviceCategory: snapshot.serviceCategory,
    availability: snapshot.availability,
    currency: snapshot.currency,
    baseServicePriceMinor: snapshot.baseServicePriceMinor,
    optionalComponents: snapshot.optionalComponents,
    quotedServicePriceMinor: snapshot.quotedServicePriceMinor,
    expiresAt: snapshot.expiresAt,
    status: selected ? 'provisionally_selected' : quote.status === 'expired' || Date.parse(now) >= Date.parse(snapshot.expiresAt) ? 'expired' : 'active',
    eligibility: 'verified_by_future_authoritative_source',
  };
}

type ComparisonCursor = { context: string; total: number; startAt: string; quoteId: string };

function comparisonContext(state: ServiceRfqAggregate) {
  return `${state.rfq.rfqId}|${state.rfq.version}|${state.rfq.serviceKind}`;
}

function encodeComparisonCursor(value: ComparisonCursor) {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, ...value }));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseComparisonCursor(value: string | undefined): ComparisonCursor | null {
  if (!value || value.length > 800) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0))));
    if (!record(decoded) || decoded.v !== 1 || !boundedText(decoded.context, 1, 300) || safeMinor(decoded.total, true) === null ||
        !timestamp(decoded.startAt) || typeof decoded.quoteId !== 'string' || !SAFE_QUOTE_ID.test(decoded.quoteId)) return null;
    return { context: decoded.context as string, total: decoded.total as number, startAt: decoded.startAt as string, quoteId: decoded.quoteId };
  } catch {
    return null;
  }
}

function compareSummary(left: QuoteComparisonSummary, right: QuoteComparisonSummary) {
  if (left.quotedServicePriceMinor !== right.quotedServicePriceMinor) return left.quotedServicePriceMinor < right.quotedServicePriceMinor ? -1 : 1;
  return left.schedule.startAt.localeCompare(right.schedule.startAt) || left.quoteId.localeCompare(right.quoteId);
}

export function pageSyntheticQuoteSummaries(
  state: ServiceRfqAggregate,
  viewer: QuoteComparisonViewer | undefined,
  options: { cursor?: string; limit?: number; now: string } = { now: new Date().toISOString() },
): { quotes: readonly QuoteComparisonSummary[]; nextCursor: string | null } {
  assertComparisonViewer(state, viewer);
  const now = timestamp(options.now);
  const limit = options.limit ?? SERVICE_QUOTE_PAGE_MAX;
  const cursor = options.cursor ? parseComparisonCursor(options.cursor) : null;
  const context = comparisonContext(state);
  if (!now || !Number.isSafeInteger(limit) || limit < 1 || limit > SERVICE_QUOTE_PAGE_MAX || options.cursor && (!cursor || cursor.context !== context)) {
    throw new ServiceRfqError('INVALID_COMPARISON_PAGE');
  }
  const all = state.quotes.map(quote => quoteSummary(state, quote, now)).filter((item): item is QuoteComparisonSummary => !!item).sort(compareSummary);
  const afterCursor = cursor ? all.filter(item => compareSummary(item, {
    ...item,
    quotedServicePriceMinor: cursor.total,
    schedule: { ...item.schedule, startAt: cursor.startAt },
    quoteId: cursor.quoteId,
  }) > 0) : all;
  const quotes = afterCursor.slice(0, limit);
  const last = quotes.at(-1);
  const nextCursor = afterCursor.length > limit && last ? encodeComparisonCursor({
    context,
    total: last.quotedServicePriceMinor,
    startAt: last.schedule.startAt,
    quoteId: last.quoteId,
  }) : null;
  return deepFreeze({ quotes, nextCursor });
}
