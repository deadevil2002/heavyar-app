import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicEquipmentById } from '../services/equipmentSearchService';
import { invalidatePublicEquipment } from '../services/discoveryInvalidation';

describe('public equipment detail transport', () => {
  afterEach(() => {
    invalidatePublicEquipment();
    vi.unstubAllGlobals();
  });

  it('reads a public detail through the bounded Worker endpoint', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify({
      success: true,
      equipment: [{ id: 'public-id', titleEn: 'Excavator' }],
      nextCursor: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicEquipmentById('public-id')).resolves.toMatchObject({
      id: 'public-id',
      titleEn: 'Excavator',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/equipment/search?id=public-id');
  });

  it('does not issue a request for an unsafe document ID', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicEquipmentById('../private')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deduplicates three concurrent reads of the same public ID', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const fetchMock = vi.fn(async () => {
      await pending;
      return new Response(JSON.stringify({
        success: true,
        equipment: [{ id: 'shared-id', titleEn: 'Crane' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const reads = [
      fetchPublicEquipmentById('shared-id'),
      fetchPublicEquipmentById('shared-id'),
      fetchPublicEquipmentById('shared-id'),
    ];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await expect(Promise.all(reads)).resolves.toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('removes rejected requests from in-flight state so retry can succeed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        errorCode: 'EQUIPMENT_DETAIL_UNAVAILABLE',
      }), { status: 503, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        equipment: [{ id: 'retry-id' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicEquipmentById('retry-id')).rejects.toThrow('EQUIPMENT_DETAIL_UNAVAILABLE');
    await expect(fetchPublicEquipmentById('retry-id')).resolves.toMatchObject({ id: 'retry-id' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears cached public detail when listing mutations invalidate discovery', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      equipment: [{ id: 'mutable-id' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchPublicEquipmentById('mutable-id');
    await fetchPublicEquipmentById('mutable-id');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    invalidatePublicEquipment();
    await fetchPublicEquipmentById('mutable-id');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not repopulate cache from a request invalidated while in flight', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) await pending;
      return new Response(JSON.stringify({
        success: true,
        equipment: [{ id: 'invalidated-id' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const staleRead = fetchPublicEquipmentById('invalidated-id');
    invalidatePublicEquipment();
    release();
    await staleRead;
    await fetchPublicEquipmentById('invalidated-id');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});