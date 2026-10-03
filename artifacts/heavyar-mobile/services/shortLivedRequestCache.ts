export type ShortLivedRequestCache<T> = {
  get(loader: () => Promise<T>): Promise<T>;
  clear(): void;
};

/**
 * Deduplicates concurrent reads and keeps only successful values briefly.
 * Rejections are never cached, so a fail-closed caller can retry immediately.
 */
export function createShortLivedRequestCache<T>(
  ttlMs: number,
  now: () => number = Date.now,
): ShortLivedRequestCache<T> {
  let cached: { value: T; expiresAt: number } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    get(loader) {
      const current = now();
      if (cached && current < cached.expiresAt) return Promise.resolve(cached.value);
      if (inFlight) return inFlight;

      inFlight = Promise.resolve().then(loader).then((value) => {
        cached = { value, expiresAt: now() + Math.max(0, ttlMs) };
        return value;
      }).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    clear() {
      cached = null;
      inFlight = null;
    },
  };
}
