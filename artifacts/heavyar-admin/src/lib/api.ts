import { QueryClient, useQuery, useMutation, focusManager } from '@tanstack/react-query';
import { quotaCircuit, isQuotaResponse, liveLists, detailInterval, deletionInterval } from './query-policy';
import { getFirebaseAuth } from './firebase';
import { adminListParams } from './operations-contract';
import { SafeApiError } from './error-messages';
import { accountRefreshKeys, refreshQueries } from './admin-feedback';
import { useEffect } from 'react';
import { ACCOUNT_INTEGRITY_ENDPOINT, normalizeIntegrityParams, type IncompleteRegistrationsResponse } from './account-integrity';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://heavyar-api.heavyar-official.workers.dev';
export const API_BASE = configuredApiBase.replace(/\/+$/, '').replace(/\/api\/admin$/, '') + '/api/admin';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: false,
      staleTime: 30_000,
    },
  },
});

// One visibility listener, no page-specific timers and no hidden-tab catch-up.
focusManager.setEventListener(handleFocus => {
  if (typeof document === 'undefined') return () => {};
  const changed = () => handleFocus(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', changed);
  changed();
  return () => document.removeEventListener('visibilitychange', changed);
});

export async function guardedFetch(url: string, options: RequestInit): Promise<Response> {
  if (!quotaCircuit.acquire()) throw new ApiError('SERVICE_TEMPORARILY_BUSY', 503);
  try {
    const response = await fetch(url, options);
    const body = response.ok ? null : await response.clone().json().catch(() => null);
    if (isQuotaResponse(response.status, body)) {
      quotaCircuit.busy(response.headers.get('Retry-After') ?? (typeof body?.retryAfter === 'number' ? String(body.retryAfter) : null));
      throw new ApiError('SERVICE_TEMPORARILY_BUSY', 503);
    }
    quotaCircuit.release(response.ok);
    return response;
  } catch (error) {
    quotaCircuit.release(false);
    throw error;
  }
}

async function getToken(forceRefresh = false) {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return null;
  return await auth.currentUser.getIdToken(forceRefresh);
}

export class ApiError extends SafeApiError {}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}, hasRetried = false): Promise<T> {
  const token = await getToken(hasRetried);
   if (!token) throw new ApiError('UNAUTHENTICATED', 401);

  const url = `${API_BASE}${endpoint}`;

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  } else {
    headers.delete('Content-Type');
  }

  const response = await guardedFetch(url, { ...options, headers });

  if (!response.ok) {
    let message: unknown = null;
    try {
      const errorData = await response.json();
      message = errorData;
    } catch (e) {}
    if (response.status === 401 && !hasRetried) {
      return fetchApi<T>(endpoint, options, true);
    }
    if (response.status === 401) {
      await getFirebaseAuth().signOut();
      throw new ApiError('Session expired. Please sign in again.', response.status);
    }
    throw new ApiError(message, response.status);
  }

  const data = await response.json();
  if (data.error) {
    throw new ApiError(data, response.status);
  }
  return data;
}

