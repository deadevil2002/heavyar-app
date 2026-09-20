import { getFirebaseAuth } from './firebaseConfig';
import { WORKER_BASE_URL } from '../constants/worker';
import { listingLifecyclePath } from './listingContracts';
import { sanitizeCreateListingPayload, sanitizeListingPayload } from './listingPayload';
import { driverRequestActions } from './driverRequestContract';
import type { GccCountryCode } from '@/constants/gcc';
import { invalidatePublicEquipment } from './discoveryInvalidation';
import type { RentalEstimate, RentalSummary } from '@/types';
import { buildRentalRequestPayload, normalizeEstimate, type RentalRequestInput } from './rentalV2';
export { driverRequestActions } from './driverRequestContract';

export type AvailabilityRange = { from: string; until?: string };
export type ListingAvailability = AvailabilityRange & {
  blocked?: AvailabilityRange[];
  temporarilyUnavailable?: boolean;
};
export type DriverPublicProfile = {
  id: string;
  displayName?: string;
  photoUrl?: string;
  region?: string;
  city?: string;
  customCity?: string;
  equipmentTypes?: string[];
  yearsExperience?: number;
  description?: string;
  availabilityStatus?: 'available' | 'busy' | 'offline';
  availableFrom?: string;
  availableUntil?: string;
  countryCode?: GccCountryCode;
};
export type DriverOwnerProfile = DriverPublicProfile & {
  active: boolean;
  moderationStatus?: 'pending_review' | 'approved' | 'rejected' | 'suspended';
  /** Legacy owner API field while moderationStatus is rolled out. */
  trustStatus?: string;
  nativeCurrency?: string;
};
export type DriverSearchParams = {
  q?: string;
  countryCode?: string;
  cursor?: string;
  region?: string;
  city?: string;
  equipment?: string;
  availableFrom?: string;
  availableUntil?: string;
  availabilityStatus?: string;
  trustStatus?: string;
  limit?: number;
};

export type DriverRequest = {
  id: string;
  status: 'open' | 'accepted' | 'declined' | 'closed' | string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  driver: DriverPublicProfile | null;
  requesterName: string;
  isRequester: boolean;
};

export class WorkerError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 500, code = 'WORKER_ERROR') {
    super(message);
    this.name = 'WorkerError';
    this.status = status;
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

function requestSignal(external?: AbortSignal | null) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  external?.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      external?.removeEventListener('abort', abort);
    },
  };
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (authenticated) {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) throw new WorkerError('Authentication required', 401, 'AUTH_REQUIRED');
    headers.set('Authorization', `Bearer ${token}`);
  }
  const bounded = requestSignal(init.signal);
  let response: Response;
  try {
    response = await fetch(`${WORKER_BASE_URL}${path}`, { ...init, headers, signal: bounded.signal });
  } catch {
    if (init.signal?.aborted) throw new WorkerError('Request cancelled', 0, 'REQUEST_CANCELLED');
    if (bounded.timedOut()) throw new WorkerError('Request timed out', 0, 'NETWORK_TIMEOUT');
    throw new WorkerError('Network unavailable', 0, 'NETWORK_UNAVAILABLE');
  } finally {
    bounded.cleanup();
  }
  let body: any = null;
  try { body = await response.json(); } catch { /* server may return an empty response */ }
  if (!response.ok || body?.success === false) {
    const code = typeof body?.errorCode === 'string' ? body.errorCode
      : typeof body?.code === 'string' ? body.code
        : response.status === 401 ? 'AUTH_REQUIRED'
          : response.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'REQUEST_FAILED';
    const message = response.status >= 500 ? 'Service temporarily unavailable'
      : response.status === 401 ? 'Authentication required'
        : response.status === 403 ? 'Action not permitted'
          : response.status === 404 ? 'Requested item was not found'
            : 'Request could not be completed';
    throw new WorkerError(message, response.status, code);
  }
  return body as T;
}

