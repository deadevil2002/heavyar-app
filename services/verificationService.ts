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
};
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