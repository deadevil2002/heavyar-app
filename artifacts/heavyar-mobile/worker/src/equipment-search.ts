import { legacyMarketProjection, legacyPricingProjection } from './rental-v2';

export type FirestoreQuery = Record<string, unknown>;

export type EquipmentSearchRow = {
  name: string;
  data: Record<string, unknown>;
};

export type EquipmentSearchDependencies = {
  projectId: string;
  runQuery: (query: FirestoreQuery) => Promise<EquipmentSearchRow[]>;
  isMarketplaceEnabled: (countryCode: string) => Promise<boolean>;
  allowRequest?: (request: Request) => Promise<boolean | null>;
};

export type EquipmentSearchResult = {
  status: number;
  body: {
    success: boolean;
    equipment?: Record<string, unknown>[];
    nextCursor?: string | null;
    error?: string;
    errorCode?: string;
  };
};

const SAFE_FILTER = /^[\p{L}\p{N}_ .-]{0,100}$/u;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,150}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function base64UrlEncode(value: string): string {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,400}$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    return null;
  }
}

export function encodeEquipmentCursor(id: string): string {
  return base64UrlEncode(JSON.stringify({ v: 1, id }));
}

export function decodeEquipmentCursor(value: string | null): string | null | undefined {
  if (!value) return undefined;
  const decoded = base64UrlDecode(value);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded) as { v?: unknown; id?: unknown };
    return parsed.v === 1 && typeof parsed.id === 'string' && SAFE_DOCUMENT_ID.test(parsed.id)
      ? parsed.id
      : null;
  } catch {
    return null;
  }
}

function stringParam(url: URL, name: string): string {
  return (url.searchParams.get(name) || '').trim();
}

function fieldFilter(fieldPath: string, value: string | boolean) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: 'EQUAL',
      value: typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value },
    },
  };
}

function publicOwner(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const owner = {
    nameAr: typeof value.nameAr === 'string' ? value.nameAr : '',
    nameEn: typeof value.nameEn === 'string' ? value.nameEn : '',
    avatar: typeof value.avatar === 'string' ? value.avatar : '',
  };
  return owner.nameAr || owner.nameEn || owner.avatar ? owner : undefined;
}

function isStoreReviewEquipment(data: Record<string, unknown>): boolean {
  return data.accountPurpose === 'store_review' || data.moderationReason === 'store_review_qa_only';
}

function isPublicEquipment(data: Record<string, unknown>): boolean {
  return data.isActive === true
    && data.visibility === 'visible'
    && data.moderationStatus === 'approved'
    && !isStoreReviewEquipment(data);
}

function publicProjection(id: string, data: Record<string, unknown>): Record<string, unknown> | null {
  if (!isPublicEquipment(data)) return null;
  const fields = [
    'publicEquipmentNumber', 'titleAr', 'titleEn', 'descriptionAr', 'descriptionEn',
    'category', 'customCategory', 'countryCode', 'region', 'city', 'customCity',
    'district', 'pricePerDay', 'nativeCurrency', 'nativePricePerDay',
    'pricingModelVersion', 'pricing', 'images',
    'availability', 'isActive', 'visibility', 'moderationStatus', 'createdAt', 'updatedAt',
  ] as const;
  const projected: Record<string, unknown> = { id };
  for (const field of fields) if (data[field] !== undefined) projected[field] = data[field];
  const owner = publicOwner(data.ownerPublic);
  if (owner) projected.ownerPublic = owner;
  if (data.pricingModelVersion !== 2) {
    try {
      const market = legacyMarketProjection(data as Record<string, any>);
      const legacy = legacyPricingProjection(data as Record<string, any>);
      projected.countryCode = market.countryCode;
      projected.nativeCurrency = market.nativeCurrency;
      projected.pricingModelVersion = legacy.pricingModelVersion;
      projected.pricing = legacy.pricing;
    } catch { /* malformed legacy prices retain their historical projection */ }
  }
  return projected;
}

function matchesCandidate(data: Record<string, unknown>, filters: {
  country: string; city: string; text: string;
}): boolean {
  // Store Review inventory is never public, even if a malformed/admin write
  // accidentally changes the ordinary visibility fields.
  if (!isPublicEquipment(data)) return false;
  const country = String(data.countryCode || 'SA').toUpperCase();
  if (filters.country && country !== filters.country) return false;
  if (filters.city && data.city !== filters.city && data.customCity !== filters.city) return false;
  if (filters.text) {
    const searchable = `${data.titleAr || ''} ${data.titleEn || ''} ${data.descriptionAr || ''} ${data.descriptionEn || ''}`
      .toLocaleLowerCase();
    if (!searchable.includes(filters.text.toLocaleLowerCase())) return false;
  }
  return true;
}

