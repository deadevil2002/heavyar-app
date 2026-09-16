import { getFirebaseAuth } from './firebaseConfig';
import { WORKER_BASE_URL } from '@/constants/worker';

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
  console.log('[PaymentService] Creating payment for request:', params.requestId);
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
    console.log('[PaymentService] Create payment result:', result.success, result.status);
    return result;
  } catch (error) {
    console.error('[PaymentService] Create payment error:', error);
    return { success: false, error: 'Network error creating payment' };
  }
}

export async function verifyPayment(paymentId: string): Promise<VerifyPaymentResponse> {
  console.log('[PaymentService] Verifying payment:', paymentId);
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
    console.log('[PaymentService] Verify result:', result.success, result.status);
    return result;
  } catch (error) {
    console.error('[PaymentService] Verify payment error:', error);
    return { success: false, error: 'Network error verifying payment' };
  }
}
