export const SERVICE_PROFILE_KINDS = ['operator', 'transporter'] as const;
export type ServiceProfileKind = (typeof SERVICE_PROFILE_KINDS)[number];

export const SERVICE_AVAILABILITY = ['available', 'busy', 'offline'] as const;
export type ServiceAvailability = (typeof SERVICE_AVAILABILITY)[number];

const GCC_COUNTRIES = ['SA', 'AE', 'KW', 'BH', 'OM', 'QA'] as const;
const OPERATOR_DECLARATION_KINDS = ['qualification', 'permit', 'training'] as const;
const TRANSPORT_DECLARATION_KINDS = ['transport_license', 'vehicle_permit', 'operating_card', 'other'] as const;
const TRANSPORT_VEHICLE_CATEGORIES = ['lowbed', 'flatbed', 'trailer', 'recovery', 'other'] as const;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

type ServiceArea = { countryCode: string; region: string; city?: string };
type Declaration = {
  kind: string;
  title: string;
  issuer?: string;
  expiresOn?: string;
  declarationState: 'declared_unverified';
};

export type OperatorDraft = {
  equipmentCategories: string[];
  yearsExperience: number;
  serviceArea: ServiceArea;
  availability: ServiceAvailability;
  declarations: Declaration[];
  description: string;
};

export type TransporterDraft = {
  vehicleCategory: (typeof TRANSPORT_VEHICLE_CATEGORIES)[number];
  vehicleType: string;
  capacityKg: number;
  dimensionsMm: { length: number; width: number; height: number };
  serviceArea: ServiceArea;
  availability: ServiceAvailability;
  declarations: Declaration[];
  description: string;
};

export type ServiceProfileDraft = OperatorDraft | TransporterDraft;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every(key => keys.includes(key));
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

function safeInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function serviceArea(value: unknown): ServiceArea | null {
  const row = record(value);
  if (!row || !onlyKeys(row, ['countryCode', 'region', 'city'])) return null;
  const countryCode = typeof row.countryCode === 'string' ? row.countryCode.toUpperCase() : '';
  const region = text(row.region, 1, 80);
  const city = row.city === undefined ? undefined : text(row.city, 1, 80);
  if (!GCC_COUNTRIES.includes(countryCode as (typeof GCC_COUNTRIES)[number]) || !region || row.city !== undefined && !city) return null;
  return { countryCode, region, ...(city ? { city } : {}) };
}

