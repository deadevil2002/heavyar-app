/** One circuit for all authenticated Admin requests, including downloads/mutations. */
export class QuotaCircuit {
  until = 0;
  failures = 0;
  private probing = false;
  constructor(private now = Date.now) {}
  remaining() { return Math.max(0, this.until - this.now()); }
  acquire() {
    if (this.remaining() || this.probing) return false;
    if (this.failures) this.probing = true;
    return true;
  }
  busy(retryAfter: string | null) {
    // Concurrent failures belong to the same outage, not separate backoff steps.
    if (!this.remaining()) this.failures++;
    const seconds = Number(retryAfter);
    const serverDelay = retryAfter && Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - this.now() : 0;
    this.until = Math.max(this.until, this.now() + Math.max(30_000 * 2 ** Math.min(this.failures - 1, 4), Number.isFinite(serverDelay) ? serverDelay : 0));
    this.probing = false;
  }
  release(success: boolean) {
    if (!this.probing) return;
    this.probing = false;
    if (success) { this.failures = 0; this.until = 0; }
    else this.until = this.now() + 30_000;
  }
}
export const quotaCircuit = new QuotaCircuit();
export function isQuotaResponse(status: number, body: unknown) {
  const value = body as { code?: string; error?: string | { code?: string }; message?: string } | null;
  const code = value?.code || (typeof value?.error === 'object' ? value.error?.code : value?.error);
  return status === 429 || code === 'SERVICE_TEMPORARILY_BUSY' || code === 'RESOURCE_EXHAUSTED';
}
export const liveLists = new Set(['users', 'providers', 'drivers', 'equipment', 'requests', 'payments', 'invoices', 'refunds', 'complaints', 'verification', 'verificationProfiles', 'verificationAttempts']);
const stableLists = new Set(['users', 'providers', 'drivers', 'equipment', 'invoices']);
const activeListStates: Record<string, ReadonlySet<string>> = {
  requests: new Set(['pending', 'requested', 'accepted', 'in_progress', 'completion_requested', 'under_investigation', 'escalated', 'extension_requested']),
  payments: new Set(['pending', 'queued', 'processing', 'authorized', 'requires_action']),
  refunds: new Set(['pending', 'requested', 'queued', 'processing', 'under_review']),
  complaints: new Set(['open', 'pending', 'under_review', 'in_progress', 'escalated']),
  verification: new Set(['pending', 'manual_review', 'require_verification', 'require_manual_review']),
  verificationProfiles: new Set(['pending', 'manual_review', 'require_verification', 'require_manual_review']),
  verificationAttempts: new Set(['pending', 'queued', 'processing', 'in_progress', 'manual_review']),
};
const listFilterKeys = ['status', 'state', 'paymentState', 'overallTrust.status'] as const;

function normalizedState(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function itemStates(item: unknown) {
  if (!item || typeof item !== 'object') return [];
  const value = item as Record<string, unknown>;
  const overallTrust = value.overallTrust && typeof value.overallTrust === 'object'
    ? (value.overallTrust as Record<string, unknown>).status
    : undefined;
  return [value.status, value.state, value.paymentState, value.trustStatus, value.verificationStatus, overallTrust]
    .map(normalizedState)
    .filter(Boolean);
}

/** Central visible-tab list cadence: active work is fast, empty queues stay discoverable, stable/history lists are slow. */
export function listInterval(resource: string, params: Record<string, unknown> = {}, items: readonly unknown[] = []): number | false {
  if (!liveLists.has(resource)) return false;
  if (stableLists.has(resource)) return 120_000;

  const activeStates = activeListStates[resource];
  const filterStates = listFilterKeys.map(key => normalizedState(params[key])).filter(value => value && value !== 'all');
  if (filterStates.some(value => activeStates?.has(value))) return 15_000;
  if (filterStates.length) return 120_000;
  if (items.some(item => itemStates(item).some(value => activeStates?.has(value)))) return 15_000;
  return 30_000;
}
export function detailInterval(resource: string, item: unknown): number | false {
  const data = item as { status?: string; state?: string } | undefined;
  return ['requests', 'payments', 'refunds', 'verificationAttempts'].includes(resource) &&
    ['queued', 'processing', 'pending', 'in_progress', 'authorized'].includes(data?.status || data?.state || '') ? 15_000 : false;
}
export function deletionInterval(id: string | undefined, status: string | undefined, updates: number): number | false {
  return id && ['queued', 'processing'].includes(status || '') ? Math.min(30_000, 2_000 * 2 ** Math.min(Math.max(0, updates - 1), 4)) : false;
}
/** Ignore ordinary refresh timestamps; only identity/authorization changes matter. */
export function authorizationFingerprint(claims: Record<string, unknown>) {
  const { iat, exp, auth_time, ...authorization } = claims;
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
  }
  return JSON.stringify(canonical(authorization));
}
