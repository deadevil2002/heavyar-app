import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/services/workerClient';
import {
  createServiceExecution,
  decodeServiceExecutionDetail,
  ServiceExecutionScopeGuard,
  transitionServiceExecution,
} from '@/services/serviceExecutionService';

vi.mock('@/services/workerClient', () => ({
  request: vi.fn(),
  WorkerError: class WorkerError extends Error {
    status: number; code: string;
    constructor(message: string, status = 500, code = 'WORKER_ERROR') { super(message); this.status = status; this.code = code; }
  },
}));

const mockedRequest = vi.mocked(request);
const executionId = `execution_${'E'.repeat(43)}`;
const detail = {
  success: true,
  access: 'provider',
  execution: {
    executionId,
    serviceKind: 'operator',
    lifecycleAuthority: 'service_execution',
    source: { kind: 'service_contract', id: 'service_contract_123', revision: 2 },
    status: 'confirmed',
    revision: 0,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    events: [{ eventId: `${executionId}__0`, revision: 0, action: 'confirmed', actorRole: 'customer', occurredAt: '2026-10-15T10:00:00.000Z' }],
  },
  activation: { productionEnabled: false, reason: 'disabled_pending_contractual_eligibility_booking_and_payment_prerequisites' },
  evidenceMedia: {
    enabled: false,
    reason: 'disabled_pending_authenticated_private_media_delivery',
    limits: { maxFilesPerEvent: 3, maxFileBytes: 5 * 1024 * 1024 },
  },
};

describe('M2-E2 mobile service execution boundary', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('decodes the private projection without accepting participant identifiers or media URLs', () => {
    expect(decodeServiceExecutionDetail(detail).execution.status).toBe('confirmed');
    expect(() => decodeServiceExecutionDetail({ ...detail, execution: { ...detail.execution, customerUid: 'private' } })).toThrow();
    expect(() => decodeServiceExecutionDetail({
      ...detail,
      execution: { ...detail.execution, events: [{ ...detail.execution.events[0], eventId: `execution_${'F'.repeat(43)}__0` }] },
    })).toThrow();
    expect(() => decodeServiceExecutionDetail({
      ...detail,
      execution: { ...detail.execution, events: [{ ...detail.execution.events[0], actorUid: 'private', evidence: { photoUrl: 'https://public.example' } }] },
    })).toThrow();
    expect(() => decodeServiceExecutionDetail({ ...detail, evidenceMedia: { ...detail.evidenceMedia, enabled: true } })).toThrow();
    expect(decodeServiceExecutionDetail({
      ...detail,
      evidenceMedia: { enabled: true, limits: detail.evidenceMedia.limits },
      execution: { ...detail.execution, revision: 1, events: [
        detail.execution.events[0],
        { eventId: `${executionId}__1`, revision: 1, action: 'start', actorRole: 'provider', occurredAt: '2026-10-15T10:01:00.000Z', evidence: { media: [{ mediaId: `evidence_media_${'m'.repeat(43)}` }] } },
      ] },
    }).evidenceMedia.enabled).toBe(true);
    expect(() => decodeServiceExecutionDetail({ ...detail, evidenceMedia: { ...detail.evidenceMedia, publicUrl: 'https://public.example' } })).toThrow();
  });

  it('never sends actor identities, activation flags, money, or evidence photo URLs', async () => {
    mockedRequest.mockResolvedValue(detail);
    await createServiceExecution({ kind: 'service_contract', id: 'service_contract_123' }, 'create:execution:123', 'customer_uid_123');
    const createBody = JSON.parse(String(mockedRequest.mock.calls[0][1]?.body));
    expect(createBody).toEqual({ sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:123' });

    await transitionServiceExecution(executionId, {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:123', evidence: { note: 'Started safely.' },
    }, 'provider_uid_456');
    const transitionBody = JSON.parse(String(mockedRequest.mock.calls[1][1]?.body));
    expect(transitionBody).not.toHaveProperty('actorUid');
    expect(transitionBody).not.toHaveProperty('productionEnabled');
    expect(JSON.stringify(transitionBody)).not.toContain('amount');
    expect(JSON.stringify(transitionBody)).not.toContain('photo');
  });

  it('cancels and rejects stale responses across logout or account switching', () => {
    const guard = new ServiceExecutionScopeGuard();
    const accountA = guard.begin('customer-a');
    const accountB = guard.begin('provider-b');
    expect(accountA.signal.aborted).toBe(true);
    expect(guard.isCurrent(accountA)).toBe(false);
    expect(guard.isCurrent(accountB)).toBe(true);
    guard.cancel();
    expect(guard.isCurrent(accountB)).toBe(false);
  });
});
