import { request } from './workerClient';

export type ServiceProfileKind = 'operator' | 'transporter';
export type ServiceAvailability = 'available' | 'busy' | 'offline';
export type DeclaredCredential = {
  kind: string;
  title: string;
  issuer?: string;
  expiresOn?: string;
  declarationState: 'declared_unverified';
};
export type ServiceArea = { countryCode: string; region: string; city?: string };
export type OperatorDraft = {
  equipmentCategories: string[];
  yearsExperience: number;
  serviceArea: ServiceArea;
  availability: ServiceAvailability;
  declarations: DeclaredCredential[];
  description: string;
};
export type TransporterDraft = {
  vehicleCategory: 'lowbed' | 'flatbed' | 'trailer' | 'recovery' | 'other';
  vehicleType: string;
  capacityKg: number;
  dimensionsMm: { length: number; width: number; height: number };
  serviceArea: ServiceArea;
  availability: ServiceAvailability;
  declarations: DeclaredCredential[];
  description: string;
};
export type ServiceDraftByKind = { operator: OperatorDraft; transporter: TransporterDraft };
export type ServiceProfile<K extends ServiceProfileKind = ServiceProfileKind> = {
  kind: K;
  requestedCapability: K;
  profileState: 'draft';
  moderationState: 'not_submitted';
  verificationState: 'unverified';
  discoverable: false;
  canReceiveRequests: false;
  revision: string | null;
  draft: ServiceDraftByKind[K];
  updatedAt: string | null;
};

const organizationIdPattern = /^org_[A-Za-z0-9_-]{43}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
  return value as Record<string, unknown>;
}

function string(value: unknown, max: number) {
  if (typeof value !== 'string' || value.length > max) throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
  return value;
}

function integer(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
  return value;
}

function area(value: unknown): ServiceArea {
  const row = object(value);
  const countryCode = string(row.countryCode, 2);
  const region = string(row.region, 80);
  if (!['SA', 'AE', 'KW', 'BH', 'OM', 'QA'].includes(countryCode) || !region) throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
  return { countryCode, region, ...(row.city === undefined ? {} : { city: string(row.city, 80) }) };
}

function availability(value: unknown): ServiceAvailability {
  if (!['available', 'busy', 'offline'].includes(String(value))) throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
  return value as ServiceAvailability;
}

function declaredCredentials(value: unknown): DeclaredCredential[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
  return value.map(valueItem => {
    const item = object(valueItem);
    if (item.declarationState !== 'declared_unverified') throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
    return {
      kind: string(item.kind, 40), title: string(item.title, 120), declarationState: 'declared_unverified' as const,
      ...(item.issuer === undefined ? {} : { issuer: string(item.issuer, 120) }),
      ...(item.expiresOn === undefined ? {} : { expiresOn: string(item.expiresOn, 10) }),
    };
  });
}

function operatorDraft(value: unknown): OperatorDraft {
  const row = object(value);
  if (!Array.isArray(row.equipmentCategories) || row.equipmentCategories.length < 1 || row.equipmentCategories.length > 20) throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
  const equipmentCategories = row.equipmentCategories.map(item => string(item, 48));
  return {
    equipmentCategories,
    yearsExperience: integer(row.yearsExperience, 0, 80),
    serviceArea: area(row.serviceArea),
    availability: availability(row.availability),
    declarations: declaredCredentials(row.declarations),
    description: string(row.description, 1000),
  };
}

function transporterDraft(value: unknown): TransporterDraft {
  const row = object(value), dimensions = object(row.dimensionsMm);
  if (!['lowbed', 'flatbed', 'trailer', 'recovery', 'other'].includes(String(row.vehicleCategory))) throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
  return {
    vehicleCategory: row.vehicleCategory as TransporterDraft['vehicleCategory'],
    vehicleType: string(row.vehicleType, 80),
    capacityKg: integer(row.capacityKg, 1, 250_000),
    dimensionsMm: {
      length: integer(dimensions.length, 1, 50_000),
      width: integer(dimensions.width, 1, 20_000),
      height: integer(dimensions.height, 1, 20_000),
    },
    serviceArea: area(row.serviceArea),
    availability: availability(row.availability),
    declarations: declaredCredentials(row.declarations),
    description: string(row.description, 1000),
  };
}

export function decodeServiceProfile<K extends ServiceProfileKind>(value: unknown, kind: K): ServiceProfile<K> {
  const row = object(value);
  if (row.kind !== kind || row.requestedCapability !== kind || row.profileState !== 'draft' || row.moderationState !== 'not_submitted' ||
      row.verificationState !== 'unverified' || row.discoverable !== false || row.canReceiveRequests !== false ||
      !(row.revision === null || typeof row.revision === 'string') || !(row.updatedAt === null || typeof row.updatedAt === 'string')) {
    throw new Error('SERVICE_PROFILE_RESPONSE_INVALID');
  }
  return {
    kind, requestedCapability: kind, profileState: 'draft', moderationState: 'not_submitted', verificationState: 'unverified',
    discoverable: false, canReceiveRequests: false, revision: row.revision as string | null,
    draft: (kind === 'operator' ? operatorDraft(row.draft) : transporterDraft(row.draft)) as ServiceDraftByKind[K],
    updatedAt: row.updatedAt as string | null,
  };
}

function optionalProfile<K extends ServiceProfileKind>(value: unknown, kind: K): ServiceProfile<K> | null {
  return value === null ? null : decodeServiceProfile(value, kind);
}

function serviceDraftInput<K extends ServiceProfileKind>(draft: ServiceDraftByKind[K]) {
  return {
    ...draft,
    declarations: draft.declarations.map(({ declarationState: _serverOwnedState, ...declaration }) => declaration),
  };
}

export async function getPersonalServiceProfiles(expectedUid: string, signal?: AbortSignal) {
  const response = object(await request('/api/service-profiles', { signal }, true, expectedUid));
  const profiles = object(response.profiles);
  return { operator: optionalProfile(profiles.operator, 'operator'), transporter: optionalProfile(profiles.transporter, 'transporter') };
}

export async function savePersonalServiceProfile<K extends ServiceProfileKind>(expectedUid: string, kind: K, expectedRevision: string | null, draft: ServiceDraftByKind[K], signal?: AbortSignal) {
  const response = object(await request(`/api/service-profiles/${kind}`, { method: 'PUT', body: JSON.stringify({ expectedRevision, draft: serviceDraftInput(draft) }), signal }, true, expectedUid));
  return decodeServiceProfile(response.profile, kind);
}

export async function getOrganizationServiceProfile<K extends ServiceProfileKind>(expectedUid: string, organizationId: string, kind: K, signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId)) throw new Error('ORGANIZATION_ID_INVALID');
  const response = object(await request(`/api/organizations/${organizationId}/service-profiles/${kind}`, { signal }, true, expectedUid));
  return optionalProfile(response.profile, kind);
}

export async function saveOrganizationServiceProfile<K extends ServiceProfileKind>(expectedUid: string, organizationId: string, kind: K, expectedRevision: string | null, draft: ServiceDraftByKind[K], signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId)) throw new Error('ORGANIZATION_ID_INVALID');
  const response = object(await request(`/api/organizations/${organizationId}/service-profiles/${kind}`, { method: 'PUT', body: JSON.stringify({ expectedRevision, draft: serviceDraftInput(draft) }), signal }, true, expectedUid));
  return decodeServiceProfile(response.profile, kind);
}
