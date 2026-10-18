import {
  type ActiveCustomerAuthority,
  type FutureProviderAuthority,
  type ProviderPrincipal,
  type QuoteVersionSnapshot,
  type ServiceKind,
  type ServiceRfqAggregate,
  providerCanManageFutureQuote,
} from './service-rfq';

export const SERVICE_CONTRACT_VERSION = 1 as const;
export const SERVICE_CONTRACT_TEST_TERMS_VERSION = 'synthetic-local-test-v1' as const;
export const SERVICE_CONTRACT_PRODUCTION_ACTIVATION =
  'disabled_pending_approved_legal_terms_payment_and_regulatory_release' as const;

const SAFE_CONTRACT_ID = /^contract_[A-Za-z0-9_-]{43}$/;
const SAFE_RFQ_ID = /^rfq_[A-Za-z0-9_-]{43}$/;
const SAFE_QUOTE_ID = /^quote_[A-Za-z0-9_-]{43}$/;
const SAFE_UID = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ORGANIZATION_ID = /^org_[A-Za-z0-9_-]{43}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_OPERATION_HISTORY = 20;

export type ServiceContractStatus = 'awaiting_acceptances' | 'pending_payment' | 'cancelled' | 'expired';
export type ServiceContractActorRole = 'customer' | 'provider';

export class ServiceContractError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ServiceContractError';
  }
}

export type ServiceContractSnapshot = Readonly<{
  contractVersion: 1;
  contractId: string;
  rfqId: string;
  rfqVersion: 1;
  rfqRevisionAtSelection: number;
  serviceKind: ServiceKind;
  customerUid: string;
  providerPrincipal: ProviderPrincipal;
  requirementsSnapshot: Readonly<Record<string, unknown>>;
  quoteId: string;
  quoteVersion: number;
  quoteSnapshot: QuoteVersionSnapshot;
  terms: Readonly<{
    version: typeof SERVICE_CONTRACT_TEST_TERMS_VERSION;
    source: 'synthetic_local_test_only';
    approvedForProduction: false;
  }>;
  createdAt: string;
  acceptanceExpiresAt: string;
}>;

export type ServiceContractAcceptance = Readonly<{
  role: ServiceContractActorRole;
  actorUid: string;
  acceptedAt: string;
  acceptedContractRevision: number;
  termsVersion: typeof SERVICE_CONTRACT_TEST_TERMS_VERSION;
}>;

type ContractOperation = Readonly<{
  key: string;
  operation: 'accept_customer' | 'accept_provider' | 'cancel';
  fingerprint: string;
  authorizationScope: string;
  resultingRevision: number;
}>;

export type ServiceContractAggregate = Readonly<{
  contractVersion: 1;
  snapshot: ServiceContractSnapshot;
  status: ServiceContractStatus;
  revision: number;
  customerAcceptance: ServiceContractAcceptance | null;
  providerAcceptance: ServiceContractAcceptance | null;
  paymentState: 'not_verified';
  bookingState: 'not_confirmed';
  executionAuthorized: false;
  settlementEnabled: false;
  updatedAt: string;
  operationHistory: readonly ContractOperation[];
}>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function principalScope(principal: ProviderPrincipal) {
  return principal.kind === 'individual' ? `individual:${principal.providerUid}` : `organization:${principal.organizationId}`;
}

function samePrincipal(left: ProviderPrincipal, right: ProviderPrincipal) {
  return principalScope(left) === principalScope(right);
}

function validPrincipal(principal: ProviderPrincipal) {
  return principal.kind === 'individual'
    ? SAFE_UID.test(principal.providerUid)
    : SAFE_ORGANIZATION_ID.test(principal.organizationId);
}

function assertCustomer(authority: ActiveCustomerAuthority, customerUid: string) {
  if (!SAFE_UID.test(authority.actorUid) || authority.actorUid !== customerUid || authority.role !== 'customer' ||
      authority.accountState !== 'active' || authority.revoked || authority.accountPurpose !== 'standard') {
    throw new ServiceContractError('CONTRACT_CUSTOMER_NOT_AUTHORIZED');
  }
}

function assertProvider(authority: FutureProviderAuthority, principal: ProviderPrincipal, serviceKind: ServiceKind) {
  if (!providerCanManageFutureQuote(authority, serviceKind) || !samePrincipal(authority.principal, principal)) {
    throw new ServiceContractError('CONTRACT_PROVIDER_NOT_AUTHORIZED');
  }
}

