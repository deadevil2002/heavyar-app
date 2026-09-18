import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, fetchApiBinary, downloadBlob, API_BASE, fetchAuthenticatedPublic } from './api';
import { adminActionPayload, adminDetailEndpoint, adminExportEndpoint, normalizeGatewayRows } from './operations-contract';
import { SafeApiError } from './error-messages';
import { cancellationPayload, invitationId } from './invitation-contract';
import { invitationRefreshKeys, refreshQueries } from './admin-feedback';

// --- Staff & Permissions ---

export type StaffMember = {
  id: string;
  email: string;
  nameAr?: string;
  nameEn?: string;
  role: string;
  status: 'active' | 'revoked' | 'suspended';
  active?: boolean;
  roleVersion?: number;
};

export type StaffInvitation = {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'expired' | 'accepted' | 'cancelled' | 'revoked';
  createdAt: string;
  expiresAt?: string;
  deliveryStatus?: 'queued' | 'accepted' | 'delivered' | 'failed' | 'bounced' | 'not_configured';
  lastDeliveryError?: string;
  invitedBy?: { uid?: string; email?: string; name?: string } | string;
  inviterUid?: string;
  inviterEmail?: string;
  acceptedAt?: string;
  cancelledAt?: string;
  acceptedByUid?: string;
  accountUid?: string;
  accountStatus?: string;
  maskedEmail?: string;
};

export type PublicInvitationDetails = StaffInvitation & {
  claimsStatus?: 'ready' | 'pending' | 'failed';
  canAccept?: boolean;
};

async function fetchPublic<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE.replace(/\/api\/admin$/, '')}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new SafeApiError(body, response.status);
  return body;
}

export function useStaff(params: Record<string, any> = {}) {
  const searchParams = new URLSearchParams(params as Record<string, string>);
  const qs = searchParams.toString();
  return useQuery({
    queryKey: ['staff', params],
    queryFn: async () => {
      const response = await fetchApi<{ success: boolean; staff?: StaffMember[]; items?: StaffMember[] }>(`/staff${qs ? '?' + qs : ''}`);
      const staff = (response.staff || response.items || []).map((member) => ({
        ...member,
        status: member.status || (member.active === false ? 'revoked' : 'active'),
      })) as StaffMember[];
      return { ...response, staff };
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useStaffInvitations(params: Record<string, any> = {}) {
  const searchParams = new URLSearchParams(params as Record<string, string>);
  const qs = searchParams.toString();
  return useQuery({
    queryKey: ['staff-invitations', params],
    queryFn: async () => {
      const response = await fetchApi<{ success: boolean; invitations?: StaffInvitation[]; items?: StaffInvitation[] }>(`/staff/invitations${qs ? '?' + qs : ''}`);
      const now = Date.now();
      const invitations = (response.invitations || response.items || []).map((invitation) => ({
        ...invitation,
        status: invitation.status === 'pending' && invitation.expiresAt && Date.parse(invitation.expiresAt) <= now ? 'expired' : invitation.status,
      })) as StaffInvitation[];
      return { ...response, invitations };
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useInviteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; role: string }) => fetchApi('/staff/invite', { method: 'POST', body: JSON.stringify(data) }),
    onSettled: () => refreshQueries(queryClient, invitationRefreshKeys),
  });
}

export function useRevokeStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { uid: string; reason: string }) => fetchApi('/staff/revoke', { method: 'POST', body: JSON.stringify(data) }),
    onSettled: () => refreshQueries(queryClient, invitationRefreshKeys),
  });
}

export function useCancelStaffInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; reason: string }) => fetchApi('/staff/invitations/cancel', { method: 'POST', body: JSON.stringify(cancellationPayload(data)) }),
    onSettled: () => refreshQueries(queryClient, invitationRefreshKeys),
  });
}

export function useResendStaffInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string }) => fetchApi('/staff/invitations/resend', { method: 'POST', body: JSON.stringify({ id: invitationId(data.id) }) }),
    onSettled: () => refreshQueries(queryClient, invitationRefreshKeys),
  });
}

export function useStaffInvitationDetails(id?: string) {
  return useQuery({
    queryKey: ['staff-invitation-details', id],
    queryFn: () => fetchApi<{ success: boolean; invitation: StaffInvitation }>(`/staff/invitations/details?id=${encodeURIComponent(invitationId(id!))}`),
    enabled: Boolean(id),
  });
}

export function usePublicStaffInvitationDetails(token?: string) {
  return useQuery({
    queryKey: ['public-staff-invitation-details', token],
    queryFn: () => fetchPublic<{ success: boolean; invitation: PublicInvitationDetails }>(`/api/staff/invitations/details?token=${encodeURIComponent(token!)}`),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useAcceptStaffInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { token: string }) => fetchAuthenticatedPublic('/api/staff/invitations/accept', { method: 'POST', body: JSON.stringify(data) }),
    onSettled: () => refreshQueries(queryClient, invitationRefreshKeys),
  });
}

// --- Ownership ---

export type OwnershipStatus = {
  ownerUid?: string;
  owner?: { uid?: string; email?: string };
  currentOwner?: { uid?: string; email?: string };
  pendingTransfer?: { email: string; createdAt: string };
};

