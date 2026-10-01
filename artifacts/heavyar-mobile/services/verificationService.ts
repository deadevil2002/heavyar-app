import { getFirebaseAuth } from './firebaseConfig';
import { WORKER_BASE_URL } from '@/constants/worker';

export type TrustStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired' | 'manual_review' | 'restricted';
export type VerificationProfile = {
  identity: { status: TrustStatus; provider: string; verifiedAt?: string | null; expiresAt?: string | null };
  business: { status: TrustStatus };
  bankAccount: { status: TrustStatus };
  manualReview: { status: TrustStatus };
  overallTrust: { status: TrustStatus };
  providerComponents?: Record<string, TrustStatus>;
  capabilities?: Record<string, boolean>;
  verificationBadges?: Array<{ scope: 'identity' | 'business' | 'activity_license' | 'operating_card'; labelAr: string; labelEn: string }>;
};
export type RegulatoryDocumentSubmission = { documentType: 'COMMERCIAL_REGISTRATION' | 'ACTIVITY_LICENSE' | 'OPERATING_CARD' | 'OWNERSHIP_AUTHORIZATION'; documentNumber: string; issuingAuthority: string; activityScope?: string[]; equipmentIds?: string[]; issueDate?: string; expiryDate?: string };
export type VerificationAttempt = { attemptId: string; status: TrustStatus; provider: string; verificationType: string; createdAt?: string | null; expiresAt?: string | null; reviewRequired?: boolean };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`${WORKER_BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) throw new Error(body.error || 'VERIFICATION_UNAVAILABLE');
  return body as T;
}

export const getVerificationProfile = async () => (await request<{ profile: VerificationProfile }>('/api/verification/profile')).profile;
export const startVerification = async () => (await request<{ attempt: VerificationAttempt }>('/api/verification/attempts', { method: 'POST', body: JSON.stringify({}) })).attempt;
export const listRegulatoryDocuments = async () => (await request<{ items: Array<Record<string, unknown>> }>('/api/regulatory-documents')).items;
export const submitRegulatoryDocument = async (document: RegulatoryDocumentSubmission) => (await request<{ document: Record<string, unknown> }>('/api/regulatory-documents', { method: 'POST', body: JSON.stringify(document) })).document;
