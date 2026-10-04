export const CURRENT_POLICY_VERSIONS = Object.freeze({
  termsVersion: '2026-10-04',
  privacyVersion: '2026-10-04',
  acceptableUseVersion: '2026-10-04',
  refundPolicyVersion: '2026-10-04',
  providerTermsVersion: '2026-10-04',
  driverTermsVersion: '2026-10-04',
});

export type MarketplaceRole = 'customer' | 'provider' | 'driver';
export type PolicyAcceptanceState = 'current' | 'legacy_unversioned';
export const LEGACY_POLICY_ACCEPTANCE_COMPAT_ENABLED = true;
export const LEGACY_POLICY_ACCEPTANCE_MODE = 'legacy_unversioned' as const;
export const CURRENT_POLICY_ACCEPTANCE_MODE = 'current_versioned' as const;
export type PolicyAcceptanceInput = {
  termsVersion?: unknown;
  privacyVersion?: unknown;
  acceptableUseVersion?: unknown;
  refundPolicyVersion?: unknown;
  providerTermsVersion?: unknown;
  driverTermsVersion?: unknown;
  accepted?: unknown;
  legalCapacityConfirmed?: unknown;
  businessAuthorityConfirmed?: unknown;
  appVersion?: unknown;
  platform?: unknown;
  locale?: unknown;
};

const BASE_POLICY_KEYS = ['termsVersion', 'privacyVersion', 'acceptableUseVersion', 'refundPolicyVersion'] as const;

export function requiredPolicyVersions(role: MarketplaceRole) {
  return {
    ...Object.fromEntries(BASE_POLICY_KEYS.map(key => [key, CURRENT_POLICY_VERSIONS[key]])),
    ...(role === 'provider' ? { providerTermsVersion: CURRENT_POLICY_VERSIONS.providerTermsVersion } : {}),
    ...(role === 'driver' ? { driverTermsVersion: CURRENT_POLICY_VERSIONS.driverTermsVersion } : {}),
  };
}

export function validatePolicyAcceptance(input: PolicyAcceptanceInput | null | undefined, role: MarketplaceRole) {
  if (!input || input.accepted !== true || input.legalCapacityConfirmed !== true) return null;
  if (role === 'provider' && input.businessAuthorityConfirmed !== true) return null;
  const required = requiredPolicyVersions(role);
  if (Object.entries(required).some(([key, version]) => input[key as keyof PolicyAcceptanceInput] !== version)) return null;
  const platform = typeof input.platform === 'string' && ['ios', 'android', 'web'].includes(input.platform) ? input.platform : null;
  const locale = typeof input.locale === 'string' && /^(ar|en)(?:-[A-Za-z]{2})?$/.test(input.locale) ? input.locale : null;
  const appVersion = typeof input.appVersion === 'string' && /^[0-9A-Za-z._+-]{1,40}$/.test(input.appVersion) ? input.appVersion : null;
  if (!platform || !locale || !appVersion) return null;
  return { ...required, accepted: true, legalCapacityConfirmed: true, ...(role === 'provider' ? { businessAuthorityConfirmed: true } : {}), platform, locale, appVersion };
}

export function acceptanceIsCurrent(record: Record<string, unknown> | null | undefined, role: MarketplaceRole) {
  if (!record) return false;
  return record.legalCapacityConfirmed === true
    && (role !== 'provider' || record.businessAuthorityConfirmed === true)
    && Object.entries(requiredPolicyVersions(role)).every(([key, version]) => record[key] === version);
}

export function policyAcceptanceState(profile: Record<string, unknown> | null | undefined, role: MarketplaceRole): PolicyAcceptanceState {
  if (!profile) return LEGACY_POLICY_ACCEPTANCE_MODE;
  const versions = profile.currentPolicyVersions;
  if (profile.policyAcceptanceState === 'current'
    && profile.legalCapacityConfirmed === true
    && (role !== 'provider' || profile.businessAuthorityConfirmed === true)
    && versions && typeof versions === 'object' && !Array.isArray(versions)
    && Object.entries(requiredPolicyVersions(role)).every(([key, version]) => (versions as Record<string, unknown>)[key] === version)) {
    return 'current';
  }
  return LEGACY_POLICY_ACCEPTANCE_MODE;
}

