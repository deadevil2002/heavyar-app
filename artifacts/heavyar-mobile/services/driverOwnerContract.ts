import type { GccCountryCode } from '../constants/gcc';
import { mockCategories } from '../mocks/categories';

export const DRIVER_AVAILABILITY_STATUSES = ['available', 'busy', 'offline'] as const;
export type DriverAvailabilityStatus = typeof DRIVER_AVAILABILITY_STATUSES[number];

export type DriverOwnerDraft = {
  displayName: string;
  countryCode: GccCountryCode;
  region: string;
  city: string;
  equipmentTypes: string[];
  yearsExperience: string;
  description: string;
  availabilityStatus: DriverAvailabilityStatus;
};

export type DriverOwnerSavePayload = {
  displayName: string;
  countryCode: GccCountryCode;
  region: string;
  city: string;
  equipmentTypes: string[];
  yearsExperience: number;
  description: string;
  availabilityStatus: DriverAvailabilityStatus;
};

const canonicalCategoryIds = new Set(mockCategories.map(category => category.id));

export function canonicalEquipmentTypes(values: readonly string[]): string[] {
  return [...new Set(values.filter(value => canonicalCategoryIds.has(value)))];
}

export function buildDriverOwnerSavePayload(draft: DriverOwnerDraft): DriverOwnerSavePayload {
  return {
    displayName: draft.displayName.trim(),
    countryCode: draft.countryCode,
    region: draft.region.trim(),
    city: draft.city.trim(),
    equipmentTypes: canonicalEquipmentTypes(draft.equipmentTypes),
    yearsExperience: Number(draft.yearsExperience),
    description: draft.description.trim(),
    availabilityStatus: DRIVER_AVAILABILITY_STATUSES.includes(draft.availabilityStatus)
      ? draft.availabilityStatus
      : 'offline',
  };
}

export function canEditDriverOwnerProfile(user: {
  role?: string;
  accountStatus?: string;
  suspensionStatus?: string | null;
  isActive?: boolean;
} | null | undefined): boolean {
  if (!user || user.role !== 'driver' || user.isActive === false) return false;
  if (['restricted', 'deletion_requested', 'suspended'].includes(String(user.accountStatus || ''))) return false;
  return !['temporarily_suspended', 'permanently_suspended', 'suspended'].includes(String(user.suspensionStatus || ''));
}