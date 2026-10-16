import { request, WorkerError } from './workerClient';
import { QuoteComparisonScopeGuard } from './serviceQuoteComparison';
import { currencyMinorDigits, formatMinorCurrency } from './listingPricing';

export type CustomerProject = {
  projectId: string;
  title: string;
  description: string;
  status: 'active' | 'archived';
  revision: number;
  requestCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CustomerProjectSource = {
  sourceKind: 'rental' | 'service_rfq';
  sourceId: string;
  titleAr: string;
  titleEn: string;
  providerLabelAr: string;
  providerLabelEn: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  financial: {
    state: 'estimate' | 'paid' | 'final' | 'pending_quote' | 'provisional_non_binding' | 'unavailable';
    currency: 'SAR' | 'AED' | 'QAR' | 'KWD' | 'BHD' | 'OMR' | null;
    currencyDecimals: 2 | 3 | null;
    amountMinor: number | null;
  };
  route: string | null;
};

export type CustomerProjectLink = {
  linkId: string;
  projectId: string;
  sourceKind: CustomerProjectSource['sourceKind'];
  sourceId: string;
  createdAt: string;
  item: CustomerProjectSource;
};

export type EligibleProjectSource = CustomerProjectSource & { linkedProjectId: string | null };

const PROJECT_ID = /^project_[A-Za-z0-9_-]{43}$/;
const LINK_ID = /^project_link_[A-Za-z0-9_-]{43}$/;
const SOURCE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const GCC_CURRENCIES = new Set(['SAR', 'AED', 'QAR', 'KWD', 'BHD', 'OMR']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function date(value: unknown) { return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value)) ? value : null; }

export function decodeCustomerProject(value: unknown): CustomerProject {
  const raw = record(value);
  if (!raw || Object.keys(raw).some(key => !['projectId', 'title', 'description', 'status', 'revision', 'requestCount', 'createdAt', 'updatedAt'].includes(key)) ||
      typeof raw.projectId !== 'string' || !PROJECT_ID.test(raw.projectId) || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 80 ||
      typeof raw.description !== 'string' || raw.description.length > 300 || !['active', 'archived'].includes(String(raw.status)) ||
      !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 || !Number.isSafeInteger(raw.requestCount) || Number(raw.requestCount) < 0 ||
      !date(raw.createdAt) || !date(raw.updatedAt)) throw new WorkerError('Invalid project response', 502, 'INVALID_CUSTOMER_PROJECT_RESPONSE');
  return raw as CustomerProject;
}

function decodeSource(value: unknown): CustomerProjectSource {
  const raw = record(value), financial = record(raw?.financial);
  const sourceKind = raw?.sourceKind, sourceId = raw?.sourceId;
  if (!raw || Object.keys(raw).some(key => !['sourceKind', 'sourceId', 'titleAr', 'titleEn', 'providerLabelAr', 'providerLabelEn', 'status', 'startAt', 'endAt', 'financial', 'route', 'linkedProjectId'].includes(key)) ||
      !['rental', 'service_rfq'].includes(String(sourceKind)) || typeof sourceId !== 'string' || !SOURCE_ID.test(sourceId) ||
      sourceKind === 'service_rfq' && !/^rfq_[A-Za-z0-9_-]{43}$/.test(sourceId) ||
      typeof raw.titleAr !== 'string' || !raw.titleAr || raw.titleAr.length > 160 || typeof raw.titleEn !== 'string' || !raw.titleEn || raw.titleEn.length > 160 ||
      typeof raw.providerLabelAr !== 'string' || !raw.providerLabelAr || raw.providerLabelAr.length > 120 ||
      typeof raw.providerLabelEn !== 'string' || !raw.providerLabelEn || raw.providerLabelEn.length > 120 || typeof raw.status !== 'string' || raw.status.length > 80 ||
      raw.startAt !== null && !date(raw.startAt) || raw.endAt !== null && !date(raw.endAt) ||
      !financial || Object.keys(financial).some(key => !['state', 'currency', 'currencyDecimals', 'amountMinor'].includes(key)) ||
      !['estimate', 'paid', 'final', 'pending_quote', 'provisional_non_binding', 'unavailable'].includes(String(financial.state)) ||
      (['pending_quote', 'unavailable'].includes(String(financial.state))
        ? financial.currency !== null || financial.currencyDecimals !== null || financial.amountMinor !== null
        : typeof financial.currency !== 'string' || !GCC_CURRENCIES.has(financial.currency) ||
          financial.currencyDecimals !== currencyMinorDigits(String(financial.currency)) ||
          !Number.isSafeInteger(financial.amountMinor) || Number(financial.amountMinor) < 0) ||
      raw.route !== null && (typeof raw.route !== 'string' || !raw.route.startsWith('/'))) {
    throw new WorkerError('Invalid project source response', 502, 'INVALID_CUSTOMER_PROJECT_RESPONSE');
  }
  return raw as CustomerProjectSource;
}

