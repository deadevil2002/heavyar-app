import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, PaginatedResponse } from './api';

export type EarlyAccessConfig = {
  enabled: boolean;
  updatedAt: string;
  revision: number;
  retentionDays: number;
};

export type EarlyAccessPermissions = {
  read: boolean;
  manage: boolean;
  configure: boolean;
  testSend: boolean;
  approve: boolean;
  send: boolean;
};

export type EarlyAccessConfigResponse = {
  config: EarlyAccessConfig;
  permissions: EarlyAccessPermissions;
};

export type Subscriber = {
  id: string;
  email: string;
  name?: string;
  country?: string;
  language?: string;
  status: 'active' | 'unsubscribed' | 'anonymized';
  consentMarketing: boolean;
  consentAt?: string;
  consentSource?: string;
  createdAt: string;
  updatedAt: string;
  verified: boolean;
  deliveryStatus?: string;
  unsubscribedAt?: string;
};

export type Campaign = {
  id: string;
  name: string;
  subjectAr: string;
  subjectEn: string;
  bodyAr: string;
  bodyEn: string;
  createdAt: string;
  updatedAt: string;
  status?: string;
  revision?: number;
  previewId?: string;
};

export type CampaignRecipient = {
  id: string;
  email: string;
  name?: string;
  businessName?: string;
  language?: string;
  country?: string;
  source: 'subscriber' | 'csv_import' | string;
  deliveryStatus: 'not_sent' | 'queued' | 'accepted' | 'delivered' | 'failed' | 'bounced' | 'complained' | 'suppressed' | 'skipped' | string;
  attempts?: number;
  providerMessageId?: string | null;
  retryEligible?: boolean;
  lawfulBasisConfirmed?: boolean | null;
  updatedAt?: string;
};

export type CampaignProgress = {
  campaignId: string;
  status: string;
  audience: number;
  notSent: number;
  queued: number;
  accepted: number;
  delivered: number;
  failed: number;
  bounced: number;
  complained: number;
  suppressed: number;
  skipped: number;
  remaining: number;
  finalRecipientCount: number;
  finalRecipientIds: string[];
  completedAt?: string | null;
  sendCompletedAt?: string | null;
};

export type CsvPreview = {
  headers: string[];
  contacts: Array<Record<string, string>>;
  rejected: Array<{ row?: number; reason: string; email?: string }>;
  totalRows: number;
  snapshot?: { added: number; duplicate: number };
};

export type PreviewResponse = {
  previewId: string;
  recipientCount: number;
  excludedCount: number;
  byLanguage: Record<string, number>;
  byCountry: Record<string, number>;
  exclusionReasons?: Record<string, number>;
  htmlAr: string;
  htmlEn: string;
  expiresAt: string;
};

export function useEarlyAccessConfig() {
  return useQuery({
    queryKey: ['early-access', 'config'],
    queryFn: () => fetchApi<EarlyAccessConfigResponse>('/early-access/config'),
    retry: false,
  });
}

export function useUpdateEarlyAccessConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { enabled: boolean; revision: number }) =>
      fetchApi<EarlyAccessConfigResponse>('/early-access/config', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['early-access', 'config'], data);
    },
  });
}

export function buildSubscribersQuery(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  });
  return `/early-access/subscribers?${searchParams.toString()}`;
}

export function buildCampaignsQuery(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  });
  return `/early-access/campaigns?${searchParams.toString()}`;
}

export function buildPreviewPayload(
  id: string,
  subscriberIds: Set<string>,
  language?: string,
  country?: string,
  recipientIds: Set<string> = new Set(),
  selectAllRecipients = false,
  recipientFilters: Record<string, string> = {},
) {
  return {
    id,
    subscriberIds: Array.from(subscriberIds),
    ...(selectAllRecipients
      ? { selectAllRecipients: true as const, recipientFilters }
      : { recipientIds: Array.from(recipientIds) }),
    language,
    country,
  };
}

export function buildTestPayload(id: string, previewId: string, baseIdempotencyKey: string, language: string) {
  return {
    id,
    previewId,
    idempotencyKey: `${baseIdempotencyKey}-${language}`,
    confirm: true,
    language
  };
}

export function buildImportPayload(csv: string, filename: string, confirm = false, lawfulBasisConfirmed = false) {
  return {
    csv,
    filename,
    confirm,
    ...(confirm && lawfulBasisConfirmed ? { lawfulBasisConfirmed: true as const } : {}),
  };
}

export function buildSnapshotPayload(
  selectedIds: Set<string>,
  filters?: Record<string, string>,
  selectAll = false,
) {
  return selectAll
    ? { selectAll: true, filters: filters || {} }
    : { subscriberIds: Array.from(selectedIds) };
}