function selectedAssociation(rfq: ServiceRfqAggregate) {
  if (rfq.rfq.status !== 'provisionally_selected' || !rfq.provisionalSelection) {
    throw new ServiceContractError('CONTRACT_SELECTION_NOT_READY');
  }
  const quote = rfq.quotes.find(item => item.quoteId === rfq.provisionalSelection?.quoteId);
  const quoteSnapshot = quote?.snapshots[rfq.provisionalSelection.quoteVersion - 1];
  if (!quote || !quoteSnapshot || quote.currentVersion !== rfq.provisionalSelection.quoteVersion) {
    throw new ServiceContractError('CONTRACT_SELECTION_NOT_READY');
  }
  return { quote, quoteSnapshot };
}

function selectedContext(rfq: ServiceRfqAggregate, now: string) {
  const { quote, quoteSnapshot } = selectedAssociation(rfq);
  if (quote.status !== 'active') {
    throw new ServiceContractError('CONTRACT_QUOTE_NOT_ACTIVE');
  }
  if (!quoteSnapshot || quoteSnapshot.currency !== 'SAR' || !Number.isSafeInteger(quoteSnapshot.quotedServicePriceMinor) ||
      quoteSnapshot.quotedServicePriceMinor <= 0 || Date.parse(now) >= Date.parse(quoteSnapshot.expiresAt) ||
      Date.parse(now) >= Date.parse(rfq.rfq.expiresAt)) {
    throw new ServiceContractError('CONTRACT_QUOTE_EXPIRED');
  }
  return { quote, quoteSnapshot };
}

function assertSnapshotMatchesRfq(state: ServiceContractAggregate, rfq: ServiceRfqAggregate, now: string) {
  const { quote, quoteSnapshot } = selectedContext(rfq, now);
  assertStoredAssociation(state, rfq, quote, quoteSnapshot);
}

function assertStoredAssociation(
  state: ServiceContractAggregate,
  rfq: ServiceRfqAggregate,
  quote = rfq.provisionalSelection ? rfq.quotes.find(item => item.quoteId === rfq.provisionalSelection?.quoteId) : undefined,
  quoteSnapshot = quote && rfq.provisionalSelection ? quote.snapshots[rfq.provisionalSelection.quoteVersion - 1] : undefined,
) {
  const snapshot = state.snapshot;
  if (!quote || !quoteSnapshot || !rfq.provisionalSelection || snapshot.rfqId !== rfq.rfq.rfqId || snapshot.rfqVersion !== rfq.rfq.version ||
      snapshot.serviceKind !== rfq.rfq.serviceKind || snapshot.customerUid !== rfq.rfq.customerUid ||
      snapshot.quoteId !== quote.quoteId || snapshot.quoteVersion !== rfq.provisionalSelection.quoteVersion ||
      !samePrincipal(snapshot.providerPrincipal, quote.principal) ||
      stableJson(snapshot.requirementsSnapshot) !== stableJson(rfq.rfq.requirementsSnapshot) ||
      stableJson(snapshot.quoteSnapshot) !== stableJson(quoteSnapshot)) {
    throw new ServiceContractError('CONTRACT_SNAPSHOT_STALE');
  }
}

function operationScope(role: ServiceContractActorRole, actorUid: string, principal: ProviderPrincipal) {
  return role === 'customer' ? `customer:${actorUid}` : `provider:${actorUid}:${principalScope(principal)}`;
}

function priorOperation(
  state: ServiceContractAggregate,
  key: string,
  operation: ContractOperation['operation'],
  fingerprint: string,
  authorizationScope: string,
) {
  const prior = state.operationHistory.find(item => item.key === key);
  if (!prior) return false;
  if (prior.operation !== operation || prior.fingerprint !== fingerprint || prior.authorizationScope !== authorizationScope) {
    throw new ServiceContractError('CONTRACT_IDEMPOTENCY_CONFLICT');
  }
  return true;
}

function finishOperation(
  state: ServiceContractAggregate,
  key: string,
  operation: ContractOperation['operation'],
  fingerprint: string,
  authorizationScope: string,
) {
  return deepFreeze({
    ...state,
    operationHistory: [...state.operationHistory, {
      key, operation, fingerprint, authorizationScope, resultingRevision: state.revision,
    }].slice(-MAX_OPERATION_HISTORY),
  });
}

