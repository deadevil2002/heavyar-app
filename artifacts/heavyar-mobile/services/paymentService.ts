import { request } from './workerClient';
import { createAccountDeletionPayload } from './accountDeletionContract';
import type { CheckoutGateway } from './workerClient';
import type { CommercialSnapshot, EquipmentRequest } from '@/types';

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

export interface PaymentRequestScope {
  signal?: AbortSignal;
  expectedUid?: string;
}

export interface EquipmentPreServicePaymentPlan {
  version: 1;
  kind: 'equipment_rental';
  sourceId: string;
  sourceRevision: number;
  quoteReference: string;
  currency: string;
  customerPayableMinor: number;
  paymentState: 'not_started';
  executionAuthorized: false;
  settlementEnabled: false;
  productionEnabled: false;
  activation: { enabled: false; reason?: string };
}

export interface PrepareEquipmentPreServicePaymentResponse {
  success: true;
  plan: EquipmentPreServicePaymentPlan;
}

export interface CreateEquipmentPreServicePaymentResponse extends CreatePaymentResponse {
  plan?: EquipmentPreServicePaymentPlan;
}

export function isAcceptedFixedDurationRental(
  rental: Pick<EquipmentRequest, 'pricingModelVersion' | 'status' | 'rentalMode' | 'requestedStartAt' | 'requestedEndAt' | 'customerUid'>,
  expectedUid: string,
): boolean {
  const start = Date.parse(String(rental.requestedStartAt || ''));
  const end = Date.parse(String(rental.requestedEndAt || ''));
  return rental.customerUid === expectedUid && rental.pricingModelVersion === 2 && rental.status === 'accepted' &&
    rental.rentalMode !== 'open_ended' && Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export function isEquipmentPreServiceTestReady(
  result: PrepareEquipmentPreServicePaymentResponse,
  gateways: CheckoutGateway[],
  expectedRequestId: string,
): boolean {
  const plan = result?.plan;
  const testTap = gateways.some(gateway => gateway.provider === 'tap' &&
    gateway.environment.toUpperCase() === 'TEST' && gateway.supportsSplit === true);
  // A successful prepare response is the server-authoritative eligibility and
  // destination check. Production activation must remain disabled for this
  // TEST-only client path.
  return result?.success === true && testTap && plan?.version === 1 &&
    plan.kind === 'equipment_rental' && plan.sourceId === expectedRequestId &&
    Number.isSafeInteger(plan.sourceRevision) && plan.sourceRevision >= 0 &&
    typeof plan.quoteReference === 'string' && plan.quoteReference.length > 0 &&
    plan.currency === 'SAR' && Number.isSafeInteger(plan.customerPayableMinor) &&
    plan.customerPayableMinor > 0 && plan.paymentState === 'not_started' &&
    plan.executionAuthorized === false && plan.settlementEnabled === false &&
    plan.productionEnabled === false && plan.activation?.enabled === false;
}

export function safeTapCheckoutUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'tap.company' || url.hostname.endsWith('.tap.company'))
      ? url.toString()
      : '';
  } catch {
    return '';
  }
}

export function preServicePaymentUnavailableCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'PRE_SERVICE_PAYMENT_UNAVAILABLE';
  const value = error as { code?: unknown; errorCode?: unknown };
  return String(value.code || value.errorCode || 'PRE_SERVICE_PAYMENT_UNAVAILABLE');
}

export async function prepareEquipmentPreServicePayment(
  requestId: string,
  scope: PaymentRequestScope = {},
): Promise<PrepareEquipmentPreServicePaymentResponse> {
  return request<PrepareEquipmentPreServicePaymentResponse>('/api/payments/pre-service/prepare', {
    method: 'POST',
    body: JSON.stringify({ kind: 'equipment_rental', sourceId: requestId }),
    signal: scope.signal,
  }, true, scope.expectedUid);
}

export async function createEquipmentPreServicePayment(
  requestId: string,
  scope: PaymentRequestScope = {},
): Promise<CreateEquipmentPreServicePaymentResponse> {
  const result = await request<CreateEquipmentPreServicePaymentResponse>('/api/payments/pre-service/create', {
    method: 'POST',
    body: JSON.stringify({ kind: 'equipment_rental', sourceId: requestId }),
    signal: scope.signal,
  }, true, scope.expectedUid);
  result.status = result.canonicalStatus ?? result.paymentState ?? result.status;
  return result;
}

export async function verifyEquipmentPreServicePayment(
  paymentId: string,
  scope: PaymentRequestScope = {},
): Promise<VerifyPaymentResponse> {
  const result = await request<VerifyPaymentResponse>('/api/verify-payment', {
    method: 'POST',
    body: JSON.stringify({ paymentId }),
    signal: scope.signal,
  }, true, scope.expectedUid);
  result.status = result.canonicalStatus ?? result.paymentState ?? result.status;
  return result;
}

export async function createPayment(
  params: CreatePaymentParams,
  scope: PaymentRequestScope = {},
): Promise<CreatePaymentResponse> {
  try {
    const result = await request<CreatePaymentResponse>('/api/create-payment', {
      method: 'POST',
      body: JSON.stringify({ requestId: params.requestId, purpose: params.purpose }),
      signal: scope.signal,
    }, true, scope.expectedUid);
    result.status = result.canonicalStatus ?? result.paymentState ?? result.status;
    return result;
  } catch {
    return { success: false, error: 'Network error creating payment' };
  }
}

export async function verifyPayment(
  paymentId: string,
  scope: PaymentRequestScope = {},
): Promise<VerifyPaymentResponse> {
  try {
    const result = await request<VerifyPaymentResponse>('/api/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ paymentId }),
      signal: scope.signal,
    }, true, scope.expectedUid);
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
