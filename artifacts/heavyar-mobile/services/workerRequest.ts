import { getFirebaseAuth } from './firebaseConfig';
import { safeSupportCode } from './mutationError';
import { WORKER_BASE_URL } from '@/constants/worker';
import { mobilePerformance } from '@/utils/mobilePerformance';

export class WorkerError extends Error {
  status: number;
  code: string;
  supportCode: string;
  constructor(message: string, status = 500, code = 'WORKER_ERROR', supportCode?: unknown) {
    super(message);
    this.name = 'WorkerError';
    this.status = status;
    this.code = code;
    this.supportCode = safeSupportCode(supportCode) || `CLIENT-${code.replace(/[^A-Z0-9-]/g, '-').slice(0, 48)}`;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

function metricLabel(path: string): string {
  const route = path.split('?')[0]
    .replace(/\/api\/listings\/[^/]+/, '/api/listings/:id')
    .replace(/\/api\/requests\/[^/]+/, '/api/requests/:id')
    .replace(/\/api\/drivers\/public\/[^/]+/, '/api/drivers/public/:id')
    .replace(/\/api\/drivers\/requests\/[^/]+/, '/api/drivers/requests/:id');
  return `worker${route.replace(/\//g, '.')}`.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80);
}

function requestSignal(external?: AbortSignal | null) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  external?.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => { clearTimeout(timeout); external?.removeEventListener('abort', abort); },
  };
}

export async function request<T>(path: string, init: RequestInit = {}, authenticated = true, expectedUid?: string): Promise<T> {
  const label = metricLabel(path);
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const auth = authenticated ? getFirebaseAuth() : undefined;
  const user = auth?.currentUser;
  const uid = expectedUid || user?.uid;
  const assertSession = () => {
    if (authenticated && (!uid || user?.uid !== uid || auth?.currentUser?.uid !== uid)) {
      throw new WorkerError('Authentication session changed', 0, 'AUTH_SESSION_CHANGED');
    }
  };
  if (authenticated) {
    if (!user) throw new WorkerError('Authentication required', 401, 'AUTH_REQUIRED');
    assertSession();
    let token: string | undefined;
    try { token = await user.getIdToken(); }
    catch { throw new WorkerError('Authentication unavailable', 0, 'AUTH_TOKEN_UNAVAILABLE'); }
    if (!token) throw new WorkerError('Authentication required', 401, 'AUTH_REQUIRED');
    headers.set('Authorization', `Bearer ${token}`);
  }
  assertSession();
  const bounded = requestSignal(init.signal);
  let response: Response;
  try {
    response = await mobilePerformance.trackNetwork(label, () => fetch(`${WORKER_BASE_URL}${path}`, { ...init, headers, signal: bounded.signal }));
  } catch {
    if (init.signal?.aborted) { mobilePerformance.markCancellation(label); throw new WorkerError('Request cancelled', 0, 'REQUEST_CANCELLED'); }
    if (bounded.timedOut()) { mobilePerformance.markTimeout(label); throw new WorkerError('Request timed out', 0, 'NETWORK_TIMEOUT'); }
    throw new WorkerError('Network unavailable', 0, 'NETWORK_UNAVAILABLE');
  } finally { bounded.cleanup(); }
  assertSession();
  let body: any = null;
  try { body = await response.json(); } catch { /* empty response */ }
  assertSession();
  if (!response.ok || body?.success === false) {
    const code = typeof body?.errorCode === 'string' ? body.errorCode : typeof body?.code === 'string' ? body.code
      : response.status === 401 ? 'AUTH_REQUIRED' : response.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'REQUEST_FAILED';
    const message = response.status >= 500 ? 'Service temporarily unavailable' : response.status === 401 ? 'Authentication required'
      : response.status === 403 ? 'Action not permitted' : response.status === 404 ? 'Requested item was not found' : 'Request could not be completed';
    throw new WorkerError(message, response.status, code, response.headers.get('X-Request-ID') || body?.supportCode);
  }
  return body as T;
}