export function formatCustomerProjectMoney(financial: CustomerProjectSource['financial'], language: 'ar' | 'en') {
  if (financial.amountMinor === null || financial.currency === null || financial.currencyDecimals === null ||
      financial.currencyDecimals !== currencyMinorDigits(financial.currency)) return '';
  return formatMinorCurrency(financial.amountMinor, financial.currency, language, true);
}

function decodeProjectEnvelope(value: unknown) {
  const raw = record(value);
  if (!raw || raw.success !== true) throw new WorkerError('Invalid project response', 502, 'INVALID_CUSTOMER_PROJECT_RESPONSE');
  return decodeCustomerProject(raw.project);
}

export function decodeCustomerProjectList(value: unknown) {
  const raw = record(value);
  if (!raw || raw.success !== true || !Array.isArray(raw.projects) || raw.projects.length > 20 ||
      raw.nextCursor !== null && (typeof raw.nextCursor !== 'string' || !PROJECT_ID.test(raw.nextCursor))) {
    throw new WorkerError('Invalid project list response', 502, 'INVALID_CUSTOMER_PROJECT_RESPONSE');
  }
  return { projects: raw.projects.map(decodeCustomerProject), nextCursor: raw.nextCursor as string | null };
}

export function decodeCustomerProjectLinks(value: unknown) {
  const raw = record(value);
  if (!raw || raw.success !== true || !Array.isArray(raw.links) || raw.links.length > 20 ||
      raw.nextCursor !== null && (typeof raw.nextCursor !== 'string' || !LINK_ID.test(raw.nextCursor))) {
    throw new WorkerError('Invalid project links response', 502, 'INVALID_CUSTOMER_PROJECT_RESPONSE');
  }
  const links = raw.links.map(item => {
    const link = record(item);
    if (!link || typeof link.linkId !== 'string' || !LINK_ID.test(link.linkId) || typeof link.projectId !== 'string' || !PROJECT_ID.test(link.projectId) ||
        !['rental', 'service_rfq'].includes(String(link.sourceKind)) || typeof link.sourceId !== 'string' || !SOURCE_ID.test(link.sourceId) || !date(link.createdAt)) {
      throw new WorkerError('Invalid project links response', 502, 'INVALID_CUSTOMER_PROJECT_RESPONSE');
    }
    const source = decodeSource(link.item);
    if (source.sourceKind !== link.sourceKind || source.sourceId !== link.sourceId) throw new WorkerError('Invalid project links response', 502, 'INVALID_CUSTOMER_PROJECT_RESPONSE');
    return { ...link, item: source } as CustomerProjectLink;
  });
  return { links, nextCursor: raw.nextCursor as string | null };
}

export function decodeEligibleProjectSources(value: unknown) {
  const raw = record(value);
  if (!raw || raw.success !== true || !Array.isArray(raw.items) || raw.items.length > 20 ||
      raw.nextCursor !== null && (typeof raw.nextCursor !== 'string' || !SOURCE_ID.test(raw.nextCursor))) {
    throw new WorkerError('Invalid eligible project sources', 502, 'INVALID_CUSTOMER_PROJECT_RESPONSE');
  }
  return { items: raw.items.map(item => {
    const source = decodeSource(item), linkedProjectId = record(item)?.linkedProjectId;
    if (linkedProjectId !== null && (typeof linkedProjectId !== 'string' || !PROJECT_ID.test(linkedProjectId))) throw new WorkerError('Invalid eligible project sources', 502, 'INVALID_CUSTOMER_PROJECT_RESPONSE');
    return { ...source, linkedProjectId } as EligibleProjectSource;
  }), nextCursor: raw.nextCursor as string | null };
}

