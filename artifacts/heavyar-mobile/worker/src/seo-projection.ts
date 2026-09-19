import { resolveSeo, validateSeoConfig } from './seo';
import type { SeoResolvedPage, SeoVersion } from './seo-types';

const SCHEMA_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ENCODED_BYTES = 500_000;
const ISO_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

export type SeoPublicPayload = ReturnType<typeof publicSeoPayload>;
export type SeoProjection =
  | {
      schemaVersion: 1;
      published: false;
      sourceRevision: number;
      updatedAt: string;
      expiresAt: string;
      etag: string;
    }
  | {
      schemaVersion: 1;
      published: true;
      sourceRevision: number;
      updatedAt: string;
      expiresAt: string;
      versionId: string;
      etag: string;
      encoded: string;
    };

export interface SeoProjectionStorage {
  read(): Promise<unknown>;
  write(projection: SeoProjection): Promise<void>;
}

/** An explicit allowlist, never a redacted copy of an Admin document. */
export function publicSeoPayload(version: SeoVersion) {
  const config = validateSeoConfig(version.config);
  if (version.status !== 'published' || !version.publishedAt) throw new Error('No current publication.');
  const g = config.global, o = config.organization, m = config.mobileApplication;
  return {
    success: true as const, schemaVersion: 1 as const,
    version: { id: version.id, number: version.version, publishedAt: version.publishedAt },
    global: {
      siteName: g.siteName, siteNames: g.siteNames, title: g.title, description: g.description,
      socialTitle: g.socialTitle, socialDescription: g.socialDescription,
      ogImage: g.ogImage, xImage: g.xImage, canonicalOrigin: g.canonicalOrigin,
      defaultLanguage: g.defaultLanguage, supportedLanguages: g.supportedLanguages,
      defaultLocale: g.defaultLocale, assets: g.assets,
    },
    organization: { name: o.name, alternateName: o.alternateName, logo: o.logo, url: o.url, publicEmail: o.publicEmail, businessRegistration: o.businessRegistration, sameAs: o.sameAs },
    mobileApplication: m.enabled ? {
      enabled: true as const, androidStoreUrl: m.androidStoreUrl, iosStoreUrl: m.iosStoreUrl,
      applicationCategory: m.applicationCategory, operatingSystems: m.operatingSystems, pricingDescription: m.pricingDescription,
    } : null,
    crawlerPolicy: {
      mainstreamIndexing: config.crawlers.mainstreamIndexing,
      googlebot: config.crawlers.googlebot, bingbot: config.crawlers.bingbot, oaiSearchBot: config.crawlers.oaiSearchBot,
    },
    pages: resolveSeo(config, version.publishedAt),
  };
}

