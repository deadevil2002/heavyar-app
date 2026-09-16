export const PAYMENT_STATES = [
  'created', 'pending', 'requires_action', 'processing', 'paid', 'failed',
  'cancelled', 'expired', 'refund_pending', 'refunded', 'partially_refunded',
] as const;
export type PaymentState = typeof PAYMENT_STATES[number];

export type PaymentQuote = {
  amount: number; total: number; subtotal: number; platformFee: number;
  providerAmount: number; vatAmount: number; tax: number; currency: 'SAR';
  platformFeeRate: number; vatRate: number; policyVersion: string;
  quoteId: string; expiresAt: string;
};
export type ProviderPayment = {
  id: string; status: string; amount: number; currency: string;
  checkoutUrl?: string; metadata?: Record<string, string>;
};
export interface PaymentProvider {
  readonly name: string;
  create(input: { amount: number; currency: string; metadata: Record<string, string>; idempotencyKey: string }): Promise<ProviderPayment>;
  retrieve(providerReference: string): Promise<ProviderPayment>;
}
export type PaymentProviderConfig = { enabled: boolean; environment: 'test'; priority: number; methods: string[]; marketplace: boolean; health: 'unknown' | 'healthy' | 'unhealthy' };
export type PaymentPricingConfig = { platformFeeRate: number; vatRate: number };
export function tapConfig(enabled: boolean): PaymentProviderConfig {
  return { enabled, environment: 'test', priority: 1, methods: ['card', '3ds'], marketplace: false, health: 'unknown' };
}
export function pricingConfig(platformFeeRate = 0.10, vatRate = 0.15): PaymentPricingConfig {
  if (!Number.isFinite(platformFeeRate) || platformFeeRate < 0 || platformFeeRate >= 1) throw new Error('Invalid platform fee rate');
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate >= 1) throw new Error('Invalid VAT rate');
  return { platformFeeRate, vatRate };
}

const TAP = 'https://api.tap.company/v2';
export class TapPaymentProvider implements PaymentProvider {
  readonly name = 'tap';
  constructor(private readonly secret: string, private readonly http: typeof fetch = fetch) {}
  private async call(path: string, init?: RequestInit): Promise<any> {
    const r = await this.http(`${TAP}${path}`, { ...init, headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const data = await r.json() as any;
    if (!r.ok) throw new Error('Payment provider unavailable');
    return data;
  }
  async create(input: { amount: number; currency: string; metadata: Record<string, string>; idempotencyKey: string }) {
    const d = await this.call('/charges', { method: 'POST', headers: { 'Idempotency-Key': input.idempotencyKey }, body: JSON.stringify({ amount: input.amount, currency: input.currency, customer_initiated: true, threeDSecure: true, save_card: false, description: 'Heavyar rental payment', metadata: input.metadata, source: { id: 'src_all' }, redirect: { url: 'https://heavyar.app/payment/callback' } }) });
    return { id: String(d.id), status: String(d.status || ''), amount: Number(d.amount), currency: String(d.currency), checkoutUrl: d.redirect?.url || '', metadata: d.metadata || input.metadata };
  }
  async retrieve(id: string) {
    const d = await this.call(`/charges/${encodeURIComponent(id)}`);
    return { id: String(d.id), status: String(d.status || ''), amount: Number(d.amount), currency: String(d.currency), checkoutUrl: d.redirect?.url || '', metadata: d.metadata || {} };
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