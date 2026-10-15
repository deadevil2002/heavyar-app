export const SERVICE_EXECUTION_PRODUCTION_ACTIVATION =
  'disabled_pending_contractual_eligibility_booking_and_payment_prerequisites' as const;

export type ServiceExecutionKind = 'equipment_rental' | 'operator' | 'transporter';
export type ServiceExecutionStatus =
  | 'confirmed'
  | 'in_progress'
  | 'completion_requested'
  | 'completed'
  | 'disputed'
  | 'rental_managed';
export type ServiceExecutionAction =
  | 'start'
  | 'record_progress'
  | 'confirm_pickup'
  | 'confirm_delivery'
  | 'request_completion'
  | 'confirm_completion'
  | 'dispute_completion'
  | 'record_handover'
  | 'record_return';
export type ExecutionActorRole = 'customer' | 'provider';

export type ConfirmedExecutionBinding = {
  sourceKind: 'service_contract' | 'rental_request';
  sourceId: string;
  serviceKind: ServiceExecutionKind;
  customerUid: string;
  providerUid: string;
  sourceRevision: number;
  contractState: 'confirmed';
  eligibilityState: 'verified';
  bookingState: 'confirmed';
  paymentState: 'verified' | 'not_required';
};

export type ExecutionEvidence = Readonly<{ note?: string }>;
export type ServiceExecutionEvent = Readonly<{
  eventId: string;
  revision: number;
  action: 'confirmed' | ServiceExecutionAction;
  actorRole: ExecutionActorRole;
  actorUid: string;
  occurredAt: string;
  evidence?: ExecutionEvidence;
}>;
type OperationRecord = Readonly<{
  key: string;
  operation: string;
  fingerprint: string;
  actorUid: string;
  resultingRevision: number;
}>;

export type ServiceExecutionAggregate = Readonly<{
  contractVersion: 1;
  executionId: string;
  serviceKind: ServiceExecutionKind;
  lifecycleAuthority: 'service_execution' | 'rental_v2';
  source: Readonly<{
    kind: ConfirmedExecutionBinding['sourceKind'];
    id: string;
    revision: number;
  }>;
  customerUid: string;
  providerUid: string;
  status: ServiceExecutionStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  events: readonly ServiceExecutionEvent[];
  operationHistory: readonly OperationRecord[];
}>;

export class ServiceExecutionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ServiceExecutionError';
  }
}

const SAFE_UID = /^[A-Za-z0-9_-]{6,128}$/;
const SAFE_SOURCE_ID = /^[A-Za-z0-9:_-]{6,160}$/;
const SAFE_EXECUTION_ID = /^execution_[A-Za-z0-9_-]{43}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_EVENTS = 64;
const MAX_OPERATIONS = 100;
const EXECUTION_ACTIONS: readonly ServiceExecutionAction[] = [
  'start', 'record_progress', 'confirm_pickup', 'confirm_delivery', 'request_completion',
  'confirm_completion', 'dispute_completion', 'record_handover', 'record_return',
];

function timestamp(value: string) {
  if (!ISO.test(value) || !Number.isFinite(Date.parse(value))) throw new ServiceExecutionError('INVALID_EXECUTION_TIME');
  return new Date(Date.parse(value)).toISOString();
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function actorRole(state: ServiceExecutionAggregate, actorUid: string): ExecutionActorRole {
  if (actorUid === state.customerUid) return 'customer';
  if (actorUid === state.providerUid) return 'provider';
  throw new ServiceExecutionError('EXECUTION_NOT_AUTHORIZED');
}

function normalizedEvidence(value: unknown): ExecutionEvidence | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceExecutionError('INVALID_EXECUTION_EVIDENCE');
  const raw = value as Record<string, unknown>;
  if (!Object.keys(raw).every(key => ['note', 'photoReferences'].includes(key))) throw new ServiceExecutionError('INVALID_EXECUTION_EVIDENCE');
  if (raw.photoReferences !== undefined && (!Array.isArray(raw.photoReferences) || raw.photoReferences.length !== 0)) {
    // Current Cloudinary delivery is public. Private service evidence must not
    // be uploaded until authenticated/signed delivery and retention are ready.
    throw new ServiceExecutionError('EVIDENCE_PHOTO_DELIVERY_NOT_READY');
  }
  if (raw.note === undefined || raw.note === null || raw.note === '') return undefined;
  if (typeof raw.note !== 'string' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw.note)) {
    throw new ServiceExecutionError('INVALID_EXECUTION_EVIDENCE');
  }
  const note = raw.note.trim();
  if (!note || note.length > 500) throw new ServiceExecutionError('INVALID_EXECUTION_EVIDENCE');
  return freeze({ note });
}