export function useOwnershipStatus() {
  return useQuery({
    queryKey: ['ownership'],
    queryFn: () => fetchApi<{ success: boolean; ownerUid?: string; owner?: OwnershipStatus['owner']; currentOwner?: OwnershipStatus['currentOwner']; pendingTransfer?: OwnershipStatus['pendingTransfer'] }>('/ownership'),
  });
}

export function useTransferOwnership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; reason?: string }) => fetchApi('/ownership', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownership'] });
    },
  });
}

export function useCancelOwnershipTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { reason?: string }) => fetchApi('/ownership/cancel', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownership'] });
    },
  });
}

export function useAcceptOwnershipTransfer() {
  return useMutation({
    mutationFn: (data: { token: string }) => fetchApi('/ownership/accept', { method: 'POST', body: JSON.stringify(data) }),
  });
}

// --- Identity Integrations (Nafath via Rabet) ---

export type IdentityIntegration = {
  id: string;
  provider: string; // 'nafath_rabet'
  mode: 'sandbox' | 'production';
  status: 'waiting_for_activation' | 'waiting_activation' | 'not_configured' | 'configured' | 'ready' | 'disabled' | 'enabled' | 'error';
  ready?: boolean;
  configured?: Record<string, boolean>;
  settings?: Record<string, any>;
};

export function useIdentityIntegrations() {
  return useQuery({
    queryKey: ['identity-integrations'],
    queryFn: async () => {
      const response = await fetchApi<{ success: boolean; integrations?: Array<IdentityIntegration & { key?: string }>; items?: Array<IdentityIntegration & { key?: string }> }>('/identity-integrations');
      const integrations = (response.integrations || response.items || []).map((integration) => ({
        ...integration,
        id: integration.id || integration.key || 'nafath_rabet',
      }));
      return { ...response, integrations };
    },
  });
}

export function useUpdateIdentityIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { providerId: string; enabled?: boolean; settings?: any }) => fetchApi('/action', {
      method: 'POST',
      body: JSON.stringify({
        action: 'update_identity_integration',
        targetType: 'identityIntegrations',
        targetId: data.providerId,
        reason: 'Updated identity integration availability',
        payload: { enabled: data.enabled },
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['identity-integrations'] });
    },
  });
}

// --- Gateways ---

export type Gateway = {
  id: string;
  provider: string;
  configured: boolean;
  enabled: boolean;
  adapterAvailable?: boolean;
  health?: string;
  environment: string;
  methods?: string[];
  supportedMethods?: string[];
};

export function useGateways() {
  return useQuery({
    queryKey: ['gateways'],
    queryFn: async () => {
      const response = await fetchApi<{ success: boolean; gateways?: Array<Omit<Gateway, 'id'> & { id?: string; key?: string }>; items?: Array<Omit<Gateway, 'id'> & { id?: string; key?: string }> }>('/payment-gateways');
      const gateways = normalizeGatewayRows(response) as Gateway[];
      return { ...response, gateways };
    },
  });
}

export function useUpdateGateway() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { gatewayId: string; enabled: boolean }) => fetchApi('/action', {
      method: 'POST',
      body: JSON.stringify({
        action: 'update_gateway',
        targetType: 'paymentGateway',
        targetId: data.gatewayId,
        reason: 'Updated payment gateway availability',
        payload: { enabled: data.enabled },
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateways'] });
    },
  });
}

// --- Business Configuration ---

export function useBusinessConfig() {
  return useQuery({
    queryKey: ['business-config'],
    queryFn: () => fetchApi<{ success: boolean; item?: any }>(adminDetailEndpoint('heavyarConfig', 'business')),
  });
}

export function useUpdateBusinessConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, string>) => fetchApi('/action', {
      method: 'POST',
      body: JSON.stringify(adminActionPayload('update_config', 'config', 'business', 'Updated structured business configuration', { config })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-config'] });
    },
  });
}

// --- Marketing Campaigns ---

export type Campaign = {
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  targetAudience: string;
  sentAt?: string;
};

export function useCampaigns(params: Record<string, any> = {}) {
  const searchParams = new URLSearchParams(params as Record<string, string>);
  const qs = searchParams.toString();
  return useQuery({
    queryKey: ['campaigns', params],
    queryFn: () => fetchApi<{ success: boolean; items: Campaign[] }>(`/campaigns${qs ? '?' + qs : ''}`),
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => fetchApi('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useExportUrl() {
  return useMutation({
    mutationFn: async (data: { entity: string, filters?: any, scope?: 'current_page' | 'all_filtered' }) => {
      const endpoint = adminExportEndpoint(data.entity, data.scope || 'all_filtered', data.filters || {});
      const { blob, filename } = await fetchApiBinary(endpoint);
      downloadBlob(blob, filename || `${data.entity}_export_${new Date().toISOString()}.xlsx`);
      return true;
    }
  });
}

export function useInvoicePdf() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { blob, filename } = await fetchApiBinary(`/invoices/${invoiceId}.pdf`);
      downloadBlob(blob, filename || `invoice_${invoiceId}.pdf`);
      return true;
    }
  });
}

