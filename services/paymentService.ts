import { getFirebaseAuth } from './firebaseConfig';
import { WORKER_BASE_URL } from '@/constants/worker';

export interface CreatePaymentParams {
  amount: number;
  currency?: string;
  requestId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
}

export interface CreatePaymentResponse {
  success: boolean;
  chargeId?: string;
  status?: string;
  paymentUrl?: string;
  transactionUrl?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  chargeId?: string;
  status?: string;
  isPaid?: boolean;
  amount?: number;
  currency?: string;
  requestId?: string;
  receiptId?: string;
  error?: string;
}

export async function createPayment(params: CreatePaymentParams): Promise<CreatePaymentResponse> {
  console.log('[PaymentService] Creating payment for request:', params.requestId, 'amount:', params.amount);
  try {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) return { success: false, error: 'Please sign in before paying' };
    const response = await fetch(`${WORKER_BASE_URL}/api/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        requestId: params.requestId,
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        customerPhone: params.customerPhone,
        description: params.description,
      }),
    });

    const result = await response.json() as CreatePaymentResponse;
    console.log('[PaymentService] Create payment result:', result.success, result.chargeId);
    return result;
  } catch (error) {
    console.error('[PaymentService] Create payment error:', error);
    return { success: false, error: 'Network error creating payment' };
  }
}

export async function verifyPayment(chargeId: string): Promise<VerifyPaymentResponse> {
  console.log('[PaymentService] Verifying payment:', chargeId);
  try {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) return { success: false, error: 'Please sign in before verifying payment' };
    const response = await fetch(`${WORKER_BASE_URL}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ chargeId }),
    });

    const result = await response.json() as VerifyPaymentResponse;
    console.log('[PaymentService] Verify result:', result.success, result.isPaid);
    return result;
  } catch (error) {
    console.error('[PaymentService] Verify payment error:', error);
    return { success: false, error: 'Network error verifying payment' };
  }
}
