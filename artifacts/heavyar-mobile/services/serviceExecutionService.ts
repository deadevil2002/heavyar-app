import { QuoteComparisonScopeGuard } from './serviceQuoteComparison';
import { request, WorkerError } from './workerClient';

export type ServiceExecutionKind = 'equipment_rental' | 'operator' | 'transporter';
export type ServiceExecutionStatus = 'confirmed' | 'in_progress' | 'completion_requested' | 'completed' | 'disputed' | 'rental_managed';
export type ServiceExecutionAction =
  | 'start' | 'record_progress' | 'confirm_pickup' | 'confirm_delivery'
  | 'request_completion' | 'confirm_completion' | 'dispute_completion'
  | 'record_handover' | 'record_return';
export type ServiceExecutionEvent = {
  eventId: string;
  revision: number;
  action: 'confirmed' | ServiceExecutionAction;
  actorRole: 'customer' | 'provider';
  occurredAt: string;
  evidence?: { note?: string; media?: { mediaId: string }[] };
};
export type ServiceExecutionDetail = {
  access: 'customer' | 'provider';
  execution: {
    executionId: string;
    serviceKind: ServiceExecutionKind;
    lifecycleAuthority: 'service_execution' | 'rental_v2';
    source: { kind: 'service_contract' | 'rental_request'; id: string; revision: number };
    status: ServiceExecutionStatus;
    revision: number;
    createdAt: string;
    updatedAt: string;
    rentalStatus?: string;
    events: ServiceExecutionEvent[];
  };
  activation: {
    productionEnabled: false;
    reason: 'disabled_pending_contractual_eligibility_booking_and_payment_prerequisites';
  };
  evidenceMedia: {
    enabled: boolean;
    reason?: 'disabled_pending_authenticated_private_media_delivery';
    limits: { maxFilesPerEvent: 3; maxFileBytes: 5242880 };
  };
};

const EXECUTION_ID = /^execution_[A-Za-z0-9_-]{43}$/;
const SOURCE_ID = /^[A-Za-z0-9:_-]{6,160}$/;
const EVENT_ID = /^execution_[A-Za-z0-9_-]{43}__\d{1,3}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const actions = new Set(['confirmed', 'start', 'record_progress', 'confirm_pickup', 'confirm_delivery', 'request_completion', 'confirm_completion', 'dispute_completion', 'record_handover', 'record_return']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function iso(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value));
}

