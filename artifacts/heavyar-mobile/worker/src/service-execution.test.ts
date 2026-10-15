import { describe, expect, it } from 'vitest';
import {
  ServiceExecutionError,
  createConfirmedExecution,
  executionBindingMatches,
  isServiceExecutionAggregate,
  transitionServiceExecution,
  type ConfirmedExecutionBinding,
  type ServiceExecutionAggregate,
} from './service-execution';

const customerUid = 'customer_uid_123';
const providerUid = 'provider_uid_456';
const at = (minute: number) => `2026-10-15T10:${String(minute).padStart(2, '0')}:00.000Z`;
const binding = (serviceKind: ConfirmedExecutionBinding['serviceKind'] = 'operator'): ConfirmedExecutionBinding => ({
  sourceKind: serviceKind === 'equipment_rental' ? 'rental_request' : 'service_contract',
  sourceId: serviceKind === 'equipment_rental' ? 'rental_request_123' : 'service_contract_123',
  serviceKind,
  customerUid,
  providerUid,
  sourceRevision: 4,
  contractState: 'confirmed',
  eligibilityState: 'verified',
  bookingState: 'confirmed',
  paymentState: 'not_required',
});
function create(serviceKind: ConfirmedExecutionBinding['serviceKind'] = 'operator') {
  return createConfirmedExecution(binding(serviceKind), {
    executionId: `execution_${'a'.repeat(43)}`,
    actorUid: customerUid,
    idempotencyKey: 'create:customer:123',
    now: at(0),
  });
}
function move(
  state: ServiceExecutionAggregate,
  action: Parameters<typeof transitionServiceExecution>[1]['action'],
  actorUid: string,
  minute: number,
  rentalStatus?: string,
  evidence?: unknown,
) {
  return transitionServiceExecution(state, {
    action, expectedRevision: state.revision, idempotencyKey: `${action}:${actorUid}:${minute}`, evidence,
  }, actorUid, at(minute), rentalStatus);
}

