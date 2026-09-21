import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const service = source('../services/firestoreService.ts');

const implementation = (name: string, nextName: string) =>
  service.split(`export ${name}(`)[1].split(`export ${nextName}(`)[0];

describe('bounded Firestore read paths', () => {
  it('sets explicit normal-read page budgets', () => {
    expect(service).toContain('OWNER_EQUIPMENT_PAGE_SIZE = 20');
    expect(service).toContain('REQUESTS_PAGE_SIZE = 20');
    expect(service).toContain('CHAT_PAGE_SIZE = 50');
    expect(service).toContain('INVOICES_PAGE_SIZE = 20');
    expect(service).toContain('RATINGS_PAGE_SIZE = 20');
  });

  it.each([
    ['async function fetchEquipmentByOwner', 'async function fetchEquipmentByIds'],
    ['async function fetchUserRequests', 'async function fetchRequestById'],
    ['function subscribeToUserRequests', 'function subscribeToMessages'],
    ['function subscribeToMessages', 'async function fetchOlderMessages'],
    ['async function fetchOlderMessages', 'async function sendMessage'],
    ['async function fetchRatingsForUser', 'async function createInvoice'],
    ['async function fetchUserInvoices', 'async function fetchInvoiceByRequestId'],
  ])('%s uses stable cursor ordering and a limit', (name, nextName) => {
    const body = implementation(name, nextName);
    expect(body).toContain("orderBy('createdAt', 'desc')");
    expect(body).toContain("orderBy(documentId(), 'desc')");
    expect(body).toContain('limit(');
  });

  it('batches request equipment instead of reading once per card', () => {
    const batch = implementation('async function fetchEquipmentByIds', 'async function createEquipment');
    expect(batch).toContain('offset += 30');
    expect(batch).toContain("where(documentId(), 'in', batch)");
    expect(batch).toContain("where('visibility', '==', 'visible')");
    expect(batch).toContain("where('ownerUid', '==', currentUid)");
    expect(source('../components/RequestCard.tsx')).not.toContain('fetchEquipmentById');
    expect(source('../app/(tabs)/requests/index.tsx')).toContain('fetchEquipmentByIds');
  });

  it('exposes pagination controls rather than silently truncating screens', () => {
    expect(source('../app/my-equipment.tsx')).toContain('Load more');
    expect(source('../app/invoices.tsx')).toContain('Load more');
    expect(source('../app/(tabs)/requests/index.tsx')).toContain('Older requests are not live');
    expect(source('../app/chat/[requestId].tsx')).toContain('Load older messages');
  });

  it('bounds the rating duplicate fallback and avoids repeated listener enrichment reads', () => {
    const rating = implementation('async function submitRating', 'async function fetchRatingsForUser');
    expect(rating).toContain("where('requestId', '==', data.requestId),");
    expect(rating).toContain('limit(10)');
    expect(source('../app/request/[id].tsx')).toContain('fetchedEquipmentIdRef.current !== req.equipmentId');
    expect(source('../app/chat/[requestId].tsx')).toContain('enrichedEquipmentIdRef.current !== req.equipmentId');
  });

  it('routes Active Rentals to an actual requests status filter', () => {
    expect(source('../app/(tabs)/(home)/index.tsx')).toContain("pathname: '/(tabs)/requests', params: { section: 'active' }");
    expect(source('../app/(tabs)/requests/index.tsx')).toContain("activeOnly={selected === 'active'}");
  });

  it('uses the request public provider snapshot in the rating flow', () => {
    const ratingScreen = source('../app/rating/[requestId].tsx');
    expect(ratingScreen).toContain('req.providerPublic || null');
    expect(ratingScreen).not.toContain('fetchUserById');
  });
});