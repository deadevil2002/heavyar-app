import { parsePreciseLocation, type PreciseLocation } from './location';

export const OPERATOR_DISCOVERY_PAGE_MAX = 20;
export const OPERATOR_DISCOVERY_ACTIVATION = 'regulatory_activation_required' as const;
export const OPERATOR_REQUEST_CONTRACT_VERSION = 1 as const;

const GCC_COUNTRIES = ['SA', 'AE', 'KW', 'BH', 'OM', 'QA'] as const;
const AVAILABILITY = ['available', 'busy'] as const;
const SAFE_SKILL = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export type OperatorAvailability = (typeof AVAILABILITY)[number];
export type OperatorSearchFilters = {
  countryCode: string;
  region?: string;
  equipmentSkill?: string;
  availability?: OperatorAvailability;
  cursor?: string;
  limit: number;
};

export type OperatorPublicProfile = {
  id: string;
  displayName: string;
  countryCode: string;
  region: string;
  equipmentSkills: string[];
  yearsExperience: number;
  availability: OperatorAvailability;
  description?: string;
  eligibility: 'verified_eligible';
};

export type OperatorRequestInput = {
  clientDraftId: string;
  contractVersion: 1;
  expectedRevision: null;
  equipmentSkill: string;
  requestedStartAt: string;
  requestedEndAt: string;
  matchingRegion: { countryCode: string; region: string };
  workSite: PreciseLocation;
  notes?: string;
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

function safeSkill(value: unknown): string | null {
  return typeof value === 'string' && SAFE_SKILL.test(value) ? value : null;
}

function parseCursor(value: string | undefined): { sortKey: string; id: string } | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0))));
    if (!record(decoded) || decoded.v !== 1 || !boundedText(decoded.sortKey, 1, 160) || typeof decoded.id !== 'string' || !SAFE_ID.test(decoded.id)) return null;
    return { sortKey: decoded.sortKey, id: decoded.id };
  } catch {
    return null;
  }
}

export function operatorCursor(sortKey: string, id: string): string {
  if (!boundedText(sortKey, 1, 160) || !SAFE_ID.test(id)) throw new Error('INVALID_OPERATOR_CURSOR');
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, sortKey, id }));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function parseOperatorSearch(url: URL): OperatorSearchFilters | null {
  const allowed = ['countryCode', 'region', 'equipmentSkill', 'availability', 'cursor', 'limit'];
  if ([...url.searchParams.keys()].some(key => !allowed.includes(key))) return null;
  const countryCode = safeCountry(url.searchParams.get('countryCode') || 'SA');
  const regionValue = url.searchParams.get('region');
  const region = regionValue === null ? undefined : boundedText(regionValue, 1, 80) || undefined;
  const skillValue = url.searchParams.get('equipmentSkill');
  const equipmentSkill = skillValue === null ? undefined : safeSkill(skillValue) || undefined;
  const availabilityValue = url.searchParams.get('availability');
  const availability = availabilityValue === null ? undefined : AVAILABILITY.includes(availabilityValue as OperatorAvailability) ? availabilityValue as OperatorAvailability : undefined;
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? OPERATOR_DISCOVERY_PAGE_MAX : Number(rawLimit);
  const cursorValue = url.searchParams.get('cursor') || undefined;
  if (!countryCode || regionValue !== null && !region || skillValue !== null && !equipmentSkill || availabilityValue !== null && !availability ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > OPERATOR_DISCOVERY_PAGE_MAX || cursorValue && !parseCursor(cursorValue)) return null;
  return { countryCode, ...(region ? { region } : {}), ...(equipmentSkill ? { equipmentSkill } : {}), ...(availability ? { availability } : {}), ...(cursorValue ? { cursor: cursorValue } : {}), limit };
}

export function operatorDiscoveryFacet(filters: Pick<OperatorSearchFilters, 'countryCode' | 'region' | 'equipmentSkill' | 'availability'>): string {
  return ['v1', filters.countryCode, filters.region || '*', filters.equipmentSkill || '*', filters.availability || '*'].join('|');
}

