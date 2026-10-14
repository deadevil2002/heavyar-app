import type { GccCountryCode } from '@/constants/gcc';
import { decodePreciseLocation, type PreciseLocation } from './location';
import { request, WorkerError } from './workerClient';

export type TransporterVehicleCategory = 'lowbed' | 'flatbed' | 'trailer' | 'recovery' | 'other';
export type TransporterAvailability = 'available' | 'busy';
export type TransporterPublicProfile = {
  id: string;
  displayName: string;
  countryCode: GccCountryCode;
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
export type TransporterSearchResult = {
  activation: { enabled: boolean; reason?: 'regulatory_activation_required' };
  transporters: TransporterPublicProfile[];
  nextCursor: string | null;
};
export type TransportRequestDraft = {
  clientDraftId: string;
  contractVersion: 1;
  expectedRevision: null;
  equipmentCategory: string;
  loadWeightKg: number;
  loadDimensionsMm: { length: number; width: number; height: number };
  origin: { region: { countryCode: GccCountryCode; region: string }; pin: PreciseLocation };
  destination: { region: { countryCode: GccCountryCode; region: string }; pin: PreciseLocation };
  requestedPickupWindow: { startAt: string; endAt: string };
  requestedDeliveryBy: string;
  notes?: string;
};

const COUNTRY = new Set(['SA', 'AE', 'KW', 'BH', 'OM', 'QA']);
const CATEGORY = new Set(['lowbed', 'flatbed', 'trailer', 'recovery', 'other']);
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,47}$/;
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every(key => keys.includes(key));
}
function positiveInteger(value: unknown, max: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max;
}
function dimensions(value: unknown) {
  const row = record(value);
  return !!row && onlyKeys(row, ['length', 'width', 'height']) && positiveInteger(row.length, 50_000) && positiveInteger(row.width, 20_000) && positiveInteger(row.height, 20_000);
}
function publicProfile(value: unknown): TransporterPublicProfile | null {
  const row = record(value);
  if (!row || !onlyKeys(row, ['id', 'displayName', 'countryCode', 'region', 'vehicleCategory', 'vehicleType', 'declaredCapacityKg', 'declaredDimensionsMm', 'availability', 'description', 'eligibility', 'capabilityBasis']) ||
      typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(row.id) || typeof row.displayName !== 'string' || !row.displayName.trim() || row.displayName.length > 120 ||
      typeof row.countryCode !== 'string' || !COUNTRY.has(row.countryCode) || typeof row.region !== 'string' || !row.region.trim() || row.region.length > 80 ||
      typeof row.vehicleCategory !== 'string' || !CATEGORY.has(row.vehicleCategory) || typeof row.vehicleType !== 'string' || !SAFE_SLUG.test(row.vehicleType) ||
      !positiveInteger(row.declaredCapacityKg, 250_000) || !dimensions(row.declaredDimensionsMm) || !['available', 'busy'].includes(String(row.availability)) ||
      row.eligibility !== 'verified_eligible' || row.capabilityBasis !== 'declared_not_independently_verified' ||
      row.description !== undefined && (typeof row.description !== 'string' || row.description.length > 500)) return null;
  return row as unknown as TransporterPublicProfile;
}

export function decodeTransporterSearchResponse(value: unknown): TransporterSearchResult {
  const raw = record(value), activation = record(raw?.activation);
  if (!raw || !onlyKeys(raw, ['success', 'activation', 'transporters', 'nextCursor']) || raw.success !== true || !activation ||
      !onlyKeys(activation, ['enabled', 'reason']) || typeof activation.enabled !== 'boolean' ||
      activation.reason !== undefined && activation.reason !== 'regulatory_activation_required' || !Array.isArray(raw.transporters) || raw.transporters.length > 20 ||
      raw.nextCursor !== null && typeof raw.nextCursor !== 'string') throw new WorkerError('Invalid transporter discovery response', 502, 'INVALID_TRANSPORTER_RESPONSE');
  const transporters = raw.transporters.map(publicProfile);
  if (transporters.some(item => item === null) || activation.enabled === false && raw.transporters.length > 0) {
    throw new WorkerError('Invalid transporter discovery response', 502, 'INVALID_TRANSPORTER_RESPONSE');
  }
  return { activation: activation as TransporterSearchResult['activation'], transporters: transporters as TransporterPublicProfile[], nextCursor: raw.nextCursor as string | null };
}

export async function searchTransporters(params: {
  countryCode?: string;
  region?: string;
  vehicleCategory?: TransporterVehicleCategory;
  vehicleType?: string;
  availability?: TransporterAvailability;
  minCapacityKg?: number;
  minLengthMm?: number;
  minWidthMm?: number;
  minHeightMm?: number;
  cursor?: string;
  limit?: number;
} = {}, signal?: AbortSignal): Promise<TransporterSearchResult> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  return decodeTransporterSearchResponse(await request<unknown>(`/api/transporters/search?${query.toString()}`, { signal }, false));
}

function sameLocation(value: unknown, expected: PreciseLocation) {
  const decoded = decodePreciseLocation(value);
  return decoded && decoded.lat === expected.lat && decoded.lng === expected.lng && decoded.instructions === expected.instructions;
}
function sameEndpoint(value: unknown, expected: TransportRequestDraft['origin']) {
  const endpoint = record(value), region = record(endpoint?.region);
  return !!endpoint && onlyKeys(endpoint, ['region', 'pin']) && !!region && onlyKeys(region, ['countryCode', 'region']) &&
    region.countryCode === expected.region.countryCode && region.region === expected.region.region && sameLocation(endpoint.pin, expected.pin);
}

export async function prepareTransportRequest(input: TransportRequestDraft, expectedUid: string, signal?: AbortSignal) {
  const response = await request<{ success: true; request?: unknown }>('/api/transport-requests/prepare', {
    method: 'POST', body: JSON.stringify(input), signal,
  }, true, expectedUid);
  const value = record(response.request), snapshot = record(value?.requirementsSnapshot), pickup = record(snapshot?.requestedPickupWindow);
  if (!value || !onlyKeys(value, ['contractVersion', 'clientDraftId', 'revision', 'status', 'submissionEnabled', 'preparedAt', 'requirementsSnapshot']) ||
      value.contractVersion !== 1 || value.clientDraftId !== input.clientDraftId || value.revision !== null || value.status !== 'prepared_not_submitted' ||
      value.submissionEnabled !== false || typeof value.preparedAt !== 'string' || !Number.isFinite(Date.parse(value.preparedAt)) || !snapshot ||
      !onlyKeys(snapshot, ['equipmentCategory', 'loadWeightKg', 'loadDimensionsMm', 'origin', 'destination', 'requestedPickupWindow', 'requestedDeliveryBy', 'notes']) ||
      snapshot.equipmentCategory !== input.equipmentCategory || snapshot.loadWeightKg !== input.loadWeightKg ||
      JSON.stringify(snapshot.loadDimensionsMm) !== JSON.stringify(input.loadDimensionsMm) || !sameEndpoint(snapshot.origin, input.origin) || !sameEndpoint(snapshot.destination, input.destination) ||
      !pickup || !onlyKeys(pickup, ['startAt', 'endAt']) || pickup.startAt !== input.requestedPickupWindow.startAt || pickup.endAt !== input.requestedPickupWindow.endAt ||
      snapshot.requestedDeliveryBy !== input.requestedDeliveryBy || snapshot.notes !== input.notes) {
    throw new WorkerError('Invalid transport request response', 502, 'INVALID_TRANSPORT_REQUEST_RESPONSE');
  }
  return value;
}