function newContract(
  rfq: ServiceRfqAggregate,
  contractId: string,
  customer: ActiveCustomerAuthority,
  provider: FutureProviderAuthority,
  now: string,
): ServiceContractAggregate {
  const selected = selectedContext(rfq, now);
  assertCustomer(customer, rfq.rfq.customerUid);
  assertProvider(provider, selected.quote.principal, rfq.rfq.serviceKind);
  if (!SAFE_CONTRACT_ID.test(contractId)) throw new ServiceContractError('INVALID_SERVICE_CONTRACT');
  return deepFreeze({
    contractVersion: 1,
    snapshot: {
      contractVersion: 1,
      contractId,
      rfqId: rfq.rfq.rfqId,
      rfqVersion: rfq.rfq.version,
      rfqRevisionAtSelection: rfq.rfq.revision,
      serviceKind: rfq.rfq.serviceKind,
      customerUid: rfq.rfq.customerUid,
      providerPrincipal: clone(selected.quote.principal),
      requirementsSnapshot: clone(rfq.rfq.requirementsSnapshot),
      quoteId: selected.quote.quoteId,
      quoteVersion: selected.quote.currentVersion,
      quoteSnapshot: clone(selected.quoteSnapshot),
      terms: { version: SERVICE_CONTRACT_TEST_TERMS_VERSION, source: 'synthetic_local_test_only', approvedForProduction: false },
      createdAt: now,
      acceptanceExpiresAt: selected.quoteSnapshot.expiresAt,
    },
    status: 'awaiting_acceptances',
    revision: 0,
    customerAcceptance: null,
    providerAcceptance: null,
    paymentState: 'not_verified',
    bookingState: 'not_confirmed',
    executionAuthorized: false,
    settlementEnabled: false,
    updatedAt: now,
    operationHistory: [],
  });
}

export function acceptTestOnlyServiceContract(
  existing: ServiceContractAggregate | null,
  rfq: ServiceRfqAggregate,
  request: {
    contractId: string;
    actorRole: ServiceContractActorRole;
    actorUid: string;
    customer: ActiveCustomerAuthority;
    provider: FutureProviderAuthority;
    quoteId: string;
    quoteVersion: number;
    termsVersion: string;
    expectedContractRevision: number;
    idempotencyKey: string;
    now: string;
  },
): ServiceContractAggregate {
  const now = timestamp(request.now);
  if (!now || !SAFE_UID.test(request.actorUid) || !SAFE_IDEMPOTENCY_KEY.test(request.idempotencyKey) ||
      !SAFE_QUOTE_ID.test(request.quoteId) || !Number.isSafeInteger(request.quoteVersion) || request.quoteVersion < 1 ||
      !Number.isSafeInteger(request.expectedContractRevision) || request.expectedContractRevision < 0 ||
      request.termsVersion !== SERVICE_CONTRACT_TEST_TERMS_VERSION) {
    throw new ServiceContractError('INVALID_CONTRACT_ACCEPTANCE');
  }
  const selected = selectedAssociation(rfq);
  assertCustomer(request.customer, rfq.rfq.customerUid);
  assertProvider(request.provider, selected.quote.principal, rfq.rfq.serviceKind);
  if (request.actorRole === 'customer' ? request.actorUid !== request.customer.actorUid : request.actorUid !== request.provider.actorUid) {
    throw new ServiceContractError('CONTRACT_ACTOR_NOT_AUTHORIZED');
  }
  if (request.quoteId !== selected.quote.quoteId || request.quoteVersion !== selected.quote.currentVersion) {
    throw new ServiceContractError('CONTRACT_SELECTION_MISMATCH');
  }
  const operation = request.actorRole === 'customer' ? 'accept_customer' as const : 'accept_provider' as const;
  const fingerprint = `${operation}|${request.quoteId}|${request.quoteVersion}|${request.termsVersion}|${request.expectedContractRevision}`;
  const authorizationScope = operationScope(request.actorRole, request.actorUid, selected.quote.principal);
  if (existing) {
    if (existing.snapshot.contractId !== request.contractId) throw new ServiceContractError('CONTRACT_SNAPSHOT_STALE');
    assertStoredAssociation(existing, rfq);
    if (priorOperation(existing, request.idempotencyKey, operation, fingerprint, authorizationScope)) return existing;
  }
  // Only a new state transition requires the selected quote and acceptance
  // window to remain active. Exact idempotent replays return the prior result.
  selectedContext(rfq, now);
  const state = existing || newContract(rfq, request.contractId, request.customer, request.provider, now);
  assertSnapshotMatchesRfq(state, rfq, now);
  if (state.revision !== request.expectedContractRevision) throw new ServiceContractError('STALE_CONTRACT_REVISION');
  if (state.status !== 'awaiting_acceptances') throw new ServiceContractError('INVALID_CONTRACT_TRANSITION');
  const existingAcceptance = request.actorRole === 'customer' ? state.customerAcceptance : state.providerAcceptance;
  if (existingAcceptance) throw new ServiceContractError('CONTRACT_ALREADY_ACCEPTED');
  const revision = state.revision + 1;
  const acceptance: ServiceContractAcceptance = {
    role: request.actorRole,
    actorUid: request.actorUid,
    acceptedAt: now,
    acceptedContractRevision: revision,
    termsVersion: SERVICE_CONTRACT_TEST_TERMS_VERSION,
  };
  const customerAcceptance = request.actorRole === 'customer' ? acceptance : state.customerAcceptance;
  const providerAcceptance = request.actorRole === 'provider' ? acceptance : state.providerAcceptance;
  return finishOperation(deepFreeze({
    ...state,
    revision,
    status: customerAcceptance && providerAcceptance ? 'pending_payment' as const : 'awaiting_acceptances' as const,
    customerAcceptance,
    providerAcceptance,
    paymentState: 'not_verified' as const,
    bookingState: 'not_confirmed' as const,
    executionAuthorized: false as const,
    settlementEnabled: false as const,
    updatedAt: now,
  }), request.idempotencyKey, operation, fingerprint, authorizationScope);
}