function operationFingerprint(action: ServiceExecutionAction, evidence?: ExecutionEvidence) {
  return JSON.stringify({ action, evidence: evidence || null });
}

function replayed(
  state: ServiceExecutionAggregate,
  key: string,
  action: ServiceExecutionAction,
  fingerprint: string,
  actorUid: string,
) {
  if (!SAFE_IDEMPOTENCY_KEY.test(key)) throw new ServiceExecutionError('INVALID_IDEMPOTENCY_KEY');
  const prior = state.operationHistory.find(item => item.key === key);
  if (!prior) return false;
  if (prior.actorUid !== actorUid) throw new ServiceExecutionError('IDEMPOTENCY_ACTOR_MISMATCH');
  if (prior.operation !== action || prior.fingerprint !== fingerprint) throw new ServiceExecutionError('IDEMPOTENCY_CONFLICT');
  return true;
}

function hasEvent(state: ServiceExecutionAggregate, action: ServiceExecutionEvent['action']) {
  return state.events.some(event => event.action === action);
}

export function createConfirmedExecution(
  binding: ConfirmedExecutionBinding,
  server: { executionId: string; actorUid: string; idempotencyKey: string; now: string },
): ServiceExecutionAggregate {
  if (!SAFE_EXECUTION_ID.test(server.executionId) || !SAFE_IDEMPOTENCY_KEY.test(server.idempotencyKey) ||
      !SAFE_SOURCE_ID.test(binding.sourceId) || !SAFE_UID.test(binding.customerUid) || !SAFE_UID.test(binding.providerUid) ||
      binding.customerUid === binding.providerUid || !Number.isSafeInteger(binding.sourceRevision) || binding.sourceRevision < 0 ||
      server.actorUid !== binding.customerUid || binding.contractState !== 'confirmed' || binding.eligibilityState !== 'verified' ||
      binding.bookingState !== 'confirmed' || !['verified', 'not_required'].includes(binding.paymentState) ||
      binding.sourceKind === 'service_contract' && !['operator', 'transporter'].includes(binding.serviceKind) ||
      binding.sourceKind === 'rental_request' && binding.serviceKind !== 'equipment_rental') {
    throw new ServiceExecutionError('EXECUTION_PREREQUISITES_NOT_MET');
  }
  const now = timestamp(server.now);
  const status: ServiceExecutionStatus = binding.serviceKind === 'equipment_rental' ? 'rental_managed' : 'confirmed';
  const event: ServiceExecutionEvent = freeze({
    eventId: `${server.executionId}__0`, revision: 0, action: 'confirmed', actorRole: 'customer', actorUid: binding.customerUid, occurredAt: now,
  });
  return freeze({
    contractVersion: 1,
    executionId: server.executionId,
    serviceKind: binding.serviceKind,
    lifecycleAuthority: binding.serviceKind === 'equipment_rental' ? 'rental_v2' : 'service_execution',
    source: { kind: binding.sourceKind, id: binding.sourceId, revision: binding.sourceRevision },
    customerUid: binding.customerUid,
    providerUid: binding.providerUid,
    status,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    events: [event],
    operationHistory: [{
      key: server.idempotencyKey,
      operation: 'create',
      fingerprint: JSON.stringify({ sourceKind: binding.sourceKind, sourceId: binding.sourceId, sourceRevision: binding.sourceRevision }),
      actorUid: binding.customerUid,
      resultingRevision: 0,
    }],
  });
}