const exact = (value: unknown, keys: readonly string[], path: string): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || Object.keys(record).some(key => !keys.includes(key))) {
    throw new Error(`${path} has unsupported fields`);
  }
  for (const key of keys) if (!(key in record)) throw new Error(`${path}.${key} is missing`);
  return record;
};
const safeString = (value: unknown, path: string, max = 4096): string => {
  if (typeof value !== 'string' || value.length > max || /[<>\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${path} is unsafe`);
  }
  return value;
};
const boolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${path} must be boolean`);
  return value;
};
const nullableString = (value: unknown, path: string): string | null => value === null ? null : safeString(value, path);
const safeJson = (value: unknown, path: string, depth = 0): void => {
  if (depth > 12) throw new Error(`${path} is too deep`);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'string') { safeString(value, path, 20_000); return; }
  if (Array.isArray(value)) {
    if (value.length > 200) throw new Error(`${path} is too large`);
    value.forEach((item, index) => safeJson(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!value || typeof value !== 'object') throw new Error(`${path} is not JSON`);
  const entries = Object.entries(value);
  if (entries.length > 100) throw new Error(`${path} is too large`);
  for (const [key, item] of entries) {
    if (!/^[A-Za-z0-9@._:-]{1,100}$/.test(key) ||
        /^(?:draft|audit|internal|editorialTopics|createdBy|updatedBy|publishedBy|reason|config)$/i.test(key)) {
      throw new Error(`${path}.${key} is forbidden`);
    }
    safeJson(item, `${path}.${key}`, depth + 1);
  }
};
const seoText = (value: unknown, path: string) => {
  const record = exact(value, ['ar-SA', 'en', 'default'], path);
  safeString(record['ar-SA'], `${path}.ar-SA`);
  safeString(record.en, `${path}.en`);
  safeString(record.default, `${path}.default`);
};

function validateResolvedPage(value: unknown, path: string): asserts value is SeoResolvedPage {
  const page = exact(value, ['key', 'locale', 'title', 'description', 'heading', 'canonical', 'robots', 'openGraph', 'twitter', 'sitemap', 'alternates', 'structuredData', 'faqs'], path);
  for (const key of ['key', 'locale', 'title', 'description', 'heading', 'canonical', 'robots']) safeString(page[key], `${path}.${key}`);
  const openGraph = exact(page.openGraph, ['title', 'description', 'image', 'locale', 'siteName'], `${path}.openGraph`);
  for (const key of ['title', 'description', 'locale', 'siteName']) safeString(openGraph[key], `${path}.openGraph.${key}`);
  nullableString(openGraph.image, `${path}.openGraph.image`);
  const twitter = exact(page.twitter, ['title', 'description', 'image', 'card'], `${path}.twitter`);
  for (const key of ['title', 'description', 'card']) safeString(twitter[key], `${path}.twitter.${key}`);
  nullableString(twitter.image, `${path}.twitter.image`);
  const sitemap = exact(page.sitemap, ['include', 'priority', 'changeFrequency', 'lastmod'], `${path}.sitemap`);
  boolean(sitemap.include, `${path}.sitemap.include`);
  if (sitemap.priority !== null && (typeof sitemap.priority !== 'number' || !Number.isFinite(sitemap.priority))) throw new Error(`${path}.sitemap.priority is invalid`);
  safeString(sitemap.changeFrequency, `${path}.sitemap.changeFrequency`);
  nullableString(sitemap.lastmod, `${path}.sitemap.lastmod`);
  if (!Array.isArray(page.alternates) || page.alternates.length > 3) throw new Error(`${path}.alternates is invalid`);
  page.alternates.forEach((item: unknown, index: number) => {
    const alternate = exact(item, ['locale', 'href'], `${path}.alternates[${index}]`);
    safeString(alternate.locale, `${path}.alternates[${index}].locale`);
    safeString(alternate.href, `${path}.alternates[${index}].href`);
  });
  if (!Array.isArray(page.structuredData) || page.structuredData.length > 10) throw new Error(`${path}.structuredData is invalid`);
  page.structuredData.forEach((item: unknown, index: number) => safeJson(item, `${path}.structuredData[${index}]`));
  if (!Array.isArray(page.faqs) || page.faqs.length > 100) throw new Error(`${path}.faqs is invalid`);
  page.faqs.forEach((item: unknown, index: number) => {
    const faq = exact(item, ['question', 'answer', 'order'], `${path}.faqs[${index}]`);
    safeString(faq.question, `${path}.faqs[${index}].question`);
    safeString(faq.answer, `${path}.faqs[${index}].answer`, 20_000);
    if (!Number.isSafeInteger(faq.order)) throw new Error(`${path}.faqs[${index}].order is invalid`);
  });
}

export function validatePublicSeoPayload(value: unknown): asserts value is SeoPublicPayload {
  const root = exact(value, ['success', 'schemaVersion', 'version', 'global', 'organization', 'mobileApplication', 'crawlerPolicy', 'pages'], '$');
  if (root.success !== true || root.schemaVersion !== 1) throw new Error('Invalid public SEO schema');
  const version = exact(root.version, ['id', 'number', 'publishedAt'], '$.version');
  safeString(version.id, '$.version.id', 100);
  if (!Number.isSafeInteger(version.number) || version.number < 1) throw new Error('Invalid public SEO version');
  safeString(version.publishedAt, '$.version.publishedAt');
  const global = exact(root.global, ['siteName', 'siteNames', 'title', 'description', 'socialTitle', 'socialDescription', 'ogImage', 'xImage', 'canonicalOrigin', 'defaultLanguage', 'supportedLanguages', 'defaultLocale', 'assets'], '$.global');
  safeString(global.siteName, '$.global.siteName');
  for (const key of ['siteNames', 'title', 'description', 'socialTitle', 'socialDescription']) seoText(global[key], `$.global.${key}`);
  nullableString(global.ogImage, '$.global.ogImage');
  nullableString(global.xImage, '$.global.xImage');
  for (const key of ['canonicalOrigin', 'defaultLanguage', 'defaultLocale']) safeString(global[key], `$.global.${key}`);
  if (!Array.isArray(global.supportedLanguages) || global.supportedLanguages.length > 2) throw new Error('Invalid supported languages');
  global.supportedLanguages.forEach((item: unknown, index: number) => safeString(item, `$.global.supportedLanguages[${index}]`));
  const assets = exact(global.assets, ['faviconIco', 'faviconPng', 'icon192', 'icon512', 'appleTouchIcon', 'socialShare'], '$.global.assets');
  for (const key of Object.keys(assets)) nullableString(assets[key], `$.global.assets.${key}`);
  const organization = exact(root.organization, ['name', 'alternateName', 'logo', 'url', 'publicEmail', 'businessRegistration', 'sameAs'], '$.organization');
  for (const key of ['name', 'alternateName', 'url', 'publicEmail', 'businessRegistration']) safeString(organization[key], `$.organization.${key}`);
  nullableString(organization.logo, '$.organization.logo');
  if (!Array.isArray(organization.sameAs) || organization.sameAs.length > 20) throw new Error('Invalid organization links');
  organization.sameAs.forEach((item: unknown, index: number) => safeString(item, `$.organization.sameAs[${index}]`));
  if (root.mobileApplication !== null) {
    const mobile = exact(root.mobileApplication, ['enabled', 'androidStoreUrl', 'iosStoreUrl', 'applicationCategory', 'operatingSystems', 'pricingDescription'], '$.mobileApplication');
    if (mobile.enabled !== true) throw new Error('Invalid mobile application state');
    nullableString(mobile.androidStoreUrl, '$.mobileApplication.androidStoreUrl');
    nullableString(mobile.iosStoreUrl, '$.mobileApplication.iosStoreUrl');
    safeString(mobile.applicationCategory, '$.mobileApplication.applicationCategory');
    if (!Array.isArray(mobile.operatingSystems) || mobile.operatingSystems.length > 2) throw new Error('Invalid operating systems');
    mobile.operatingSystems.forEach((item: unknown, index: number) => safeString(item, `$.mobileApplication.operatingSystems[${index}]`));
    seoText(mobile.pricingDescription, '$.mobileApplication.pricingDescription');
  }
  const crawler = exact(root.crawlerPolicy, ['mainstreamIndexing', 'googlebot', 'bingbot', 'oaiSearchBot'], '$.crawlerPolicy');
  for (const key of Object.keys(crawler)) boolean(crawler[key], `$.crawlerPolicy.${key}`);
  if (!Array.isArray(root.pages) || root.pages.length > 18) throw new Error('Invalid public SEO pages');
  root.pages.forEach((item: unknown, index: number) => validateResolvedPage(item, `$.pages[${index}]`));
}

async function digest(encoded: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

const timestamps = (at: string) => {
  const started = Date.parse(at);
  if (!ISO_DATE.test(at) || !Number.isFinite(started)) throw new Error('Invalid projection timestamp');
  return { updatedAt: at, expiresAt: new Date(started + MAX_AGE_MS).toISOString() };
};

export function negativeSeoProjection(sourceRevision: number, at = new Date().toISOString()): SeoProjection {
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) throw new Error('Invalid SEO revision');
  return {
    schemaVersion: SCHEMA_VERSION, published: false, sourceRevision, ...timestamps(at),
    etag: `W/"seo-none-r${sourceRevision}"`,
  };
}

export async function publishedSeoProjection(version: SeoVersion, sourceRevision: number, at = new Date().toISOString()): Promise<SeoProjection> {
  const payload = publicSeoPayload(version);
  const encoded = JSON.stringify(payload);
  if (new TextEncoder().encode(encoded).byteLength > MAX_ENCODED_BYTES) throw new Error('Public SEO projection is too large');
  return {
    schemaVersion: SCHEMA_VERSION, published: true, sourceRevision, ...timestamps(at),
    versionId: version.id, etag: `W/"seo-${await digest(encoded)}"`, encoded,
  };
}

export async function validateSeoProjection(value: unknown, now = Date.now()): Promise<SeoProjection> {
  const common = ['schemaVersion', 'published', 'sourceRevision', 'updatedAt', 'expiresAt', 'etag'];
  const source = value as Record<string, unknown> | null;
  const published = source?.published;
  const projection = exact(value, published === true ? [...common, 'versionId', 'encoded'] : common, '$projection');
  if (projection.schemaVersion !== SCHEMA_VERSION || typeof projection.published !== 'boolean' ||
      !Number.isSafeInteger(projection.sourceRevision) || projection.sourceRevision < 0) throw new Error('Invalid SEO projection metadata');
  const updated = Date.parse(projection.updatedAt), expires = Date.parse(projection.expiresAt);
  if (!ISO_DATE.test(projection.updatedAt) || !ISO_DATE.test(projection.expiresAt) ||
      !Number.isFinite(updated) || !Number.isFinite(expires) || expires <= updated || expires - updated > MAX_AGE_MS || expires <= now) {
    throw new Error('SEO projection is expired');
  }
  safeString(projection.etag, '$projection.etag', 100);
  if (!projection.published) {
    if (projection.etag !== `W/"seo-none-r${projection.sourceRevision}"`) throw new Error('Invalid negative SEO projection ETag');
    return projection as SeoProjection;
  }
  safeString(projection.versionId, '$projection.versionId', 100);
  if (typeof projection.encoded !== 'string' || new TextEncoder().encode(projection.encoded).byteLength > MAX_ENCODED_BYTES) {
    throw new Error('Invalid public SEO projection payload');
  }
  const payload = JSON.parse(projection.encoded);
  validatePublicSeoPayload(payload);
  if (payload.version.id !== projection.versionId || projection.etag !== `W/"seo-${await digest(projection.encoded)}"`) {
    throw new Error('Public SEO projection integrity check failed');
  }
  return projection as SeoProjection;
}