export async function updateListing(id: string, patch: Record<string, unknown>) {
  const result = await request<{ success: true; listingId: string; listing?: Record<string, unknown> }>(
    `/api/listings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(sanitizeListingPayload(patch)) },
  );
  invalidatePublicEquipment();
  return result;
}

export async function createListing(payload: Record<string, unknown>) {
  const result = await request<{ success: true; id: string; listing?: Record<string, unknown> }>(
    '/api/listings', { method: 'POST', body: JSON.stringify(sanitizeCreateListingPayload(payload)) },
  );
  invalidatePublicEquipment();
  return result;
}

export function getListingAvailability(id: string) {
  return request<{ success: true; listingId: string; availability: ListingAvailability | null; activeRentals: AvailabilityRange[] }>(
    `/api/listings/${encodeURIComponent(id)}/availability`,
  );
}

export function setListingControls(id: string, action: 'hide' | 'show' | 'archive' | 'delete') {
  if (action === 'hide') return updateListing(id, { isActive: false });
  if (action === 'show') return updateListing(id, { isActive: true });
  return action === 'archive' ? archiveListing(id) : deleteListing(id);
}

export async function archiveListing(id: string) {
  const result = await request<{ success: true; listingId: string; action: 'archived'; preservedRentalHistory: boolean }>(
    listingLifecyclePath(id, 'archive'), { method: 'POST' },
  );
  invalidatePublicEquipment();
  return result;
}

export async function deleteListing(id: string) {
  const result = await request<{ success: true; listingId: string; action: 'deleted' | 'archived'; preservedRentalHistory: boolean }>(
    listingLifecyclePath(id, 'delete'), { method: 'DELETE' },
  );
  invalidatePublicEquipment();
  return result;
}

export function checkListingAvailability(id: string, requested: AvailabilityRange) {
  return request<{ success: true; available: boolean; reason?: string }>(
    `/api/listings/${encodeURIComponent(id)}/availability/check`,
    { method: 'POST', body: JSON.stringify(requested) },
  );
}

export async function estimateRentalRequest(input: RentalRequestInput): Promise<RentalEstimate> {
  const payload = buildRentalRequestPayload(input);
  const result = await request<RentalEstimate | { success: true; serverNow: string; estimate: RentalEstimate }>(
    '/api/requests/estimate',
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return normalizeEstimate(result as RentalEstimate | { estimate: RentalEstimate; serverNow?: string });
}

export async function createRentalRequest(input: RentalRequestInput): Promise<string> {
  const payload = buildRentalRequestPayload(input);
  const result = await request<{ success: true; requestId?: string; id?: string; request?: { id?: string } }>(
    '/api/requests',
    { method: 'POST', body: JSON.stringify(payload) },
  );
  const id = result.requestId || result.request?.id || result.id;
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new WorkerError('Invalid request response', 502, 'INVALID_RESPONSE');
  return id;
}

export async function getRentalSummary(requestId: string): Promise<RentalSummary> {
  const result = await request<RentalSummary | { success: true; serverNow: string; summary: RentalSummary }>(
    `/api/requests/${encodeURIComponent(requestId)}/rental-summary`,
  );
  return 'summary' in result ? { ...result.summary, serverNow: result.serverNow } : result;
}

export function transitionRentalRequest(
  requestId: string,
  action: 'accept' | 'reject' | 'start' | 'request_completion' | 'complete' | 'cancel',
  reason?: string,
) {
  return request<{ success: true; request?: Record<string, unknown> }>(
    `/api/requests/${encodeURIComponent(requestId)}/transition`,
    {
      method: 'POST',
      body: JSON.stringify({ action, ...(reason?.trim() ? { reason: reason.trim() } : {}) }),
    },
  );
}

export type CheckoutGateway = {
  provider: 'tap' | 'moyasar' | 'myfatoorah';
  environment: 'TEST' | string;
  supportsSplit: boolean;
  capabilities?: { refunds?: boolean; savedCards?: boolean; split?: boolean };
};

export function getCheckoutGateways() {
  return request<{ success: true; gateways: CheckoutGateway[] }>('/api/checkout/gateways');
}

export function getDriverProfile() {
  return request<{ success: true; profile: DriverOwnerProfile | null }>('/api/drivers/profile');
}

export function saveDriverProfile(profile: Partial<DriverOwnerProfile>) {
  return request<{ success: true; profile: DriverOwnerProfile }>('/api/drivers/profile', {
    method: 'PUT', body: JSON.stringify(profile),
  });
}

export function searchDrivers(params: DriverSearchParams = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  return request<{ success: true; drivers: DriverPublicProfile[]; nextCursor?: string }>(`/api/drivers/search?${query.toString()}`, { signal }, false);
}

export function getPublicDriverProfile(id: string, signal?: AbortSignal) {
  return request<{ success: true; profile: DriverPublicProfile }>(`/api/drivers/public/${encodeURIComponent(id)}`, { signal }, false);
}

export function getDriverRequests(params: { cursor?: string; limit?: number } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  return request<{ success: true; requests: DriverRequest[]; nextCursor?: string }>(`/api/drivers/requests?${query.toString()}`, { signal });
}

export function createDriverRequest(payload: { driverId: string; notes: string }) {
  return request<{ success: true; requestId: string; request?: Record<string, unknown> }>('/api/drivers/requests', {
    method: 'POST', body: JSON.stringify(payload),
  });
}

export function transitionDriverRequestAction(id: string, action: 'accept' | 'decline' | 'close') {
  return request<{ success: true; state: string }>(`/api/drivers/requests/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ action }),
  });
}

// Preserved for legacy if used by Worker/Admin tests
export function transitionDriverRequest(id: string, state: 'accepted' | 'declined' | 'closed') {
  return request<{ success: true; state: string }>(`/api/drivers/requests/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ status: state }),
  });
}

export async function transitionDriverRequestForUser(
  id: string,
  state: 'accepted' | 'declined' | 'closed',
  request: { requesterUid: string; driverUid: string; status: string },
  currentUid: string,
) {
  const actions = driverRequestActions(request, currentUid);
  if ((state === 'accepted' && !actions.canAccept) ||
      (state === 'declined' && !actions.canDecline) ||
      (state === 'closed' && !actions.canClose)) {
    throw new WorkerError('You cannot perform this request action', 403, 'REQUEST_ACTION_FORBIDDEN');
  }
  const actionMap = { accepted: 'accept', declined: 'decline', closed: 'close' } as const;
  return transitionDriverRequestAction(id, actionMap[state]);
}
