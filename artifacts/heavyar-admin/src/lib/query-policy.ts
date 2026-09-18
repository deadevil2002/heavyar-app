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