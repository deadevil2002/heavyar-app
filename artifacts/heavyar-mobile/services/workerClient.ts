import { getFirebaseAuth } from './firebaseConfig';
import { WORKER_BASE_URL } from '@/constants/worker';
import { listingLifecyclePath } from './listingContracts';
import { sanitizeCreateListingPayload, sanitizeListingPayload } from './listingPayload';
import { driverRequestActions } from './driverRequestContract';
import type { GccCountryCode } from '@/constants/gcc';
export { driverRequestActions } from './driverRequestContract';

export type AvailabilityRange = { from: string; until?: string };
export type ListingAvailability = AvailabilityRange & {
  blocked?: AvailabilityRange[];
  temporarilyUnavailable?: boolean;
};
export type DriverPublicProfile = {
  id: string;
  uid?: string;
  displayName?: string;
  photoUrl?: string;
  region?: string;
  city?: string;
  customCity?: string;
  equipmentTypes?: string[];
  yearsExperience?: number;
  description?: string;
  availabilityStatus?: string;
  availableFrom?: string;
  availableUntil?: string;
  trustStatus?: string;
  active?: boolean;
  rating?: number;
  countryCode?: GccCountryCode;
  nativeCurrency?: string;
};
export type DriverSearchParams = {
  cursor?: string;
  region?: string;
  city?: string;
  equipment?: string;
  availableFrom?: string;
  availableUntil?: string;
  trustStatus?: string;
  limit?: number;
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

async function request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (authenticated) {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) throw new WorkerError('Authentication required', 401, 'AUTH_REQUIRED');
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${WORKER_BASE_URL}${path}`, { ...init, headers });
  let body: any = null;
  try { body = await response.json(); } catch { /* server may return an empty response */ }
  if (!response.ok || body?.success === false) {
    throw new WorkerError(String(body?.error || 'Request unavailable'), response.status, String(body?.error || 'WORKER_ERROR'));
  }
  return body as T;
}

export function updateListing(id: string, patch: Record<string, unknown>) {
  return request<{ success: true; listingId: string; listing?: Record<string, unknown> }>(
    `/api/listings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(sanitizeListingPayload(patch)) },
  );
}

export function createListing(payload: Record<string, unknown>) {
  return request<{ success: true; id: string; listing?: Record<string, unknown> }>(
    '/api/listings', { method: 'POST', body: JSON.stringify(sanitizeCreateListingPayload(payload)) },
  );
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

export function archiveListing(id: string) {
  return request<{ success: true; listingId: string; action: 'archived'; preservedRentalHistory: boolean }>(
    listingLifecyclePath(id, 'archive'), { method: 'POST' },
  );
}

export function deleteListing(id: string) {
  return request<{ success: true; listingId: string; action: 'deleted' | 'archived'; preservedRentalHistory: boolean }>(
    listingLifecyclePath(id, 'delete'), { method: 'DELETE' },
  );
}

export function checkListingAvailability(id: string, requested: AvailabilityRange) {
  return request<{ success: true; available: boolean; reason?: string }>(
    `/api/listings/${encodeURIComponent(id)}/availability/check`,
    { method: 'POST', body: JSON.stringify(requested) },
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
  return request<{ success: true; profile: DriverPublicProfile | null }>('/api/drivers/profile');
}

export function saveDriverProfile(profile: Partial<DriverPublicProfile>) {
  return request<{ success: true; profile: DriverPublicProfile }>('/api/drivers/profile', {
    method: 'PUT', body: JSON.stringify(profile),
  });
}

export function searchDrivers(params: DriverSearchParams = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  return request<{ success: true; drivers: DriverPublicProfile[]; nextCursor?: string }>(`/api/drivers/search?${query.toString()}`);
}

export function createDriverRequest(payload: Record<string, unknown>) {
  return request<{ success: true; requestId: string; request?: Record<string, unknown> }>('/api/drivers/requests', {
    method: 'POST', body: JSON.stringify(payload),
  });
}

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
  return transitionDriverRequest(id, state);
}