export function executionBindingMatches(state: ServiceExecutionAggregate, binding: ConfirmedExecutionBinding | null | undefined) {
  return !!binding && binding.contractState === 'confirmed' && binding.eligibilityState === 'verified' && binding.bookingState === 'confirmed' &&
    ['verified', 'not_required'].includes(binding.paymentState) && binding.sourceKind === state.source.kind && binding.sourceId === state.source.id &&
    binding.sourceRevision === state.source.revision && binding.serviceKind === state.serviceKind && binding.customerUid === state.customerUid &&
    binding.providerUid === state.providerUid;
}

export function transitionServiceExecution(
  state: ServiceExecutionAggregate,
  input: {
    action: ServiceExecutionAction;
    expectedRevision: number;
    idempotencyKey: string;
    evidence?: unknown;
  },
  actorUid: string,
  nowValue: string,
  rentalStatus?: string,
): ServiceExecutionAggregate {
  const role = actorRole(state, actorUid);
  const evidence = normalizedEvidence(input.evidence);
  const fingerprint = operationFingerprint(input.action, evidence);
  if (replayed(state, input.idempotencyKey, input.action, fingerprint, actorUid)) return state;
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) {
    throw new ServiceExecutionError('EXECUTION_STALE_REVISION');
  }
  if (state.events.length >= MAX_EVENTS) throw new ServiceExecutionError('EXECUTION_EVENT_LIMIT_REACHED');

  let nextStatus = state.status;
  const action = input.action;
  if (state.serviceKind === 'equipment_rental') {
    if (!['record_handover', 'record_progress', 'record_return', 'dispute_completion'].includes(action)) {
      throw new ServiceExecutionError('RENTAL_V2_LIFECYCLE_REQUIRED');
    }
    const allowed = action === 'record_handover' ? ['accepted', 'in_progress']
      : action === 'record_return' ? ['in_progress', 'completion_requested']
        : action === 'dispute_completion' ? ['completion_requested']
          : ['in_progress', 'completion_requested'];
    if (!rentalStatus || !allowed.includes(rentalStatus)) throw new ServiceExecutionError('INVALID_RENTAL_EVIDENCE_STATE');
  } else if (state.serviceKind === 'operator') {
    if (action === 'start' && role === 'provider' && state.status === 'confirmed') nextStatus = 'in_progress';
    else if (action === 'record_progress' && state.status === 'in_progress') nextStatus = state.status;
    else if (action === 'request_completion' && role === 'provider' && state.status === 'in_progress') nextStatus = 'completion_requested';
    else if (action === 'confirm_completion' && role === 'customer' && state.status === 'completion_requested') nextStatus = 'completed';
    else if (action === 'dispute_completion' && role === 'customer' && state.status === 'completion_requested') nextStatus = 'disputed';
    else throw new ServiceExecutionError('INVALID_EXECUTION_TRANSITION');
  } else {
    if (action === 'confirm_pickup' && role === 'provider' && state.status === 'confirmed') nextStatus = 'in_progress';
    else if (action === 'record_progress' && state.status === 'in_progress') nextStatus = state.status;
    else if (action === 'confirm_delivery' && role === 'provider' && state.status === 'in_progress' && hasEvent(state, 'confirm_pickup')) nextStatus = state.status;
    else if (action === 'request_completion' && role === 'provider' && state.status === 'in_progress' && hasEvent(state, 'confirm_delivery')) nextStatus = 'completion_requested';
    else if (action === 'confirm_completion' && role === 'customer' && state.status === 'completion_requested') nextStatus = 'completed';
    else if (action === 'dispute_completion' && role === 'customer' && state.status === 'completion_requested') nextStatus = 'disputed';
    else throw new ServiceExecutionError('INVALID_EXECUTION_TRANSITION');
  }

  const now = timestamp(nowValue);
  const revision = state.revision + 1;
  const event: ServiceExecutionEvent = freeze({
    eventId: `${state.executionId}__${revision}`,
    revision,
    action,
    actorRole: role,
    actorUid,
    occurredAt: now,
    ...(evidence ? { evidence } : {}),
  });
  return freeze({
    ...state,
    status: nextStatus,
    revision,
    updatedAt: now,
    events: [...state.events, event],
    operationHistory: [...state.operationHistory, {
      key: input.idempotencyKey, operation: action, fingerprint, actorUid, resultingRevision: revision,
    }].slice(-MAX_OPERATIONS),
  });
}

