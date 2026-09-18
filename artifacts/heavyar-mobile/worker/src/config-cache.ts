/** Bounded isolate-local singleflight. Other isolates converge within TTL, not instantly. */
export class ConfigCache<T> {
  private entries = new Map<string, { value: T; until: number }>();
  private pending = new Map<string, Promise<T>>();
  constructor(private ttl = 30_000, private clock = Date.now) {}
  invalidate(key?: string) {
    if (key === undefined) { this.entries.clear(); this.pending.clear(); }
    else { this.entries.delete(key); this.pending.delete(key); }
  }
  async get(key: string, load: () => Promise<T>, expires?: (value: T) => number): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.until > this.clock()) return hit.value;
    const flight = this.pending.get(key);
    if (flight) return flight;
    const started = this.clock();
    const promise = load().then(value => {
      // An invalidated in-flight read must never repopulate a stale generation.
      if (this.pending.get(key) === promise) {
        if (this.entries.size >= 32) this.entries.delete(this.entries.keys().next().value!);
        this.entries.set(key, { value, until: Math.min(started + this.ttl, expires?.(value) ?? Infinity) });
      }
      return value;
    }).finally(() => { if (this.pending.get(key) === promise) this.pending.delete(key); });
    this.pending.set(key, promise);
    return promise;
  }
}
export const seoPayloadCache = new ConfigCache<{ encoded: string; etag: string }>();
export const commercialReadCache = new ConfigCache<any>();
export function commercialExpiry(record: any): number {
  const now = Date.now();
  return Math.min(Infinity, ...(record?.data?.rules || []).flatMap((rule: any) =>
    [rule.effectiveFrom, rule.effectiveTo].map(v => Date.parse(v)).filter(t => t > now)));
}