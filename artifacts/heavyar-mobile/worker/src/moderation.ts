export const LISTING_VISIBILITIES = ['visible', 'hidden', 'archived'] as const;
export const LISTING_MODERATION_STATUSES = ['pending_review', 'approved', 'rejected', 'suspended'] as const;

export type ListingVisibility = (typeof LISTING_VISIBILITIES)[number];
export type ListingModerationStatus = (typeof LISTING_MODERATION_STATUSES)[number];

export function isListingVisibility(value: unknown): value is ListingVisibility {
  return typeof value === 'string' && (LISTING_VISIBILITIES as readonly string[]).includes(value);
}

export function isListingModerationStatus(value: unknown): value is ListingModerationStatus {
  return typeof value === 'string' && (LISTING_MODERATION_STATUSES as readonly string[]).includes(value);
}

/** Legacy listings without an explicit moderation result fail closed. */
export function isPublicRentableListing(listing: Record<string, unknown>): boolean {
  return listing.isActive === true
    && listing.visibility === 'visible'
    && listing.moderationStatus === 'approved';
}

export const SENSITIVE_LISTING_FIELDS = [
  'title', 'titleAr', 'titleEn', 'images', 'pricePerDay', 'dailyPrice',
  'category', 'customCategory', 'region', 'city', 'customCity', 'district', 'location',
] as const;

export function requiresListingRereview(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): boolean {
  return current.moderationStatus === 'approved'
    && SENSITIVE_LISTING_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(patch, field));
}

export function listingVisibilityForOwnerActive(isActive: boolean): ListingVisibility {
  return isActive ? 'visible' : 'hidden';
}

export function canModerateListing(
  next: ListingModerationStatus,
  reason: unknown,
): boolean {
  return next !== 'rejected' || (typeof reason === 'string' && reason.trim().length > 0);
}

/** Compatibility gate for profiles created before explicit onboarding flags. */
export function legacyProviderReady(profile: Record<string, unknown> | null | undefined): boolean {
  return profile?.role === 'provider'
    && profile.termsAccepted === true
    && (String(profile.nameAr || '').trim().length >= 2 || String(profile.nameEn || '').trim().length >= 2)
    && String(profile.countryCode || '').trim().length > 0
    && String(profile.region || '').trim().length > 0
    && (String(profile.city || '').trim().length > 0 || String(profile.customCity || '').trim().length > 0);
}