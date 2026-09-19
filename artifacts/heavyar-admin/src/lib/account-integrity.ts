export type MarketplaceRole = 'customer' | 'provider' | 'driver';
export type RegistrationState = 'incomplete' | 'complete' | 'unknown';

export type IncompleteRegistration = {
  id: string;
  email?: string;
  displayName?: string;
  role?: MarketplaceRole;
  registrationState: RegistrationState;
  missingFields: string[];
  accountStatus?: string;
  emailVerified?: boolean;
  phonePresent?: boolean;
  hasUserProfile: boolean;
  hasProviderProfile: boolean;
  hasDriverProfile: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type IncompleteRegistrationsResponse = {
  success: boolean;
  items: IncompleteRegistration[];
  nextCursor?: string;
  limit: number;
  maxLimit: number;
};

export const ACCOUNT_INTEGRITY_MAX_PAGE_SIZE = 20;
export const ACCOUNT_INTEGRITY_ENDPOINT = '/account-integrity';

const ROLE_LABELS: Record<MarketplaceRole, { ar: string; en: string }> = {
  customer: { ar: 'عميل', en: 'Customer' },
  provider: { ar: 'مقدم خدمة', en: 'Provider' },
  driver: { ar: 'سائق', en: 'Driver' },
};

export function marketplaceRoleLabel(role: string | undefined, language: 'ar' | 'en') {
  if (!role || !(role in ROLE_LABELS)) return language === 'ar' ? 'غير معروف' : 'Unknown';
  return ROLE_LABELS[role as MarketplaceRole][language];
}

export function normalizeIntegrityParams(params: { q?: string; state?: string; limit?: number; cursor?: string }) {
  const normalized: Record<string, string> = {
    limit: String(Math.min(Math.max(Math.floor(params.limit || ACCOUNT_INTEGRITY_MAX_PAGE_SIZE), 1), ACCOUNT_INTEGRITY_MAX_PAGE_SIZE)),
  };
  if (params.q?.trim()) normalized.q = params.q.trim();
  if (params.state && ['incomplete', 'complete', 'unknown'].includes(params.state)) normalized.registrationState = params.state;
  if (params.cursor) normalized.pageToken = params.cursor;
  return normalized;
}

export function safeMissingFields(fields: unknown) {
  if (!Array.isArray(fields)) return [];
  return fields.filter((field): field is string => typeof field === 'string' && field.length > 0 && field.length <= 80).slice(0, 20);
}