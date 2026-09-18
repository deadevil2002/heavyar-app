import type {
  SeoChange, SeoCommand, SeoConfig, SeoIssue, SeoLocale, SeoPage, SeoPageKey,
  SeoRegistryEntry, SeoResolvedPage, SeoSchema, SeoState, SeoText, SeoVersion,
  SeoVersionSummary,
} from './seo-types';

const ORIGIN = 'https://heavyar.com';
const LOCALES: SeoLocale[] = ['ar-SA', 'en'];
const PAGE_KEYS: SeoPageKey[] = [
  'home', 'about', 'equipment', 'drivers', 'help', 'privacy', 'terms',
  'account-deletion', 'early-access',
];
const SCHEMAS: SeoSchema[] = ['Organization', 'WebSite', 'MobileApplication', 'FAQPage', 'BreadcrumbList'];
const ROBOTS = ['index,follow', 'noindex,follow', 'noindex,nofollow'] as const;

export const SEO_REGISTRY: SeoRegistryEntry[] = [
  { key: 'home', nameAr: 'الرئيسية', nameEn: 'Home', paths: { 'ar-SA': '/', en: '/en/' } },
  { key: 'about', nameAr: 'عن هيڤيار', nameEn: 'About', paths: { 'ar-SA': '/about', en: '/en/about' } },
  { key: 'equipment', nameAr: 'المعدات', nameEn: 'Equipment', paths: { 'ar-SA': '/equipment', en: '/en/equipment' } },
  { key: 'drivers', nameAr: 'السائقون', nameEn: 'Drivers', paths: { 'ar-SA': '/drivers', en: '/en/drivers' } },
  { key: 'help', nameAr: 'المساعدة', nameEn: 'Help', paths: { 'ar-SA': '/help', en: '/en/help' } },
  { key: 'privacy', nameAr: 'الخصوصية', nameEn: 'Privacy', paths: { 'ar-SA': '/privacy', en: '/en/privacy' } },
  { key: 'terms', nameAr: 'الشروط', nameEn: 'Terms', paths: { 'ar-SA': '/terms', en: '/en/terms' } },
  { key: 'account-deletion', nameAr: 'حذف الحساب', nameEn: 'Account deletion', paths: { 'ar-SA': '/account-deletion', en: '/en/account-deletion' } },
  { key: 'early-access', nameAr: 'الوصول المبكر', nameEn: 'Early access', paths: { 'ar-SA': '/early-access', en: '/en/early-access' } },
];