export const PRIVACY_REQUEST_TYPES = ['access', 'correction', 'deletion', 'privacy_inquiry', 'objection_withdrawal'] as const;
export const PRIVACY_REQUEST_STATES = ['submitted', 'identity_verification', 'under_review', 'awaiting_user', 'completed', 'rejected', 'cancelled'] as const;
export const COMPLAINT_STATES = ['submitted', 'acknowledged', 'under_review', 'awaiting_customer', 'awaiting_provider', 'awaiting_driver', 'resolved', 'closed', 'escalated'] as const;
export const REFUND_CASE_STATES = ['requested', 'under_review', 'approved_pending_execution', 'rejected', 'manual_execution_required', 'executed', 'failed', 'cancelled'] as const;
export const INCIDENT_TYPES = ['equipment_damage', 'personal_injury', 'accident', 'theft_loss', 'traffic_operational_violation', 'breakdown', 'site_property_damage', 'other_safety_incident'] as const;
export const INCIDENT_STATES = ['reported', 'acknowledged', 'under_review', 'awaiting_evidence', 'referred_to_authority', 'resolved', 'closed'] as const;
export const MODERATION_REASONS = ['fraud', 'fake_account', 'impersonation', 'forged_documents', 'stolen_equipment', 'harassment_threats', 'malicious_links', 'spam', 'payment_abuse', 'review_manipulation', 'unsafe_illegal_listing', 'security_abuse'] as const;

const transitions = <T extends string>(map: Record<T, readonly T[]>) => (from: T, to: T) => from !== to && (map[from] || []).includes(to);

export const canTransitionPrivacyRequest = transitions<RecordPrivacyState>({
  submitted: ['identity_verification', 'under_review', 'cancelled'], identity_verification: ['under_review', 'awaiting_user', 'rejected', 'cancelled'],
  under_review: ['awaiting_user', 'completed', 'rejected'], awaiting_user: ['identity_verification', 'under_review', 'cancelled'], completed: [], rejected: [], cancelled: [],
});
type RecordPrivacyState = typeof PRIVACY_REQUEST_STATES[number];

export const canTransitionComplaint = transitions<RecordComplaintState>({
  submitted: ['acknowledged', 'under_review', 'escalated'], acknowledged: ['under_review', 'awaiting_customer', 'awaiting_provider', 'awaiting_driver', 'escalated'],
  under_review: ['awaiting_customer', 'awaiting_provider', 'awaiting_driver', 'resolved', 'escalated'], awaiting_customer: ['under_review', 'resolved', 'escalated'],
  awaiting_provider: ['under_review', 'resolved', 'escalated'], awaiting_driver: ['under_review', 'resolved', 'escalated'], resolved: ['closed', 'under_review', 'escalated'], closed: [], escalated: ['under_review', 'resolved'],
});
type RecordComplaintState = typeof COMPLAINT_STATES[number];

export const canTransitionRefundCase = transitions<RecordRefundState>({
  requested: ['under_review', 'cancelled'], under_review: ['approved_pending_execution', 'rejected', 'cancelled'],
  approved_pending_execution: ['manual_execution_required', 'rejected', 'cancelled'], manual_execution_required: ['executed', 'failed', 'cancelled'],
  failed: ['manual_execution_required', 'cancelled'], rejected: [], executed: [], cancelled: [],
});
type RecordRefundState = typeof REFUND_CASE_STATES[number];

export const canTransitionIncident = transitions<RecordIncidentState>({
  reported: ['acknowledged', 'under_review'], acknowledged: ['under_review', 'awaiting_evidence', 'referred_to_authority'],
  under_review: ['awaiting_evidence', 'referred_to_authority', 'resolved'], awaiting_evidence: ['under_review', 'referred_to_authority', 'resolved'],
  referred_to_authority: ['under_review', 'resolved'], resolved: ['closed', 'under_review'], closed: [],
});
type RecordIncidentState = typeof INCIDENT_STATES[number];

export function complaintServiceTargets(receivedAt: string) {
  const addBusinessDays = (value: string, days: number) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('INVALID_RECEIVED_AT');
    let remaining = days;
    while (remaining) { date.setUTCDate(date.getUTCDate() + 1); if (![0, 6].includes(date.getUTCDay())) remaining -= 1; }
    return date.toISOString();
  };
  return { acknowledgeTargetAt: addBusinessDays(receivedAt, 2), resolutionTargetAt: addBusinessDays(receivedAt, 10) };
}