function declarations(value: unknown, kinds: readonly string[]): Declaration[] | null {
  if (!Array.isArray(value) || value.length > 12) return null;
  const result: Declaration[] = [];
  for (const item of value) {
    const row = record(item);
    if (!row || !onlyKeys(row, ['kind', 'title', 'issuer', 'expiresOn']) || typeof row.kind !== 'string' || !kinds.includes(row.kind)) return null;
    const title = text(row.title, 2, 120);
    const issuer = row.issuer === undefined ? undefined : text(row.issuer, 2, 120);
    const expiresOn = row.expiresOn === undefined ? undefined : text(row.expiresOn, 10, 10);
    if (!title || row.issuer !== undefined && !issuer || expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return null;
    result.push({ kind: row.kind, title, ...(issuer ? { issuer } : {}), ...(expiresOn ? { expiresOn } : {}), declarationState: 'declared_unverified' });
  }
  return result;
}

function availability(value: unknown): ServiceAvailability | null {
  return typeof value === 'string' && SERVICE_AVAILABILITY.includes(value as ServiceAvailability) ? value as ServiceAvailability : null;
}

function description(value: unknown): string | null {
  return text(value, 0, 1000);
}

function operatorDraft(value: unknown): OperatorDraft | null {
  const row = record(value);
  if (!row || !onlyKeys(row, ['equipmentCategories', 'yearsExperience', 'serviceArea', 'availability', 'declarations', 'description']) ||
      !Array.isArray(row.equipmentCategories) || row.equipmentCategories.length < 1 || row.equipmentCategories.length > 20) return null;
  const equipmentCategories = [...new Set(row.equipmentCategories)];
  if (!equipmentCategories.every(item => typeof item === 'string' && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(item))) return null;
  const yearsExperience = safeInteger(row.yearsExperience, 0, 80);
  const area = serviceArea(row.serviceArea);
  const declaredAvailability = availability(row.availability);
  const declaredQualifications = declarations(row.declarations, OPERATOR_DECLARATION_KINDS);
  const serviceDescription = description(row.description);
  if (yearsExperience === null || !area || !declaredAvailability || !declaredQualifications || serviceDescription === null) return null;
  return { equipmentCategories: equipmentCategories as string[], yearsExperience, serviceArea: area, availability: declaredAvailability, declarations: declaredQualifications, description: serviceDescription };
}

function transporterDraft(value: unknown): TransporterDraft | null {
  const row = record(value);
  if (!row || !onlyKeys(row, ['vehicleCategory', 'vehicleType', 'capacityKg', 'dimensionsMm', 'serviceArea', 'availability', 'declarations', 'description']) ||
      typeof row.vehicleCategory !== 'string' || !TRANSPORT_VEHICLE_CATEGORIES.includes(row.vehicleCategory as TransporterDraft['vehicleCategory'])) return null;
  const vehicleType = text(row.vehicleType, 2, 80);
  const capacityKg = safeInteger(row.capacityKg, 1, 250_000);
  const dimensions = record(row.dimensionsMm);
  const length = dimensions && onlyKeys(dimensions, ['length', 'width', 'height']) ? safeInteger(dimensions.length, 1, 50_000) : null;
  const width = dimensions && onlyKeys(dimensions, ['length', 'width', 'height']) ? safeInteger(dimensions.width, 1, 20_000) : null;
  const height = dimensions && onlyKeys(dimensions, ['length', 'width', 'height']) ? safeInteger(dimensions.height, 1, 20_000) : null;
  const area = serviceArea(row.serviceArea);
  const declaredAvailability = availability(row.availability);
  const declaredPermits = declarations(row.declarations, TRANSPORT_DECLARATION_KINDS);
  const serviceDescription = description(row.description);
  if (!vehicleType || capacityKg === null || length === null || width === null || height === null || !area || !declaredAvailability || !declaredPermits || serviceDescription === null) return null;
  return { vehicleCategory: row.vehicleCategory as TransporterDraft['vehicleCategory'], vehicleType, capacityKg, dimensionsMm: { length, width, height }, serviceArea: area, availability: declaredAvailability, declarations: declaredPermits, description: serviceDescription };
}

export function parseServiceProfileDraft(kind: ServiceProfileKind, value: unknown): ServiceProfileDraft | null {
  return kind === 'operator' ? operatorDraft(value) : kind === 'transporter' ? transporterDraft(value) : null;
}

export function isEligibleIndividualServiceAccount(account: Record<string, unknown> | null | undefined, driverProfile: Record<string, unknown> | null | undefined): boolean {
  if (!account || account.role !== 'driver' || account.isActive === false || !driverProfile) return false;
  if (['suspended', 'restricted', 'deletion_requested', 'deleted'].includes(String(account.accountStatus || account.suspensionStatus || ''))) return false;
  return !['suspended', 'rejected'].includes(String(driverProfile.moderationStatus || ''));
}

export function serviceProfileCollection(kind: ServiceProfileKind, organizationOwned = false) {
  if (organizationOwned) return kind === 'operator' ? 'organizationOperatorProfiles' : 'organizationTransporterProfiles';
  return kind === 'operator' ? 'operatorProfiles' : 'transporterProfiles';
}

export function serviceProfileProjection(kind: ServiceProfileKind, raw: Record<string, unknown>, revision?: string | null) {
  const draft = parseServiceProfileDraft(kind, raw.draft);
  if (!draft) return null;
  return {
    kind,
    requestedCapability: kind,
    profileState: 'draft' as const,
    moderationState: 'not_submitted' as const,
    verificationState: 'unverified' as const,
    discoverable: false,
    canReceiveRequests: false,
    revision: revision || null,
    draft,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

export const serviceProfileTestSupport = {
  operatorDeclarationKinds: OPERATOR_DECLARATION_KINDS,
  transporterDeclarationKinds: TRANSPORT_DECLARATION_KINDS,
  transporterVehicleCategories: TRANSPORT_VEHICLE_CATEGORIES,
};
