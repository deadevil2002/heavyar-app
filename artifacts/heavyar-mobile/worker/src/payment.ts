import { minorToMajor, type CommercialSnapshot } from './commercial';

export const PAYMENT_STATES = [
  'created', 'pending', 'requires_action', 'processing', 'paid', 'failed',
  'cancelled', 'expired', 'refund_pending', 'refunded', 'partially_refunded',
] as const;
export type PaymentState = typeof PAYMENT_STATES[number];

export type PaymentQuote = {
  amount: number; total: number; subtotal: number; platformFee: number;
  providerAmount: number; vatAmount: number; tax: number; currency: string;
  platformFeeRate: number; vatRate: number; policyVersion: string;
  quoteId: string; expiresAt: string;
  commercialSnapshot?: CommercialSnapshot;
};
export type ProviderPayment = {
  id: string; status: string; amount: number; currency: string;
  checkoutUrl?: string; metadata?: Record<string, string>;
};
export type TapCustomer = {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: { country_code: string; number: string };
};
export interface PaymentProvider {
  readonly name: string;
  create(input: { amount: number; currency: string; metadata: Record<string, string>; idempotencyKey: string; requestId: string; customerUid: string; customer: TapCustomer }): Promise<ProviderPayment>;
  retrieve(providerReference: string): Promise<ProviderPayment>;
}
export type TapEnvironment = 'TEST' | 'LIVE';
export type TapRuntimeEnv = {
  TAP_SECRET_KEY_TEST?: string;
  TAP_SECRET_KEY_LIVE?: string;
  TAP_MERCHANT_ID?: string;
};
export type PaymentProviderConfig = { enabled: boolean; environment: TapEnvironment; priority: number; methods: string[]; marketplace: boolean; health: 'unknown' | 'healthy' | 'unhealthy' };
export type PaymentPricingConfig = { platformFeeRate: number; vatRate: number };
export function normalizeTapEnvironment(value: unknown): TapEnvironment {
  return typeof value === 'string' && value.toUpperCase() === 'LIVE' ? 'LIVE' : 'TEST';
}
export function tapEnvironmentStatus(env: TapRuntimeEnv, environment: TapEnvironment) {
  const merchantConfigured = typeof env.TAP_MERCHANT_ID === 'string' && env.TAP_MERCHANT_ID.trim().length > 0;
  const testConfigured = typeof env.TAP_SECRET_KEY_TEST === 'string' && env.TAP_SECRET_KEY_TEST.length > 0;
  const liveConfigured = typeof env.TAP_SECRET_KEY_LIVE === 'string' && env.TAP_SECRET_KEY_LIVE.length > 0;
  return {
    environment,
    configured: merchantConfigured && (environment === 'LIVE' ? liveConfigured : testConfigured),
    merchantConfigured,
    testConfigured,
    liveConfigured,
  };
}
export function tapCredentials(env: TapRuntimeEnv, environment: TapEnvironment) {
  const status = tapEnvironmentStatus(env, environment);
  const secret = environment === 'LIVE' ? env.TAP_SECRET_KEY_LIVE : env.TAP_SECRET_KEY_TEST;
  if (!status.configured || !secret || !env.TAP_MERCHANT_ID) throw new Error('Tap configuration unavailable');
  return { environment, secret, merchantId: env.TAP_MERCHANT_ID };
}
export function tapConfig(enabled: boolean, environment: TapEnvironment = 'TEST'): PaymentProviderConfig {
  return { enabled, environment, priority: 1, methods: ['card', '3ds'], marketplace: false, health: 'unknown' };
}
export function pricingConfig(platformFeeRate = 0.10, vatRate = 0.15): PaymentPricingConfig {
  if (!Number.isFinite(platformFeeRate) || platformFeeRate < 0 || platformFeeRate >= 1) throw new Error('Invalid platform fee rate');
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate >= 1) throw new Error('Invalid VAT rate');
  return { platformFeeRate, vatRate };
}

const TAP = 'https://api.tap.company/v2';
export const TAP_WEBHOOK_URL = 'https://heavyar-api.heavyar-official.workers.dev/api/webhooks/tap';
export const TAP_REDIRECT_URL = 'https://heavyar-api.heavyar-official.workers.dev/api/payment/tap-redirect';
const GCC_DIAL_CODES: Record<string, string> = { SA: '966', AE: '971', KW: '965', QA: '974', BH: '973', OM: '968' };

function tapCheckoutUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'tap.company' || url.hostname.endsWith('.tap.company')) ? url.toString() : '';
  } catch { return ''; }
}

export function tapCustomerFromAccount(profile: any, identity: { email?: string } = {}): TapCustomer {
  const fullName = String(profile?.nameEn || profile?.nameAr || '').trim().replace(/\s+/g, ' ');
  const parts = fullName.split(' ').filter(Boolean);
  if (parts.length < 2) throw new Error('PAYMENT_PROFILE_INCOMPLETE');
  const firstName = parts.shift()!;
  const lastName = parts.join(' ');
  if (firstName.length > 149 || lastName.length > 149) throw new Error('PAYMENT_PROFILE_INCOMPLETE');
  const emailCandidate = String(identity.email || profile?.email || '').trim().toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCandidate) ? emailCandidate : undefined;
  const dialCode = GCC_DIAL_CODES[String(profile?.countryCode || '').toUpperCase()];
  const phoneValue = String(profile?.phone || '').replace(/[\s()-]/g, '');
  const phoneNumber = dialCode && phoneValue.startsWith(`+${dialCode}`) ? phoneValue.slice(dialCode.length + 1) : '';
  const phone = dialCode && /^\d{6,12}$/.test(phoneNumber) ? { country_code: dialCode, number: phoneNumber } : undefined;
  if (!email && !phone) throw new Error('PAYMENT_PROFILE_INCOMPLETE');
  return { first_name: firstName, last_name: lastName, ...(email ? { email } : {}), ...(phone ? { phone } : {}) };
}

export async function tapProviderReferences(customerUid: string, requestId: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`heavyar:${customerUid}:${requestId}`));
  const stable = Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 48);
  return { idempotent: `hvy_${stable}`, order: `ord_${stable}`, transaction: `txn_${stable}` };
}

