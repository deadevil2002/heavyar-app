import { afterEach, describe, expect, test } from 'bun:test';
import { __adminTest, handleAdmin } from './admin';
import worker, { type Env } from './index';
import { defaultSeoConfig, emptySeoState } from './seo';
import { handleSeoAdmin, type SeoRecord, type SeoStore } from './seo-admin';
import { handleSeoPublic } from './seo-public';
import type { SeoChange, SeoConfig, SeoState, SeoVersion } from './seo-types';

const env = { FIREBASE_PROJECT_ID: 'seo-test-project' } as Env;
const adminRequest = (body?: unknown, path = '/api/admin/seo', method = body === undefined ? 'GET' : 'POST') =>
  new Request(`https://worker.test${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const user = (permissionRole: string, admin = true) => ({
  uid: `seo-${permissionRole}`, admin, role: 'admin' as const, permissionRole, testInjected: true as const,
});
const permissions = { uid: 'seo-owner', canRead: true, canEdit: true, canPublish: true };

function version(id: string, status: SeoVersion['status'], config = defaultSeoConfig(), number = 1): SeoVersion {
  const published = status === 'published';
  return {
    id, version: number, status, config,
    createdAt: '2025-01-01T00:00:00.000Z', createdBy: 'private-creator',
    updatedAt: '2025-01-01T00:00:00.000Z', updatedBy: 'private-editor',
    publishedAt: published ? '2025-01-02T00:00:00.000Z' : null,
    publishedBy: published ? 'private-publisher' : null,
    reason: 'private editorial note', sourceVersionId: null,
  };
}

function stateFor(...versions: SeoVersion[]): SeoState {
  return {
    revision: versions.length,
    currentPublishedId: versions.find(v => v.status === 'published')?.id ?? null,
    draftId: versions.find(v => v.status === 'draft')?.id ?? null,
    versions: versions.map(({ config: _config, ...summary }) => summary),
  };
}

function memoryStore(seed: SeoVersion[] = []) {
  let state = seed.length ? stateFor(...seed) : emptySeoState();
  const versions = new Map(seed.map(v => [v.id, v]));
  const history: SeoChange[] = [];
  const store: SeoStore = {
    async read(collection, id) {
      if (collection === 'seoSettings') return id === 'state' && (state.revision || state.versions.length)
        ? { data: structuredClone(state), updateTime: `state-${state.revision}` } : null;
      const found = versions.get(id);
      return found ? { data: structuredClone(found), updateTime: `version-${found.updatedAt}` } : null;
    },
    async save(_prior, _readVersions, change) {
      state = structuredClone(change.state);
      for (const item of change.writes) versions.set(item.id, structuredClone(item));
      history.push(structuredClone(change));
    },
  };
  return { store, history, get state() { return state; }, versions };
}

afterEach(() => {
  __adminTest.setFirestore(undefined);
  __adminTest.captureCommits(undefined);
});

describe('SEO Admin authority', () => {
  for (const role of ['owner', 'super_admin']) {
    test(`${role} can read, edit and publish`, async () => {
      __adminTest.setFirestore(() => null);
      __adminTest.captureCommits([]);
      const read = await handleAdmin(adminRequest(), env, user(role)) as any;
      expect(read.success).toBe(true);
      expect(read.state.revision).toBe(0);
      expect(JSON.stringify(read.permissions)).toBe(JSON.stringify({ canRead: true, canEdit: true, canPublish: true }));
      expect((await handleAdmin(adminRequest({ action: 'create', expectedRevision: 0, reason: 'Create controlled draft' }), env, user(role)) as any).success).toBe(true);
    });
  }

  test('marketing can edit but cannot publish', async () => {
    __adminTest.setFirestore(() => null);
    __adminTest.captureCommits([]);
    const view = await handleAdmin(adminRequest(), env, user('marketing')) as any;
    expect(JSON.stringify(view.permissions)).toBe(JSON.stringify({ canRead: true, canEdit: true, canPublish: false }));
    expect((await handleAdmin(adminRequest({ action: 'create', expectedRevision: 0, reason: 'Marketing draft' }), env, user('marketing')) as any).success).toBe(true);
    expect((await handleAdmin(adminRequest({ action: 'publish', expectedRevision: 0, versionId: 'seo-v1', reason: 'No' }), env, user('marketing')) as any).status).toBe(403);
  });

  for (const role of ['admin', 'auditor']) {
    test(`${role} is read-only`, async () => {
      __adminTest.setFirestore(() => null);
      expect(JSON.stringify((await handleAdmin(adminRequest(), env, user(role)) as any).permissions))
        .toBe(JSON.stringify({ canRead: true, canEdit: false, canPublish: false }));
      expect((await handleAdmin(adminRequest({ action: 'create', expectedRevision: 0, reason: 'No write' }), env, user(role)) as any).status).toBe(403);
    });
  }

  for (const role of ['support', 'moderator', 'operations', 'finance', 'payouts']) {
    test(`${role} has no SEO access`, async () => {
      expect((await handleAdmin(adminRequest(), env, user(role)) as any).status).toBe(403);
    });
  }

  test('preview requires only read permission and never writes', async () => {
    __adminTest.setFirestore(() => null);
    const commits: any[][] = [];
    __adminTest.captureCommits(commits);
    const result = await handleAdmin(adminRequest({ config: defaultSeoConfig() }, '/api/admin/seo/preview'), env, user('auditor')) as any;
    expect(result.success).toBe(true);
    expect(result.pages.length).toBe(18);
    expect(commits.length).toBe(0);
  });

  test('preview returns quality errors and no resolved pages for an invalid draft', async () => {
    __adminTest.setFirestore(() => null);
    const invalid = defaultSeoConfig();
    invalid.global.siteName = '';
    const result = await handleAdmin(adminRequest({ config: invalid }, '/api/admin/seo/preview'), env, user('auditor')) as any;
    expect(result.success).toBe(true);
    expect(result.pages.length).toBe(0);
    expect(result.issues.some((issue: { severity: string }) => issue.severity === 'error')).toBe(true);
  });
});

describe('SEO lifecycle and persistence', () => {
  test('create, edit, publish, history and republish mutate the actual store with revision CAS', async () => {
    const mem = memoryStore();
    const create = await handleSeoAdmin(adminRequest({ action: 'create', expectedRevision: 0, reason: 'Initial draft' }), mem.store, permissions) as any;
    const draftId = create.state.draftId as string;
    expect(/^seo-v1-[0-9a-f-]{36}$/.test(draftId)).toBe(true);
    expect(create.state.revision).toBe(1);

    const editedConfig = defaultSeoConfig();
    editedConfig.global.siteName = 'Heavyar Edited';
    const edit = await handleSeoAdmin(adminRequest({ action: 'edit', expectedRevision: 1, versionId: draftId, reason: 'Approved copy', config: editedConfig }), mem.store, permissions) as any;
    expect(edit.state.revision).toBe(2);
    expect(edit.draft.config.global.siteName).toBe('Heavyar Edited');

    const publish = await handleSeoAdmin(adminRequest({ action: 'publish', expectedRevision: 2, versionId: draftId, reason: 'Launch' }), mem.store, permissions) as any;
    expect(publish.state.revision).toBe(3);
    expect(publish.state.currentPublishedId).toBe(draftId);
    expect(publish.state.draftId).toBe(null);

    const second = await handleSeoAdmin(adminRequest({ action: 'create', expectedRevision: 3, reason: 'Next draft' }), mem.store, permissions) as any;
    const secondId = second.state.draftId;
    expect(JSON.stringify(mem.state.versions.map(v => v.id))).toBe(JSON.stringify([draftId, secondId]));
    expect((await handleSeoAdmin(adminRequest(undefined, `/api/admin/seo/version?id=${draftId}`), mem.store, permissions) as any).version.status).toBe('published');

    const secondPublish = await handleSeoAdmin(adminRequest({ action: 'publish', expectedRevision: 4, versionId: secondId, reason: 'Second launch' }), mem.store, permissions) as any;
    expect(secondPublish.state.revision).toBe(5);
    expect(mem.versions.get(draftId)?.status).toBe('archived');
    const republish = await handleSeoAdmin(adminRequest({ action: 'republish', expectedRevision: 5, versionId: draftId, reason: 'Rollback' }), mem.store, permissions) as any;
    expect(republish.state.revision).toBe(6);
    expect(republish.state.currentPublishedId === draftId).toBe(false);
    expect(mem.versions.get(republish.state.currentPublishedId)?.sourceVersionId).toBe(draftId);
    expect(JSON.stringify(mem.history.map(x => x.audit.action))).toBe(JSON.stringify([
      'seo_draft_created', 'seo_draft_edited', 'seo_published',
      'seo_draft_created', 'seo_published', 'seo_republished',
    ]));
  });

  test('stale revisions return 412 and storage outage returns 503 without defaults fallback', async () => {
    const published = version('published-1', 'published');
    const mem = memoryStore([published]);
    const stale = await handleSeoAdmin(adminRequest({ action: 'create', expectedRevision: 0, reason: 'Stale' }), mem.store, permissions) as any;
    expect(stale.status).toBe(412);
    expect(stale.errorCode).toBe('VERSION_PRECONDITION_FAILED');
    expect(mem.history.length).toBe(0);
    const draft = version('stale-draft', 'draft');
    const staleEditStore = memoryStore([draft]);
    const staleEdit = await handleSeoAdmin(adminRequest({
      action: 'edit', expectedRevision: 0, versionId: draft.id, reason: 'Stale edit',
      config: defaultSeoConfig(),
    }), staleEditStore.store, permissions) as any;
    expect(staleEdit.status).toBe(412);
    expect(staleEditStore.history.length).toBe(0);
    const outage: SeoStore = { read: async () => { throw new Error('offline'); }, save: async () => { throw new Error('offline'); } };
    __adminTest.setFirestore(() => { throw new Error('offline'); });
    expect((await handleAdmin(adminRequest(), env, user('owner')) as any).status).toBe(503);
    const publicResult = await handleSeoPublic(new Request('https://worker.test/api/seo/published'), outage);
    expect(publicResult.status).toBe(503);
  });

  test('Firestore save is one canonical CAS commit containing versions and existing audit', async () => {
    __adminTest.setFirestore(() => null);
    const initialCommits: any[][] = [];
    __adminTest.captureCommits(initialCommits);
    await handleAdmin(adminRequest({ action: 'create', expectedRevision: 0, reason: 'Atomic initial draft' }), env, user('owner'));
    expect(initialCommits.length).toBe(1);
    expect(initialCommits[0].length).toBe(3);
    expect(initialCommits[0][0].update.name.includes('/documents/seoSettings/state')).toBe(true);
    expect(JSON.stringify(initialCommits[0][0].currentDocument)).toBe(JSON.stringify({ exists: false }));
    expect(/\/documents\/seoVersions\/seo-v1-/.test(initialCommits[0][1].update.name)).toBe(true);
    expect(JSON.stringify(initialCommits[0][1].currentDocument)).toBe(JSON.stringify({ exists: false }));
    expect(initialCommits[0][2].update.name.includes('/documents/adminAudit/')).toBe(true);
    const audit = initialCommits[0][2].update.fields;
    expect(audit.actorUid.stringValue).toBe('seo-owner');
    expect(audit.targetType.stringValue).toBe('seoSettings');
    expect(audit.before.mapValue.fields.state.mapValue.fields.revision.integerValue).toBe('0');
    expect(audit.after.mapValue.fields.state.mapValue.fields.revision.integerValue).toBe('1');
    expect(audit.after.mapValue.fields.scopes.arrayValue.values.length > 0).toBe(true);
    expect(audit.after.mapValue.fields.scopes.arrayValue.values
      .some((item: any) => item.mapValue.fields.scope.stringValue === 'global')).toBe(true);

    const existingDraft = version('draft-existing', 'draft');
    const existingState = stateFor(existingDraft);
    __adminTest.setFirestore((collection, id) => collection === 'seoSettings' && id === 'state' ? existingState
      : collection === 'seoVersions' && id === existingDraft.id ? existingDraft : null);
    const updateCommits: any[][] = [];
    __adminTest.captureCommits(updateCommits);
    const config = defaultSeoConfig();
    config.organization.alternateName = 'Heavyar Arabia';
    await handleAdmin(adminRequest({ action: 'edit', expectedRevision: existingState.revision, versionId: existingDraft.id, reason: 'Metadata correction', config }), env, user('owner'));
    expect(updateCommits.length).toBe(1);
    expect(JSON.stringify(updateCommits[0][0].currentDocument)).toBe(JSON.stringify({ updateTime: 'test-update-time' }));
    expect(JSON.stringify(updateCommits[0][1].currentDocument)).toBe(JSON.stringify({ updateTime: 'test-update-time' }));
  });

  test('malformed stored state fails closed', async () => {
    const malformed = { ...emptySeoState(), revision: -1 };
    __adminTest.setFirestore((collection, id) => collection === 'seoSettings' && id === 'state' ? malformed : null);
    expect((await handleAdmin(adminRequest(), env, user('owner')) as any).status).toBe(503);
    const response = await handleSeoPublic(new Request('https://worker.test/api/seo/published'), {
      read: async () => ({ data: malformed, updateTime: 'bad' }),
    });
    expect(response.status).toBe(503);
  });
});

describe('public published SEO contract', () => {
  test('drafts are isolated and private version/editorial metadata are excluded', async () => {
    const config = defaultSeoConfig();
    config.editorialTopics = ['private roadmap'];
    config.mobileApplication = { ...config.mobileApplication, enabled: false };
    config.faqs = [{
      id: 'disabled-secret', enabled: false, order: 1, pageKey: 'help',
      question: { 'ar-SA': 'سري', en: 'Secret question', default: 'Secret question' },
      answer: { 'ar-SA': 'سري', en: 'Secret answer', default: 'Secret answer' },
    }];
    const published = version('public-v1', 'published', config);
    const draftConfig = defaultSeoConfig();
    draftConfig.global.siteName = 'DRAFT SECRET';
    const draft = version('draft-v2', 'draft', draftConfig, 2);
    const mem = memoryStore([published, draft]);
    const response = await handleSeoPublic(new Request('https://worker.test/api/seo/published'), mem.store);
    const text = await response.text();
    const payload = JSON.parse(text);
    expect(response.status).toBe(200);
    expect(JSON.stringify(payload.version)).toBe(JSON.stringify({ id: published.id, number: 1, publishedAt: published.publishedAt }));
    expect(payload.mobileApplication).toBe(null);
    expect(payload.pages.flatMap((p: any) => p.faqs).length).toBe(0);
    for (const secret of ['DRAFT SECRET', 'private roadmap', 'private editorial note', 'private-creator', 'private-editor', 'private-publisher', 'disabled-secret', 'Secret answer']) {
      expect(text.includes(secret)).toBe(false);
    }
  });

  test('GET/HEAD, ETag conditional caching, changed publication, query and method rules', async () => {
    const first = version('public-v1', 'published');
    const firstMem = memoryStore([first]);
    const get = await handleSeoPublic(new Request('https://worker.test/api/seo/published'), firstMem.store);
    const etag = get.headers.get('etag')!;
    expect(get.status).toBe(200);
    expect(/^W\/"seo-[a-f0-9]{64}"$/.test(etag)).toBe(true);
    const conditional = await handleSeoPublic(new Request('https://worker.test/api/seo/published', { headers: { 'If-None-Match': etag } }), firstMem.store);
    expect(conditional.status).toBe(304);
    const head = await handleSeoPublic(new Request('https://worker.test/api/seo/published', { method: 'HEAD' }), firstMem.store);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(head.headers.get('etag')).toBe(etag);

    const changed = version('public-v2', 'published', defaultSeoConfig(), 2);
    const changedResponse = await handleSeoPublic(new Request('https://worker.test/api/seo/published'), memoryStore([changed]).store);
    expect(changedResponse.headers.get('etag') === etag).toBe(false);
    expect((await handleSeoPublic(new Request('https://worker.test/api/seo/published?version=public-v1'), firstMem.store)).status).toBe(400);
    const post = await handleSeoPublic(new Request('https://worker.test/api/seo/published', { method: 'POST' }), firstMem.store);
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    expect((await handleSeoPublic(new Request('https://worker.test/api/seo/published'), memoryStore().store)).status).toBe(404);
  });

  test('Worker public route works without authorization from admin Firestore fixtures', async () => {
    const published = version('worker-public-v1', 'published');
    const state = stateFor(published);
    __adminTest.setFirestore((collection, id) => collection === 'seoSettings' && id === 'state' ? state
      : collection === 'seoVersions' && id === published.id ? published : null);
    const response = await worker.fetch(new Request('https://worker.test/api/seo/published'), env);
    expect(response.status).toBe(200);
    expect((await response.json() as any).version.id).toBe(published.id);
  });
});