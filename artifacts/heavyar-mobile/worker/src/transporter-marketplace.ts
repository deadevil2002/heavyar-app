import { parsePreciseLocation, type PreciseLocation } from './location';

export const TRANSPORTER_DISCOVERY_PAGE_MAX = 20;
export const TRANSPORTER_DISCOVERY_ACTIVATION = 'regulatory_activation_required' as const;
export const TRANSPORT_REQUEST_CONTRACT_VERSION = 1 as const;

const GCC_COUNTRIES = ['SA', 'AE', 'KW', 'BH', 'OM', 'QA'] as const;
const VEHICLE_CATEGORIES = ['lowbed', 'flatbed', 'trailer', 'recovery', 'other'] as const;
const LOAD_CATEGORIES = ['excavators', 'cranes', 'loaders', 'bulldozers', 'trucks', 'generators', 'compressors', 'concrete', 'other'] as const;
const AVAILABILITY = ['available', 'busy'] as const;
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export type TransporterVehicleCategory = (typeof VEHICLE_CATEGORIES)[number];
export type TransporterAvailability = (typeof AVAILABILITY)[number];
export type TransporterSearchFilters = {
  countryCode: string;
  region?: string;
  vehicleCategory?: TransporterVehicleCategory;
  vehicleType?: string;
  availability?: TransporterAvailability;
  minCapacityKg: number;
  minLengthMm: number;
  minWidthMm: number;
  minHeightMm: number;
  cursor?: string;
  limit: number;
};

export type TransporterPublicProfile = {
  id: string;
  displayName: string;
  countryCode: string;
  region: string;
  vehicleCategory: TransporterVehicleCategory;
  vehicleType: string;
  declaredCapacityKg: number;
  declaredDimensionsMm: { length: number; width: number; height: number };
  availability: TransporterAvailability;
  description?: string;
  eligibility: 'verified_eligible';
  capabilityBasis: 'declared_not_independently_verified';
};

type TransportRegion = { countryCode: string; region: string };
type TransportEndpoint = { region: TransportRegion; pin: PreciseLocation };
export type TransportRequestInput = {
  clientDraftId: string;
  contractVersion: 1;
  expectedRevision: null;
  equipmentCategory: (typeof LOAD_CATEGORIES)[number];
  loadWeightKg: number;
  loadDimensionsMm: { length: number; width: number; height: number };
  origin: TransportEndpoint;
  destination: TransportEndpoint;
  requestedPickupWindow: { startAt: string; endAt: string };
  requestedDeliveryBy: string;
  notes?: string;
};

type CursorValue = {
  context: string;
  capacityKg: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  sortKey: string;
  id: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}

function boundedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

function safeCountry(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.toUpperCase() : '';
  return GCC_COUNTRIES.includes(normalized as (typeof GCC_COUNTRIES)[number]) ? normalized : null;
}

function safeInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function queryInteger(value: string | null, max: number): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  return safeInteger(Number(value), 0, max);
}

function encodedRegion(value: string | undefined): string {
  if (value === undefined) return '*';
  if (!SAFE_SLUG.test(value)) throw new Error('INVALID_TRANSPORTER_REGION');
  return value;
}

function searchContext(filters: Omit<TransporterSearchFilters, 'cursor' | 'limit'>): string {
  return [
    'v1', filters.countryCode, encodedRegion(filters.region), filters.vehicleCategory || '*', filters.vehicleType || '*',
    filters.availability || '*', filters.minCapacityKg, filters.minLengthMm, filters.minWidthMm, filters.minHeightMm,
  ].join('|');
}

function encodeCursor(filters: Omit<TransporterSearchFilters, 'cursor' | 'limit'>, value: Omit<CursorValue, 'context'>): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, context: searchContext(filters), ...value }));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseCursor(value: string | undefined): CursorValue | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0))));
    if (!record(decoded) || decoded.v !== 1 || !boundedText(decoded.context, 1, 400) || !boundedText(decoded.sortKey, 1, 160) ||
        typeof decoded.id !== 'string' || !SAFE_ID.test(decoded.id)) return null;
    const capacityKg = safeInteger(decoded.capacityKg, 1, 250_000);
    const lengthMm = safeInteger(decoded.lengthMm, 1, 50_000);
    const widthMm = safeInteger(decoded.widthMm, 1, 20_000);
    const heightMm = safeInteger(decoded.heightMm, 1, 20_000);
    if (capacityKg === null || lengthMm === null || widthMm === null || heightMm === null) return null;
    return { context: decoded.context as string, capacityKg, lengthMm, widthMm, heightMm, sortKey: decoded.sortKey as string, id: decoded.id };
  } catch {
    return null;
  }
}

