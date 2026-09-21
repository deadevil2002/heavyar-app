import { describe, expect, test } from 'bun:test';
import { mutationDiagnosticEvent, responseErrorCode, type MutationDiagnostics } from './observability';

const request = new Request('https://worker.test/api/listings/private-id?token=private', { method: 'POST' });
const diagnostics = (overrides: Partial<MutationDiagnostics> = {}): MutationDiagnostics => ({
  requestId: 'A1B2C3D4E5',
  startedAt: Date.now(),
  stage: 'commit',
  firestoreReads: 0,
  firestoreWrites: 0,
  firestoreWriteAttempts: 0,
  firestoreRequests: 0,
  firestoreDurationMs: 0,
  upstreamDurationMs: 0,
  cas: 'not_used',
  quota: { checked: false, blocked: false, exhausted: false },
  ...overrides,
});

describe('sanitized mutation observability', () => {
  test('response codes accept only safe canonical tokens found in error fields', () => {
    expect(responseErrorCode('RATE_LIMITED', 429)).toBe('RATE_LIMITED');
    expect(responseErrorCode('EMAIL_VERIFICATION_REQUIRED', 403)).toBe('EMAIL_VERIFICATION_REQUIRED');
    expect(responseErrorCode('private raw provider detail', 400)).toBe('REQUEST_FAILED');
    expect(responseErrorCode('private raw provider detail', 502)).toBe('INTERNAL_SERVICE_ERROR');
  });

  test('denied writes report attempts without claiming a commit', () => {
    const event: any = mutationDiagnosticEvent(request, diagnostics({
      firestoreWriteAttempts: 1,
      firestoreRequests: 1,
      firestoreFailure: { operation: 'commit', status: 403, code: 'PERMISSION_DENIED' },
      cas: 'failed',
    }), 500, 'INTERNAL_SERVICE_ERROR', undefined);
    expect(event.firestoreWriteCount).toBe(0);
    expect(event.firestoreAttemptedWriteCount).toBe(1);
    expect(event.firestoreAcknowledgedWriteCount).toBe(0);
    expect(event.firestoreWriteOutcome).toBe('rejected');
  });

  test('timeout and ambiguous CAS writes remain explicitly unknown', () => {
    const timeout: any = mutationDiagnosticEvent(request, diagnostics({
      firestoreWriteAttempts: 2,
      firestoreRequests: 1,
      firestoreFailure: { operation: 'commit', status: 0 },
    }), 500, 'INTERNAL_SERVICE_ERROR', undefined);
    expect(timeout.firestoreWriteOutcome).toBe('unknown');
    expect(timeout.firestoreAttemptedWriteCount).toBe(2);
    expect(timeout.firestoreWriteCount).toBeNull();

    const ambiguousCas: any = mutationDiagnosticEvent(request, diagnostics({
      firestoreWriteAttempts: 1,
      firestoreRequests: 1,
      cas: 'failed',
    }), 500, 'INTERNAL_SERVICE_ERROR', undefined);
    expect(ambiguousCas.firestoreWriteOutcome).toBe('unknown');
    expect(ambiguousCas.firestoreWriteCount).toBeNull();
  });

  test('retry attempts are counted separately from acknowledged writes', () => {
    const event: any = mutationDiagnosticEvent(request, diagnostics({
      firestoreWriteAttempts: 3,
      firestoreWrites: 2,
      firestoreRequests: 3,
    }), 500, 'INTERNAL_SERVICE_ERROR', undefined);
    expect(event.firestoreAttemptedWriteCount).toBe(3);
    expect(event.firestoreAcknowledgedWriteCount).toBe(2);
    expect(event.firestoreWriteOutcome).toBe('unknown');
    expect(event.firestoreWriteCount).toBeNull();
  });
});