describe('service execution lifecycle', () => {
  it('requires a server-confirmed binding and never accepts a provisional selection', () => {
    expect(() => createConfirmedExecution({ ...binding(), contractState: 'provisional_selection' as never }, {
      executionId: `execution_${'a'.repeat(43)}`, actorUid: customerUid, idempotencyKey: 'create:customer:123', now: at(0),
    })).toThrowError(new ServiceExecutionError('EXECUTION_PREREQUISITES_NOT_MET'));
    expect(() => createConfirmedExecution({ ...binding(), paymentState: 'pending' as never }, {
      executionId: `execution_${'a'.repeat(43)}`, actorUid: customerUid, idempotencyKey: 'create:customer:123', now: at(0),
    })).toThrowError(new ServiceExecutionError('EXECUTION_PREREQUISITES_NOT_MET'));
  });

  it('fails authoritative source revalidation after cancellation, expiry, or participant changes', () => {
    const state = create();
    expect(executionBindingMatches(state, binding())).toBe(true);
    expect(executionBindingMatches(state, null)).toBe(false);
    expect(executionBindingMatches(state, { ...binding(), sourceRevision: 5 })).toBe(false);
    expect(executionBindingMatches(state, { ...binding(), providerUid: 'different_provider_uid' })).toBe(false);
  });

  it('runs operator start, progress, requested completion, confirmation and immutable history', () => {
    const initial = create();
    const started = move(initial, 'start', providerUid, 1);
    const progressed = move(started, 'record_progress', providerUid, 2, undefined, { note: 'Arrived and checked the machine.' });
    const requested = move(progressed, 'request_completion', providerUid, 3);
    const completed = move(requested, 'confirm_completion', customerUid, 4);
    expect(completed.status).toBe('completed');
    expect(completed.events.map(event => event.action)).toEqual(['confirmed', 'start', 'record_progress', 'request_completion', 'confirm_completion']);
    expect(initial).toMatchObject({ status: 'confirmed', revision: 0 });
    expect(Object.isFrozen(completed.events)).toBe(true);
  });

  it('supports a customer dispute and never permits provider self-confirmation', () => {
    const requested = move(move(create(), 'start', providerUid, 1), 'request_completion', providerUid, 2);
    expect(() => move(requested, 'confirm_completion', providerUid, 3)).toThrowError(new ServiceExecutionError('INVALID_EXECUTION_TRANSITION'));
    expect(move(requested, 'dispute_completion', customerUid, 3).status).toBe('disputed');
  });

  it('requires pickup before delivery and delivery before transport completion request', () => {
    const initial = create('transporter');
    expect(() => move(initial, 'confirm_delivery', providerUid, 1)).toThrowError(new ServiceExecutionError('INVALID_EXECUTION_TRANSITION'));
    const pickedUp = move(initial, 'confirm_pickup', providerUid, 1);
    expect(() => move(pickedUp, 'request_completion', providerUid, 2)).toThrowError(new ServiceExecutionError('INVALID_EXECUTION_TRANSITION'));
    const delivered = move(pickedUp, 'confirm_delivery', providerUid, 2);
    const requested = move(delivered, 'request_completion', providerUid, 3);
    expect(move(requested, 'confirm_completion', customerUid, 4).status).toBe('completed');
  });

  it('keeps equipment rental lifecycle under Rental V2 while recording bounded evidence', () => {
    const initial = create('equipment_rental');
    expect(initial).toMatchObject({ status: 'rental_managed', lifecycleAuthority: 'rental_v2' });
    expect(() => move(initial, 'start', providerUid, 1, 'accepted')).toThrowError(new ServiceExecutionError('RENTAL_V2_LIFECYCLE_REQUIRED'));
    const handover = move(initial, 'record_handover', providerUid, 1, 'accepted', { note: 'Meter and condition recorded.' });
    const returned = move(handover, 'record_return', customerUid, 2, 'in_progress');
    expect(returned.status).toBe('rental_managed');
    expect(returned.events.at(-1)?.action).toBe('record_return');
  });

  it('binds idempotency to the actor and payload and rejects stale concurrency', () => {
    const initial = create();
    const input = { action: 'start' as const, expectedRevision: 0, idempotencyKey: 'start:provider:abc' };
    const started = transitionServiceExecution(initial, input, providerUid, at(1));
    expect(transitionServiceExecution(started, input, providerUid, at(2))).toBe(started);
    expect(() => transitionServiceExecution(started, { ...input, evidence: { note: 'changed' } }, providerUid, at(2)))
      .toThrowError(new ServiceExecutionError('IDEMPOTENCY_CONFLICT'));
    expect(() => transitionServiceExecution(started, input, customerUid, at(2)))
      .toThrowError(new ServiceExecutionError('IDEMPOTENCY_ACTOR_MISMATCH'));
    expect(() => transitionServiceExecution(started, { action: 'record_progress', expectedRevision: 0, idempotencyKey: 'progress:provider:abc' }, providerUid, at(2)))
      .toThrowError(new ServiceExecutionError('EXECUTION_STALE_REVISION'));
  });

  it('rejects nonparticipants and public evidence photo references', () => {
    const initial = create();
    expect(() => move(initial, 'start', 'unrelated_uid_789', 1)).toThrowError(new ServiceExecutionError('EXECUTION_NOT_AUTHORIZED'));
    expect(() => move(initial, 'start', providerUid, 1, undefined, { photoReferences: ['https://public.example/evidence.jpg'] }))
      .toThrowError(new ServiceExecutionError('EVIDENCE_PHOTO_DELIVERY_NOT_READY'));
    expect(() => move(initial, 'start', providerUid, 1, undefined, { mediaIntentId: `evidence_intent_${'i'.repeat(43)}` }))
      .toThrowError(new ServiceExecutionError('EVIDENCE_PHOTO_DELIVERY_NOT_READY'));
  });

  it('rejects malformed persisted history before it can be projected or transitioned', () => {
    const initial = create();
    expect(isServiceExecutionAggregate(initial)).toBe(true);
    expect(isServiceExecutionAggregate({ ...initial, lifecycleAuthority: 'rental_v2' })).toBe(false);
    expect(isServiceExecutionAggregate({ ...initial, events: [{ ...initial.events[0], actorUid: providerUid }] })).toBe(false);
    expect(isServiceExecutionAggregate({ ...initial, revision: 1 })).toBe(false);
  });
});
