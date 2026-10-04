import { request } from './workerClient';
import { createAccountDeletionPayload } from './accountDeletionContract';
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
    const result = await request<CreatePaymentResponse>('/api/create-payment', {
      method: 'POST',
      body: JSON.stringify({ requestId: params.requestId, purpose: params.purpose }),
    });
    result.status = result.canonicalStatus ?? result.paymentState ?? result.status;
    return result;
  } catch {
    return { success: false, error: 'Network error creating payment' };
  }
}

export async function verifyPayment(paymentId: string): Promise<VerifyPaymentResponse> {
  try {
    const result = await request<VerifyPaymentResponse>('/api/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ paymentId }),
    });
    result.status = result.canonicalStatus ?? result.paymentState ?? result.status;
    return result;
  } catch {
    return { success: false, error: 'Network error verifying payment' };
  }
}

export async function requestAccountDeletion(): Promise<void> {
  await request('/api/account/deletion-request', {
    method: 'POST',
    body: JSON.stringify(createAccountDeletionPayload()),
  });
}