export class TapPaymentProvider implements PaymentProvider {
  readonly name = 'tap';
  constructor(private readonly secret: string, private readonly merchantId: string, private readonly http: typeof fetch = fetch) {}
  private async call(path: string, init?: RequestInit): Promise<any> {
    const r = await this.http(`${TAP}${path}`, { ...init, headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const data = await r.json() as any;
    if (!r.ok) throw new Error('Payment provider unavailable');
    return data;
  }
  async create(input: { amount: number; currency: string; metadata: Record<string, string>; idempotencyKey: string; requestId: string; customerUid: string; customer: TapCustomer }) {
    const reference = await tapProviderReferences(input.customerUid, input.requestId);
    const redirectUrl = `${TAP_REDIRECT_URL}?requestId=${encodeURIComponent(input.requestId)}`;
    const d = await this.call('/charges', { method: 'POST', headers: { 'Idempotency-Key': input.idempotencyKey }, body: JSON.stringify({ amount: input.amount, currency: input.currency, customer_initiated: true, threeDSecure: true, save_card: false, description: 'Heavyar rental payment', metadata: input.metadata, reference, customer: input.customer, source: { id: 'src_all' }, merchant: { id: this.merchantId }, post: { url: TAP_WEBHOOK_URL }, redirect: { url: redirectUrl } }) });
    return { id: String(d.id), status: String(d.status || ''), amount: Number(d.amount), currency: String(d.currency), checkoutUrl: tapCheckoutUrl(d.transaction?.url), metadata: d.metadata || input.metadata };
  }
  async retrieve(id: string) {
    const d = await this.call(`/charges/${encodeURIComponent(id)}`);
    return { id: String(d.id), status: String(d.status || ''), amount: Number(d.amount), currency: String(d.currency), checkoutUrl: tapCheckoutUrl(d.transaction?.url), metadata: d.metadata || {} };
  }
}

/** Quote is derived only from server-persisted request/equipment values. */
export function quoteForRequest(request: any, equipment: any, requestId: string, now = Date.now(), policy = pricingConfig()): PaymentQuote {
  const raw = Number(request?.finalAmount ?? request?.amount);
  const daily = Number(request?.dailyRate ?? equipment?.dailyRate ?? equipment?.pricePerDay);
  const days = Math.max(1, Number(request?.days ?? request?.durationDays ?? request?.numberOfDays ?? 1));
  const subtotal = Math.round((Number.isFinite(raw) && raw > 0 ? raw : daily * days) * 100) / 100;
  if (!Number.isFinite(subtotal) || subtotal <= 0) throw new Error('Invalid payment quote');
  const platformFee = Math.round(subtotal * policy.platformFeeRate * 100) / 100;
  const vatAmount = Math.round(subtotal * policy.vatRate * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  return {
    amount: total, total, subtotal, platformFee,
    providerAmount: Math.round((subtotal - platformFee) * 100) / 100,
    vatAmount, tax: vatAmount, currency: 'SAR',
    platformFeeRate: policy.platformFeeRate, vatRate: policy.vatRate, policyVersion: 'phase1-v1',
    quoteId: `quote:${requestId}:${subtotal.toFixed(2)}:SAR`,
    expiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
  };
}

/** Adapts an immutable Heavyar commercial calculation to the legacy payment/invoice shape. */
export function quoteFromCommercial(snapshot: CommercialSnapshot, requestId: string, now = Date.now()): PaymentQuote {
  const major = (minor: number) => Number(minorToMajor(minor, snapshot.currency));
  const subtotal = major(snapshot.baseAmountMinor);
  const platformFee = major(snapshot.platformFeeMinor);
  const vatAmount = major(snapshot.taxAmountMinor ?? 0);
  const total = major(snapshot.customerPayableMinor);
  const providerAmount = major(snapshot.providerReceivableMinor);
  if (![subtotal, platformFee, vatAmount, total, providerAmount].every(Number.isFinite) || subtotal <= 0 || total <= 0) {
    throw new Error('Invalid commercial payment quote');
  }
  return {
    amount: total,
    total,
    subtotal,
    platformFee,
    providerAmount,
    vatAmount,
    tax: vatAmount,
    currency: snapshot.currency,
    platformFeeRate: subtotal ? platformFee / subtotal : 0,
    vatRate: subtotal ? vatAmount / subtotal : 0,
    policyVersion: snapshot.ruleVersion,
    quoteId: `quote:${requestId}:${snapshot.ruleVersion}:${snapshot.customerPayableMinor}:${snapshot.currency}`,
    expiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
    commercialSnapshot: snapshot,
  };
}
export function paymentIdForRequest(requestId: string) { return `payment:${requestId}`; }
export function idempotencyKeyForPayment(uid: string, requestId: string) { return `heavyar-payment:${uid}:${requestId}`; }
export function invoiceNumberForPayment(requestId: string, providerReference: string) { return `INV-${requestId}-${providerReference.slice(-8)}`; }
export function stateForProvider(status: string): PaymentState {
  const s = status.toUpperCase();
  if (s === 'CAPTURED' || s === 'PAID') return 'paid';
  if (s === 'INITIATED' || s === 'PENDING') return 'pending';
  if (s === 'AUTHORIZED' || s === 'REQUIRES_ACTION') return 'requires_action';
  if (s === 'FAILED' || s === 'DECLINED') return 'failed';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
  if (s === 'EXPIRED') return 'expired';
  if (s === 'REFUNDED') return 'refunded';
  if (s === 'PARTIALLY_REFUNDED') return 'partially_refunded';
  return 'processing';
}
export function canTransition(from: PaymentState | undefined, to: PaymentState): boolean {
  if (!from) return to === 'created';
  if (from === to) return true;
  const t: Record<PaymentState, PaymentState[]> = {
    created: ['pending', 'requires_action', 'processing', 'paid', 'failed', 'cancelled', 'expired'], pending: ['requires_action', 'processing', 'paid', 'failed', 'cancelled', 'expired'],
    requires_action: ['processing', 'paid', 'failed', 'cancelled', 'expired'], processing: ['paid', 'failed', 'cancelled', 'refund_pending'],
    paid: ['refund_pending'], failed: ['pending', 'cancelled'], cancelled: [], expired: ['pending'],
    refund_pending: ['refunded', 'partially_refunded', 'failed'], refunded: [], partially_refunded: ['refund_pending'],
  };
  return t[from].includes(to);
}
export const __test = { quoteForRequest, canTransition, paymentIdForRequest, idempotencyKeyForPayment, invoiceNumberForPayment, stateForProvider };
