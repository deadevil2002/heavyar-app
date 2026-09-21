export type CloudinaryQuotaRecord = {
  windowStart: string;
  count: number;
  version?: string;
};

export type CloudinaryQuotaOutcome =
  | 'quota_reserved'
  | 'quota_exhausted'
  | 'cas_conflict_retry'
  | 'quota_infrastructure_failure';

export type CloudinaryQuotaResult = {
  outcome: CloudinaryQuotaOutcome;
  count?: number;
  casConflictRetries: number;
};

export type CloudinaryQuotaReservation = {
  uid: string;
  windowStart: string;
  count: number;
  prior: CloudinaryQuotaRecord | null;
};

export async function reserveCloudinaryUploadQuota(options: {
  uid: string;
  limit?: number;
  maxAttempts?: number;
  now?: () => number;
  read: (uid: string) => Promise<CloudinaryQuotaRecord | null>;
  write: (reservation: CloudinaryQuotaReservation) => Promise<void>;
  isConflict: (error: unknown) => boolean;
}): Promise<CloudinaryQuotaResult> {
  const limit = options.limit ?? 10;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 4);
  let conflicts = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let prior: CloudinaryQuotaRecord | null;
    try {
      prior = await options.read(options.uid);
    } catch {
      return { outcome: 'quota_infrastructure_failure', casConflictRetries: conflicts };
    }
    const now = options.now ? options.now() : Date.now();
    const windowStart = new Date(Math.floor(now / 60000) * 60000).toISOString();
    const count = prior?.windowStart === windowStart ? Number(prior.count || 0) : 0;
    if (count >= limit) return { outcome: 'quota_exhausted', count, casConflictRetries: conflicts };
    try {
      await options.write({
        uid: options.uid,
        windowStart,
        count: count + 1,
        prior,
      });
      return {
        outcome: 'quota_reserved',
        count: count + 1,
        casConflictRetries: conflicts,
      };
    } catch (error) {
      if (!options.isConflict(error)) return { outcome: 'quota_infrastructure_failure', casConflictRetries: conflicts };
      conflicts++;
    }
  }
  return { outcome: 'cas_conflict_retry', casConflictRetries: conflicts };
}