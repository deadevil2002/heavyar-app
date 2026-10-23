import { Platform } from 'react-native';

/**
 * Release-wide product capabilities. These are platform release decisions,
 * never reviewer-account or user-role exceptions.
 */
export function identityVerificationUiEnabledForPlatform(platform: string): boolean {
  return platform !== 'ios';
}

export const IDENTITY_VERIFICATION_UI_ENABLED =
  identityVerificationUiEnabledForPlatform(Platform.OS);

// Provider business/activity documents are not government identity checks.
// Keep this capability available on iOS while the separate identity flow is
// release-disabled there.
export function providerDocumentReviewUiEnabledForPlatform(platform: string): boolean {
  return platform === 'ios' || platform === 'android' || platform === 'web';
}

export const PROVIDER_DOCUMENT_REVIEW_UI_ENABLED =
  providerDocumentReviewUiEnabledForPlatform(Platform.OS);

export function shouldLoadIdentityVerification(
  capabilityEnabled: boolean,
  isAuthenticated: boolean,
  userId: string | null | undefined,
): boolean {
  return capabilityEnabled && isAuthenticated && Boolean(userId);
}

export function verificationDestinationForPlatform(platform: string): string {
  return identityVerificationUiEnabledForPlatform(platform)
    ? '/verification'
    : '/(tabs)/profile';
}

export function verificationDestination(): string {
  return verificationDestinationForPlatform(Platform.OS);
}