export async function searchPublicEquipment(
  request: Request,
  dependencies: EquipmentSearchDependencies,
): Promise<EquipmentSearchResult> {
  const allowedRequest = await dependencies.allowRequest?.(request);
  if (allowedRequest === false) {
    return { status: 429, body: { success: false, error: 'Too many requests', errorCode: 'RATE_LIMITED' } };
  }
  if (allowedRequest === null) {
    return { status: 503, body: { success: false, error: 'Equipment search unavailable', errorCode: 'RATE_LIMIT_UNAVAILABLE' } };
  }
  const url = new URL(request.url);
  const allowed = new Set(['country', 'region', 'city', 'category', 'text', 'cursor', 'limit', 'id']);
  if ([...url.searchParams.keys()].some(key => !allowed.has(key))) {
    return { status: 400, body: { success: false, error: 'Invalid equipment search filter', errorCode: 'INVALID_SEARCH_FILTER' } };
  }

  const id = stringParam(url, 'id');
  if (id) {
    if (!SAFE_DOCUMENT_ID.test(id) || [...url.searchParams.keys()].some(key => key !== 'id')) {
      return { status: 400, body: { success: false, error: 'Invalid equipment search filter', errorCode: 'INVALID_SEARCH_FILTER' } };
    }
    const referenceValue = `projects/${dependencies.projectId}/databases/(default)/documents/equipment/${id}`;
    const rows = await dependencies.runQuery({
      from: [{ collectionId: 'equipment' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            fieldFilter('isActive', true),
            fieldFilter('visibility', 'visible'),
            fieldFilter('moderationStatus', 'approved'),
            {
              fieldFilter: {
                field: { fieldPath: '__name__' },
                op: 'EQUAL',
                value: { referenceValue },
              },
            },
          ],
        },
      },
      limit: 1,
    });
    const row = rows.find(candidate => candidate.name === referenceValue);
    if (!row || !matchesCandidate(row.data, { country: '', city: '', text: '' })) {
      return { status: 404, body: { success: false, error: 'Equipment not found', errorCode: 'EQUIPMENT_NOT_FOUND' } };
    }
    const countryCode = String(row.data.countryCode || 'SA').toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode) || !await dependencies.isMarketplaceEnabled(countryCode)) {
      return { status: 404, body: { success: false, error: 'Equipment not found', errorCode: 'EQUIPMENT_NOT_FOUND' } };
    }
    const equipment = publicProjection(id, row.data);
    return equipment
      ? { status: 200, body: { success: true, equipment: [equipment], nextCursor: null } }
      : { status: 404, body: { success: false, error: 'Equipment not found', errorCode: 'EQUIPMENT_NOT_FOUND' } };
  }

  const country = stringParam(url, 'country').toUpperCase();
  const region = stringParam(url, 'region');
  const city = stringParam(url, 'city');
  const category = stringParam(url, 'category');
  const text = stringParam(url, 'text');
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  const cursorId = decodeEquipmentCursor(url.searchParams.get('cursor'));

  if (!/^[A-Z]{2}$/.test(country) || ![region, city, category, text].every(value => SAFE_FILTER.test(value)) ||
      !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT || cursorId === null) {
    return { status: 400, body: { success: false, error: 'Invalid equipment search filter', errorCode: 'INVALID_SEARCH_FILTER' } };
  }
  if (!await dependencies.isMarketplaceEnabled(country)) {
    return { status: 200, body: { success: true, equipment: [], nextCursor: null } };
  }

  const filters = [
    fieldFilter('isActive', true),
    fieldFilter('visibility', 'visible'),
    fieldFilter('moderationStatus', 'approved'),
    ...(country && country !== 'SA' ? [fieldFilter('countryCode', country)] : []),
    ...(region ? [fieldFilter('region', region)] : []),
    ...(category ? [fieldFilter('category', category)] : []),
  ];
  const candidateLimit = Math.min(MAX_LIMIT + 1, Math.max(limit + 1, text || city || country === 'SA' ? limit * 2 + 1 : limit + 1));
  const documentPrefix = `projects/${dependencies.projectId}/databases/(default)/documents/equipment/`;
  const query: Record<string, unknown> = {
    from: [{ collectionId: 'equipment' }],
    where: { compositeFilter: { op: 'AND', filters } },
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit: candidateLimit,
    ...(cursorId ? { startAt: { values: [{ referenceValue: `${documentPrefix}${cursorId}` }], before: false } } : {}),
  };

  const rows = await dependencies.runQuery(query);
  const candidates = rows.slice(0, candidateLimit);
  const matched: EquipmentSearchRow[] = [];
  let scannedIndex = -1;
  for (let index = 0; index < candidates.length; index += 1) {
    scannedIndex = index;
    if (matchesCandidate(candidates[index].data, { country, city, text })) matched.push(candidates[index]);
    if (matched.length === limit) break;
  }
  const lastScanned = scannedIndex >= 0 ? candidates[scannedIndex] : undefined;
  const hasMore = scannedIndex < candidates.length - 1 || candidates.length === candidateLimit;
  const nextCursor = hasMore && lastScanned
    ? encodeEquipmentCursor(decodeURIComponent(lastScanned.name.split('/').pop() || ''))
    : null;

  return {
    status: 200,
    body: {
      success: true,
      equipment: matched
        .map(row => publicProjection(decodeURIComponent(row.name.split('/').pop() || ''), row.data))
        .filter((item): item is Record<string, unknown> => item !== null),
      nextCursor,
    },
  };
}