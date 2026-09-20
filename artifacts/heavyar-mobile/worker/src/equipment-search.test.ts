import { describe, expect, test } from 'vitest';
import { decodeEquipmentCursor, encodeEquipmentCursor, searchPublicEquipment, type FirestoreQuery } from './equipment-search';

const projectId = 'heavyar-test';
const name = (id: string) => `projects/${projectId}/databases/(default)/documents/equipment/${id}`;
const listing = (id: string, patch: Record<string, unknown> = {}) => ({
  name: name(id),
  data: {
    ownerUid: 'private-owner-id',
    titleAr: `حفارة ${id}`,
    titleEn: `Excavator ${id}`,
    descriptionAr: '',
    descriptionEn: 'public description',
    category: 'excavators',
    countryCode: 'SA',
    region: 'eastern',
    city: 'jubail',
    district: 'public district',
    pricePerDay: 100,
    images: [],
    isActive: true,
    visibility: 'visible',
    moderationStatus: 'approved',
    ownerPublic: { uid: 'private-owner-id', nameAr: 'مالك', nameEn: 'Owner', avatar: 'https://example.com/a.jpg', phone: 'private' },
    moderationReason: 'private',
    ...patch,
  },
});

describe('bounded public equipment search', () => {
  const enabled = async () => true;
  test('uses default 20, stable document cursor, and public projection', async () => {
    let captured: FirestoreQuery | undefined;
    const rows = Array.from({ length: 41 }, (_, index) => listing(`item-${String(index).padStart(2, '0')}`));
    const result = await searchPublicEquipment(new Request('https://api.test/api/equipment/search?country=SA'), {
      projectId,
      isMarketplaceEnabled: enabled,
      runQuery: async query => { captured = query; return rows; },
    });
    expect(result.status).toBe(200);
    expect(result.body.equipment).toHaveLength(20);
    expect(result.body.nextCursor).toBeTruthy();
    expect(decodeEquipmentCursor(result.body.nextCursor!)).toBe('item-19');
    expect((captured as any).limit).toBeLessThanOrEqual(51);
    expect((result.body.equipment![0] as any).ownerUid).toBeUndefined();
    expect((result.body.equipment![0] as any).moderationReason).toBeUndefined();
    expect((result.body.equipment![0] as any).ownerPublic).toEqual({ nameAr: 'مالك', nameEn: 'Owner', avatar: 'https://example.com/a.jpg' });
  });

  test('rejects offsets, malformed cursors, and limits over 50', async () => {
    const runQuery = async () => [];
    for (const suffix of ['offset=1', 'limit=51', 'cursor=not-a-cursor']) {
      const result = await searchPublicEquipment(new Request(`https://api.test/api/equipment/search?country=SA&${suffix}`), { projectId, runQuery, isMarketplaceEnabled: enabled });
      expect(result.status).toBe(400);
      expect(result.body.errorCode).toBe('INVALID_SEARCH_FILTER');
    }
  });

  test('bounds bilingual substring matching to fetched candidates', async () => {
    const rows = [listing('one'), listing('two', { titleEn: 'Crane' }), listing('three')];
    const result = await searchPublicEquipment(new Request('https://api.test/api/equipment/search?country=SA&text=crane&limit=20'), {
      projectId,
      isMarketplaceEnabled: enabled,
      runQuery: async () => rows,
    });
    expect(result.body.equipment?.map(item => item.id)).toEqual(['two']);
  });

  test('cursor encoding is opaque, versioned, and validated', () => {
    const cursor = encodeEquipmentCursor('safe-id');
    expect(cursor).not.toContain('safe-id');
    expect(decodeEquipmentCursor(cursor)).toBe('safe-id');
    expect(decodeEquipmentCursor(encodeEquipmentCursor('../unsafe'))).toBeNull();
  });

  test('fails closed for disabled markets and enforces an injected public limiter', async () => {
    let queried = false;
    const runQuery = async () => { queried = true; return []; };
    const disabled = await searchPublicEquipment(new Request('https://api.test/api/equipment/search?country=AE'), {
      projectId, runQuery, isMarketplaceEnabled: async () => false,
    });
    expect(disabled.body.equipment).toEqual([]);
    expect(queried).toBe(false);
    const limited = await searchPublicEquipment(new Request('https://api.test/api/equipment/search?country=SA'), {
      projectId, runQuery, isMarketplaceEnabled: enabled, allowRequest: async () => false,
    });
    expect(limited.status).toBe(429);
    expect(limited.body.errorCode).toBe('RATE_LIMITED');
  });

  test('independently rejects an accidentally visible Store Review listing', async () => {
    const rows = [
      listing('review-purpose', { accountPurpose: 'store_review', visibility: 'visible', moderationStatus: 'approved' }),
      listing('review-reason', { moderationReason: 'store_review_qa_only', visibility: 'visible', moderationStatus: 'approved' }),
      listing('public'),
    ];
    const result = await searchPublicEquipment(new Request('https://api.test/api/equipment/search?country=SA'), {
      projectId, isMarketplaceEnabled: enabled, runQuery: async () => rows,
    });
    expect(result.body.equipment?.map(item => item.id)).toEqual(['public']);
  });

  test('reads one exact public detail through the bounded projection', async () => {
    let captured: FirestoreQuery | undefined;
    const result = await searchPublicEquipment(new Request('https://api.test/api/equipment/search?id=public-detail'), {
      projectId,
      isMarketplaceEnabled: enabled,
      runQuery: async query => {
        captured = query;
        return [listing('public-detail')];
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.equipment).toHaveLength(1);
    expect((captured as any).limit).toBe(1);
    expect((result.body.equipment?.[0] as any).ownerUid).toBeUndefined();
    expect((result.body.equipment?.[0] as any).moderationReason).toBeUndefined();
  });

  test('hides non-public and Store Review detail IDs without projecting them', async () => {
    for (const row of [
      listing('inactive', { isActive: false }),
      listing('review', { accountPurpose: 'store_review' }),
    ]) {
      const result = await searchPublicEquipment(new Request(`https://api.test/api/equipment/search?id=${row.name.split('/').pop()}`), {
        projectId,
        isMarketplaceEnabled: enabled,
        runQuery: async () => [row],
      });
      expect(result.status).toBe(404);
      expect(result.body.equipment).toBeUndefined();
    }
  });

  test('continues from the last scanned row without duplicates or skipped matches', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => listing(`item-${String(index).padStart(2, '0')}`, {
      ...(index % 4 === 0 ? { titleEn: 'Wanted crane' } : { titleEn: 'Other equipment' }),
    }));
    const runQuery = async (query: FirestoreQuery) => {
      const structured = query as any;
      const start = structured.startAt?.values?.[0]?.referenceValue as string | undefined;
      const remaining = start ? rows.filter(row => row.name > start) : rows;
      return remaining.slice(0, Number(structured.limit));
    };
    const first = await searchPublicEquipment(new Request('https://api.test/api/equipment/search?country=SA&text=wanted&limit=3'), {
      projectId, isMarketplaceEnabled: enabled, runQuery,
    });
    const second = await searchPublicEquipment(new Request(`https://api.test/api/equipment/search?country=SA&text=wanted&limit=3&cursor=${first.body.nextCursor}`), {
      projectId, isMarketplaceEnabled: enabled, runQuery,
    });
    expect(first.body.equipment?.map(item => item.id)).toEqual(['item-00', 'item-04']);
    expect(second.body.equipment?.map(item => item.id)).toEqual(['item-08', 'item-12']);
    expect(new Set([
      ...(first.body.equipment || []).map(item => item.id),
      ...(second.body.equipment || []).map(item => item.id),
    ])).toHaveLength(4);
  });
});