export function cancelTestOnlyServiceContract(
  state: ServiceContractAggregate,
  rfq: ServiceRfqAggregate,
  request: {
    actorRole: ServiceContractActorRole;
    actorUid: string;
    customer: ActiveCustomerAuthority;
    provider: FutureProviderAuthority;
    expectedContractRevision: number;
    idempotencyKey: string;
    now: string;
  },
) {
  const now = timestamp(request.now);
  if (!now || !SAFE_IDEMPOTENCY_KEY.test(request.idempotencyKey) || !Number.isSafeInteger(request.expectedContractRevision)) {
    throw new ServiceContractError('INVALID_CONTRACT_CANCELLATION');
  }
  assertCustomer(request.customer, rfq.rfq.customerUid);
  assertProvider(request.provider, state.snapshot.providerPrincipal, rfq.rfq.serviceKind);
  assertStoredAssociation(state, rfq);
  if (request.actorRole === 'customer' ? request.actorUid !== request.customer.actorUid : request.actorUid !== request.provider.actorUid) {
    throw new ServiceContractError('CONTRACT_ACTOR_NOT_AUTHORIZED');
  }
  const operation = 'cancel' as const;
  const fingerprint = `${operation}|${request.expectedContractRevision}`;
  const authorizationScope = operationScope(request.actorRole, request.actorUid, state.snapshot.providerPrincipal);
  if (priorOperation(state, request.idempotencyKey, operation, fingerprint, authorizationScope)) return state;
  if (state.revision !== request.expectedContractRevision) throw new ServiceContractError('STALE_CONTRACT_REVISION');
  if (!['awaiting_acceptances', 'pending_payment'].includes(state.status)) throw new ServiceContractError('INVALID_CONTRACT_TRANSITION');
  const next = deepFreeze({ ...state, status: 'cancelled' as const, revision: state.revision + 1, updatedAt: now });
  return finishOperation(next, request.idempotencyKey, operation, fingerprint, authorizationScope);
}

export function expireTestOnlyServiceContract(state: ServiceContractAggregate, nowValue: string) {
  const now = timestamp(nowValue);
  if (!now || state.status !== 'awaiting_acceptances' || Date.parse(now) < Date.parse(state.snapshot.acceptanceExpiresAt)) {
    throw new ServiceContractError('INVALID_CONTRACT_EXPIRY');
  }
  return deepFreeze({ ...state, status: 'expired' as const, revision: state.revision + 1, updatedAt: now });
}

