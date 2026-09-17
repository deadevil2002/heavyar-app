import { QueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { getFirebaseAuth } from './firebase';

export const API_BASE = 'https://heavyar-api.heavyar-official.workers.dev/api/admin';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

async function getToken() {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return null;
  return await auth.currentUser.getIdToken();
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Unauthorized');

  const url = `${API_BASE}${endpoint}`;
  
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  } else {
    headers.delete('Content-Type');
  }

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    let message = response.statusText;
    try {
      const errorData = await response.json();
      message = errorData.error || errorData.message || message;
    } catch (e) {}
    if (response.status === 403) {
      throw new Error('Forbidden: ' + message);
    }
    throw new Error(message || 'API Error');
  }
  
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

export type PaginatedResponse<T> = {
  items: T[];
  nextCursor?: string;
  total?: number;
};

// Types
export type AdminSession = { role: 'admin' | 'super_admin' };
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
export type User = { id: string; email: string; nameAr?: string; nameEn?: string; suspensionStatus?: string; createdAt?: string; role?: string } & TrustFields;
export type Equipment = { id: string; titleAr?: string; titleEn?: string; ownerUid: string; moderationStatus?: string; isActive?: boolean; rate?: number };
export type Provider = User;
export type Request = { id: string; status: string; customerUid: string; providerUid: string; paymentState?: string; totalAmount?: number; events?: any[] } & TrustFields;
export type Payment = { id: string; state: string; amount: number; vatAmount?: number; platformFee?: number; providerReference?: string; invoiceId?: string; events?: any[] } & TrustFields;
export type Invoice = { id: string; invoiceNumber?: string; totalAmount?: number; status: string; customerId?: string; providerId?: string; url?: string };
export type Refund = { id: string; state?: string; amount: number; requestId?: string; originalPaymentId?: string };
export type Complaint = { id: string; status: string; description: string; customerUid: string; providerUid?: string; requestId?: string } & TrustFields;
export type ProviderConfig = { id: string; providerId?: string; enabled?: boolean; environment?: string; settings?: Record<string, any> };
export type VersionedConfig = { id: string; version: string; data?: any; key?: string };
export type AuditEntry = { id: string; actorUid: string; action: string; targetType: string; targetId: string; before?: any; after?: any; reason?: string; timestamp: string };
export type OverviewMetrics = { totalUsers: number; activeProviders: number; activeRequests: number; payments: number; equipmentListings: number; invoices: number; openComplaints: number };
export type OverviewResponse = { success: boolean; metrics: OverviewMetrics };

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

export function useListQuery<T>(key: string, endpoint: string, params: Record<string, any> = {}) {
  return useQuery({
    queryKey: [key, params],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') searchParams.set(k, String(v));
      });
      const qs = searchParams.toString();
      return fetchApi<PaginatedResponse<T>>(`${endpoint}${qs ? '?' + qs : ''}`);
    },
  });
}

export function useUsers(params: Record<string, any> = {}) { return useListQuery<User>('users', '/users', params); }
export function useProviders(params: Record<string, any> = {}) { return useListQuery<Provider>('providers', '/providers', params); }
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
export function useAudit(params: Record<string, any> = {}) { return useListQuery<AuditEntry>('audit', '/audit', params); }

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