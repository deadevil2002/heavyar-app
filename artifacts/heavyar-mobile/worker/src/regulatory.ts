export const regulatoryDocumentTypes = [
  'COMMERCIAL_REGISTRATION',
  'ACTIVITY_LICENSE',
  'OPERATING_CARD',
  'OWNERSHIP_AUTHORIZATION',
] as const;
export type RegulatoryDocumentType = typeof regulatoryDocumentTypes[number];

export const regulatoryReviewStatuses = [
  'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REVOKED',
] as const;
export type RegulatoryReviewStatus = typeof regulatoryReviewStatuses[number];

export const capabilityNames = [
  'CAN_LIST_EQUIPMENT',
  'CAN_RECEIVE_REQUESTS',
  'CAN_OFFER_TRANSPORT_SERVICE',
  'CAN_RENT_TRUCK_WITHOUT_DRIVER',
  'CAN_OPERATE_EQUIPMENT',
  'CAN_ACCEPT_REGULATED_RENTAL',
  'CAN_RECEIVE_PAYOUT',
] as const;
export type CapabilityName = typeof capabilityNames[number];

export type RegulatoryDocument = {
  id: string;
  ownerUid: string;
  documentType: RegulatoryDocumentType;
  documentNumber: string;
  issuingAuthority: string;
  activityScope?: string[];
  equipmentIds?: string[];
  issueDate?: string | null;
  expiryDate?: string | null;
  submittedAt: string;
  reviewStatus: RegulatoryReviewStatus;
  verificationMethod?: 'HEAVYAR_MANUAL' | 'OFFICIAL_PROVIDER';
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
  updatedAt: string;
};

export type CapabilityDecision = {
  capabilities: Record<CapabilityName, boolean>;
  reasons: Partial<Record<CapabilityName, string[]>>;
  badges: Array<{ scope: 'identity' | 'business' | 'activity_license' | 'operating_card'; labelAr: string; labelEn: string }>;
};

const badgeCopy = {
  identity: { scope: 'identity', labelAr: 'هوية موثقة', labelEn: 'Identity Verified' },
  business: { scope: 'business', labelAr: 'منشأة موثقة', labelEn: 'Verified Business' },
  activity_license: { scope: 'activity_license', labelAr: 'ترخيص نشاط موثق', labelEn: 'Activity Licence Verified' },
  operating_card: { scope: 'operating_card', labelAr: 'بطاقة تشغيل موثقة', labelEn: 'Operating Card Verified' },
} as const;

export function effectiveDocumentStatus(document: Pick<RegulatoryDocument, 'reviewStatus' | 'expiryDate'>, now = new Date()): RegulatoryReviewStatus {
  if (document.reviewStatus === 'VERIFIED' && document.expiryDate && Date.parse(document.expiryDate) <= now.getTime()) return 'EXPIRED';
  return document.reviewStatus;
}

export function isVerifiedDocument(
  document: RegulatoryDocument,
  type: RegulatoryDocumentType,
  now: Date,
  scope?: string,
  equipmentId?: string,
) {
  if (document.documentType !== type || effectiveDocumentStatus(document, now) !== 'VERIFIED') return false;
  if (scope && document.activityScope?.length && !document.activityScope.includes(scope)) return false;
  if (equipmentId && document.equipmentIds?.length && !document.equipmentIds.includes(equipmentId)) return false;
  return true;
}

export function isSaudiTruckRentalWithoutDriver(input: { countryCode?: string; categoryId?: string; transactionType?: string; includesDriver?: boolean }) {
  return String(input.countryCode || '').toUpperCase() === 'SA' &&
    String(input.categoryId || '').toLowerCase() === 'trucks' &&
    input.transactionType === 'rental' && input.includesDriver !== true;
}