export function operatorDiscoveryQuery(projectId: string, filters: OperatorSearchFilters) {
  const cursor = parseCursor(filters.cursor);
  const query: Record<string, unknown> = {
    from: [{ collectionId: 'operatorDiscoveryProfiles' }],
    where: { fieldFilter: { field: { fieldPath: 'discoveryFacets' }, op: 'ARRAY_CONTAINS', value: { stringValue: operatorDiscoveryFacet(filters) } } },
    orderBy: [
      { field: { fieldPath: 'sortKey' }, direction: 'ASCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
    ],
    limit: filters.limit + 1,
  };
  if (cursor) query.startAt = { before: false, values: [
    { stringValue: cursor.sortKey },
    { referenceValue: `projects/${projectId}/databases/(default)/documents/operatorDiscoveryProfiles/${encodeURIComponent(cursor.id)}` },
  ] };
  return query;
}

export function publicOperatorProjection(id: string, value: unknown): OperatorPublicProfile | null {
  const raw = record(value);
  if (!raw || !SAFE_ID.test(id) || raw.schemaVersion !== 1 || raw.kind !== 'operator' || raw.eligibilityState !== 'verified_eligible' ||
      raw.profileState !== 'active' || raw.moderationState !== 'approved' || raw.verificationState !== 'verified' ||
      raw.discoverable !== true || raw.canReceiveRequests !== true || raw.accountPurpose !== 'standard' ||
      !['individual', 'organization'].includes(String(raw.principalType)) || raw.authorizationState !== 'active' || raw.revocationState !== 'clear') return null;
  const displayName = boundedText(raw.displayName, 2, 120);
  const countryCode = safeCountry(raw.countryCode);
  const region = boundedText(raw.region, 1, 80);
  const sortKey = boundedText(raw.sortKey, 1, 160);
  const availability = typeof raw.availability === 'string' && AVAILABILITY.includes(raw.availability as OperatorAvailability)
    ? raw.availability as OperatorAvailability : null;
  const yearsExperience = typeof raw.yearsExperience === 'number' && Number.isSafeInteger(raw.yearsExperience) && raw.yearsExperience >= 0 && raw.yearsExperience <= 80
    ? raw.yearsExperience : null;
  const skills = Array.isArray(raw.equipmentSkills) ? [...new Set(raw.equipmentSkills)] : [];
  const description = raw.description === undefined ? undefined : boundedText(raw.description, 0, 500);
  if (!displayName || !countryCode || !region || !sortKey || !availability || yearsExperience === null ||
      skills.length < 1 || skills.length > 20 || !skills.every(skill => typeof skill === 'string' && SAFE_SKILL.test(skill)) ||
      raw.description !== undefined && description === null) return null;
  return { id, displayName, countryCode, region, equipmentSkills: skills as string[], yearsExperience, availability,
    ...(description ? { description } : {}), eligibility: 'verified_eligible' };
}

export function parseOperatorRequestInput(value: unknown): OperatorRequestInput | null {
  const raw = record(value);
  if (!raw || !onlyKeys(raw, ['clientDraftId', 'contractVersion', 'expectedRevision', 'equipmentSkill', 'requestedStartAt', 'requestedEndAt', 'matchingRegion', 'workSite', 'notes']) ||
      raw.contractVersion !== OPERATOR_REQUEST_CONTRACT_VERSION || raw.expectedRevision !== null || typeof raw.clientDraftId !== 'string' || !SAFE_ID.test(raw.clientDraftId)) return null;
  const equipmentSkill = safeSkill(raw.equipmentSkill);
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const start = typeof raw.requestedStartAt === 'string' && iso.test(raw.requestedStartAt) ? Date.parse(raw.requestedStartAt) : NaN;
  const end = typeof raw.requestedEndAt === 'string' && iso.test(raw.requestedEndAt) ? Date.parse(raw.requestedEndAt) : NaN;
  const matching = record(raw.matchingRegion);
  const countryCode = matching && onlyKeys(matching, ['countryCode', 'region']) ? safeCountry(matching.countryCode) : null;
  const region = matching && onlyKeys(matching, ['countryCode', 'region']) ? boundedText(matching.region, 1, 80) : null;
  const notes = raw.notes === undefined ? undefined : boundedText(raw.notes, 0, 1000);
  let workSite: PreciseLocation;
  try { workSite = parsePreciseLocation(raw.workSite)!; } catch { return null; }
  if (!equipmentSkill || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 366 * 24 * 60 * 60 * 1000 ||
      !countryCode || !region || raw.notes !== undefined && notes === null) return null;
  return {
    clientDraftId: raw.clientDraftId,
    contractVersion: 1,
    expectedRevision: null,
    equipmentSkill,
    requestedStartAt: new Date(start).toISOString(),
    requestedEndAt: new Date(end).toISOString(),
    matchingRegion: { countryCode, region },
    workSite,
    ...(notes ? { notes } : {}),
  };
}

export function prepareOperatorRequest(input: OperatorRequestInput, preparedAt = new Date().toISOString()) {
  return {
    contractVersion: OPERATOR_REQUEST_CONTRACT_VERSION,
    clientDraftId: input.clientDraftId,
    revision: null,
    status: 'prepared_not_submitted' as const,
    submissionEnabled: false,
    preparedAt,
    requirementsSnapshot: {
      equipmentSkill: input.equipmentSkill,
      requestedStartAt: input.requestedStartAt,
      requestedEndAt: input.requestedEndAt,
      matchingRegion: input.matchingRegion,
      workSite: input.workSite,
      ...(input.notes ? { notes: input.notes } : {}),
    },
  };
}