function validAcceptance(value: unknown, role: ServiceContractActorRole, maxRevision: number): value is ServiceContractAcceptance {
  const item = record(value);
  return !!item && item.role === role && typeof item.actorUid === 'string' && SAFE_UID.test(item.actorUid) &&
    !!timestamp(item.acceptedAt) && Number.isSafeInteger(item.acceptedContractRevision) &&
    Number(item.acceptedContractRevision) > 0 && Number(item.acceptedContractRevision) <= maxRevision &&
    item.termsVersion === SERVICE_CONTRACT_TEST_TERMS_VERSION;
}

function validQuoteSnapshot(value: unknown, expectedVersion: unknown): value is QuoteVersionSnapshot {
  const quote = record(value), schedule = record(quote?.schedule);
  if (!quote || quote.contractVersion !== 1 || quote.quoteVersion !== expectedVersion ||
      typeof quote.serviceScope !== 'string' || quote.serviceScope.trim().length < 5 || quote.serviceScope.length > 500 ||
      !schedule || !timestamp(schedule.startAt) || !timestamp(schedule.endAt) ||
      Date.parse(schedule.endAt as string) <= Date.parse(schedule.startAt as string) ||
      !Array.isArray(quote.inclusions) || quote.inclusions.length > 12 || !Array.isArray(quote.exclusions) || quote.exclusions.length > 12 ||
      ![...quote.inclusions, ...quote.exclusions].every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= 180) ||
      typeof quote.serviceCategory !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(quote.serviceCategory) ||
      !['declared_available', 'declared_limited'].includes(String(quote.availability)) || quote.currency !== 'SAR' ||
      !Number.isSafeInteger(quote.baseServicePriceMinor) || Number(quote.baseServicePriceMinor) <= 0 ||
      !Array.isArray(quote.optionalComponents) || quote.optionalComponents.length > 8 ||
      !Number.isSafeInteger(quote.quotedServicePriceMinor) || Number(quote.quotedServicePriceMinor) <= 0 ||
      !timestamp(quote.expiresAt) || !timestamp(quote.createdAt)) return false;
  let total = Number(quote.baseServicePriceMinor);
  for (const raw of quote.optionalComponents) {
    const component = record(raw);
    if (!component || typeof component.code !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(component.code) ||
        typeof component.label !== 'string' || component.label.trim().length < 1 || component.label.length > 120 ||
        !Number.isSafeInteger(component.amountMinor) || Number(component.amountMinor) < 0 ||
        total > Number.MAX_SAFE_INTEGER - Number(component.amountMinor)) return false;
    total += Number(component.amountMinor);
  }
  return total === quote.quotedServicePriceMinor;
}

export function isServiceContractAggregate(value: unknown): value is ServiceContractAggregate {
  const state = record(value), snapshot = record(state?.snapshot), principal = record(snapshot?.providerPrincipal), quote = record(snapshot?.quoteSnapshot);
  if (!state || state.contractVersion !== 1 || !snapshot || snapshot.contractVersion !== 1 ||
      typeof snapshot.contractId !== 'string' || !SAFE_CONTRACT_ID.test(snapshot.contractId) ||
      typeof snapshot.rfqId !== 'string' || !SAFE_RFQ_ID.test(snapshot.rfqId) || snapshot.rfqVersion !== 1 ||
      !Number.isSafeInteger(snapshot.rfqRevisionAtSelection) || !['operator', 'transporter'].includes(String(snapshot.serviceKind)) ||
      typeof snapshot.customerUid !== 'string' || !SAFE_UID.test(snapshot.customerUid) || !principal ||
      !validPrincipal(principal as ProviderPrincipal) || !record(snapshot.requirementsSnapshot) ||
      typeof snapshot.quoteId !== 'string' || !SAFE_QUOTE_ID.test(snapshot.quoteId) ||
      !Number.isSafeInteger(snapshot.quoteVersion) || Number(snapshot.quoteVersion) < 1 || !quote ||
      !validQuoteSnapshot(quote, snapshot.quoteVersion) ||
      !timestamp(snapshot.createdAt) || !timestamp(snapshot.acceptanceExpiresAt) ||
      stableJson(snapshot.terms) !== stableJson({ version: SERVICE_CONTRACT_TEST_TERMS_VERSION, source: 'synthetic_local_test_only', approvedForProduction: false }) ||
      !['awaiting_acceptances', 'pending_payment', 'cancelled', 'expired'].includes(String(state.status)) ||
      !Number.isSafeInteger(state.revision) || Number(state.revision) < 0 || !timestamp(state.updatedAt) ||
      state.paymentState !== 'not_verified' || state.bookingState !== 'not_confirmed' ||
      state.executionAuthorized !== false || state.settlementEnabled !== false || !Array.isArray(state.operationHistory) ||
      state.operationHistory.length > MAX_OPERATION_HISTORY) return false;
  const revision = Number(state.revision);
  const customerAcceptance = state.customerAcceptance === null ? null : validAcceptance(state.customerAcceptance, 'customer', revision);
  const providerAcceptance = state.providerAcceptance === null ? null : validAcceptance(state.providerAcceptance, 'provider', revision);
  if (customerAcceptance === false || providerAcceptance === false) return false;
  const bothAccepted = state.customerAcceptance !== null && state.providerAcceptance !== null;
  if (state.status === 'pending_payment' && !bothAccepted || state.status === 'awaiting_acceptances' && bothAccepted) return false;
  return state.operationHistory.every(item => {
    const operation = record(item);
    return !!operation && typeof operation.key === 'string' && SAFE_IDEMPOTENCY_KEY.test(operation.key) &&
      ['accept_customer', 'accept_provider', 'cancel'].includes(String(operation.operation)) &&
      typeof operation.fingerprint === 'string' && operation.fingerprint.length <= 500 &&
      typeof operation.authorizationScope === 'string' && operation.authorizationScope.length <= 500 &&
      Number.isSafeInteger(operation.resultingRevision) && Number(operation.resultingRevision) <= revision;
  });
}

