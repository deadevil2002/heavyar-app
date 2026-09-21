import { describe, expect, it, vi, afterEach } from 'vitest';
import { LatestRequestGuard, refreshLoadedPages } from '../services/driverLiveSync';

vi.mock('../services/firebaseConfig', () => ({
  getFirebaseAuth: () => ({
    currentUser: { uid: 'test-driver-request-user', getIdToken: async () => 'test-token' },
  }),
}));

describe('driver live synchronization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects stale response writes after a newer request begins', () => {
    const guard = new LatestRequestGuard();
    const first = guard.begin();
    const second = guard.begin();
    expect(first.signal.aborted).toBe(true);
    expect(guard.isCurrent(first.generation)).toBe(false);
    expect(guard.isCurrent(second.generation)).toBe(true);
  });

  it('refreshes all loaded pages and follows a cursor through an empty page', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ items: [{ id: 'one' }], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [], nextCursor: 'cursor-3' })
      .mockResolvedValueOnce({ items: [{ id: 'three' }], nextCursor: 'cursor-4' });

    const result = await refreshLoadedPages(3, fetchPage);
    expect(fetchPage.mock.calls.map(call => call[0])).toEqual([undefined, 'cursor-2', 'cursor-3']);
    expect(result).toEqual({
      items: [{ id: 'one' }, { id: 'three' }],
      nextCursor: 'cursor-4',
      pagesFetched: 3,
    });
  });

  it('sends only driverId and trimmed notes contract fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, requestId: 'request-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { createDriverRequest } = await import('../services/workerClient');

    await createDriverRequest({ driverId: 'driver-7', notes: 'Needed tomorrow' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ driverId: 'driver-7', notes: 'Needed tomorrow' });
    expect(init.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('includes the name query and canonical availability in real search URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, drivers: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { searchDrivers } = await import('../services/workerClient');

    await searchDrivers({ q: 'Salem', availabilityStatus: 'busy', limit: 20 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('q=Salem');
    expect(url).toContain('availabilityStatus=busy');
    expect(url).toContain('limit=20');
  });
});