/** Server request IDs only; never render arbitrary upstream text as a support code. */
export function safeSupportCode(value: unknown): string | undefined {
  return typeof value === 'string' && /^(?:[A-F0-9]{10}|CLIENT-[A-Z0-9-]{3,48})$/.test(value) ? value : undefined;
}

/** Find a safe request ID through the small error wrappers used by mutations. */
export function supportCodeFromError(error: unknown): string | undefined {
  let current: unknown = error;
  const visited = new Set<object>();
  let clientFallback: string | undefined;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    if (visited.has(current)) break;
    visited.add(current);
    const value = current as { supportCode?: unknown; cause?: unknown; error?: unknown };
    const supportCode = safeSupportCode(value.supportCode);
    // A Worker X-Request-ID is authoritative over a client-only wrapper code.
    // Continue through wrappers after seeing CLIENT-* so a nested upload
    // failure cannot lose its server request identifier.
    if (supportCode && !supportCode.startsWith('CLIENT-')) return supportCode;
    if (supportCode) clientFallback ??= supportCode;
    current = value.cause && typeof value.cause === 'object' ? value.cause : value.error;
  }
  return clientFallback;
}

export type PublishFailureStage = 'upload' | 'listing' | 'confirmation';

export function publishFailureStage(
  error: unknown,
  listingSubmitted: boolean,
  listingCommitted: boolean,
): PublishFailureStage {
  if (!listingSubmitted) return 'upload';
  if (listingCommitted) return 'confirmation';
  const value = error as { code?: unknown; status?: unknown } | null;
  const transportFailure = value?.code === 'NETWORK_TIMEOUT'
    || value?.code === 'NETWORK_UNAVAILABLE'
    || value?.code === 'AUTH_SESSION_CHANGED';
  const definitiveRejection = !transportFailure
    && typeof value?.status === 'number'
    && value.status >= 400
    && value.status < 500
    && value.status !== 408;
  return definitiveRejection ? 'listing' : 'confirmation';
}

export class MutationError extends Error {
  readonly supportCode: string;
  constructor(readonly code: string, readonly status = 0, supportCode?: unknown) {
    super('The operation could not be completed');
    this.name = 'MutationError';
    this.supportCode = supportCodeFromError(supportCode) || safeSupportCode(supportCode)
      || `CLIENT-${code.replace(/[^A-Z0-9-]/g, '-').slice(0, 48)}`;
  }
}