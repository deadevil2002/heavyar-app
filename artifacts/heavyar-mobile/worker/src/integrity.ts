export type CanonicalRole = 'customer' | 'provider' | 'driver';
export type CompletenessResult = {
  state: 'authenticated_complete' | 'provisioning_incomplete';
  role: CanonicalRole | null; missingFields: string[];
  profilePresent: boolean; roleProfilePresent: boolean;
};
export const STORE_REVIEW_PURPOSE = 'store_review' as const;
export const SECURITY_SUSPENSION_STATUSES = new Set(['temporarily_suspended', 'permanently_suspended', 'suspended']);

export function isSecuritySuspended(account: any): boolean {
  return SECURITY_SUSPENSION_STATUSES.has(String(account?.suspensionStatus || ''));
}

export function isOperationallyBlocked(account: any): boolean {
  return isSecuritySuspended(account)
    || account?.accountStatus === 'restricted'
    || account?.accountStatus === 'deletion_requested';
}

export function isStoreReviewAccount(value: Record<string, any> | null | undefined): boolean {
  return value?.accountPurpose === STORE_REVIEW_PURPOSE;
}
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
export function evaluateCanonicalCompleteness(auth: { uid?: string; email?: string } | null, profile: Record<string, any> | null, roleProfile: Record<string, any> | null = null): CompletenessResult {
  const role = ['customer', 'provider', 'driver'].includes(String(profile?.role)) ? profile!.role as CanonicalRole : null;
  const missingFields: string[] = [];
  if (!auth?.uid) missingFields.push('auth_identity');
  if (!profile) missingFields.push('user_profile');
  if (!role) missingFields.push('canonical_role');
  if (!text(profile?.email || auth?.email)) missingFields.push('email');
  if (!text(profile?.nameEn) && !text(profile?.nameAr)) missingFields.push('name');
  if (!text(profile?.countryCode)) missingFields.push('country');
  if (!text(profile?.region)) missingFields.push('region');
  if (!text(profile?.city) && !text(profile?.customCity)) missingFields.push('city');
  if (role === 'provider') {
    if (!text(profile?.providerType)) missingFields.push('provider_type');
    if (!(profile?.providerOnboardingCompleted === true || profile?.providerOnboardingComplete === true || profile?.onboardingCompleted === true || profile?.onboardingStatus === 'completed')) missingFields.push('provider_onboarding');
  }
  if (role === 'driver' && !roleProfile) missingFields.push('driver_profile');
  return { state: missingFields.length ? 'provisioning_incomplete' : 'authenticated_complete', role, missingFields, profilePresent: !!profile, roleProfilePresent: !!roleProfile };
}