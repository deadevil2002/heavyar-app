import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './api';
import type { 
  SeoAdminView, 
  SeoCommand, 
  SeoVersion, 
  SeoPreview, 
  SeoConfig,
  SeoState
} from '../../../heavyar-mobile/worker/src/seo-types';

export function useSeoAdminView() {
  return useQuery({
    queryKey: ['seoAdminView'],
    queryFn: () => fetchApi<SeoAdminView>('/seo'),
    refetchInterval: false, // Load/focus/mutation driven; server revision guards conflicts.
  });
}

export function useSeoVersion(id?: string) {
  return useQuery({
    queryKey: ['seoVersion', id],
    queryFn: () => fetchApi<{success: true, version: SeoVersion}>(`/seo/version?id=${id}`),
    enabled: !!id,
  });
}

export function useSeoPreviewMutation() {
  return useMutation({
    mutationFn: (data: { config?: SeoConfig, versionId?: string }) => 
      fetchApi<SeoPreview>('/seo/preview', { method: 'POST', body: JSON.stringify(data) })
  });
}

export function useSeoCommandMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SeoCommand) => 
      fetchApi<SeoAdminView>('/seo', { method: 'POST', body: JSON.stringify(data) }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['seoAdminView'] });
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(['seoAdminView'], data);
      await queryClient.invalidateQueries({ queryKey: ['seoAdminView'] });
    }
  });
}
