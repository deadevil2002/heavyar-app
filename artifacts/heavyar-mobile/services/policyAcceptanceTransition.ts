import { PUBLIC_LINKS } from '@/constants/publicLinks';

export type PolicyConfirmationKey =
  | 'terms'
  | 'privacy'
  | 'acceptableUse'
  | 'refundPolicy'
  | 'providerTerms'
  | 'driverTerms'
  | 'legalCapacity'
  | 'businessAuthority';

export type PolicyRole = 'customer' | 'provider' | 'driver';

const BASE_CONFIRMATIONS: readonly PolicyConfirmationKey[] = [
  'terms', 'privacy', 'acceptableUse', 'refundPolicy', 'legalCapacity',
];

export function requiredPolicyConfirmations(role: PolicyRole): readonly PolicyConfirmationKey[] {
  return [
    ...BASE_CONFIRMATIONS,
    ...(role === 'provider' ? ['providerTerms', 'businessAuthority'] as const : []),
    ...(role === 'driver' ? ['driverTerms'] as const : []),
  ];
}

export function policyConfirmationComplete(role: PolicyRole, confirmations: Partial<Record<PolicyConfirmationKey, boolean>>) {
  return requiredPolicyConfirmations(role).every(key => confirmations[key] === true);
}

export const POLICY_LINKS: Partial<Record<PolicyConfirmationKey, string>> = {
  terms: PUBLIC_LINKS.terms,
  privacy: PUBLIC_LINKS.privacy,
  acceptableUse: PUBLIC_LINKS.restrictedActivities,
  refundPolicy: PUBLIC_LINKS.refundPolicy,
  providerTerms: PUBLIC_LINKS.providerTerms,
  driverTerms: PUBLIC_LINKS.driverTerms,
};

export function localizedPolicyLink(key: PolicyConfirmationKey, language: 'ar' | 'en') {
  const link = POLICY_LINKS[key];
  if (!link || language === 'ar') return link;
  const url = new URL(link);
  url.pathname = `/en${url.pathname}`;
  return url.toString();
}
