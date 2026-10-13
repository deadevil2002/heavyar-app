import type { GccCountryCode } from '@/constants/gcc';
import { decodePreciseLocation, type PreciseLocation } from './location';
import { request, WorkerError } from './workerClient';

export type OperatorAvailability = 'available' | 'busy';
export type OperatorPublicProfile = {
  id: string;
  displayName: string;
  countryCode: GccCountryCode;
  region: string;
  equipmentSkills: string[];
  yearsExperience: number;
  availability: OperatorAvailability;
  description?: string;
  eligibility: 'verified_eligible';
};
export type OperatorSearchResult = {
  activation: { enabled: boolean; reason?: 'regulatory_activation_required' };
  operators: OperatorPublicProfile[];
  nextCursor: string | null;
};
export type OperatorRequestDraft = {
  clientDraftId: string;
  contractVersion: 1;
  expectedRevision: null;
  equipmentSkill: string;
  requestedStartAt: string;
  requestedEndAt: string;
  matchingRegion: { countryCode: GccCountryCode; region: string };
  workSite: PreciseLocation;
  notes?: string;
};

const COUNTRY = new Set(['SA', 'AE', 'KW', 'BH', 'OM', 'QA']);
const SAFE_SKILL = /^[a-z0-9][a-z0-9_-]{0,47}$/;
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every(key => keys.includes(key));
}
function publicProfile(value: unknown): OperatorPublicProfile | null {
  const row = record(value);
  if (!row || !onlyKeys(row, ['id', 'displayName', 'countryCode', 'region', 'equipmentSkills', 'yearsExperience', 'availability', 'description', 'eligibility']) ||
      typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(row.id) || typeof row.displayName !== 'string' || !row.displayName.trim() || row.displayName.length > 120 ||
      typeof row.countryCode !== 'string' || !COUNTRY.has(row.countryCode) || typeof row.region !== 'string' || !row.region.trim() || row.region.length > 80 ||
      !Array.isArray(row.equipmentSkills) || row.equipmentSkills.length < 1 || row.equipmentSkills.length > 20 || !row.equipmentSkills.every(skill => typeof skill === 'string' && SAFE_SKILL.test(skill)) ||
      typeof row.yearsExperience !== 'number' || !Number.isSafeInteger(row.yearsExperience) || row.yearsExperience < 0 || row.yearsExperience > 80 ||
      !['available', 'busy'].includes(String(row.availability)) || row.eligibility !== 'verified_eligible' ||
      row.description !== undefined && (typeof row.description !== 'string' || row.description.length > 500)) return null;
  return row as unknown as OperatorPublicProfile;
}

export function decodeOperatorSearchResponse(value: unknown): OperatorSearchResult {
  const raw = record(value), activation = record(raw?.activation);
  if (!raw || !onlyKeys(raw, ['success', 'activation', 'operators', 'nextCursor']) || raw.success !== true || !activation ||
      !onlyKeys(activation, ['enabled', 'reason']) || typeof activation.enabled !== 'boolean' ||
      activation.reason !== undefined && activation.reason !== 'regulatory_activation_required' || !Array.isArray(raw.operators) || raw.operators.length > 20 ||
      raw.nextCursor !== null && typeof raw.nextCursor !== 'string') throw new WorkerError('Invalid operator discovery response', 502, 'INVALID_OPERATOR_RESPONSE');
  const operators = raw.operators.map(publicProfile);
  if (operators.some(item => item === null) || activation.enabled === false && raw.operators.length > 0) throw new WorkerError('Invalid operator discovery response', 502, 'INVALID_OPERATOR_RESPONSE');
  return { activation: activation as OperatorSearchResult['activation'], operators: operators as OperatorPublicProfile[], nextCursor: raw.nextCursor as string | null };
}

export async function searchOperators(params: {
  countryCode?: string;
  region?: string;
  equipmentSkill?: string;
  availability?: OperatorAvailability;
  cursor?: string;
  limit?: number;
} = {}, signal?: AbortSignal): Promise<OperatorSearchResult> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  const response = await request<unknown>(`/api/operators/search?${query.toString()}`, { signal }, false);
  return decodeOperatorSearchResponse(response);
}

export async function prepareOperatorRequest(input: OperatorRequestDraft, expectedUid: string, signal?: AbortSignal) {
  const response = await request<{ success: true; request?: unknown }>('/api/operator-requests/prepare', {
    method: 'POST', body: JSON.stringify(input), signal,
  }, true, expectedUid);
  const value = record(response.request), snapshot = record(value?.requirementsSnapshot);
  const matching = record(snapshot?.matchingRegion);
  const returnedLocation = decodePreciseLocation(snapshot?.workSite);
  if (!value || !onlyKeys(value, ['contractVersion', 'clientDraftId', 'revision', 'status', 'submissionEnabled', 'preparedAt', 'requirementsSnapshot']) ||
      value.contractVersion !== 1 || value.clientDraftId !== input.clientDraftId || value.revision !== null || value.status !== 'prepared_not_submitted' ||
      value.submissionEnabled !== false || typeof value.preparedAt !== 'string' || !Number.isFinite(Date.parse(value.preparedAt)) || !snapshot ||
      !onlyKeys(snapshot, ['equipmentSkill', 'requestedStartAt', 'requestedEndAt', 'matchingRegion', 'workSite', 'notes']) ||
      snapshot.equipmentSkill !== input.equipmentSkill || snapshot.requestedStartAt !== input.requestedStartAt || snapshot.requestedEndAt !== input.requestedEndAt ||
      !matching || !onlyKeys(matching, ['countryCode', 'region']) || matching.countryCode !== input.matchingRegion.countryCode || matching.region !== input.matchingRegion.region ||
      !returnedLocation || returnedLocation.lat !== input.workSite.lat || returnedLocation.lng !== input.workSite.lng ||
      snapshot.notes !== input.notes) throw new WorkerError('Invalid operator request response', 502, 'INVALID_OPERATOR_REQUEST_RESPONSE');
  return value;
}