export function transporterCursor(filters: TransporterSearchFilters, profile: TransporterPublicProfile, sortKey: string): string {
  if (!boundedText(sortKey, 1, 160) || !SAFE_ID.test(profile.id)) throw new Error('INVALID_TRANSPORTER_CURSOR');
  return encodeCursor(filters, {
    capacityKg: profile.declaredCapacityKg,
    lengthMm: profile.declaredDimensionsMm.length,
    widthMm: profile.declaredDimensionsMm.width,
    heightMm: profile.declaredDimensionsMm.height,
    sortKey,
    id: profile.id,
  });
}

export function transporterCursorFromRow(filters: TransporterSearchFilters, id: string, value: unknown): string {
  const raw = record(value);
  const dimensions = record(raw?.declaredDimensionsMm);
  const capacityKg = safeInteger(raw?.declaredCapacityKg, 1, 250_000);
  const lengthMm = safeInteger(dimensions?.length, 1, 50_000);
  const widthMm = safeInteger(dimensions?.width, 1, 20_000);
  const heightMm = safeInteger(dimensions?.height, 1, 20_000);
  const sortKey = boundedText(raw?.sortKey, 1, 160);
  if (!SAFE_ID.test(id) || capacityKg === null || lengthMm === null || widthMm === null || heightMm === null || !sortKey) {
    throw new Error('INVALID_TRANSPORTER_CURSOR');
  }
  return encodeCursor(filters, { capacityKg, lengthMm, widthMm, heightMm, sortKey, id });
}

export function parseTransporterSearch(url: URL): TransporterSearchFilters | null {
  const allowed = ['countryCode', 'region', 'vehicleCategory', 'vehicleType', 'availability', 'minCapacityKg', 'minLengthMm', 'minWidthMm', 'minHeightMm', 'cursor', 'limit'];
  if ([...url.searchParams.keys()].some(key => !allowed.includes(key))) return null;
  const countryCode = safeCountry(url.searchParams.get('countryCode') || 'SA');
  const regionRaw = url.searchParams.get('region');
  const region = regionRaw === null ? undefined : SAFE_SLUG.test(regionRaw) ? regionRaw : undefined;
  const categoryRaw = url.searchParams.get('vehicleCategory');
  const vehicleCategory = categoryRaw === null ? undefined : VEHICLE_CATEGORIES.includes(categoryRaw as TransporterVehicleCategory) ? categoryRaw as TransporterVehicleCategory : undefined;
  const typeRaw = url.searchParams.get('vehicleType');
  const vehicleType = typeRaw === null ? undefined : typeof typeRaw === 'string' && SAFE_SLUG.test(typeRaw) ? typeRaw : undefined;
  const availabilityRaw = url.searchParams.get('availability');
  const availability = availabilityRaw === null ? undefined : AVAILABILITY.includes(availabilityRaw as TransporterAvailability) ? availabilityRaw as TransporterAvailability : undefined;
  const capacityRaw = url.searchParams.get('minCapacityKg');
  const lengthRaw = url.searchParams.get('minLengthMm');
  const widthRaw = url.searchParams.get('minWidthMm');
  const heightRaw = url.searchParams.get('minHeightMm');
  const minCapacityKg = capacityRaw === null ? 0 : queryInteger(capacityRaw, 250_000);
  const minLengthMm = lengthRaw === null ? 0 : queryInteger(lengthRaw, 50_000);
  const minWidthMm = widthRaw === null ? 0 : queryInteger(widthRaw, 20_000);
  const minHeightMm = heightRaw === null ? 0 : queryInteger(heightRaw, 20_000);
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? TRANSPORTER_DISCOVERY_PAGE_MAX : Number(rawLimit);
  const cursorValue = url.searchParams.get('cursor') || undefined;
  if (!countryCode || regionRaw !== null && !region || categoryRaw !== null && !vehicleCategory || typeRaw !== null && !vehicleType ||
      availabilityRaw !== null && !availability || minCapacityKg === null || minLengthMm === null || minWidthMm === null || minHeightMm === null ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > TRANSPORTER_DISCOVERY_PAGE_MAX) return null;
  const filters: TransporterSearchFilters = {
    countryCode, ...(region ? { region } : {}), ...(vehicleCategory ? { vehicleCategory } : {}), ...(vehicleType ? { vehicleType } : {}),
    ...(availability ? { availability } : {}), minCapacityKg, minLengthMm, minWidthMm, minHeightMm,
    ...(cursorValue ? { cursor: cursorValue } : {}), limit,
  };
  const cursor = parseCursor(cursorValue);
  if (cursorValue && (!cursor || cursor.context !== searchContext(filters))) return null;
  return filters;
}

export function transporterDiscoveryFacet(filters: Pick<TransporterSearchFilters, 'countryCode' | 'region' | 'vehicleCategory' | 'vehicleType' | 'availability'>): string {
  return ['v1', filters.countryCode, encodedRegion(filters.region), filters.vehicleCategory || '*', filters.vehicleType || '*', filters.availability || '*'].join('|');
}

