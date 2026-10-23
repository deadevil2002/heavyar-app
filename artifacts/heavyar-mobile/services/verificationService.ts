import { request } from './workerClient';

export type TrustStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired' | 'manual_review' | 'restricted';
export type VerificationProfile = {
  identity: { status: TrustStatus; provider: string; verifiedAt?: string | null; expiresAt?: string | null };
  business: { status: TrustStatus };
  bankAccount: { status: TrustStatus };
  manualReview: { status: TrustStatus };
  overallTrust: { status: TrustStatus };
  providerComponents?: Record<string, TrustStatus>;
  capabilities?: Record<string, boolean>;
  verificationBadges?: { scope: 'identity' | 'business' | 'professional' | 'activity_license' | 'operating_card'; labelAr: string; labelEn: string }[];
};
export type RegulatoryDocumentType = 'COMMERCIAL_REGISTRATION' | 'FREELANCE_CERTIFICATE' | 'ACTIVITY_LICENSE' | 'OPERATING_CARD' | 'OWNERSHIP_AUTHORIZATION';
export type RegulatoryDocumentSubmission = { documentType: RegulatoryDocumentType; documentNumber: string; issuingAuthority: string; activityScope?: string[]; equipmentIds?: string[]; issueDate?: string; expiryDate?: string; resubmissionOf?: string };
export type RegulatoryDocumentItem = {
  id: string;
  documentType: RegulatoryDocumentType;
  documentNumberMasked: string;
  issuingAuthority: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  reviewStatus: 'PENDING' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
  rejectionReason?: string | null;
  resubmissionReason?: string | null;
  submittedAt: string;
  updatedAt: string;
  hasPrivateFile: boolean;
  fileMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null;
  supersedesDocumentId?: string;
};
export type RegulatoryDocumentFile = { uri: string; name: string; mimeType: NonNullable<RegulatoryDocumentItem['fileMimeType']>; size: number };
export type VerificationAttempt = { attemptId: string; status: TrustStatus; provider: string; verificationType: string; createdAt?: string | null; expiresAt?: string | null; reviewRequired?: boolean };

const documentTypes: RegulatoryDocumentType[] = ['COMMERCIAL_REGISTRATION', 'FREELANCE_CERTIFICATE', 'ACTIVITY_LICENSE', 'OPERATING_CARD', 'OWNERSHIP_AUTHORIZATION'];
const reviewStatuses: RegulatoryDocumentItem['reviewStatus'][] = ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REVOKED'];
function decodeRegulatoryDocument(value: unknown): RegulatoryDocumentItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REGULATORY_DOCUMENT');
  const item = value as Record<string, unknown>;
  if ('documentNumber' in item || 'privateMedia' in item || 'ownerUid' in item || 'publicId' in item || 'assetId' in item ||
      typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) ||
      !documentTypes.includes(item.documentType as RegulatoryDocumentType) || !reviewStatuses.includes(item.reviewStatus as RegulatoryDocumentItem['reviewStatus']) ||
      typeof item.documentNumberMasked !== 'string' || item.documentNumberMasked.length > 8 || typeof item.issuingAuthority !== 'string' ||
      typeof item.submittedAt !== 'string' || typeof item.updatedAt !== 'string' || typeof item.hasPrivateFile !== 'boolean' ||
      !(item.fileMimeType === null || providerFileMimeTypes.includes(item.fileMimeType as RegulatoryDocumentFile['mimeType']))) {
    throw new Error('INVALID_REGULATORY_DOCUMENT');
  }
  return item as unknown as RegulatoryDocumentItem;
}

const providerFileMimeTypes: RegulatoryDocumentFile['mimeType'][] = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const getVerificationProfile = async () => (await request<{ profile: VerificationProfile }>('/api/verification/profile')).profile;
export const startVerification = async () => (await request<{ attempt: VerificationAttempt }>('/api/verification/attempts', { method: 'POST', body: JSON.stringify({}) })).attempt;
export const listRegulatoryDocuments = async (expectedUid?: string, signal?: AbortSignal) =>
  (await request<{ items: unknown[] }>('/api/regulatory-documents', { signal }, true, expectedUid)).items.map(decodeRegulatoryDocument);
export const submitRegulatoryDocument = async (document: RegulatoryDocumentSubmission, file: RegulatoryDocumentFile, expectedUid: string, signal?: AbortSignal) => {
  const form = new FormData();
  form.append('metadata', JSON.stringify(document));
  (form as any).append('file', { uri: file.uri, type: file.mimeType, name: file.name });
  return decodeRegulatoryDocument((await request<{ document: unknown }>('/api/regulatory-documents', { method: 'POST', body: form, signal }, true, expectedUid)).document);
};