export function isServiceExecutionAggregate(value: unknown): value is ServiceExecutionAggregate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as ServiceExecutionAggregate;
  const baseValid = state.contractVersion === 1 && SAFE_EXECUTION_ID.test(String(state.executionId || '')) &&
    ['equipment_rental', 'operator', 'transporter'].includes(state.serviceKind) &&
    ['service_execution', 'rental_v2'].includes(state.lifecycleAuthority) &&
    SAFE_SOURCE_ID.test(String(state.source?.id || '')) && ['service_contract', 'rental_request'].includes(state.source?.kind) &&
    Number.isSafeInteger(state.source?.revision) && state.source.revision >= 0 && SAFE_UID.test(String(state.customerUid || '')) &&
    SAFE_UID.test(String(state.providerUid || '')) && state.customerUid !== state.providerUid &&
    ['confirmed', 'in_progress', 'completion_requested', 'completed', 'disputed', 'rental_managed'].includes(state.status) &&
    Number.isSafeInteger(state.revision) && state.revision >= 0 && Array.isArray(state.events) && state.events.length >= 1 && state.events.length <= MAX_EVENTS &&
    Array.isArray(state.operationHistory) && state.operationHistory.length >= 1 && state.operationHistory.length <= MAX_OPERATIONS &&
    ISO.test(state.createdAt) && Number.isFinite(Date.parse(state.createdAt)) && new Date(Date.parse(state.createdAt)).toISOString() === state.createdAt &&
    ISO.test(state.updatedAt) && Number.isFinite(Date.parse(state.updatedAt)) && new Date(Date.parse(state.updatedAt)).toISOString() === state.updatedAt &&
    Date.parse(state.updatedAt) >= Date.parse(state.createdAt);
  if (!baseValid || state.revision !== state.events.length - 1) return false;

  const isRental = state.serviceKind === 'equipment_rental';
  if (isRental !== (state.lifecycleAuthority === 'rental_v2') ||
      isRental !== (state.source.kind === 'rental_request') ||
      isRental !== (state.status === 'rental_managed')) return false;

  const eventsValid = state.events.every((event, index) => {
    if (!event || typeof event !== 'object' || event.revision !== index ||
        event.eventId !== `${state.executionId}__${index}` ||
        !['customer', 'provider'].includes(event.actorRole) ||
        event.actorUid !== (event.actorRole === 'customer' ? state.customerUid : state.providerUid) ||
        (index === 0 ? event.action !== 'confirmed' : !EXECUTION_ACTIONS.includes(event.action as ServiceExecutionAction)) ||
        !ISO.test(event.occurredAt) || !Number.isFinite(Date.parse(event.occurredAt)) ||
        new Date(Date.parse(event.occurredAt)).toISOString() !== event.occurredAt ||
        Date.parse(event.occurredAt) < Date.parse(state.createdAt) || Date.parse(event.occurredAt) > Date.parse(state.updatedAt)) return false;
    if (event.evidence === undefined) return true;
    const evidence = event.evidence as Record<string, unknown>;
    return !!evidence && typeof evidence === 'object' && !Array.isArray(evidence) &&
      Object.keys(evidence).length === 1 && typeof evidence.note === 'string' &&
      evidence.note === evidence.note.trim() && evidence.note.length > 0 && evidence.note.length <= 500 &&
      !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(evidence.note);
  });
  if (!eventsValid || state.events[0]?.action !== 'confirmed' || state.events[0]?.occurredAt !== state.createdAt) return false;

  return state.operationHistory.every(operation => !!operation && typeof operation === 'object' &&
    SAFE_IDEMPOTENCY_KEY.test(String(operation.key || '')) &&
    (operation.operation === 'create' || EXECUTION_ACTIONS.includes(operation.operation as ServiceExecutionAction)) &&
    typeof operation.fingerprint === 'string' && operation.fingerprint.length > 0 && operation.fingerprint.length <= 2048 &&
    (operation.actorUid === state.customerUid || operation.actorUid === state.providerUid) &&
    Number.isSafeInteger(operation.resultingRevision) && operation.resultingRevision >= 0 && operation.resultingRevision <= state.revision);
}