export function transporterDiscoveryQuery(projectId: string, filters: TransporterSearchFilters) {
  const cursor = parseCursor(filters.cursor);
  const range = (fieldPath: string, value: number) => ({ fieldFilter: { field: { fieldPath }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(value) } } });
  const query: Record<string, unknown> = {
    from: [{ collectionId: 'transporterDiscoveryProfiles' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'discoveryFacets' }, op: 'ARRAY_CONTAINS', value: { stringValue: transporterDiscoveryFacet(filters) } } },
      range('declaredCapacityKg', filters.minCapacityKg),
      range('declaredDimensionsMm.length', filters.minLengthMm),
      range('declaredDimensionsMm.width', filters.minWidthMm),
      range('declaredDimensionsMm.height', filters.minHeightMm),
    ] } },
    orderBy: [
      { field: { fieldPath: 'declaredCapacityKg' }, direction: 'ASCENDING' },
      { field: { fieldPath: 'declaredDimensionsMm.length' }, direction: 'ASCENDING' },
      { field: { fieldPath: 'declaredDimensionsMm.width' }, direction: 'ASCENDING' },
      { field: { fieldPath: 'declaredDimensionsMm.height' }, direction: 'ASCENDING' },
      { field: { fieldPath: 'sortKey' }, direction: 'ASCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
    ],
    limit: filters.limit + 1,
  };
  if (cursor) query.startAt = { before: false, values: [
    { integerValue: String(cursor.capacityKg) },
    { integerValue: String(cursor.lengthMm) },
    { integerValue: String(cursor.widthMm) },
    { integerValue: String(cursor.heightMm) },
    { stringValue: cursor.sortKey },
    { referenceValue: `projects/${projectId}/databases/(default)/documents/transporterDiscoveryProfiles/${encodeURIComponent(cursor.id)}` },
  ] };
  return query;
}

export function publicTransporterProjection(id: string, value: unknown): TransporterPublicProfile | null {
  const raw = record(value);
  if (!raw || !SAFE_ID.test(id) || raw.schemaVersion !== 1 || raw.kind !== 'transporter' || raw.eligibilityState !== 'verified_eligible' ||
      raw.profileState !== 'active' || raw.moderationState !== 'approved' || raw.verificationState !== 'verified' || raw.discoverable !== true ||
      raw.canReceiveRequests !== true || raw.accountPurpose !== 'standard' || !['individual', 'organization'].includes(String(raw.principalType)) ||
      raw.authorizationState !== 'active' || raw.revocationState !== 'clear') return null;
  const displayName = boundedText(raw.displayName, 2, 120);
  const countryCode = safeCountry(raw.countryCode);
  const region = boundedText(raw.region, 1, 80);
  const vehicleCategory = typeof raw.vehicleCategory === 'string' && VEHICLE_CATEGORIES.includes(raw.vehicleCategory as TransporterVehicleCategory)
    ? raw.vehicleCategory as TransporterVehicleCategory : null;
  const vehicleType = typeof raw.vehicleType === 'string' && SAFE_SLUG.test(raw.vehicleType) ? raw.vehicleType : null;
  const capacity = safeInteger(raw.declaredCapacityKg, 1, 250_000);
  const dimensions = record(raw.declaredDimensionsMm);
  const length = safeInteger(dimensions?.length, 1, 50_000);
  const width = safeInteger(dimensions?.width, 1, 20_000);
  const height = safeInteger(dimensions?.height, 1, 20_000);
  const availability = typeof raw.availability === 'string' && AVAILABILITY.includes(raw.availability as TransporterAvailability)
    ? raw.availability as TransporterAvailability : null;
  const description = raw.description === undefined ? undefined : boundedText(raw.description, 0, 500);
  if (!displayName || !countryCode || !region || !vehicleCategory || !vehicleType || capacity === null || length === null || width === null || height === null ||
      !availability || raw.description !== undefined && description === null) return null;
  return {
    id, displayName, countryCode, region, vehicleCategory, vehicleType, declaredCapacityKg: capacity,
    declaredDimensionsMm: { length, width, height }, availability, ...(description ? { description } : {}),
    eligibility: 'verified_eligible', capabilityBasis: 'declared_not_independently_verified',
  };
}

function parseRegion(value: unknown): TransportRegion | null {
  const raw = record(value);
  if (!raw || !onlyKeys(raw, ['countryCode', 'region'])) return null;
  const countryCode = safeCountry(raw.countryCode);
  const region = boundedText(raw.region, 1, 80);
  return countryCode && region ? { countryCode, region } : null;
}