const fallbackText: SeoText = { 'ar-SA': 'هيڤيار', en: 'Heavyar', default: 'Heavyar' };
const descriptions: SeoText = {
  'ar-SA': 'هيڤيار لخدمات ومعدات النقل الثقيل.',
  en: 'Heavyar for heavy transport services and equipment.',
  default: 'Heavyar for heavy transport services and equipment.',
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function page(entry: SeoRegistryEntry): SeoPage {
  const title = { 'ar-SA': entry.nameAr, en: entry.nameEn, default: entry.nameEn };
  return {
    key: entry.key, title: copy(title), description: { 'ar-SA': '', en: '', default: '' },
    heading: copy(title), canonicalPaths: copy(entry.paths), robots: 'noindex,follow',
    sitemap: { include: false, priority: null, changeFrequency: '' },
    ogTitle: { 'ar-SA': '', en: '', default: '' }, ogDescription: { 'ar-SA': '', en: '', default: '' },
    ogImage: null, xTitle: { 'ar-SA': '', en: '', default: '' },
    xDescription: { 'ar-SA': '', en: '', default: '' }, xImage: null,
    hreflang: true, schemas: entry.key === 'home' ? ['Organization', 'WebSite'] : [],
  };
}

export function defaultSeoConfig(): SeoConfig {
  return {
    global: {
      siteName: 'Heavyar', siteNames: copy(fallbackText), title: copy(fallbackText),
      description: copy(descriptions), socialTitle: copy(fallbackText),
      socialDescription: copy(descriptions), ogImage: null, xImage: null,
      canonicalOrigin: ORIGIN, defaultLanguage: 'ar-SA', supportedLanguages: ['ar-SA', 'en'],
      defaultLocale: 'ar-SA',
      assets: { faviconIco: null, faviconPng: null, icon192: null, icon512: null, appleTouchIcon: null, socialShare: null },
    },
    organization: {
      name: 'Heavyar', alternateName: 'هيڤيار', logo: null, url: ORIGIN,
      publicEmail: '', businessRegistration: '', sameAs: [],
    },
    mobileApplication: {
      enabled: false, androidStoreUrl: null, iosStoreUrl: null,
      applicationCategory: 'BusinessApplication', operatingSystems: [],
      pricingDescription: { 'ar-SA': '', en: '', default: '' },
    },
    crawlers: { mainstreamIndexing: false, googlebot: false, bingbot: false, oaiSearchBot: false },
    pages: SEO_REGISTRY.map(page), faqs: [], editorialTopics: [],
  };
}

export function emptySeoState(): SeoState {
  return { revision: 0, currentPublishedId: null, draftId: null, versions: [] };
}

function fail(path: string, message: string): never {
  throw new Error(`Invalid SEO configuration at ${path}: ${message}`);
}
function obj(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
  const out = value as Record<string, unknown>;
  for (const key of Object.keys(out)) if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  for (const key of keys) if (!(key in out)) fail(`${path}.${key}`, 'missing field');
  return out;
}
function arr(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected array');
  return value;
}
function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected boolean');
  return value;
}
function text(value: unknown, path: string, max = 500): string {
  if (typeof value !== 'string') fail(path, 'expected string');
  const normalized = value.trim().replace(/[ \t]+/g, ' ');
  if (normalized.length > max) fail(path, `maximum length is ${max}`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) fail(path, 'control characters are forbidden');
  if (/[<>]|&(?:lt|gt|#x?0*3[ce]);/i.test(normalized)) fail(path, 'HTML is forbidden');
  if (/%[0-9a-f]{2}/i.test(normalized)) fail(path, 'unsafe percent encoding');
  return normalized;
}
function requiredText(value: unknown, path: string, max = 500): string {
  const result = text(value, path, max);
  if (!result) fail(path, 'must not be empty');
  return result;
}
function oneOf<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) fail(path, 'unsupported value');
  return value as T;
}
function seoText(value: unknown, path: string): SeoText {
  const source = obj(value, path, ['ar-SA', 'en', 'default']);
  return {
    'ar-SA': text(source['ar-SA'], `${path}.ar-SA`),
    en: text(source.en, `${path}.en`),
    default: text(source.default, `${path}.default`),
  };
}
function publicUrl(value: unknown, path: string, sameOrigin = false): string {
  const raw = requiredText(value, path, 2048);
  let url: URL;
  try { url = new URL(raw); } catch { return fail(path, 'malformed URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) fail(path, 'HTTPS public URL required');
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || /^\d+(?:\.\d+){3}$/.test(host) || /^\[.*\]$/.test(host) ||
      host === 'localhost' || /\.(?:localhost|local|internal|lan|home)$/.test(host)) {
    fail(path, 'a public DNS hostname is required; IP and internal hosts are forbidden');
  }
  if (sameOrigin && url.origin !== ORIGIN) fail(path, `origin must be ${ORIGIN}`);
  if (url.hash) fail(path, 'fragments are forbidden');
  return url.toString().replace(/\/$/, url.pathname === '/' ? '' : '/');
}
function nullableUrl(value: unknown, path: string): string | null {
  return value === null ? null : publicUrl(value, path);
}
function canonical(value: unknown, path: string): string {
  const raw = requiredText(value, path, 2048);
  if (/[?#\\]/.test(raw) || /%(?:2f|5c|2e|00)/i.test(raw)) fail(path, 'query, fragment, backslash, and encoded traversal are forbidden');
  let pathname: string;
  if (raw.startsWith('/')) pathname = raw;
  else {
    const absolute = publicUrl(raw, path, true);
    const url = new URL(absolute);
    if (url.search) fail(path, 'query is forbidden');
    pathname = url.pathname;
  }
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return fail(path, 'invalid encoding'); }
  if (decoded.includes('\\') || decoded.split('/').some((part) => part === '.' || part === '..')) fail(path, 'traversal is forbidden');
  if (/^\/(?:admin|api|private)(?:\/|$)/i.test(decoded) || /^\/en\/(?:admin|api|private)(?:\/|$)/i.test(decoded)) fail(path, 'private route is forbidden');
  if (!pathname.startsWith('//')) {
    if (pathname !== '/' && pathname !== '/en/') pathname = pathname.replace(/\/+$/, '');
    return pathname;
  }
  return fail(path, 'protocol-relative path is forbidden');
}

export function validateSeoConfig(config: unknown): SeoConfig {
  const root = obj(config, '$', ['global', 'organization', 'mobileApplication', 'crawlers', 'pages', 'faqs', 'editorialTopics']);
  const g = obj(root.global, '$.global', ['siteName', 'siteNames', 'title', 'description', 'socialTitle', 'socialDescription', 'ogImage', 'xImage', 'canonicalOrigin', 'defaultLanguage', 'supportedLanguages', 'defaultLocale', 'assets']);
  const assets = obj(g.assets, '$.global.assets', ['faviconIco', 'faviconPng', 'icon192', 'icon512', 'appleTouchIcon', 'socialShare']);
  const languages = arr(g.supportedLanguages, '$.global.supportedLanguages').map((x, i) => oneOf(x, `$.global.supportedLanguages[${i}]`, LOCALES));
  if (languages.length < 1 || languages.length > 2 || new Set(languages).size !== languages.length) fail('$.global.supportedLanguages', 'must contain one or two unique supported locales');
  const defaultLanguage = oneOf(g.defaultLanguage, '$.global.defaultLanguage', LOCALES);
  const defaultLocale = oneOf(g.defaultLocale, '$.global.defaultLocale', LOCALES);
  if (!languages.includes(defaultLanguage) || !languages.includes(defaultLocale)) fail('$.global', 'default locales must be supported');
  if (g.canonicalOrigin !== ORIGIN) fail('$.global.canonicalOrigin', `must be ${ORIGIN}`);
  const global: SeoConfig['global'] = {
    siteName: requiredText(g.siteName, '$.global.siteName', 100), siteNames: seoText(g.siteNames, '$.global.siteNames'),
    title: seoText(g.title, '$.global.title'), description: seoText(g.description, '$.global.description'),
    socialTitle: seoText(g.socialTitle, '$.global.socialTitle'), socialDescription: seoText(g.socialDescription, '$.global.socialDescription'),
    ogImage: nullableUrl(g.ogImage, '$.global.ogImage'), xImage: nullableUrl(g.xImage, '$.global.xImage'),
    canonicalOrigin: ORIGIN, defaultLanguage, supportedLanguages: languages, defaultLocale,
    assets: {
      faviconIco: nullableUrl(assets.faviconIco, '$.global.assets.faviconIco'),
      faviconPng: nullableUrl(assets.faviconPng, '$.global.assets.faviconPng'),
      icon192: nullableUrl(assets.icon192, '$.global.assets.icon192'),
      icon512: nullableUrl(assets.icon512, '$.global.assets.icon512'),
      appleTouchIcon: nullableUrl(assets.appleTouchIcon, '$.global.assets.appleTouchIcon'),
      socialShare: nullableUrl(assets.socialShare, '$.global.assets.socialShare'),
    },
  };
  const o = obj(root.organization, '$.organization', ['name', 'alternateName', 'logo', 'url', 'publicEmail', 'businessRegistration', 'sameAs']);
  const email = text(o.publicEmail, '$.organization.publicEmail', 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('$.organization.publicEmail', 'invalid email');
  const organization: SeoConfig['organization'] = {
    name: requiredText(o.name, '$.organization.name', 100), alternateName: text(o.alternateName, '$.organization.alternateName', 100),
    logo: nullableUrl(o.logo, '$.organization.logo'), url: publicUrl(o.url, '$.organization.url', true),
    publicEmail: email, businessRegistration: text(o.businessRegistration, '$.organization.businessRegistration', 100),
    sameAs: arr(o.sameAs, '$.organization.sameAs').map((x, i) => publicUrl(x, `$.organization.sameAs[${i}]`)),
  };
  if (new Set(organization.sameAs).size !== organization.sameAs.length) fail('$.organization.sameAs', 'duplicate URL');
  if (organization.sameAs.length > 20) fail('$.organization.sameAs', 'maximum is 20 URLs');
  if (organization.businessRegistration && !/^[\p{L}\p{N}][\p{L}\p{N} ._/-]{1,99}$/u.test(organization.businessRegistration)) fail('$.organization.businessRegistration', 'invalid public registration identifier');
  const m = obj(root.mobileApplication, '$.mobileApplication', ['enabled', 'androidStoreUrl', 'iosStoreUrl', 'applicationCategory', 'operatingSystems', 'pricingDescription']);
  const androidStoreUrl = nullableUrl(m.androidStoreUrl, '$.mobileApplication.androidStoreUrl');
  const iosStoreUrl = nullableUrl(m.iosStoreUrl, '$.mobileApplication.iosStoreUrl');
  if (androidStoreUrl) {
    const store = new URL(androidStoreUrl);
    const packageId = store.searchParams.get('id') || '';
    const extraParams = [...store.searchParams.keys()].filter((key) => !['id', 'hl', 'gl'].includes(key));
    if (store.hostname !== 'play.google.com' || store.pathname !== '/store/apps/details' ||
        !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageId) ||
        store.searchParams.getAll('id').length !== 1 || extraParams.length) {
      fail('$.mobileApplication.androidStoreUrl', 'invalid Google Play application URL');
    }
  }
  if (iosStoreUrl) {
    const store = new URL(iosStoreUrl);
    if (store.hostname !== 'apps.apple.com' || !/^\/(?:[a-z]{2}\/)?app\/[^/]+\/id\d+\/?$/.test(store.pathname)) fail('$.mobileApplication.iosStoreUrl', 'invalid Apple App Store URL');
  }
  const systems = arr(m.operatingSystems, '$.mobileApplication.operatingSystems').map((x, i) => oneOf(x, `$.mobileApplication.operatingSystems[${i}]`, ['Android', 'iOS'] as const));
  if (new Set(systems).size !== systems.length) fail('$.mobileApplication.operatingSystems', 'duplicate operating system');
  const enabled = bool(m.enabled, '$.mobileApplication.enabled');
  if (enabled && !androidStoreUrl && !iosStoreUrl) fail('$.mobileApplication.enabled', 'enabled application requires a real store URL');
  if (!!androidStoreUrl !== systems.includes('Android') || !!iosStoreUrl !== systems.includes('iOS')) fail('$.mobileApplication.operatingSystems', 'must exactly match configured stores');
  const mobileApplication: SeoConfig['mobileApplication'] = {
    enabled, androidStoreUrl, iosStoreUrl,
    applicationCategory: oneOf(m.applicationCategory, '$.mobileApplication.applicationCategory', ['BusinessApplication', 'UtilitiesApplication', 'TravelApplication'] as const),
    operatingSystems: systems, pricingDescription: seoText(m.pricingDescription, '$.mobileApplication.pricingDescription'),
  };
  const c = obj(root.crawlers, '$.crawlers', ['mainstreamIndexing', 'googlebot', 'bingbot', 'oaiSearchBot']);
  const crawlers = { mainstreamIndexing: bool(c.mainstreamIndexing, '$.crawlers.mainstreamIndexing'), googlebot: bool(c.googlebot, '$.crawlers.googlebot'), bingbot: bool(c.bingbot, '$.crawlers.bingbot'), oaiSearchBot: bool(c.oaiSearchBot, '$.crawlers.oaiSearchBot') };
  if (!crawlers.mainstreamIndexing && (crawlers.googlebot || crawlers.bingbot || crawlers.oaiSearchBot)) fail('$.crawlers', 'individual crawlers cannot be enabled while mainstream indexing is disabled');
  const seen = new Set<string>();
  const pages = arr(root.pages, '$.pages').map((raw, i): SeoPage => {
    const path = `$.pages[${i}]`;
    const p = obj(raw, path, ['key', 'title', 'description', 'heading', 'canonicalPaths', 'robots', 'sitemap', 'ogTitle', 'ogDescription', 'ogImage', 'xTitle', 'xDescription', 'xImage', 'hreflang', 'schemas']);
    const key = oneOf(p.key, `${path}.key`, PAGE_KEYS);
    if (seen.has(key)) fail(`${path}.key`, 'duplicate page key');
    seen.add(key);
    const cp = obj(p.canonicalPaths, `${path}.canonicalPaths`, LOCALES);
    const canonicalPaths = { 'ar-SA': canonical(cp['ar-SA'], `${path}.canonicalPaths.ar-SA`), en: canonical(cp.en, `${path}.canonicalPaths.en`) };
    const registered = SEO_REGISTRY.find((x) => x.key === key)!;
    for (const locale of LOCALES) if (canonicalPaths[locale] !== registered.paths[locale]) fail(`${path}.canonicalPaths.${locale}`, 'must equal the controlled registry path');
    const sitemap = obj(p.sitemap, `${path}.sitemap`, ['include', 'priority', 'changeFrequency']);
    const robots = oneOf(p.robots, `${path}.robots`, ROBOTS);
    const include = bool(sitemap.include, `${path}.sitemap.include`);
    if (robots !== 'index,follow' && include) fail(`${path}.sitemap.include`, 'noindex pages cannot be included in sitemap');
    let priority: number | null = null;
    if (sitemap.priority !== null) {
      if (typeof sitemap.priority !== 'number' || !Number.isFinite(sitemap.priority) || sitemap.priority < 0 || sitemap.priority > 1) fail(`${path}.sitemap.priority`, 'must be null or between 0 and 1');
      priority = sitemap.priority;
    }
    const schemas = arr(p.schemas, `${path}.schemas`).map((x, j) => oneOf(x, `${path}.schemas[${j}]`, SCHEMAS));
    if (new Set(schemas).size !== schemas.length) fail(`${path}.schemas`, 'duplicate schema');
    if (schemas.includes('FAQPage') && !arr(root.faqs, '$.faqs').some((f) => typeof f === 'object' && f !== null && (f as Record<string, unknown>).pageKey === key && (f as Record<string, unknown>).enabled === true)) fail(`${path}.schemas`, 'FAQPage requires enabled visible FAQ content');
    if (schemas.includes('MobileApplication') && !enabled) fail(`${path}.schemas`, 'MobileApplication requires enabled store configuration');
    if (schemas.includes('BreadcrumbList') && key === 'home') fail(`${path}.schemas`, 'home cannot have a breadcrumb hierarchy');
    return {
      key, title: seoText(p.title, `${path}.title`), description: seoText(p.description, `${path}.description`),
      heading: seoText(p.heading, `${path}.heading`), canonicalPaths, robots,
      sitemap: { include, priority, changeFrequency: oneOf(sitemap.changeFrequency, `${path}.sitemap.changeFrequency`, ['', 'daily', 'weekly', 'monthly', 'yearly'] as const) },
      ogTitle: seoText(p.ogTitle, `${path}.ogTitle`), ogDescription: seoText(p.ogDescription, `${path}.ogDescription`),
      ogImage: nullableUrl(p.ogImage, `${path}.ogImage`), xTitle: seoText(p.xTitle, `${path}.xTitle`),
      xDescription: seoText(p.xDescription, `${path}.xDescription`), xImage: nullableUrl(p.xImage, `${path}.xImage`),
      hreflang: bool(p.hreflang, `${path}.hreflang`), schemas,
    };
  });
  if (pages.length !== PAGE_KEYS.length || PAGE_KEYS.some((key) => !seen.has(key))) fail('$.pages', 'must contain every controlled page exactly once');
  const faqIds = new Set<string>();
  const rawFaqs = arr(root.faqs, '$.faqs');
  if (rawFaqs.length > 30) fail('$.faqs', 'maximum is 30 FAQ items');
  const faqs = rawFaqs.map((raw, i) => {
    const path = `$.faqs[${i}]`;
    const f = obj(raw, path, ['id', 'question', 'answer', 'enabled', 'order', 'pageKey']);
    const id = requiredText(f.id, `${path}.id`, 100);
    if (faqIds.has(id)) fail(`${path}.id`, 'duplicate FAQ id');
    faqIds.add(id);
    if (!Number.isSafeInteger(f.order) || (f.order as number) < 0) fail(`${path}.order`, 'must be a non-negative integer');
    const question = seoText(f.question, `${path}.question`), answer = seoText(f.answer, `${path}.answer`);
    const faqEnabled = bool(f.enabled, `${path}.enabled`);
    if (faqEnabled) for (const locale of languages) if (!question[locale] || !answer[locale]) fail(path, 'enabled FAQ requires visible translated content in every supported locale');
    return { id, question, answer, enabled: faqEnabled, order: f.order as number, pageKey: oneOf(f.pageKey, `${path}.pageKey`, PAGE_KEYS) };
  });
  const rawTopics = arr(root.editorialTopics, '$.editorialTopics');
  if (rawTopics.length > 20) fail('$.editorialTopics', 'maximum is 20 topics');
  const editorialTopics = rawTopics.map((x, i) => requiredText(x, `$.editorialTopics[${i}]`, 100));
  const result: SeoConfig = { global, organization, mobileApplication, crawlers, pages, faqs, editorialTopics };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 100 * 1024) fail('$', 'configuration exceeds 100KB');
  return result;
}

function localized(value: SeoText, locale: SeoLocale, globalValue: SeoText, safeFallback: string): string {
  return value[locale] || value.default || globalValue[locale] || globalValue.default || safeFallback;
}

export function checkSeoConfig(config: unknown): SeoIssue[] {
  let valid: SeoConfig;
  try { valid = validateSeoConfig(config); } catch (error) {
    return [{ severity: 'error', code: 'invalid_config', path: '$', messageEn: error instanceof Error ? error.message : 'Invalid configuration', messageAr: 'إعدادات تحسين البحث غير صالحة' }];
  }
  const issues: SeoIssue[] = [];
  const add = (severity: SeoIssue['severity'], code: string, path: string, en: string, ar: string) => issues.push({ severity, code, path, messageEn: en, messageAr: ar });
  const titles = new Map<string, string>();
  valid.pages.forEach((p, i) => LOCALES.filter((l) => valid.global.supportedLanguages.includes(l)).forEach((locale) => {
    const title = localized(p.title, locale, valid.global.title, fallbackText[locale]);
    const description = localized(p.description, locale, valid.global.description, descriptions[locale]);
    const path = `$.pages[${i}]`;
    const registry = SEO_REGISTRY.find((entry) => entry.key === p.key)!;
    const pageLabel = locale === 'ar-SA' ? registry.nameAr : registry.nameEn;
    if (!p.title[locale] && !p.title.default && !valid.global.title[locale] && !valid.global.title.default) add('warning', 'title_missing', `${path}.title.${locale}`, 'Configured page title is missing; the safe application fallback will be used', 'عنوان الصفحة المُعدّ مفقود؛ سيُستخدم الاسم الآمن للتطبيق');
    else if (title.length > 60) add('warning', 'title_long', `${path}.title.${locale}`, 'Page title may be too long', 'قد يكون عنوان الصفحة طويلاً');
    const duplicate = titles.get(`${locale}:${title.toLocaleLowerCase()}`);
    if (title && duplicate) {
      const duplicateEntry = SEO_REGISTRY.find((entry) => entry.key === duplicate)!;
      add('warning', 'title_duplicate', `${path}.title.${locale}`, `Title duplicates ${duplicateEntry.nameEn}`, `العنوان مكرر مع ${duplicateEntry.nameAr}`);
    }
    else if (title) titles.set(`${locale}:${title.toLocaleLowerCase()}`, p.key);
    if (!p.description[locale] && !p.description.default && !valid.global.description[locale] && !valid.global.description.default) add('warning', 'description_missing', `${path}.description.${locale}`, 'Configured description is missing; the safe translated fallback will be used', 'وصف الصفحة المُعدّ مفقود؛ سيُستخدم الوصف المترجم الآمن');
    else if (description.length > 160) add('warning', 'description_long', `${path}.description.${locale}`, 'Description may be too long', 'قد يكون وصف الصفحة طويلاً');
    if (!p.title[locale] && (p.title.default || valid.global.title[locale] || valid.global.title.default)) add('info', 'locale_title_override_missing', `${path}.title.${locale}`, `${pageLabel} uses a fallback title`, `${pageLabel}: يُستخدم عنوان احتياطي`);
    if (!(p.ogImage || valid.global.ogImage || valid.global.assets.socialShare)) add('info', 'social_image_missing', `${path}.ogImage`, 'No social sharing image is configured', 'لم يتم إعداد صورة للمشاركة');
  }));
  for (const key of ['home', 'equipment', 'drivers'] as SeoPageKey[]) {
    const p = valid.pages.find((x) => x.key === key)!;
    if (p.robots !== 'index,follow') add('warning', 'important_page_noindex', `$.pages.${key}.robots`, 'Important public page is noindex', 'صفحة عامة مهمة غير مفهرسة');
  }
  if (!valid.crawlers.mainstreamIndexing) for (const p of valid.pages.filter((page) => page.robots === 'index,follow' || page.sitemap.include)) {
    add('warning', 'crawler_blocks_indexed_page', `$.pages.${p.key}.robots`, 'This page is marked indexable but mainstream crawler access is disabled', 'الصفحة معدّة للفهرسة لكن وصول محركات البحث الرئيسية معطّل');
  }
  return issues;
}

export function resolveSeo(config: unknown, publishedAt?: string | null): SeoResolvedPage[] {
  const valid = validateSeoConfig(config);
  const supported = valid.global.supportedLanguages;
  return valid.pages.flatMap((p) => supported.map((locale): SeoResolvedPage => {
    const title = localized(p.title, locale, valid.global.title, fallbackText[locale]);
    const description = localized(p.description, locale, valid.global.description, descriptions[locale]);
    const heading = p.heading[locale] || p.heading.default || title;
    const ogTitle = localized(p.ogTitle, locale, valid.global.socialTitle, title);
    const ogDescription = localized(p.ogDescription, locale, valid.global.socialDescription, description);
    const xTitle = localized(p.xTitle, locale, valid.global.socialTitle, ogTitle);
    const xDescription = localized(p.xDescription, locale, valid.global.socialDescription, ogDescription);
    const canonicalUrl = ORIGIN + p.canonicalPaths[locale];
    const faqs = valid.faqs.filter((x) => x.enabled && x.pageKey === p.key).map((x) => ({
      question: localized(x.question, locale, fallbackText, fallbackText[locale]),
      answer: localized(x.answer, locale, descriptions, descriptions[locale]), order: x.order,
    })).sort((a, b) => a.order - b.order);
    const structuredData: Record<string, unknown>[] = [];
    for (const schema of p.schemas) {
      if (schema === 'Organization') structuredData.push({ '@context': 'https://schema.org', '@type': 'Organization', name: valid.organization.name, ...(valid.organization.alternateName ? { alternateName: valid.organization.alternateName } : {}), url: valid.organization.url, ...(valid.organization.logo ? { logo: valid.organization.logo } : {}), ...(valid.organization.publicEmail ? { email: valid.organization.publicEmail } : {}), ...(valid.organization.businessRegistration ? { identifier: valid.organization.businessRegistration } : {}), ...(valid.organization.sameAs.length ? { sameAs: valid.organization.sameAs } : {}) });
      if (schema === 'WebSite') structuredData.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: localized(valid.global.siteNames, locale, fallbackText, fallbackText[locale]), url: ORIGIN, inLanguage: locale });
      if (schema === 'MobileApplication' && valid.mobileApplication.enabled) structuredData.push({ '@context': 'https://schema.org', '@type': 'MobileApplication', name: valid.global.siteName, applicationCategory: valid.mobileApplication.applicationCategory, operatingSystem: valid.mobileApplication.operatingSystems.join(', '), ...(valid.mobileApplication.androidStoreUrl ? { downloadUrl: valid.mobileApplication.androidStoreUrl } : {}), ...(valid.mobileApplication.iosStoreUrl ? { installUrl: valid.mobileApplication.iosStoreUrl } : {}) });
      if (schema === 'FAQPage' && faqs.length) structuredData.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) });
      if (schema === 'BreadcrumbList' && p.key !== 'home') structuredData.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: fallbackText[locale], item: ORIGIN + SEO_REGISTRY[0].paths[locale] }, { '@type': 'ListItem', position: 2, name: heading, item: canonicalUrl }] });
    }
    const image = p.ogImage || valid.global.ogImage || valid.global.assets.socialShare;
    return {
      key: p.key, locale, title, description, heading, canonical: canonicalUrl, robots: p.robots,
      openGraph: { title: ogTitle, description: ogDescription, image, locale, siteName: localized(valid.global.siteNames, locale, fallbackText, fallbackText[locale]) },
      twitter: { title: xTitle, description: xDescription, image: p.xImage || valid.global.xImage || image, card: (p.xImage || valid.global.xImage || image) ? 'summary_large_image' : 'summary' },
      sitemap: { include: p.sitemap.include, priority: p.sitemap.priority, changeFrequency: p.sitemap.changeFrequency, lastmod: publishedAt || null },
      alternates: p.hreflang ? [...supported.map((l) => ({ locale: l, href: ORIGIN + p.canonicalPaths[l] })), { locale: 'x-default' as const, href: ORIGIN + p.canonicalPaths[valid.global.defaultLocale] }] : [],
      structuredData, faqs,
    };
  }));
}

