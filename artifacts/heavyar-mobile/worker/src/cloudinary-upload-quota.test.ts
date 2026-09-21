import { describe, expect, test } from 'bun:test';
import { reserveCloudinaryUploadQuota, type CloudinaryQuotaRecord } from './cloudinary-upload-quota';
import { FirestorePreconditionError } from './index';

const now = Date.parse('2026-01-01T00:10:00.000Z');
const windowStart = new Date(Math.floor(now / 60000) * 60000).toISOString();

function store() {
  const records = new Map<string, CloudinaryQuotaRecord>();
  let version = 0;
  let pendingWrites = 0;
  let releaseWrites: (() => void) | undefined;
  const barrier = async () => {
    pendingWrites++;
    if (pendingWrites === 2) releaseWrites?.();
    if (pendingWrites < 2) await new Promise<void>(resolve => { releaseWrites = resolve; });
  };
  return {
    records,
    read: async (uid: string) => {
      const value = records.get(uid);
      return value ? { ...value } : null;
    },
    async write(reservation: { uid: string; windowStart: string; count: number; prior: CloudinaryQuotaRecord | null }) {
      await barrier();
      const current = records.get(reservation.uid);
      if (reservation.prior?.version !== current?.version) throw new Error('FAILED_PRECONDITION');
      if (!reservation.prior && current) throw new Error('FAILED_PRECONDITION');
      records.set(reservation.uid, { windowStart: reservation.windowStart, count: reservation.count, version: String(++version) });
    },
    isConflict: (error: unknown) => error instanceof Error && error.message === 'FAILED_PRECONDITION',
  };
}

const reserve = (s: ReturnType<typeof store>, uid: string, maxAttempts = 4) => reserveCloudinaryUploadQuota({
  uid, maxAttempts, now: () => now, read: s.read, write: s.write, isConflict: s.isConflict,
});

describe('cloudinary upload quota reservation', () => {
  test('two concurrent same-UID reservations both succeed and increment by two', async () => {
    const s = store();
    const results = await Promise.all([reserve(s, 'same-user'), reserve(s, 'same-user')]);
    expect(results.map(result => result.outcome).sort()).toEqual(['quota_reserved', 'quota_reserved']);
    expect(s.records.get('same-user')?.count).toBe(2);
    expect(results.some(result => result.casConflictRetries === 1)).toBe(true);
  });

  test('concurrency filling the final slots reserves exactly the available slots', async () => {
    const s = store();
    s.records.set('fulling-user', { windowStart, count: 9, version: 'seed' });
    const results = await Promise.all([reserve(s, 'fulling-user'), reserve(s, 'fulling-user')]);
    expect(results.map(result => result.outcome).sort()).toEqual(['quota_exhausted', 'quota_reserved']);
    expect(s.records.get('fulling-user')?.count).toBe(10);
  });

  test('requests above the authoritative quota are exhausted, not reserved', async () => {
    const s = store();
    s.records.set('exhausted-user', { windowStart, count: 10, version: 'seed' });
    const result = await reserve(s, 'exhausted-user');
    expect(result.outcome).toBe('quota_exhausted');
    expect(result.count).toBe(10);
  });

  test('CAS conflicts retry and do not become exhaustion or 429 semantics', async () => {
    const s = store();
    let conflicts = 0;
    const result = await reserveCloudinaryUploadQuota({
      uid: 'retry-user',
      now: () => now,
      read: s.read,
      write: async reservation => {
        if (conflicts++ < 2) throw new Error('FAILED_PRECONDITION');
        return;
      },
      isConflict: s.isConflict,
    });
    expect(result.outcome).toBe('quota_reserved');
    expect(result.casConflictRetries).toBe(2);
    expect(result.outcome).not.toBe('quota_exhausted');
  });

  test('bounded repeated CAS conflicts produce temporary concurrency failure', async () => {
    const result = await reserveCloudinaryUploadQuota({
      uid: 'blocked-user',
      now: () => now,
      read: async () => null,
      write: async () => { throw new Error('FAILED_PRECONDITION'); },
      isConflict: error => error instanceof Error && error.message === 'FAILED_PRECONDITION',
      maxAttempts: 3,
    });
    expect(result.outcome).toBe('cas_conflict_retry');
    expect(result.casConflictRetries).toBe(3);
  });

  test('a conflict followed by infrastructure failure is not misclassified as another conflict', async () => {
    let writes = 0;
    const result = await reserveCloudinaryUploadQuota({
      uid: 'stale-diagnostics-user',
      now: () => now,
      read: async () => null,
      write: async () => {
        writes++;
        if (writes === 1) throw new FirestorePreconditionError();
        throw new Error('Firestore unavailable');
      },
      isConflict: error => error instanceof FirestorePreconditionError,
    });
    expect(result.outcome).toBe('quota_infrastructure_failure');
    expect(result.casConflictRetries).toBe(1);
  });

  test('separate UIDs do not contend', async () => {
    const s = store();
    const results = await Promise.all([reserve(s, 'user-a'), reserve(s, 'user-b')]);
    expect(results.every(result => result.outcome === 'quota_reserved')).toBe(true);
    expect(s.records.get('user-a')?.count).toBe(1);
    expect(s.records.get('user-b')?.count).toBe(1);
  });
});