export function normalizeModerationReason(value: unknown) {
  return typeof value === 'string' && (MODERATION_REASONS as readonly string[]).includes(value) ? value as typeof MODERATION_REASONS[number] : null;
}

export const REGULATORY_CATALOG_VERSION = '2026-10-04';
export type RegulatoryCatalogueEntry = { category: string; transactionType: string; classification: 'regulated' | 'unregulated' | 'unknown'; requiredProviderCapability: string | null; requiredDriverCapability: string | null; authority: string; sourceUrl: string; action: 'allow' | 'fail_closed' };
export const REGULATORY_CATALOGUE: readonly RegulatoryCatalogueEntry[] = Object.freeze([
  { category: 'trucks', transactionType: 'rental_without_driver', classification: 'regulated', requiredProviderCapability: 'CAN_RENT_TRUCK_WITHOUT_DRIVER', requiredDriverCapability: null, authority: 'Transport General Authority', sourceUrl: 'https://www.tga.gov.sa/', action: 'fail_closed' },
  ...['excavators', 'cranes', 'loaders', 'bulldozers', 'generators', 'compressors', 'concrete'].map(category => ({ category, transactionType: 'equipment_rental', classification: 'unregulated' as const, requiredProviderCapability: null, requiredDriverCapability: null, authority: 'Heavyar current-release catalogue decision', sourceUrl: 'https://mc.gov.sa/ar/ECC/pages/default.aspx', action: 'allow' as const })),
  { category: '*', transactionType: '*', classification: 'unknown', requiredProviderCapability: null, requiredDriverCapability: null, authority: 'Unverified category', sourceUrl: '', action: 'fail_closed' },
]);

export function regulatoryDecision(category: unknown, transactionType: unknown) {
  const exact = REGULATORY_CATALOGUE.find(entry => entry.category === String(category || '').toLowerCase() && entry.transactionType === String(transactionType || '').toLowerCase());
  return exact || REGULATORY_CATALOGUE[REGULATORY_CATALOGUE.length - 1];
}

export const DRIVER_CREDENTIAL_FRAMEWORK = Object.freeze({ version: '2026-10-04', enabled: false, capabilityGate: 'driver_credentials_v1', fields: ['credentialType', 'issuingAuthority', 'identifier', 'issueDate', 'expiryDate', 'status', 'reviewedAt', 'reviewerUid', 'evidenceReference'] });

export function safeUserExport(input: { user: Record<string, unknown>; requests?: Record<string, unknown>[]; complaints?: Record<string, unknown>[]; policyAcceptances?: Record<string, unknown>[] }) {
  const pick = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
  return {
    generatedAt: new Date().toISOString(),
    profile: pick(input.user, ['uid', 'nameAr', 'nameEn', 'email', 'phone', 'role', 'countryCode', 'region', 'city', 'customCity', 'createdAt', 'accountStatus']),
    requests: (input.requests || []).map(row => pick(row, ['id', 'publicRequestNumber', 'status', 'equipmentSnapshot', 'requestedStartAt', 'requestedEndAt', 'createdAt'])),
    complaints: (input.complaints || []).map(row => pick(row, ['id', 'status', 'category', 'createdAt', 'updatedAt', 'resolvedAt'])),
    policyAcceptances: (input.policyAcceptances || []).map(row => pick(row, ['id', 'acceptanceMode', 'policyVersionStatus', 'currentPolicyAcceptance', 'termsAccepted', 'legalCapacityStatus', 'businessAuthorityStatus', 'termsVersion', 'privacyVersion', 'acceptableUseVersion', 'refundPolicyVersion', 'providerTermsVersion', 'driverTermsVersion', 'acceptedAt', 'source', 'appVersion', 'platform', 'locale'])),
  };
}

export function temporaryRecordExpired(record: Record<string, unknown>, now = Date.now()) {
  const expiresAt = typeof record.expiresAt === 'string' ? Date.parse(record.expiresAt) : NaN;
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function refundMayBeMarkedExecuted(record: Record<string, unknown>) {
  return record.state === 'manual_execution_required' && typeof record.providerEvidenceReference === 'string' && record.providerEvidenceReference.trim().length >= 8 && typeof record.executedAt === 'string';
}