function parseEndpoint(value: unknown): TransportEndpoint | null {
  const raw = record(value);
  if (!raw || !onlyKeys(raw, ['region', 'pin'])) return null;
  const region = parseRegion(raw.region);
  try {
    const pin = parsePreciseLocation(raw.pin);
    return region && pin ? { region, pin } : null;
  } catch {
    return null;
  }
}

function parseIso(value: unknown): number {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? Date.parse(value) : NaN;
}

export function parseTransportRequestInput(value: unknown): TransportRequestInput | null {
  const raw = record(value);
  if (!raw || !onlyKeys(raw, ['clientDraftId', 'contractVersion', 'expectedRevision', 'equipmentCategory', 'loadWeightKg', 'loadDimensionsMm', 'origin', 'destination', 'requestedPickupWindow', 'requestedDeliveryBy', 'notes']) ||
      raw.contractVersion !== TRANSPORT_REQUEST_CONTRACT_VERSION || raw.expectedRevision !== null || typeof raw.clientDraftId !== 'string' || !SAFE_ID.test(raw.clientDraftId) ||
      typeof raw.equipmentCategory !== 'string' || !LOAD_CATEGORIES.includes(raw.equipmentCategory as (typeof LOAD_CATEGORIES)[number])) return null;
  const loadWeightKg = safeInteger(raw.loadWeightKg, 1, 250_000);
  const dimensions = record(raw.loadDimensionsMm);
  if (!dimensions || !onlyKeys(dimensions, ['length', 'width', 'height'])) return null;
  const length = safeInteger(dimensions.length, 1, 50_000);
  const width = safeInteger(dimensions.width, 1, 20_000);
  const height = safeInteger(dimensions.height, 1, 20_000);
  const origin = parseEndpoint(raw.origin);
  const destination = parseEndpoint(raw.destination);
  const window = record(raw.requestedPickupWindow);
  if (!window || !onlyKeys(window, ['startAt', 'endAt'])) return null;
  const start = parseIso(window.startAt), end = parseIso(window.endAt), delivery = parseIso(raw.requestedDeliveryBy);
  const notes = raw.notes === undefined ? undefined : boundedText(raw.notes, 0, 1000);
  if (loadWeightKg === null || length === null || width === null || height === null || !origin || !destination ||
      !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(delivery) || end <= start || delivery < end ||
      delivery - start > 366 * 24 * 60 * 60 * 1000 || raw.notes !== undefined && notes === null) return null;
  return {
    clientDraftId: raw.clientDraftId,
    contractVersion: 1,
    expectedRevision: null,
    equipmentCategory: raw.equipmentCategory as (typeof LOAD_CATEGORIES)[number],
    loadWeightKg,
    loadDimensionsMm: { length, width, height },
    origin,
    destination,
    requestedPickupWindow: { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() },
    requestedDeliveryBy: new Date(delivery).toISOString(),
    ...(notes ? { notes } : {}),
  };
}

export function prepareTransportRequest(input: TransportRequestInput, preparedAt = new Date().toISOString()) {
  return {
    contractVersion: TRANSPORT_REQUEST_CONTRACT_VERSION,
    clientDraftId: input.clientDraftId,
    revision: null,
    status: 'prepared_not_submitted' as const,
    submissionEnabled: false,
    preparedAt,
    requirementsSnapshot: {
      equipmentCategory: input.equipmentCategory,
      loadWeightKg: input.loadWeightKg,
      loadDimensionsMm: { ...input.loadDimensionsMm },
      origin: { region: { ...input.origin.region }, pin: { ...input.origin.pin } },
      destination: { region: { ...input.destination.region }, pin: { ...input.destination.pin } },
      requestedPickupWindow: { ...input.requestedPickupWindow },
      requestedDeliveryBy: input.requestedDeliveryBy,
      ...(input.notes ? { notes: input.notes } : {}),
    },
  };
}

export function matchTransportLoad(
  requirements: Pick<TransportRequestInput, 'loadWeightKg' | 'loadDimensionsMm'>,
  capability: Pick<TransporterPublicProfile, 'declaredCapacityKg' | 'declaredDimensionsMm'>,
) {
  const reasons = [
    ...(capability.declaredCapacityKg < requirements.loadWeightKg ? ['capacity'] : []),
    ...(capability.declaredDimensionsMm.length < requirements.loadDimensionsMm.length ? ['length'] : []),
    ...(capability.declaredDimensionsMm.width < requirements.loadDimensionsMm.width ? ['width'] : []),
    ...(capability.declaredDimensionsMm.height < requirements.loadDimensionsMm.height ? ['height'] : []),
  ];
  return {
    compatible: reasons.length === 0,
    reasons,
    capabilityBasis: 'declared_not_independently_verified' as const,
    routeSuitability: 'not_evaluated' as const,
    legalEligibility: 'not_evaluated' as const,
  };
}
