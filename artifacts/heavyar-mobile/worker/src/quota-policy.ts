/** Isolate-shared circuit. No distributed coordination binding is configured. */
export const BUSY_CODE = 'SERVICE_TEMPORARILY_BUSY';
export const BUSY_EN = 'The service is temporarily busy. Please try again shortly.';
export const BUSY_AR = 'الخدمة مشغولة مؤقتًا. حاول مرة أخرى بعد قليل.';
export class QuotaBusyError extends Error {
  readonly code = BUSY_CODE;
  constructor(public retryAfter: number) { super(BUSY_EN); }
}
export function isQuotaError(error: unknown): error is QuotaBusyError {
  return error instanceof QuotaBusyError;
}
export function createQuotaPolicy(clock = Date.now, transport: typeof fetch = (...args) => fetch(...args)) {
  let failures = 0, until = 0, probing = false, generation = 0;
  const retryAfter = () => Math.max(1, Math.ceil((until - clock()) / 1000));
  const open = () => {
    failures = Math.min(failures + 1, 6);
    until = clock() + Math.min(30_000 * 2 ** (failures - 1), 900_000);
    generation++;
  };
  return {
    blocked: () => clock() < until || probing,
    retryAfter,
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== 'firestore.googleapis.com') return transport(input, init);
      if (clock() < until || probing) throw new QuotaBusyError(retryAfter());
      const probe = failures > 0, startedGeneration = generation;
      if (probe) probing = true;
      try {
        const response = await transport(input, init);
        let exhausted = response.status === 429;
        if (!response.ok && !exhausted) {
          const body = await response.clone().json().catch(() => null) as any;
          exhausted = body?.error?.status === 'RESOURCE_EXHAUSTED';
        }
        if (exhausted) {
          if (startedGeneration === generation) open();
          throw new QuotaBusyError(retryAfter());
        }
        if (probe && startedGeneration === generation) {
          if (response.ok || response.status === 404) { failures = 0; until = 0; }
          else { open(); throw new QuotaBusyError(retryAfter()); }
        }
        return response;
      } catch (error) {
        if (probe && !isQuotaError(error)) { open(); throw new QuotaBusyError(retryAfter()); }
        throw error;
      } finally { if (probe) probing = false; }
    },
  };
}
const shared = createQuotaPolicy();
export const quotaFetch = shared.fetch;
export const quotaBlocked = shared.blocked;
export function quotaResponse(req: Request, error: QuotaBusyError): Response {
  return new Response(req.method === 'HEAD' ? null : JSON.stringify({
    success: false, code: BUSY_CODE, errorCode: BUSY_CODE,
    error: /^ar\b/i.test(req.headers.get('Accept-Language') || '') ? BUSY_AR : BUSY_EN,
    retryAfter: error.retryAfter,
  }), { status: 503, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Retry-After': String(error.retryAfter), 'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Retry-After', 'Vary': 'Accept-Language',
  } });
}