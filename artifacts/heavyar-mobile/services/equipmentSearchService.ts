import { WORKER_BASE_URL } from '../constants/worker';
import type { Equipment } from '../types';
import type { DiscoveryFilters } from './publicDiscovery';
import { subscribePublicEquipmentInvalidation } from './discoveryInvalidation';

const EQUIPMENT_DETAIL_STALE_MS = 2 * 60_000;
const MAX_EQUIPMENT_DETAIL_CACHE_ENTRIES = 50;
const detailCache = new Map<string, { equipment: Equipment | null; expiresAt: number }>();
const detailInflight = new Map<string, Promise<Equipment | null>>();
let detailCacheGeneration = 0;

subscribePublicEquipmentInvalidation(() => {
  detailCacheGeneration += 1;
  detailCache.clear();
  detailInflight.clear();
});

export type EquipmentSearchPage = {
  equipment: Equipment[];
  nextCursor?: string;
};

export async function searchPublicEquipment(
  filters: DiscoveryFilters,
  cursor?: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<EquipmentSearchPage> {
  const query = new URLSearchParams({ country: filters.countryCode, limit: String(limit) });
  if (filters.region) query.set('region', filters.region);
  if (filters.city) query.set('city', filters.city);
  if (filters.category) query.set('category', filters.category);
  if (filters.text.trim()) query.set('text', filters.text.trim());
  if (cursor) query.set('cursor', cursor);
  const response = await fetch(`${WORKER_BASE_URL}/api/equipment/search?${query}`, { signal });
  const body = await response.json().catch(() => null) as {
    success?: boolean; equipment?: Equipment[]; nextCursor?: string | null; errorCode?: string;
  } | null;
  if (!response.ok || body?.success !== true || !Array.isArray(body.equipment)) {
    throw new Error(body?.errorCode || 'EQUIPMENT_SEARCH_UNAVAILABLE');
  }
  return {
    equipment: body.equipment,
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : undefined,
  };
}

async function requestPublicEquipmentById(id: string, signal?: AbortSignal): Promise<Equipment | null> {
  const response = await fetch(
    `${WORKER_BASE_URL}/api/equipment/search?id=${encodeURIComponent(id)}`,
    { signal },
  );
  const body = await response.json().catch(() => null) as {
    success?: boolean; equipment?: Equipment[]; errorCode?: string;
  } | null;
  if (response.status === 404 && body?.errorCode === 'EQUIPMENT_NOT_FOUND') return null;
  if (!response.ok || body?.success !== true || !Array.isArray(body.equipment)) {
    throw new Error(body?.errorCode || 'EQUIPMENT_DETAIL_UNAVAILABLE');
  }
  return body.equipment[0] || null;
}

export function fetchPublicEquipmentById(id: string, signal?: AbortSignal): Promise<Equipment | null> {
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) return Promise.resolve(null);
  // A caller-owned abort signal must never cancel another caller's shared
  // request. Signal-bearing calls therefore remain isolated and uncached.
  if (signal) return requestPublicEquipmentById(id, signal);

  const now = Date.now();
  const cached = detailCache.get(id);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.equipment);
  if (cached) detailCache.delete(id);

  const existing = detailInflight.get(id);
  if (existing) return existing;

  const requestGeneration = detailCacheGeneration;
  const request = requestPublicEquipmentById(id).then(equipment => {
    if (requestGeneration === detailCacheGeneration) {
      while (detailCache.size >= MAX_EQUIPMENT_DETAIL_CACHE_ENTRIES) {
        const oldest = detailCache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        detailCache.delete(oldest);
      }
      detailCache.set(id, { equipment, expiresAt: Date.now() + EQUIPMENT_DETAIL_STALE_MS });
    }
    return equipment;
  }).finally(() => {
    if (detailInflight.get(id) === request) detailInflight.delete(id);
  });
  detailInflight.set(id, request);
  return request;
}