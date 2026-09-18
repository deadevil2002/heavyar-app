import { resolveSeo, validateSeoConfig } from './seo';
import { readSeoState, readSeoVersion, type SeoStore } from './seo-admin';
import type { SeoVersion } from './seo-types';
import { seoPayloadCache } from './config-cache';
import { isQuotaError, quotaResponse } from './quota-policy';

/** An explicit allowlist, never a redacted copy of an Admin document. */
export function publicSeoPayload(version: SeoVersion) {
  const config = validateSeoConfig(version.config);
  if (version.status !== 'published' || !version.publishedAt) throw new Error('No current publication.');
  const g = config.global, o = config.organization, m = config.mobileApplication;
  return {
    success: true, schemaVersion: 1,
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
      enabled: true, androidStoreUrl: m.androidStoreUrl, iosStoreUrl: m.iosStoreUrl,
      applicationCategory: m.applicationCategory, operatingSystems: m.operatingSystems, pricingDescription: m.pricingDescription,
    } : null,
    crawlerPolicy: {
      mainstreamIndexing: config.crawlers.mainstreamIndexing,
      googlebot: config.crawlers.googlebot, bingbot: config.crawlers.bingbot, oaiSearchBot: config.crawlers.oaiSearchBot,
    },
    pages: resolveSeo(config, version.publishedAt),
  };
}
export async function handleSeoPublic(req: Request, store: Pick<SeoStore, 'read' | 'cacheKey'>): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'ETag', 'Cache-Control': 'no-store',
  };
  const json = (value: unknown, status: number) => new Response(req.method === 'HEAD' ? null : JSON.stringify(value), { status, headers });
  if (!['GET', 'HEAD'].includes(req.method)) {
    headers.Allow = 'GET, HEAD';
    return json({ success: false, error: 'Read-only endpoint.' }, 405);
  }
  if ([...new URL(req.url).searchParams.keys()].length) return json({ success: false, error: 'Published configuration does not accept version selection.' }, 400);
  try {
    const load = async () => {
    const { state } = await readSeoState(store);
    if (!state.currentPublishedId) throw new Error('SEO_NOT_PUBLISHED');
    const record = await readSeoVersion(store, state, state.currentPublishedId);
    const payload = publicSeoPayload(record.data);
    const encoded = JSON.stringify(payload);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded));
    const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    return { encoded, etag: `W/"seo-${hash}"` };
    };
    // Never share an unscoped store across projects/tests. No downstream TTL is
    // added to our 30s TTL: clients revalidate against the application cache.
    const { encoded, etag } = store.cacheKey ? await seoPayloadCache.get(store.cacheKey, load) : await load();
    headers.ETag = etag;
    headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
    const conditional = req.headers.get('If-None-Match')?.split(',').map(v => v.trim()) || [];
    if (conditional.some(v => v === '*' || v.replace(/^W\//, '') === headers.ETag.replace(/^W\//, ''))) return new Response(null, { status: 304, headers });
    return new Response(req.method === 'HEAD' ? null : encoded, { status: 200, headers });
  } catch (error) {
    if (isQuotaError(error)) return quotaResponse(req, error);
    if (error instanceof Error && error.message === 'SEO_NOT_PUBLISHED') return json({ success: false, errorCode: 'SEO_NOT_PUBLISHED', error: 'No SEO configuration has been published.' }, 404);
    return json({ success: false, errorCode: 'SEO_UNAVAILABLE', error: 'Published SEO configuration is temporarily unavailable.' }, 503);
  }
}