export function serviceContractParticipantRole(
  state: ServiceContractAggregate,
  actorUid: string,
  providerAuthority?: FutureProviderAuthority,
): ServiceContractActorRole | null {
  if (state.snapshot.customerUid === actorUid) return 'customer';
  if (providerAuthority && providerAuthority.actorUid === actorUid &&
      providerCanManageFutureQuote(providerAuthority, state.snapshot.serviceKind) &&
      samePrincipal(providerAuthority.principal, state.snapshot.providerPrincipal)) return 'provider';
  return null;
}

export function serviceContractPrivateView(state: ServiceContractAggregate, role: ServiceContractActorRole, nowValue = state.updatedAt) {
  const status = state.status === 'awaiting_acceptances' && Date.parse(nowValue) >= Date.parse(state.snapshot.acceptanceExpiresAt)
    ? 'expired' as const
    : state.status;
  return {
    contractVersion: 1 as const,
    contractId: state.snapshot.contractId,
    rfqId: state.snapshot.rfqId,
    rfqRevisionAtSelection: state.snapshot.rfqRevisionAtSelection,
    serviceKind: state.snapshot.serviceKind,
    status,
    revision: state.revision,
    participantRole: role,
    selectedQuote: {
      quoteId: state.snapshot.quoteId,
      quoteVersion: state.snapshot.quoteVersion,
      serviceScope: state.snapshot.quoteSnapshot.serviceScope,
      schedule: state.snapshot.quoteSnapshot.schedule,
      inclusions: state.snapshot.quoteSnapshot.inclusions,
      exclusions: state.snapshot.quoteSnapshot.exclusions,
      currency: state.snapshot.quoteSnapshot.currency,
      quotedServicePriceMinor: state.snapshot.quoteSnapshot.quotedServicePriceMinor,
      expiresAt: state.snapshot.quoteSnapshot.expiresAt,
    },
    requirementsSnapshot: state.snapshot.requirementsSnapshot,
    terms: state.snapshot.terms,
    customerAcceptance: state.customerAcceptance ? { acceptedAt: state.customerAcceptance.acceptedAt, termsVersion: state.customerAcceptance.termsVersion } : null,
    providerAcceptance: state.providerAcceptance ? { acceptedAt: state.providerAcceptance.acceptedAt, termsVersion: state.providerAcceptance.termsVersion } : null,
    paymentState: state.paymentState,
    bookingState: state.bookingState,
    executionAuthorized: state.executionAuthorized,
    settlementEnabled: state.settlementEnabled,
    createdAt: state.snapshot.createdAt,
    updatedAt: state.updatedAt,
    acceptanceExpiresAt: state.snapshot.acceptanceExpiresAt,
    productionEnabled: false as const,
    legallyBinding: false as const,
  };
}