function summary(version: SeoVersion): SeoVersionSummary {
  const { config: _config, ...result } = version;
  return result;
}
function metadata(base: SeoConfig, id: string, version: number, status: SeoVersion['status'], actor: string, now: string, reason: string, sourceVersionId: string | null): SeoVersion {
  return { id, version, status, createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor, publishedAt: status === 'published' ? now : null, publishedBy: status === 'published' ? actor : null, reason, sourceVersionId, config: copy(base) };
}
function scopes(config: SeoConfig | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['global', 'organization', 'mobileApplication', 'crawlers', 'editorialTopics'] as const) out[key === 'mobileApplication' ? 'mobile' : key === 'editorialTopics' ? 'editorial' : key] = config?.[key] ?? null;
  for (const p of config?.pages ?? []) out[`pages.${p.key}`] = p;
  for (const f of config?.faqs ?? []) out[`FAQ.${f.id}`] = f;
  return out;
}
function diffs(before: SeoConfig | null, after: SeoConfig | null) {
  const a = scopes(before), b = scopes(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map((scope) => ({ scope, before: copy(a[scope] ?? null), after: copy(b[scope] ?? null) }));
}

export function applySeoChange(state: SeoState, versions: Record<string, SeoVersion>, command: SeoCommand, actorUid: string, now: string, id?: string): SeoChange {
  const actor = actorUid.trim();
  if (!actor || actor === '-' || actor.length > 128 || /[<>\u0000-\u001F\u007F]/.test(actor)) throw new Error('Authenticated actor is required');
  const reason = text(command.reason, '$.reason', 1000);
  if (reason.length < 3) throw new Error('Change reason must be between 3 and 1000 characters');
  if (command.expectedRevision !== state.revision) throw new Error('SEO state revision conflict');
  if (!Number.isFinite(Date.parse(now))) throw new Error('Invalid server timestamp');
  if (!['create', 'edit', 'publish', 'republish'].includes(command.action)) throw new Error('Invalid SEO action');
  const before = copy(state);
  const next = copy(state);
  const writes: SeoVersion[] = [];
  const maxVersion = [...Object.values(versions), ...state.versions].reduce((max, v) => Math.max(max, v.version), 0);
  const generatedId = id || `seo-v${maxVersion + 1}-${crypto.randomUUID()}`;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(generatedId)) throw new Error('Invalid server version id');
  if (versions[generatedId]) throw new Error('Server version id already exists');
  let auditVersionId = '';
  let auditBefore: SeoConfig | null = null;
  let auditAfter: SeoConfig | null = null;
  let action: SeoChange['audit']['action'];
  if (command.action === 'create') {
    if (state.draftId) throw new Error('A draft already exists');
    const sourceId = command.sourceVersionId || state.currentPublishedId;
    const source = sourceId ? versions[sourceId] : null;
    if (sourceId && !source) throw new Error('Source SEO version not found');
    const config = source ? validateSeoConfig(source.config) : defaultSeoConfig();
    const draft = metadata(config, generatedId, maxVersion + 1, 'draft', actor, now, reason, sourceId || null);
    writes.push(draft); next.draftId = draft.id; auditVersionId = draft.id; auditAfter = draft.config; action = 'seo_draft_created';
  } else if (command.action === 'edit') {
    if (state.draftId !== command.versionId) throw new Error('Only the current draft can be edited');
    const existing = versions[command.versionId];
    if (!existing || existing.status !== 'draft') throw new Error('Draft version not found');
    const config = validateSeoConfig(command.config);
    const edited = { ...copy(existing), config, updatedAt: now, updatedBy: actor, reason };
    writes.push(edited); auditVersionId = edited.id; auditBefore = existing.config; auditAfter = edited.config; action = 'seo_draft_edited';
  } else if (command.action === 'publish') {
    if (state.draftId !== command.versionId) throw new Error('Only the current draft can be published');
    const draft = versions[command.versionId];
    if (!draft || draft.status !== 'draft') throw new Error('Draft version not found');
    const config = validateSeoConfig(draft.config);
    const prior = state.currentPublishedId ? versions[state.currentPublishedId] : null;
    if (state.currentPublishedId && (!prior || prior.status !== 'published')) throw new Error('Published version not found');
    if (prior) writes.push({ ...copy(prior), status: 'archived', updatedAt: now, updatedBy: actor });
    const published = { ...copy(draft), config, status: 'published' as const, updatedAt: now, updatedBy: actor, publishedAt: now, publishedBy: actor, reason };
    writes.push(published); next.currentPublishedId = published.id; next.draftId = null;
    auditVersionId = published.id; auditBefore = prior?.config ?? null; auditAfter = published.config; action = 'seo_published';
  } else {
    const source = versions[command.versionId];
    if (!source || source.status === 'draft') throw new Error('Republish source must be a published or archived version');
    const config = validateSeoConfig(source.config);
    const prior = state.currentPublishedId ? versions[state.currentPublishedId] : null;
    if (!prior || prior.status !== 'published') throw new Error('Current published version not found');
    writes.push({ ...copy(prior), status: 'archived', updatedAt: now, updatedBy: actor });
    const published = metadata(config, generatedId, maxVersion + 1, 'published', actor, now, reason, source.id);
    writes.push(published); next.currentPublishedId = published.id;
    auditVersionId = published.id; auditBefore = prior.config; auditAfter = published.config; action = 'seo_republished';
  }
  next.revision++;
  const changed = new Map(writes.map((v) => [v.id, summary(v)]));
  next.versions = next.versions.map((v) => changed.get(v.id) || v);
  for (const version of writes) if (!next.versions.some((v) => v.id === version.id)) next.versions.push(summary(version));
  if (next.versions.length > 100) throw new Error('SEO version history capacity of 100 reached; creation is blocked and history is never deleted');
  return {
    state: next, writes: copy(writes),
    audit: { action, actorUid: actor, at: now, versionId: auditVersionId, reason, before, after: copy(next), changes: diffs(auditBefore, auditAfter) },
  };
}