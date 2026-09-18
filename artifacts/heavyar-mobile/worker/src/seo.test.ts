import { describe, expect, test } from 'bun:test';
import { applySeoChange, checkSeoConfig, defaultSeoConfig, emptySeoState, resolveSeo, SEO_REGISTRY, validateSeoConfig } from './seo';
import type { SeoState, SeoVersion } from './seo-types';

const NOW = '2026-05-01T00:00:00.000Z';
const throws = (fn: () => unknown, part: string) => {
  let message = '';
  try { fn(); } catch (error) { message = String(error); }
  expect(message.includes(part)).toBe(true);
};

describe('SEO foundation', () => {
  test('ships safe bilingual defaults and exact registry', () => {
    const config = validateSeoConfig(defaultSeoConfig());
    expect(config.pages.length).toBe(9);
    expect(SEO_REGISTRY.length).toBe(9);
    expect(config.pages.every((p) => !p.sitemap.include && p.robots === 'noindex,follow')).toBe(true);
    expect(config.global.ogImage).toBe(null);
  });

  test('strictly rejects unknown nested fields, HTML, bad percent encodings and oversize config', () => {
    const unknown = defaultSeoConfig() as any;
    unknown.global.assets.script = 'x';
    throws(() => validateSeoConfig(unknown), 'unknown field');
    const html = defaultSeoConfig(); html.global.title.en = '<script>x</script>';
    throws(() => validateSeoConfig(html), 'HTML');
    const unclosed = defaultSeoConfig(); unclosed.global.title.en = 'unsafe <script';
    throws(() => validateSeoConfig(unclosed), 'HTML');
    const percent = defaultSeoConfig(); percent.pages[0].title.en = 'bad%2fvalue';
    throws(() => validateSeoConfig(percent), 'percent');
    const huge = defaultSeoConfig();
    for (const page of huge.pages) for (const field of ['title', 'description', 'heading', 'ogTitle', 'ogDescription', 'xTitle', 'xDescription'] as const) {
      page[field] = { 'ar-SA': 'س'.repeat(500), en: 'a'.repeat(500), default: 'b'.repeat(500) };
    }
    throws(() => validateSeoConfig(huge), '100KB');
  });

  test('rejects unsafe canonicals, canonical drift, external origins and private asset hosts', () => {
    for (const bad of ['/admin', '/about?x=1', '/%2e%2e/admin', '/about\\x', 'https://evil.test/about']) {
      const config = defaultSeoConfig(); config.pages[1].canonicalPaths['ar-SA'] = bad;
      throws(() => validateSeoConfig(config), bad === '/aboutx' ? 'registry' : '');
    }
    const local = defaultSeoConfig(); local.global.ogImage = 'https://127.0.0.1/a.png';
    throws(() => validateSeoConfig(local), 'public DNS');
    const creds = defaultSeoConfig(); creds.organization.sameAs = ['https://a:b@example.com/'];
    throws(() => validateSeoConfig(creds), 'HTTPS public');
    for (const host of ['https://[2606:4700:4700::1111]/a', 'https://intranet/a', 'https://asset.internal/a']) {
      const config = defaultSeoConfig(); config.global.ogImage = host;
      throws(() => validateSeoConfig(config), 'public DNS');
    }
  });

  test('enforces locales, duplicate pages, sitemap and crawler consistency', () => {
    const locale = defaultSeoConfig(); (locale.global.supportedLanguages as any) = ['fr'];
    throws(() => validateSeoConfig(locale), 'unsupported');
    const pages = defaultSeoConfig(); pages.pages[1].key = 'home';
    throws(() => validateSeoConfig(pages), 'duplicate');
    const sitemap = defaultSeoConfig(); sitemap.pages[0].sitemap.include = true;
    throws(() => validateSeoConfig(sitemap), 'noindex');
    const crawler = defaultSeoConfig(); crawler.crawlers.googlebot = true;
    throws(() => validateSeoConfig(crawler), 'mainstream');
  });

  test('validates real stores, operating-system matching and enabled state', () => {
    const missing = defaultSeoConfig(); missing.mobileApplication.enabled = true;
    throws(() => validateSeoConfig(missing), 'real store');
    const fake = defaultSeoConfig();
    fake.mobileApplication.androidStoreUrl = 'https://play.google.com/store/apps/details?id=fake';
    fake.mobileApplication.operatingSystems = ['Android'];
    throws(() => validateSeoConfig(fake), 'Google Play');
    const valid = defaultSeoConfig();
    valid.mobileApplication.enabled = true;
    valid.mobileApplication.androidStoreUrl = 'https://play.google.com/store/apps/details?id=com.heavyar.app';
    valid.mobileApplication.operatingSystems = ['Android'];
    expect(validateSeoConfig(valid).mobileApplication.enabled).toBe(true);
    const prefix = defaultSeoConfig();
    prefix.mobileApplication.androidStoreUrl = 'https://play.google.com/store/apps/details?id=com.heavyar.app!invalid';
    prefix.mobileApplication.operatingSystems = ['Android'];
    throws(() => validateSeoConfig(prefix), 'Google Play');
  });

  test('requires translated visible FAQs before FAQPage and emits typed schema only', () => {
    const config = defaultSeoConfig();
    config.faqs.push({ id: 'q1', question: { 'ar-SA': 'ما هي هيڤيار؟', en: 'What is Heavyar?', default: '' }, answer: { 'ar-SA': 'منصة نقل.', en: 'A transport platform.', default: '' }, enabled: true, order: 0, pageKey: 'help' });
    config.pages.find((p) => p.key === 'help')!.schemas = ['FAQPage', 'BreadcrumbList'];
    const page = resolveSeo(config).find((p) => p.key === 'help' && p.locale === 'en')!;
    expect(page.faqs[0].question).toBe('What is Heavyar?');
    expect(page.structuredData[0]['@type']).toBe('FAQPage');
    expect(Object.prototype.hasOwnProperty.call(page.structuredData[0], 'script')).toBe(false);
    config.faqs[0].answer.en = '';
    throws(() => validateSeoConfig(config), 'translated');
  });

  test('resolves locale, page default, global locale and safe fallback without leaking keys', () => {
    const config = defaultSeoConfig();
    const about = config.pages.find((p) => p.key === 'about')!;
    about.title = { 'ar-SA': '', en: '', default: 'About default' };
    about.description = { 'ar-SA': '', en: '', default: '' };
    config.global.description.en = 'Global English';
    const pages = resolveSeo(config, NOW);
    expect(pages.find((p) => p.key === 'about' && p.locale === 'en')!.title).toBe('About default');
    expect(pages.find((p) => p.key === 'about' && p.locale === 'en')!.description).toBe('Global English');
    expect(pages.find((p) => p.key === 'about' && p.locale === 'en')!.sitemap.lastmod).toBe(NOW);
  });

  test('uses global social values before resolved SEO fallback and title for heading fallback', () => {
    const config = defaultSeoConfig();
    config.global.socialTitle.en = 'Global social title';
    config.global.socialDescription.en = 'Global social description';
    const about = config.pages.find((p) => p.key === 'about')!;
    about.heading.en = ''; about.heading.default = '';
    const resolved = resolveSeo(config).find((p) => p.key === 'about' && p.locale === 'en')!;
    expect(resolved.openGraph.title).toBe('Global social title');
    expect(resolved.twitter.title).toBe('Global social title');
    expect(resolved.openGraph.description).toBe('Global social description');
    expect(resolved.heading).toBe(resolved.title);
  });

  test('reports meaningful warnings without a vanity score', () => {
    const config = defaultSeoConfig();
    config.pages[0].title.en = 'x'.repeat(61);
    const issues = checkSeoConfig(config);
    expect(issues.some((x) => x.code === 'title_long')).toBe(true);
    expect(issues.some((x) => x.code === 'important_page_noindex')).toBe(true);
    expect(issues.some((x) => x.code.includes('score'))).toBe(false);
    expect(checkSeoConfig({})[0].severity).toBe('error');
  });

  test('warns when only safe fallbacks remain and when crawler policy blocks indexable pages', () => {
    const config = defaultSeoConfig();
    config.pages[0].title = { 'ar-SA': '', en: '', default: '' };
    config.pages[0].description = { 'ar-SA': '', en: '', default: '' };
    config.global.title = { 'ar-SA': '', en: '', default: '' };
    config.global.description = { 'ar-SA': '', en: '', default: '' };
    config.pages[0].robots = 'index,follow';
    const issues = checkSeoConfig(config);
    expect(issues.some((x) => x.code === 'title_missing')).toBe(true);
    expect(issues.some((x) => x.code === 'description_missing')).toBe(true);
    expect(issues.some((x) => x.code === 'crawler_blocks_indexed_page')).toBe(true);
    expect(resolveSeo(config).find((p) => p.key === 'home' && p.locale === 'ar-SA')!.description).toBe('هيڤيار لخدمات ومعدات النقل الثقيل.');
  });

  test('bounds public collections and includes a validated registration identifier', () => {
    const manyFaqs = defaultSeoConfig();
    manyFaqs.faqs = Array.from({ length: 31 }, (_, i) => ({ id: `q${i}`, question: { 'ar-SA': '', en: '', default: '' }, answer: { 'ar-SA': '', en: '', default: '' }, enabled: false, order: i, pageKey: 'help' }));
    throws(() => validateSeoConfig(manyFaqs), 'maximum is 30');
    const manyTopics = defaultSeoConfig(); manyTopics.editorialTopics = Array.from({ length: 21 }, (_, i) => `topic ${i}`);
    throws(() => validateSeoConfig(manyTopics), 'maximum is 20');
    const config = defaultSeoConfig(); config.organization.businessRegistration = '1010123456';
    const schema = resolveSeo(config).find((p) => p.key === 'home' && p.locale === 'en')!.structuredData[0];
    expect(schema.identifier).toBe('1010123456');
  });

  test('creates, edits and publishes an immutable draft while archiving prior publication', () => {
    const versions: Record<string, SeoVersion> = {};
    const created = applySeoChange(emptySeoState(), versions, { action: 'create', expectedRevision: 0, reason: 'start' }, 'owner', NOW, 'v1');
    versions.v1 = created.writes[0];
    const changed = defaultSeoConfig(); changed.global.siteName = 'Heavyar Platform';
    const edited = applySeoChange(created.state, versions, { action: 'edit', expectedRevision: 1, versionId: 'v1', reason: 'copy', config: changed }, 'owner', NOW);
    expect(versions.v1.config.global.siteName).toBe('Heavyar');
    versions.v1 = edited.writes[0];
    const published = applySeoChange(edited.state, versions, { action: 'publish', expectedRevision: 2, versionId: 'v1', reason: 'approve' }, 'owner', NOW);
    expect(published.state.currentPublishedId).toBe('v1');
    expect(published.state.draftId).toBe(null);
    expect(published.audit.actorUid).toBe('owner');
    expect(published.audit.changes.some((x) => x.scope === 'global')).toBe(true);
    expect(published.writes[0].status).toBe('published');
  });

  test('rejects stale CAS, duplicate draft, editing published, missing actor and invalid config publish', () => {
    const created = applySeoChange(emptySeoState(), {}, { action: 'create', expectedRevision: 0, reason: 'start' }, 'owner', NOW, 'v1');
    throws(() => applySeoChange(created.state, { v1: created.writes[0] }, { action: 'create', expectedRevision: 1, reason: 'again' }, 'owner', NOW, 'v2'), 'draft already');
    throws(() => applySeoChange(created.state, { v1: created.writes[0] }, { action: 'edit', expectedRevision: 0, versionId: 'v1', reason: 'bad', config: defaultSeoConfig() }, 'owner', NOW), 'revision conflict');
    throws(() => applySeoChange(emptySeoState(), {}, { action: 'create', expectedRevision: 0, reason: 'x' }, '', NOW, 'v'), 'actor');
    throws(() => applySeoChange(emptySeoState(), {}, { action: 'create', expectedRevision: 0, reason: 'x' }, 'owner', NOW, 'v'), 'between 3');
    throws(() => applySeoChange(emptySeoState(), {}, { action: 'create', expectedRevision: 0, reason: 'valid reason' }, '-', NOW, 'v'), 'actor');
  });

  test('republish creates a new published copy, archives current, and leaves draft untouched', () => {
    const old = { ...({} as SeoVersion), id: 'old', version: 1, status: 'archived' as const, createdAt: NOW, createdBy: 'a', updatedAt: NOW, updatedBy: 'a', publishedAt: NOW, publishedBy: 'a', reason: 'old', sourceVersionId: null, config: defaultSeoConfig() };
    const current = { ...old, id: 'current', version: 2, status: 'published' as const };
    const draft = { ...old, id: 'draft', version: 3, status: 'draft' as const, publishedAt: null, publishedBy: null };
    const state: SeoState = { revision: 8, currentPublishedId: 'current', draftId: 'draft', versions: [old, current, draft].map(({ config: _c, ...v }) => v) };
    const result = applySeoChange(state, { old, current, draft }, { action: 'republish', expectedRevision: 8, versionId: 'old', reason: 'rollback' }, 'owner', NOW, 'new');
    expect(result.state.draftId).toBe('draft');
    expect(result.state.currentPublishedId).toBe('new');
    expect(result.writes.find((x) => x.id === 'current')!.status).toBe('archived');
    expect(result.writes.find((x) => x.id === 'current')!.reason).toBe('old');
    expect(result.writes.find((x) => x.id === 'current')!.publishedBy).toBe('a');
    expect(result.writes.find((x) => x.id === 'new')!.sourceVersionId).toBe('old');
  });

  test('has bounded non-destructive history with explicit capacity failure', () => {
    const state: SeoState = { revision: 100, currentPublishedId: null, draftId: null, versions: Array.from({ length: 100 }, (_, i) => ({ id: `v${i}`, version: i, status: 'archived' as const, createdAt: NOW, createdBy: 'a', updatedAt: NOW, updatedBy: 'a', publishedAt: NOW, publishedBy: 'a', reason: 'x', sourceVersionId: null })) };
    throws(() => applySeoChange(state, {}, { action: 'create', expectedRevision: 100, reason: 'full' }, 'owner', NOW, 'new'), 'capacity');
    expect(state.versions.length).toBe(100);
  });
});