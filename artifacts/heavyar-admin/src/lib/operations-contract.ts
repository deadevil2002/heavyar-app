import type { Permission, StaffRole } from './permissions';
import { hasPermission } from './permissions';

export function candidatePageEmptyLabel(hasNext: boolean, language: string) {
  if (!hasNext) return '';
  return language === 'ar'
    ? 'لا توجد نتائج مطابقة في هذه الصفحة. تابع البحث في الصفحة التالية.'
    : 'No matches on this page. Continue searching on the next page.';
}

/** Normalizes table search/filter state before it reaches a list endpoint. */
export function adminListParams(params: Record<string, unknown>) {
  const output: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    output[key === 'search' ? 'q' : key] = String(value);
  });
  return output;
}

export function adminExportEndpoint(entity: string, scope: 'current_page' | 'all_filtered', filters: Record<string, unknown> = {}) {
  const query = new URLSearchParams({ scope, ...adminListParams(filters) });
  return `/exports/${encodeURIComponent(entity)}.xlsx?${query.toString()}`;
}

export function adminDetailEndpoint(resource: string, id: string) {
  return `/detail/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`;
}

export function adminActionPayload(action: string, targetType: string, targetId: string, reason: string, payload: Record<string, unknown> = {}) {
  return { action, targetType, targetId, reason, payload };
}

export type GatewayContractRow = {
  id?: string;
  key?: string;
  provider?: string;
  methods?: string[];
  supportedMethods?: string[];
  [key: string]: unknown;
};

/** Accepts both gateway response aliases and supplies the stable fields used by gateway cards. */
export function normalizeGatewayRows(response: { gateways?: unknown; items?: unknown }) {
  const source = Array.isArray(response.gateways)
    ? response.gateways
    : Array.isArray(response.items)
      ? response.items
      : [];

  return source
    .filter((row): row is GatewayContractRow => Boolean(row && typeof row === 'object'))
    .map((row) => ({
      ...row,
      id: String(row.id || row.key || row.provider || ''),
      provider: String(row.provider || row.key || row.id || ''),
      supportedMethods: Array.isArray(row.supportedMethods)
        ? row.supportedMethods
        : Array.isArray(row.methods)
          ? row.methods
          : [],
    }))
    .filter((row) => Boolean(row.id));
}

export function roleCanRenderAction(role: StaffRole | undefined, permission: Permission) {
  return hasPermission(role, permission);
}