export function evaluateCapabilities(input: {
  uid: string;
  canonicalRole?: string;
  accountType?: 'individual' | 'business';
  suspended?: boolean;
  identityVerified?: boolean;
  documents?: RegulatoryDocument[];
  countryCode?: string;
  categoryId?: string;
  transactionType?: string;
  includesDriver?: boolean;
  equipmentId?: string;
  now?: Date;
}): CapabilityDecision {
  const now = input.now || new Date();
  const documents = input.documents || [];
  const has = (type: RegulatoryDocumentType, scope?: string) => documents.some(document =>
    document.ownerUid === input.uid && isVerifiedDocument(document, type, now, scope, input.equipmentId));
  const blocked = input.suspended === true;
  const provider = ['provider', 'business', 'owner'].includes(String(input.canonicalRole || ''));
  const business = input.accountType === 'business' && has('COMMERCIAL_REGISTRATION');
  const ownership = has('OWNERSHIP_AUTHORIZATION');
  const activity = has('ACTIVITY_LICENSE', 'truck_rental_without_driver');
  const operatingCard = has('OPERATING_CARD');
  const regulatedTruckRental = isSaudiTruckRentalWithoutDriver(input);
  const capabilities = Object.fromEntries(capabilityNames.map(name => [name, false])) as Record<CapabilityName, boolean>;
  capabilities.CAN_LIST_EQUIPMENT = !blocked && provider && (input.accountType === 'individual' || business) && (ownership || input.accountType === 'individual');
  capabilities.CAN_RECEIVE_REQUESTS = capabilities.CAN_LIST_EQUIPMENT;
  capabilities.CAN_OFFER_TRANSPORT_SERVICE = !blocked && provider && business && activity && operatingCard;
  capabilities.CAN_RENT_TRUCK_WITHOUT_DRIVER = !blocked && provider && business && activity && operatingCard && ownership;
  capabilities.CAN_OPERATE_EQUIPMENT = !blocked && ['driver', 'operator'].includes(String(input.canonicalRole || '')) && input.identityVerified === true;
  capabilities.CAN_ACCEPT_REGULATED_RENTAL = !regulatedTruckRental || capabilities.CAN_RENT_TRUCK_WITHOUT_DRIVER;
  capabilities.CAN_RECEIVE_PAYOUT = !blocked && provider && business;
  const reasons: CapabilityDecision['reasons'] = {};
  if (regulatedTruckRental && !capabilities.CAN_ACCEPT_REGULATED_RENTAL) {
    reasons.CAN_ACCEPT_REGULATED_RENTAL = [
      ...(!business ? ['VERIFIED_BUSINESS_REQUIRED'] : []),
      ...(!activity ? ['VALID_ACTIVITY_LICENSE_REQUIRED'] : []),
      ...(!operatingCard ? ['VALID_OPERATING_CARD_REQUIRED'] : []),
      ...(!ownership ? ['OWNERSHIP_AUTHORIZATION_REQUIRED'] : []),
      ...(blocked ? ['ACCOUNT_SUSPENDED'] : []),
    ];
  }
  const badges: CapabilityDecision['badges'] = [];
  if (input.identityVerified) badges.push(badgeCopy.identity);
  if (business) badges.push(badgeCopy.business);
  if (activity) badges.push(badgeCopy.activity_license);
  if (operatingCard) badges.push(badgeCopy.operating_card);
  return { capabilities, reasons, badges };
}

export function validateRegulatoryDocumentSubmission(input: unknown): Omit<RegulatoryDocument, 'id' | 'ownerUid' | 'submittedAt' | 'reviewStatus' | 'updatedAt'> | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  if (!regulatoryDocumentTypes.includes(value.documentType as RegulatoryDocumentType) ||
      typeof value.documentNumber !== 'string' || !value.documentNumber.trim() || value.documentNumber.length > 100 ||
      typeof value.issuingAuthority !== 'string' || !value.issuingAuthority.trim() || value.issuingAuthority.length > 160) return null;
  const date = (candidate: unknown) => candidate == null || (typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate) && Number.isFinite(Date.parse(`${candidate}T00:00:00Z`)));
  if (!date(value.issueDate) || !date(value.expiryDate)) return null;
  const strings = (candidate: unknown, max: number) => candidate === undefined || (Array.isArray(candidate) && candidate.length <= max && candidate.every(item => typeof item === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(item)));
  if (!strings(value.activityScope, 20) || !strings(value.equipmentIds, 50)) return null;
  return {
    documentType: value.documentType as RegulatoryDocumentType,
    documentNumber: value.documentNumber.trim(),
    issuingAuthority: value.issuingAuthority.trim(),
    activityScope: Array.isArray(value.activityScope) ? [...new Set(value.activityScope as string[])] : [],
    equipmentIds: Array.isArray(value.equipmentIds) ? [...new Set(value.equipmentIds as string[])] : [],
    issueDate: typeof value.issueDate === 'string' ? value.issueDate : null,
    expiryDate: typeof value.expiryDate === 'string' ? value.expiryDate : null,
  };
}
