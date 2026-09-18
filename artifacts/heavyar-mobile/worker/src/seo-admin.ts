import { applySeoChange, checkSeoConfig, defaultSeoConfig, emptySeoState, resolveSeo, SEO_REGISTRY, validateSeoConfig } from './seo';
import type { SeoAdminView, SeoChange, SeoCommand, SeoPermissions, SeoState, SeoVersion } from './seo-types';

export interface SeoRecord<T = unknown> { data: T; updateTime?: string }
export interface SeoStore {
  read(collection: 'seoSettings' | 'seoVersions', id: string): Promise<SeoRecord | null>;
  save(prior: SeoRecord<SeoState> | null, versions: Map<string, SeoRecord<SeoVersion>>, change: SeoChange): Promise<void>;
}
export class SeoPersistenceError extends Error {
  constructor(message: string, public status: 409 | 503 = 503) { super(message); }
}
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
export function seoState(value: unknown): SeoState {
  const state = value as SeoState;
  if (!state || !Number.isSafeInteger(state.revision) || state.revision < 0 ||
      !Array.isArray(state.versions) || state.versions.length > 100 ||
      state.versions.some(v => !v || !idPattern.test(v.id) || !['draft', 'published', 'archived'].includes(v.status)) ||
      new Set(state.versions.map(v => v.id)).size !== state.versions.length ||
      [state.draftId, state.currentPublishedId].some(id => id !== null && (!idPattern.test(id) || !state.versions.some(v => v.id === id))) ||
      state.versions.filter(v => v.status === 'draft').length > 1 ||
      state.versions.filter(v => v.status === 'published').length > 1 ||
      (state.draftId !== null && state.versions.find(v => v.id === state.draftId)?.status !== 'draft') ||
      (state.currentPublishedId !== null && state.versions.find(v => v.id === state.currentPublishedId)?.status !== 'published')) {
    throw new SeoPersistenceError('Stored SEO configuration is unavailable.');
  }
  return state;
}
export async function readSeoState(store: Pick<SeoStore, 'read'>) {
  const record = await store.read('seoSettings', 'state');
  return { prior: record ? { ...record, data: seoState(record.data) } : null, state: record ? seoState(record.data) : emptySeoState() };
}
export async function readSeoVersion(store: Pick<SeoStore, 'read'>, state: SeoState, id: string): Promise<SeoRecord<SeoVersion>> {
  if (!idPattern.test(id) || !state.versions.some(v => v.id === id)) throw new Error('Unknown SEO version.');
  const version = await store.read('seoVersions', id);
  const data = version?.data as SeoVersion | undefined;
  if (!data || data.id !== id || !['draft', 'published', 'archived'].includes(data.status)) {
    throw new SeoPersistenceError('Stored SEO version is unavailable.');
  }
  validateSeoConfig(data.config);
  return { ...version!, data };
}
async function body(req: Request) {
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > 130_000) throw new Error('SEO request is too large.');
  let value: any;
  try { value = JSON.parse(text); } catch { throw new Error('Invalid SEO request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid SEO request.');
  return value;
}
export async function handleSeoAdmin(req: Request, store: SeoStore, actor: SeoPermissions & { uid: string }) {
  if (!actor.uid || !actor.canRead) return { status: 403, error: 'SEO read permission required.', errorCode: 'SEO_FORBIDDEN' };
  const url = new URL(req.url);
  const route = url.pathname.slice('/api/admin/seo'.length);
  if (!['', '/preview', '/version'].includes(route)) return { status: 404, error: 'Not found.' };
  if ((route === '/preview' && req.method !== 'POST') || (route === '/version' && req.method !== 'GET') ||
      (route === '' && !['GET', 'POST'].includes(req.method))) return { status: 405, error: 'Method not allowed.' };
  try {
    const { prior, state } = await readSeoState(store);
    const versions = new Map<string, SeoRecord<SeoVersion>>();
    const read = async (id: string) => {
      if (!versions.has(id)) versions.set(id, await readSeoVersion(store, state, id));
      return versions.get(id)!.data;
    };
    const view = async (nextState = state): Promise<SeoAdminView> => ({
      success: true, state: nextState,
      draft: nextState.draftId ? await read(nextState.draftId) : null,
      published: nextState.currentPublishedId ? await read(nextState.currentPublishedId) : null,
      defaults: defaultSeoConfig(), registry: SEO_REGISTRY,
      permissions: { canRead: actor.canRead, canEdit: actor.canEdit, canPublish: actor.canPublish },
    });
    if (route === '/version') return { success: true, version: await read(url.searchParams.get('id') || '') };
    if (route === '' && req.method === 'GET') return await view();
    const input = await body(req);
    if (route === '/preview') {
      if (Object.keys(input).some(key => !['config', 'versionId'].includes(key)) ||
          Boolean(input.config) === Boolean(input.versionId)) throw new Error('Provide either a draft configuration or a version.');
      const config = input.config || (await read(input.versionId)).config;
      const issues = checkSeoConfig(config);
      return { success: true, issues, pages: issues.some(issue => issue.severity === 'error') ? [] : resolveSeo(config) };
    }
    const publish = input.action === 'publish' || input.action === 'republish';
    if (publish ? !actor.canPublish : !actor.canEdit) return { status: 403, error: 'SEO modification permission required.', errorCode: 'SEO_FORBIDDEN' };
    const allowed = input.action === 'edit' ? ['action', 'expectedRevision', 'versionId', 'reason', 'config']
      : input.action === 'create' ? ['action', 'expectedRevision', 'reason', 'sourceVersionId']
        : ['action', 'expectedRevision', 'versionId', 'reason'];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Unsupported SEO command field.');
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) {
      return { status: 412, error: 'SEO configuration changed. Reload before confirming.', errorCode: 'VERSION_PRECONDITION_FAILED', revision: state.revision };
    }
    for (const id of new Set([state.currentPublishedId, state.draftId, input.versionId, input.sourceVersionId].filter(Boolean))) await read(id);
    const change = applySeoChange(state, Object.fromEntries([...versions].map(([id, record]) => [id, record.data])), input as SeoCommand, actor.uid, new Date().toISOString());
    // Firestore's 1MB document limit is not a reason to discard history or audit.
    if (new TextEncoder().encode(JSON.stringify(change.audit)).byteLength > 650_000) throw new Error('SEO audit payload capacity exceeded.');
    await store.save(prior, versions, change);
    for (const version of change.writes) versions.set(version.id, { data: version });
    return await view(change.state);
  } catch (error) {
    if (error instanceof SeoPersistenceError) return { status: error.status, error: error.message, errorCode: error.status === 409 ? 'VERSION_PRECONDITION_FAILED' : 'SEO_UNAVAILABLE' };
    return { status: 400, error: error instanceof Error ? error.message : 'Invalid SEO configuration.', errorCode: 'SEO_INVALID' };
  }
}