/** Authenticated endpoints intentionally outside the admin namespace (for invitation acceptance). */
export async function fetchAuthenticatedPublic<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError('UNAUTHENTICATED', 401);
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await guardedFetch(`${API_BASE.replace(/\/api\/admin$/, '')}${endpoint}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new ApiError(body, response.status);
  return body as T;
}

/** Authenticated binary requests are used for server-generated XLSX/PDF documents. */
export async function fetchApiBinary(endpoint: string, options: RequestInit = {}, hasRetried = false): Promise<{ blob: Blob; filename?: string }> {
  const token = await getToken(hasRetried);
  if (!token) throw new ApiError('UNAUTHENTICATED', 401);
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await guardedFetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    let message: unknown = null;
    try { message = await response.json(); } catch { /* binary/error response */ }
    if (response.status === 401 && !hasRetried) return fetchApiBinary(endpoint, options, true);
    if (response.status === 401) { await getFirebaseAuth().signOut(); throw new ApiError('Session expired. Please sign in again.', response.status); }
    throw new ApiError(message || 'Download failed', response.status);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="?([^"]+)"?/i)?.[1];
  return { blob: await response.blob(), filename };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export type PaginatedResponse<T> = {
  items: T[];
  nextCursor?: string;
  total?: number;
};

// Types
export type AdminSession = { role: 'owner' | 'super_admin' | 'admin' | 'finance' | 'payouts' | 'operations' | 'support' | 'verification' | 'marketing' | 'auditor' | 'moderator'; permissions?: string[]; bootstrapRequired?: boolean; uid?: string; };
export type TrustStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired' | 'manual_review' | 'restricted' | 'require_verification' | 'require_manual_review' | 'restrict' | 'block';
export type TrustFields = {
  verificationStatus?: TrustStatus;
  identityStatus?: TrustStatus;
  trustStatus?: TrustStatus;
  riskOutcome?: TrustStatus;
  verificationRequired?: boolean;
  overallTrust?: { status?: TrustStatus };
  identity?: { status?: TrustStatus };
  manualReview?: { status?: TrustStatus };
};
export type VerificationReminderFields = {
  emailVerified?: boolean;
  lastEmailVerificationSentAt?: string;
  lastVerificationReminderAt?: string;
  verificationReminderCount?: number;
  deliveryStatus?: string;
  verificationReminderDeliveryStatus?: string;
  verificationReminder?: { lastSentAt?: string; count?: number; deliveryStatus?: string; emailVerified?: boolean };
};
export type PersonSummary = { id?: string; uid?: string; name?: string; nameAr?: string; nameEn?: string; email?: string; phone?: string; city?: string; region?: string };
export type User = { id: string; email?: string; nameAr?: string; nameEn?: string; displayName?: string; publicId?: string; publicIdentifier?: string; suspensionStatus?: string; status?: string; createdAt?: string; role?: string; accountPurpose?: string; verification?: string; city?: string; region?: string; provider?: PersonSummary; emailVerified?: boolean; emailVerifiedAt?: string; lastEmailVerificationSentAt?: string; verificationReminderCount?: number; nextVerificationReminderAt?: string; } & TrustFields & VerificationReminderFields;
export type RentalRateUnit = 'hourly' | 'daily';
export type RentalPricingV2 = {
  currency: string;
  hourly: { enabled: boolean; amountMinor?: number };
  daily: { enabled: boolean; amountMinor?: number };
};
export type RentalPricingSnapshotV2 = {
  calculationVersion: 2;
  rateUnit: RentalRateUnit;
  rateAmountMinor: number;
  currency: string;
  currencyDecimals: 2 | 3;
  marketTimezone: string;
  baseAmountMinor: number | null;
  [key: string]: unknown;
};
export type Equipment = { id: string; publicId?: string; equipmentNumber?: string; title?: string; titleAr?: string; titleEn?: string; ownerUid?: string; owner?: PersonSummary; moderationStatus?: string; visibility?: string; isActive?: boolean; rate?: number; dailyRate?: number; pricePerDay?: number; pricingModelVersion?: number; pricing?: RentalPricingV2; city?: string; reviewedBy?: PersonSummary; reviewedAt?: string; rejectionReason?: string };
export type Provider = User & { providerId?: string };
export type Driver = { id: string; uid?: string; publicId?: string; displayName?: string; name?: string; email?: string; phone?: string; city?: string; region?: string; active?: boolean; status?: string; availabilityStatus?: string; moderationStatus?: string; verificationStatus?: string; trustStatus?: string; equipmentTypes?: string[]; moderatedAt?: string; reviewedAt?: string; emailVerified?: boolean; lastEmailVerificationSentAt?: string; lastVerificationReminderAt?: string; verificationReminderCount?: number; deliveryStatus?: string; verificationReminderDeliveryStatus?: string; verificationReminder?: VerificationReminderFields['verificationReminder'] };
export type Request = { id: string; requestNumber?: string; publicRequestNumber?: string; status: string; customerUid?: string; providerUid?: string; customer?: PersonSummary; provider?: PersonSummary; equipment?: { id?: string; number?: string; title?: string }; pricingModelVersion?: number; rentalMode?: 'hourly' | 'daily' | 'open_ended'; rateUnit?: RentalRateUnit; requestedStartAt?: string; requestedEndAt?: string | null; actualStartAt?: string | null; actualEndAt?: string | null; pricingSnapshot?: RentalPricingSnapshotV2; finalCommercialSnapshot?: CommercialSnapshot; commercialSnapshot?: CommercialSnapshot; rentalFrom?: string; rentalTo?: string; startDate?: string; endDate?: string; paymentState?: string; totalAmount?: number; events?: any[] } & TrustFields;
export type Payment = { id: string; requestNumber?: string; request?: { requestNumber?: string }; customer?: PersonSummary; provider?: PersonSummary; state: string; amount: number; vatAmount?: number; platformFee?: number; providerName?: string; providerReference?: string; invoiceId?: string; events?: any[] } & TrustFields;
export type Invoice = { id: string; invoiceNumber?: string; requestNumber?: string; request?: { requestNumber?: string }; totalAmount?: number; status: string; customerId?: string; providerId?: string; customer?: PersonSummary; provider?: PersonSummary; issuedAt?: string; url?: string };
export type Refund = { id: string; state?: string; amount: number; requestId?: string; requestNumber?: string; originalPaymentId?: string; customer?: PersonSummary; provider?: PersonSummary };
export type Complaint = { id: string; status: string; description?: string; customerUid?: string; providerUid?: string; customer?: PersonSummary; provider?: PersonSummary; requestId?: string; requestNumber?: string; createdAt?: string } & TrustFields;
export type ProviderConfig = { id: string; providerId?: string; enabled?: boolean; environment?: string; settings?: Record<string, any> };
export type VersionedConfig = { id: string; version: string; data?: any; key?: string; updatedAt?: string; registrationEnabled?: boolean; maintenanceMode?: boolean; requireEmailVerification?: boolean; autoApproveProviders?: boolean; ownerUid?: string; };
/** Safe, non-secret authentication policy projection returned by the admin API. */
export type AuthConfig = {
  id?: string;
  version?: string | number;
  requested?: {
    requirePhoneOnSignup?: boolean;
    allowEmailLogin?: boolean;
    allowPhoneLogin?: boolean;
    requirePhoneVerification?: boolean;
  };
  effective?: {
    requirePhoneOnSignup?: boolean;
    allowEmailLogin?: boolean;
    allowPhoneLogin?: boolean;
    requirePhoneVerification?: boolean;
  };
  requirePhoneOnSignup?: boolean;
  allowEmailLogin?: boolean;
  allowPhoneLogin?: boolean;
  requirePhoneVerification?: boolean;
  blocked?: Partial<Record<'requirePhoneOnSignup' | 'allowEmailLogin' | 'allowPhoneLogin' | 'requirePhoneVerification', boolean>>;
  accountRecovery?: {
    firebaseReset?: boolean | string;
    resend?: { bound?: boolean; delivery?: string; status?: string };
    senderDomainVerified?: boolean;
  };
};
export type EmailVerificationPolicy = {
  enabled: boolean;
  requireBeforeRentalRequest: boolean;
  requireBeforeListingSubmission: boolean;
  requireBeforeDriverActivation: boolean;
  allowReminders: boolean;
  reminderCooldownSeconds: number;
  version: number;
  updatedAt?: string;
};
export type PhoneVerificationPolicy = {
  enabled: false;
  provider: null;
  requireAfterSignup: boolean;
  requireBeforeRentalRequest: boolean;
  requireBeforeProviderActivation: boolean;
  requireBeforeDriverActivation: boolean;
  requireBeforeSensitiveActions: boolean;
  resendCooldownSeconds: number;
  maxAttempts: number;
  expirySeconds: number;
  version: number;
};
export type AdminCountry = { code: string; nameEn: string; nameAr: string; dialCode: string; currency: string; enabled: boolean; marketplaceAvailable: boolean; providerOnboardingAvailable: boolean; crossBorderAvailable: boolean; version?: number };
export type AdminCountriesResponse = { success: boolean; version: number; countries: AdminCountry[] };
export type FxProviderConfig = { provider: 'none'; enabled: false; refreshIntervalSeconds: number; cacheTtlSeconds: number; status: 'disabled'; lastSuccessfulAt?: string | null; lastSuccessfulVersion?: number | null; version: number; updatedAt?: string };
export type AuditEntry = { id: string; actorUid: string; action: string; targetType: string; targetId: string; before?: any; after?: any; reason?: string; timestamp: string };
export type OverviewMetrics = {
  totalUsers: number;
  activeProviders: number;
  activeRequests: number;
  payments: number;
  equipmentListings: number;
  invoices: number;
  openComplaints: number;
  failedPayments?: number;
  suspendedAccounts?: number[];
  recentAuditEvents?: any[];
  paidSarVolume?: number;
  pendingSarVolume?: number;
};
export type OverviewResponse = { success: boolean; metrics: OverviewMetrics };
export type NotificationFailure = {
  id: string;
  category?: string;
  eventType?: string;
  status?: string;
  reasonCode?: string;
  createdAt?: string;
  retryable?: boolean;
};
export type NotificationHealthResponse = {
  success: boolean;
  summary?: { sent?: number; failed?: number; pending?: number; deactivatedTokens?: number };
  failures?: NotificationFailure[];
  nextCursor?: string;
};

// Hooks

export function useAdminSession() {
  return useQuery({
    queryKey: ['adminSession'],
    queryFn: () => fetchApi<AdminSession>('/session'),
  });
}

export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => fetchApi<OverviewResponse>('/overview'),
  });
}

export function useNotificationHealth(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['notificationHealth', params],
    queryFn: () => {
      const searchParams = new URLSearchParams({ limit: '25' });
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') searchParams.set(key, String(value));
      });
      return fetchApi<NotificationHealthResponse>(`/notification-health?${searchParams.toString()}`);
    },
    retry: false,
  });
}

export function useListQuery<T>(key: string, endpoint: string, params: Record<string, any> = {}) {
  return useQuery({
    queryKey: [key, params],
    queryFn: () => {
      const searchParams = new URLSearchParams(adminListParams(params));
      const qs = searchParams.toString();
      return fetchApi<PaginatedResponse<T>>(`${endpoint}${qs ? '?' + qs : ''}`);
    },
    refetchInterval: liveLists.has(key) ? 15_000 : false,
  });
}

export function useUsers(params: Record<string, any> = {}) { return useListQuery<User>('users', '/users', params); }
export function useAccountIntegrity(params: { q?: string; state?: string; cursor?: string; enabled?: boolean } = {}) {
  const { enabled = true, ...filters } = params;
  return useQuery({
    queryKey: ['accountIntegrity', filters],
    enabled,
    queryFn: () => {
      const query = new URLSearchParams(normalizeIntegrityParams(filters));
      return fetchApi<IncompleteRegistrationsResponse>(`${ACCOUNT_INTEGRITY_ENDPOINT}?${query.toString()}`);
    },
    retry: false,
  });
}
export function useProviders(params: Record<string, any> = {}) { return useListQuery<Provider>('providers', '/providers', params); }
export type DriverDiscovery = { discoveryEligibility?: { discoverable: boolean; reasons: string[] } };
export function useDrivers(params: Record<string, any> = {}) { return useListQuery<Driver & DriverDiscovery>('drivers', '/drivers', params); }
export function useEquipment(params: Record<string, any> = {}) { return useListQuery<Equipment>('equipment', '/equipment', params); }
export function useRequests(params: Record<string, any> = {}) { return useListQuery<Request>('requests', '/requests', params); }
export function usePayments(params: Record<string, any> = {}) { return useListQuery<Payment>('payments', '/payments', params); }
export function useInvoices(params: Record<string, any> = {}) { return useListQuery<Invoice>('invoices', '/invoices', params); }
export function useRefunds(params: Record<string, any> = {}) { return useListQuery<Refund>('refunds', '/refunds', params); }
export function useComplaints(params: Record<string, any> = {}) { return useListQuery<Complaint>('complaints', '/complaints', params); }
export function useVerification(params: Record<string, any> = {}) { return useListQuery<any>('verification', '/verification', params); }
export function useVerificationProfiles(params: Record<string, any> = {}) { return useListQuery<any>('verificationProfiles', '/verification-profiles', params); }
export function useVerificationAttempts(params: Record<string, any> = {}) { return useListQuery<any>('verificationAttempts', '/verification-attempts', params); }
export function useVerificationEvents(params: Record<string, any> = {}) { return useListQuery<any>('verificationEvents', '/verification-events', params); }
export function useVerificationPolicy() {
  return useQuery({
    queryKey: ['verificationPolicy', 'default'],
    queryFn: () => fetchApi<{ success: boolean; item: any }>('/detail/verificationPolicies/default'),
    retry: false,
  });
}
export function useVerificationProfileDetail(uid?: string) {
  return useQuery({
    queryKey: ['verificationProfileDetail', uid],
    queryFn: () => fetchApi<{ success: boolean; item: any }>(`/detail/verificationProfiles/${encodeURIComponent(uid!)}`),
    enabled: Boolean(uid),
  });
}
export function useVerificationAttemptEvents(attemptId?: string) {
  return useQuery({
    queryKey: ['verificationAttemptEvents', attemptId],
    queryFn: () => fetchApi<PaginatedResponse<any>>(`/verification-events?attemptId=${encodeURIComponent(attemptId!)}`),
    enabled: Boolean(attemptId),
  });
}
export function useProviderConfigs(params: Record<string, any> = {}) { return useListQuery<ProviderConfig>('provider-configs', '/provider-configs', params); }
export function useConfig(params: Record<string, any> = {}) { return useListQuery<VersionedConfig>('config', '/config', params); }
export function useAuthConfig() {
  return useQuery({
    queryKey: ['authConfig'],
    // This is deliberately a safe projection: the API must never return credentials,
    // provider identifiers, or other secret material from this resource.
    queryFn: async () => {
      try {
        return await fetchApi<{ success?: boolean; item: AuthConfig }>('/detail/authConfig/default');
      } catch (error) {
        // Permit the Worker to expose the same safe contract as a dedicated endpoint
        // while it is being rolled out; do not mask non-404 authorization/errors.
        if (error instanceof ApiError && error.status === 404) {
          try {
            return await fetchApi<{ success?: boolean; item: AuthConfig }>('/auth-config');
          } catch (fallbackError) {
            // A missing document is a valid first-run state, not a broken page.
            if (fallbackError instanceof ApiError && fallbackError.status === 404) {
              return { item: {} };
            }
            throw fallbackError;
          }
        }
        throw error;
      }
    },
    retry: false,
  });
}
export function useEmailVerificationPolicy() {
  return useQuery({ queryKey: ['emailVerificationPolicy'], queryFn: () => fetchApi<{ success: boolean; policy: EmailVerificationPolicy }>('/email-verification-policy'), retry: false });
}
export function useUpdateEmailVerificationPolicy() {
  return useMutation({ mutationFn: (policy: { expectedVersion: number; enabled: boolean; requireBeforeRentalRequest: boolean; requireBeforeListingSubmission: boolean; requireBeforeDriverActivation: boolean; allowReminders: boolean; reminderCooldownSeconds: number }) => fetchApi<{ success: boolean; policy: EmailVerificationPolicy }>('/email-verification-policy', { method: 'PUT', body: JSON.stringify(policy) }) });
}
export function usePhoneVerificationPolicy() {
  return useQuery({ queryKey: ['phoneVerificationPolicy'], queryFn: () => fetchApi<{ success: boolean; policy: PhoneVerificationPolicy }>('/phone-verification'), retry: false });
}
export function useUpdatePhoneVerificationPolicy() {
  return useMutation({ mutationFn: (policy: { expectedVersion: number; requireAfterSignup: boolean; requireBeforeRentalRequest: boolean; requireBeforeProviderActivation: boolean; requireBeforeDriverActivation: boolean; requireBeforeSensitiveActions: boolean; resendCooldownSeconds: number; maxAttempts: number; expirySeconds: number }) => fetchApi<{ success: boolean; policy: PhoneVerificationPolicy }>('/phone-verification', { method: 'PUT', body: JSON.stringify(policy) }) });
}
export function useAdminCountries() {
  return useQuery({ queryKey: ['adminCountries'], queryFn: () => fetchApi<AdminCountriesResponse>('/countries'), retry: false });
}
export function useUpdateAdminCountries() {
  return useMutation({ mutationFn: (data: { expectedVersion: number; countries: AdminCountry[] }) => fetchApi<AdminCountriesResponse>('/countries', { method: 'PUT', body: JSON.stringify(data) }) });
}
export function useFxProviderConfig() {
  return useQuery({ queryKey: ['fxProvider'], queryFn: () => fetchApi<{ success: boolean; fx: FxProviderConfig }>('/fx-provider'), retry: false });
}
export function useUpdateFxProviderConfig() {
  return useMutation({ mutationFn: (data: { expectedVersion: number; refreshIntervalSeconds: number; cacheTtlSeconds: number }) => fetchApi<{ success: boolean; fx: FxProviderConfig }>('/fx-provider', { method: 'PUT', body: JSON.stringify(data) }) });
}

// Commercial / Fees API
export type CommercialRule = {
  id?: string;
  version: string;
  status: 'draft' | 'active' | 'scheduled' | 'retired';
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  notes?: string;
  mode: 'percentage' | 'fixed' | 'percentage_fixed';
  percentageBps?: number;
  fixedAmountMinor?: number;
  minimumFeeMinor?: number | null;
  maximumFeeMinor?: number | null;
  payer: 'customer' | 'provider' | 'split';
  customerShareBps?: number;
  scope: {
    countryCode?: string | null;
    categoryId?: string | null;
    providerUid?: string | null;
  };
  currency: string;
};

export type CommercialRulesResponse = {
  success: boolean;
  revision: number;
  rules: CommercialRule[];
  canManage: boolean;
  countries: AdminCountry[];
  categories: { id: string; nameEn: string; nameAr: string }[];
  serverTime: string;
  precedence: any;
  legacyFallback: boolean;
};

export type CommercialSnapshot = {
  ruleVersion: string;
  baseAmountMinor: number;
  platformFeeMinor: number;
  customerFeeMinor: number;
  providerFeeMinor: number;
  providerReceivableMinor: number;
  customerPayableMinor: number;
  taxAmountMinor: number | null;
  gatewayFeeMinor: number | null;
  currency: string;
  calculatedAt: string;
};

export function useCommercialRules() {
  return useQuery({
    queryKey: ['commercialRules'],
    queryFn: () => fetchApi<CommercialRulesResponse>('/commercial'),
    refetchInterval: false,
  });
}

export function useCommercialMutate() {
  return useMutation({
    mutationFn: (data: { action: 'create' | 'publish' | 'retire'; expectedRevision: number; reason: string; rule?: any; version?: string }) =>
      fetchApi<{ success: boolean }>('/commercial', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercialRules'] });
    }
  });
}

export function useCommercialPreview() {
  return useMutation({
    mutationFn: (data: { baseAmountMinor: number; countryCode?: string; categoryId?: string; providerUid?: string; currency: string; at?: string; draftRule?: any }) =>
      fetchApi<{ success: boolean; snapshot: CommercialSnapshot; matchedRule?: CommercialRule }>('/commercial/preview', { method: 'POST', body: JSON.stringify(data) }),
  });
}

export function useAudit(params: Record<string, any> = {}) { return useListQuery<AuditEntry>('audit', '/audit', params); }
export function useDetail<T = Record<string, unknown>>(resource: string, id?: string) {
  return useQuery({ queryKey: ['detail', resource, id], queryFn: () => fetchApi<{ success?: boolean; item: T }>(`/detail/${resource}/${encodeURIComponent(id!)}`), enabled: Boolean(id), retry: false, refetchInterval: query => id ? detailInterval(resource, query.state.data?.item) : false, refetchOnWindowFocus: true });
}

export function useActionMutation() {
  return useMutation({
    mutationFn: (data: { action: string; targetType: string; targetId: string; reason?: string; payload?: any }) =>
      fetchApi('/action', { method: 'POST', body: JSON.stringify(data) }),
  });
}

export function useRolesMutation() {
  return useMutation({
    mutationFn: (data: { uid: string; role: 'admin' | 'super_admin' | 'none' }) =>
      fetchApi('/roles', { method: 'POST', body: JSON.stringify(data) }),
  });
}

// Bulk & Deletion Operations
type AccountTargetSelection = {
  scope?: 'user' | 'provider' | 'driver';
  uids?: string[];
  filters?: any;
};

export function useRemindersPreview() {
  return useMutation({
    mutationFn: (data: AccountTargetSelection) =>
      fetchApi<{ success: boolean; targeted: number; eligible: number; alreadyVerified: number; cooldown: number; restricted: number; missing: number }>('/email-verification/reminders/preview', { method: 'POST', body: JSON.stringify(data) })
  });
}

export function useRemindersBulk() {
  return useMutation({
    mutationFn: (data: AccountTargetSelection) =>
      fetchApi<{ success: boolean; targeted: number; sent: number; skippedVerified: number; skippedCooldown: number; skippedRestricted: number; missing: number; failed: number; results?: any }>('/email-verification/reminders/bulk', { method: 'POST', body: JSON.stringify(data) }),
    onSettled: () => refreshQueries(queryClient, accountRefreshKeys),
  });
}

export function useDeletionPreview() {
  return useMutation({
    mutationFn: (data: AccountTargetSelection) =>
      fetchApi<{
        success: boolean;
        targeted: number;
        eligible: number;
        protected: number;
        skipped: number;
        items?: any[];
        counts: { equipment: number; driverProfile: number; phoneAlias: number; requests: number; notifications: number; deviceTokens: number; complaints: number; media: number; [key: string]: number };
        retained: { payments: number; invoices: number; refunds: number; audits: number; [key: string]: number };
        requiresConfirmation: string;
        previewToken: string;
        expiresAt: string;
      }>('/users/deletion-preview', { method: 'POST', body: JSON.stringify(data) })
  });
}

export function useDeletionJob() {
  return useMutation({
    mutationFn: (data: { previewToken: string; reason: string; confirmation: string }) =>
      fetchApi<{ success: boolean; jobId: string; status: string; total: number }>('/users/deletion-jobs', { method: 'POST', body: JSON.stringify(data) }),
    onSettled: () => refreshQueries(queryClient, accountRefreshKeys),
  });
}

export function useDeletionJobStatus(id?: string) {
  const query = useQuery({
    queryKey: ['deletionJob', id],
    queryFn: () => fetchApi<{ id: string; status: 'queued' | 'processing' | 'completed' | 'partially_completed' | 'failed'; progress: number; total: number; result?: any }>(`/users/deletion-jobs/${id}`),
    enabled: Boolean(id),
    refetchInterval: query => deletionInterval(id, query.state.data?.status, query.state.dataUpdateCount),
  });
  const status = query.data?.status;
  useEffect(() => {
    if (status && ['completed', 'partially_completed', 'failed'].includes(status)) {
      void refreshQueries(queryClient, accountRefreshKeys);
    }
  }, [id, status]);
  return query;
}

export function useSendReminder() {
  return useMutation({
    mutationFn: (uid: string) => fetchApi<{ success: boolean; sent?: boolean; alreadyVerified?: boolean }>(`/email-verification/reminder`, { method: 'POST', body: JSON.stringify({ uid }) }),
    onSettled: () => refreshQueries(queryClient, accountRefreshKeys),
  });
}