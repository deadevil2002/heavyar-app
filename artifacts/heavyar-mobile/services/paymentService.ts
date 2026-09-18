import { getFirebaseAuth } from './firebaseConfig';
import { WORKER_BASE_URL } from '@/constants/worker';
import { createAccountDeletionRequest } from './accountDeletionContract';
import type { CommercialSnapshot } from '@/types';

export { createAccountDeletionRequest } from './accountDeletionContract';

export interface CreatePaymentParams {
  requestId: string;
  purpose: 'equipment_request';
}

export type PaymentLifecycleStatus =
  | 'pending'
  | 'requires_action'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface PaymentQuote {
  amount: number;
  currency: string;
  subtotal?: number;
  platformFee?: number;
  platformFeeRate?: number;
  vatRate?: number;
  policyVersion?: string;
  tax?: number;
  total?: number;
  expiresAt?: string;
  commercialSnapshot?: CommercialSnapshot;
}

export interface CreatePaymentResponse {
  success: boolean;
  paymentId?: string;
  status?: PaymentLifecycleStatus | string;
  checkoutUrl?: string;
  quote?: PaymentQuote;
  canonicalStatus?: PaymentLifecycleStatus | string;
  paymentState?: PaymentLifecycleStatus | string;
  error?: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  paymentId?: string;
  status?: PaymentLifecycleStatus | string;
  quote?: PaymentQuote;
  canonicalStatus?: PaymentLifecycleStatus | string;
  paymentState?: PaymentLifecycleStatus | string;
  requestId?: string;
  receiptId?: string;
  error?: string;
}

export async function createPayment(params: CreatePaymentParams): Promise<CreatePaymentResponse> {
  try {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) return { success: false, error: 'Please sign in before paying' };
    const response = await fetch(`${WORKER_BASE_URL}/api/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId: params.requestId, purpose: params.purpose }),
    });

    const result = await response.json() as CreatePaymentResponse;
    result.status = result.canonicalStatus ?? result.paymentState ?? result.status;
    return result;
  } catch {
    return { success: false, error: 'Network error creating payment' };
  }
}

export async function verifyPayment(paymentId: string): Promise<VerifyPaymentResponse> {
  try {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) return { success: false, error: 'Please sign in before verifying payment' };
    const response = await fetch(`${WORKER_BASE_URL}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paymentId }),
    });

    const result = await response.json() as VerifyPaymentResponse;
    result.status = result.canonicalStatus ?? result.paymentState ?? result.status;
    return result;
  } catch {
    return { success: false, error: 'Network error verifying payment' };
  }
}

export async function requestAccountDeletion(): Promise<void> {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`${WORKER_BASE_URL}/api/account/deletion-request`, {
    ...createAccountDeletionRequest(token),
  });
  if (!response.ok) throw new Error('DELETION_REQUEST_FAILED');
}
