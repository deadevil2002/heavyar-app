export const CURRENT_POLICY_VERSIONS = Object.freeze({
  termsVersion: '2026-10-04',
  privacyVersion: '2026-10-04',
  acceptableUseVersion: '2026-10-04',
  refundPolicyVersion: '2026-10-04',
  providerTermsVersion: '2026-10-04',
  driverTermsVersion: '2026-10-04',
});

export function registrationPolicyAcceptance(role: 'customer' | 'provider' | 'driver', metadata: { appVersion: string; platform: 'ios' | 'android' | 'web'; locale: 'ar' | 'en' }) {
  return {
    accepted: true,
    legalCapacityConfirmed: true,
    ...CURRENT_POLICY_VERSIONS,
    ...(role === 'provider' ? { businessAuthorityConfirmed: true } : {}),
    appVersion: metadata.appVersion,
    platform: metadata.platform,
    locale: metadata.locale,
  };
}