export function customerProjectOperationKey(scope: string) {
  const safe = scope.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32) || 'project';
  return `${safe}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 14)}`;
}

export function customerProjectScheduleConflicts(items: CustomerProjectSource[]) {
  const scheduled = items.flatMap(item => item.startAt && item.endAt && Date.parse(item.startAt) < Date.parse(item.endAt) && !['cancelled', 'expired', 'completed', 'rejected'].includes(item.status)
    ? [{ sourceId: item.sourceId, start: Date.parse(item.startAt), end: Date.parse(item.endAt) }] : []);
  scheduled.sort((left, right) => left.start - right.start || left.end - right.end);
  const conflicts = new Set<string>();
  let latestEnd = Number.NEGATIVE_INFINITY;
  let latestEndSourceId: string | null = null;
  for (const interval of scheduled) {
    if (latestEndSourceId && interval.start < latestEnd) {
      conflicts.add(latestEndSourceId);
      conflicts.add(interval.sourceId);
    }
    if (interval.end > latestEnd) {
      latestEnd = interval.end;
      latestEndSourceId = interval.sourceId;
    }
  }
  return conflicts;
}

export async function createCustomerProject(title: string, description: string, idempotencyKey: string, uid: string, signal?: AbortSignal) {
  return decodeProjectEnvelope(await request('/api/customer-projects', { method: 'POST', body: JSON.stringify({ title, description, idempotencyKey }), signal }, true, uid));
}
export async function listCustomerProjects(uid: string, cursor?: string, signal?: AbortSignal) {
  return decodeCustomerProjectList(await request(`/api/customer-projects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }, true, uid));
}
export async function getCustomerProject(projectId: string, uid: string, signal?: AbortSignal) {
  return decodeProjectEnvelope(await request(`/api/customer-projects/${encodeURIComponent(projectId)}`, { signal }, true, uid));
}
export async function updateCustomerProject(project: CustomerProject, patch: Pick<CustomerProject, 'title' | 'description' | 'status'>, idempotencyKey: string, uid: string, signal?: AbortSignal) {
  return decodeProjectEnvelope(await request(`/api/customer-projects/${encodeURIComponent(project.projectId)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, expectedRevision: project.revision, idempotencyKey }), signal }, true, uid));
}
export async function listCustomerProjectLinks(projectId: string, uid: string, cursor?: string, signal?: AbortSignal) {
  return decodeCustomerProjectLinks(await request(`/api/customer-projects/${encodeURIComponent(projectId)}/links${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }, true, uid));
}
export async function listEligibleProjectSources(kind: CustomerProjectSource['sourceKind'], uid: string, cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ kind }); if (cursor) query.set('cursor', cursor);
  return decodeEligibleProjectSources(await request(`/api/customer-projects/eligible-sources?${query}`, { signal }, true, uid));
}
export async function attachCustomerProjectSource(project: CustomerProject, source: CustomerProjectSource, idempotencyKey: string, uid: string, signal?: AbortSignal) {
  return decodeProjectEnvelope(await request(`/api/customer-projects/${encodeURIComponent(project.projectId)}/links`, { method: 'POST', body: JSON.stringify({ sourceKind: source.sourceKind, sourceId: source.sourceId, expectedRevision: project.revision, idempotencyKey }), signal }, true, uid));
}
export async function detachCustomerProjectSource(project: CustomerProject, linkId: string, idempotencyKey: string, uid: string, signal?: AbortSignal) {
  return decodeProjectEnvelope(await request(`/api/customer-projects/${encodeURIComponent(project.projectId)}/links/${encodeURIComponent(linkId)}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision: project.revision, idempotencyKey }), signal }, true, uid));
}

export class CustomerProjectScopeGuard extends QuoteComparisonScopeGuard {}
