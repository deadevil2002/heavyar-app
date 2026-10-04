const PUBLIC_WEB_BASE = process.env.EXPO_PUBLIC_PUBLIC_WEB_BASE || 'https://heavyar.com';

export const PUBLIC_LINKS = {
  privacy: `${PUBLIC_WEB_BASE}/privacy`,
  terms: `${PUBLIC_WEB_BASE}/terms`,
  support: `${PUBLIC_WEB_BASE}/support`,
  accountDeletion: `${PUBLIC_WEB_BASE}/account-deletion`,
  refundPolicy: `${PUBLIC_WEB_BASE}/refund-policy`,
  disputes: `${PUBLIC_WEB_BASE}/disputes`,
  providerTerms: `${PUBLIC_WEB_BASE}/provider-terms`,
  driverTerms: `${PUBLIC_WEB_BASE}/driver-terms`,
  verification: `${PUBLIC_WEB_BASE}/verification`,
  restrictedActivities: `${PUBLIC_WEB_BASE}/restricted-activities`,
} as const;