export function buildRetryPayload(recipientIds: string[] = [], allEligible = false) {
  if (allEligible) return { allEligible: true as const };
  return { recipientIds };
}

export function useEarlyAccessSubscribers(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['early-access', 'subscribers', params],
    queryFn: () => fetchApi<PaginatedResponse<Subscriber>>(buildSubscribersQuery(params)),
  });
}

export function useSubscriberAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'unsubscribe' | 'anonymize'; reason: string }) =>
      fetchApi<{ success: boolean }>(`/early-access/subscribers/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-access', 'subscribers'] });
    },
  });
}

export function useEarlyAccessCampaigns(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['early-access', 'campaigns', params],
    queryFn: () => fetchApi<PaginatedResponse<Campaign>>(buildCampaignsQuery(params)),
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Campaign>) =>
      fetchApi<{ campaign: Campaign }>('/early-access/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-access', 'campaigns'] });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Campaign> & { id: string }) =>
      fetchApi<{ campaign: Campaign }>(`/early-access/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['early-access', 'campaigns'] });
    },
  });
}

export function usePreviewCampaign() {
  return useMutation({
    mutationFn: ({ id, subscriberIds, recipientIds, selectAllRecipients, recipientFilters, language, country }: { id: string; subscriberIds: string[]; recipientIds?: string[]; selectAllRecipients?: true; recipientFilters?: Record<string, string>; language?: string; country?: string }) =>
      fetchApi<PreviewResponse>(`/early-access/campaigns/${id}/preview`, {
        method: 'POST',
        body: JSON.stringify({ subscriberIds, ...(selectAllRecipients ? { selectAllRecipients, recipientFilters } : { recipientIds }), language, country }),
      }),
  });
}

export function useTestCampaign() {
  return useMutation({
    mutationFn: ({ id, previewId, idempotencyKey, confirm, language }: { id: string; previewId: string; idempotencyKey: string; confirm: boolean; language: string }) =>
      fetchApi<{ success: boolean; deliveryStatus: string }>(`/early-access/campaigns/${id}/test`, {
        method: 'POST',
        body: JSON.stringify({ previewId, idempotencyKey, confirm, language }),
      }),
  });
}

export function useApproveCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, previewId, confirm }: { id: string; previewId: string; confirm: boolean }) =>
      fetchApi<{ campaign: Campaign }>(`/early-access/campaigns/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ previewId, confirm }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-access', 'campaigns'] });
    },
  });
}

export function useImportCampaign(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { csv: string; filename: string; confirm: boolean; lawfulBasisConfirmed?: true }) =>
      fetchApi<{ importId: string; preview: CsvPreview }>(`/early-access/campaigns/${campaignId}/import`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['early-access', 'campaigns', campaignId] }),
  });
}

export function useCampaignSnapshot(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReturnType<typeof buildSnapshotPayload>) =>
      fetchApi<{ snapshot: { added: number; duplicate: number } }>(`/early-access/campaigns/${campaignId}/snapshot`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['early-access', 'campaign', campaignId, 'recipients'] }),
  });
}

export function useCampaignRecipients(campaignId: string, params: Record<string, any> = {}, poll = false) {
  return useQuery({
    queryKey: ['early-access', 'campaign', campaignId, 'recipients', params],
    queryFn: () => fetchApi<PaginatedResponse<CampaignRecipient>>(
      `/early-access/campaigns/${campaignId}/recipients?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`,
    ),
    enabled: true,
    refetchInterval: poll ? 30000 : false,
  });
}

export function useCampaignProgress(campaignId: string) {
  return useQuery({
    queryKey: ['early-access', 'campaign', campaignId, 'progress'],
    queryFn: () => fetchApi<CampaignProgress>(`/early-access/campaigns/${campaignId}/progress`),
    refetchInterval: (query) => {
      const progress = query.state.data;
      return progress?.status === 'queued' ? 30000 : false;
    },
  });
}

export function useSendCampaign(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { previewId: string; confirm: true; lawfulBasisConfirmed?: true }) =>
      fetchApi<{ success: boolean; status: string; recipientCount: number; selected?: number; queued?: number; skipped?: number }>(`/early-access/campaigns/${campaignId}/send`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['early-access', 'campaigns'] }),
  });
}

export function useRetryCampaign(campaignId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { recipientIds?: string[]; allEligible?: true }) =>
      fetchApi<{ selected: number; queued: number; skipped: number }>(`/early-access/campaigns/${campaignId}/retry`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['early-access', 'campaign', campaignId, 'recipients'] });
      queryClient.invalidateQueries({ queryKey: ['early-access', 'campaigns'] });
    },
  });
}