export function decodeServiceExecutionDetail(value: unknown): ServiceExecutionDetail {
  const root = record(value), execution = record(root?.execution), source = record(execution?.source), activation = record(root?.activation);
  const evidenceMedia = record(root?.evidenceMedia), mediaLimits = record(evidenceMedia?.limits);
  const executionKeys = ['executionId', 'serviceKind', 'lifecycleAuthority', 'source', 'status', 'revision', 'createdAt', 'updatedAt', 'rentalStatus', 'events'];
  if (!root || !Object.keys(root).every(key => ['success', 'access', 'execution', 'activation', 'evidenceMedia', 'replayed'].includes(key)) ||
      !['customer', 'provider'].includes(String(root.access)) || !execution || Object.keys(execution).some(key => !executionKeys.includes(key)) ||
      !EXECUTION_ID.test(String(execution.executionId || '')) || !['equipment_rental', 'operator', 'transporter'].includes(String(execution.serviceKind)) ||
      !['service_execution', 'rental_v2'].includes(String(execution.lifecycleAuthority)) || !source || Object.keys(source).some(key => !['kind', 'id', 'revision'].includes(key)) ||
      !['service_contract', 'rental_request'].includes(String(source.kind)) || !SOURCE_ID.test(String(source.id || '')) ||
      !Number.isSafeInteger(source.revision) || Number(source.revision) < 0 ||
      !['confirmed', 'in_progress', 'completion_requested', 'completed', 'disputed', 'rental_managed'].includes(String(execution.status)) ||
      !Number.isSafeInteger(execution.revision) || Number(execution.revision) < 0 || !iso(execution.createdAt) || !iso(execution.updatedAt) ||
      !Array.isArray(execution.events) || execution.events.length < 1 || execution.events.length > 64 ||
      !activation || activation.productionEnabled !== false || activation.reason !== 'disabled_pending_contractual_eligibility_booking_and_payment_prerequisites' ||
      !evidenceMedia || !Object.keys(evidenceMedia).every(key => ['enabled', 'reason', 'limits'].includes(key)) ||
      typeof evidenceMedia.enabled !== 'boolean' ||
      (evidenceMedia.enabled === false) !== (evidenceMedia.reason === 'disabled_pending_authenticated_private_media_delivery') ||
      !mediaLimits || Object.keys(mediaLimits).some(key => !['maxFilesPerEvent', 'maxFileBytes'].includes(key)) ||
      mediaLimits.maxFilesPerEvent !== 3 || mediaLimits.maxFileBytes !== 5 * 1024 * 1024) {
    throw new WorkerError('Invalid service execution response', 502, 'INVALID_SERVICE_EXECUTION_RESPONSE');
  }
  const events = execution.events.map((value): ServiceExecutionEvent | null => {
    const event = record(value), evidence = record(event?.evidence);
    if (!event || Object.keys(event).some(key => !['eventId', 'revision', 'action', 'actorRole', 'occurredAt', 'evidence'].includes(key)) ||
        !EVENT_ID.test(String(event.eventId || '')) || !String(event.eventId).startsWith(`${String(execution.executionId)}__`) ||
        !Number.isSafeInteger(event.revision) || Number(event.revision) < 0 ||
        !actions.has(String(event.action)) || !['customer', 'provider'].includes(String(event.actorRole)) || !iso(event.occurredAt) ||
        event.evidence !== undefined && (!evidence || Object.keys(evidence).some(key => !['note', 'media'].includes(key)) ||
          evidence.note !== undefined && (typeof evidence.note !== 'string' || evidence.note.length > 500) ||
          evidence.media !== undefined && (!Array.isArray(evidence.media) || evidence.media.length < 1 || evidence.media.length > 3 ||
            evidence.media.some(item => {
              const media = record(item);
              return !media || Object.keys(media).some(key => key !== 'mediaId') || !/^evidence_media_[A-Za-z0-9_-]{43}$/.test(String(media.mediaId || ''));
            })))) return null;
    return {
      eventId: event.eventId as string,
      revision: event.revision as number,
      action: event.action as ServiceExecutionEvent['action'],
      actorRole: event.actorRole as ServiceExecutionEvent['actorRole'],
      occurredAt: event.occurredAt as string,
      ...(evidence ? { evidence: {
        ...(typeof evidence.note === 'string' ? { note: evidence.note } : {}),
        ...(Array.isArray(evidence.media) ? { media: evidence.media as { mediaId: string }[] } : {}),
      } } : {}),
    };
  });
  if (events.some(event => !event) || events.some((event, index) => event!.revision !== index) || events.at(-1)!.revision !== execution.revision) {
    throw new WorkerError('Invalid service execution response', 502, 'INVALID_SERVICE_EXECUTION_RESPONSE');
  }
  return {
    access: root.access as ServiceExecutionDetail['access'],
    execution: {
      executionId: execution.executionId as string,
      serviceKind: execution.serviceKind as ServiceExecutionKind,
      lifecycleAuthority: execution.lifecycleAuthority as ServiceExecutionDetail['execution']['lifecycleAuthority'],
      source: source as ServiceExecutionDetail['execution']['source'],
      status: execution.status as ServiceExecutionStatus,
      revision: execution.revision as number,
      createdAt: execution.createdAt as string,
      updatedAt: execution.updatedAt as string,
      ...(typeof execution.rentalStatus === 'string' ? { rentalStatus: execution.rentalStatus } : {}),
      events: events as ServiceExecutionEvent[],
    },
    activation: activation as ServiceExecutionDetail['activation'],
    evidenceMedia: evidenceMedia as ServiceExecutionDetail['evidenceMedia'],
  };
}

export function serviceExecutionIdempotencyKey(scope: string) {
  const safe = scope.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 24) || 'operation';
  return `${safe}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 14)}`;
}

export async function createServiceExecution(
  source: { kind: 'service_contract' | 'rental_request'; id: string },
  idempotencyKey: string,
  expectedUid: string,
  signal?: AbortSignal,
) {
  return decodeServiceExecutionDetail(await request<unknown>('/api/service-executions', {
    method: 'POST', body: JSON.stringify({ sourceKind: source.kind, sourceId: source.id, idempotencyKey }), signal,
  }, true, expectedUid));
}

export async function getServiceExecution(executionId: string, expectedUid: string, signal?: AbortSignal) {
  return decodeServiceExecutionDetail(await request<unknown>(`/api/service-executions/${encodeURIComponent(executionId)}`, { signal }, true, expectedUid));
}

export async function transitionServiceExecution(
  executionId: string,
  input: { action: ServiceExecutionAction; expectedRevision: number; idempotencyKey: string; evidence?: { note?: string; photoReferences?: never[]; mediaIntentId?: string } },
  expectedUid: string,
  signal?: AbortSignal,
) {
  return decodeServiceExecutionDetail(await request<unknown>(`/api/service-executions/${encodeURIComponent(executionId)}/transitions`, {
    method: 'POST', body: JSON.stringify(input), signal,
  }, true, expectedUid));
}

export class ServiceExecutionScopeGuard extends QuoteComparisonScopeGuard {}
