import { readSeoState, readSeoVersion, type SeoStore } from './seo-admin';
import { seoPayloadCache, seoProjectionRecoveryCache } from './config-cache';
import { isQuotaError, quotaResponse } from './quota-policy';
import {
  negativeSeoProjection, publicSeoPayload, publishedSeoProjection, validateSeoProjection,
  type SeoProjection,
} from './seo-projection';
export { publicSeoPayload } from './seo-projection';
export async function handleSeoPublic(req: Request, store: Pick<SeoStore, 'read' | 'cacheKey' | 'projection'>): Promise<Response> {
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
    const recover = async (): Promise<SeoProjection> => {
      const { state } = await readSeoState(store);
      const projection = state.currentPublishedId
        ? await publishedSeoProjection((await readSeoVersion(store, state, state.currentPublishedId)).data, state.revision)
        : negativeSeoProjection(state.revision);
      if (store.projection) await store.projection.write(projection);
      return projection;
    };
    let projection: SeoProjection | null = null;
    if (store.projection) {
      try { projection = await validateSeoProjection(await store.projection.read()); } catch { /* controlled recovery below */ }
      if (!projection) projection = store.cacheKey
        ? await seoProjectionRecoveryCache.get(store.cacheKey, recover)
        : await recover();
    } else {
      const load = async () => {
        const recovered = await recover();
        if (!recovered.published) throw new Error('SEO_NOT_PUBLISHED');
        return { encoded: recovered.encoded, etag: recovered.etag };
      };
      const legacy = store.cacheKey ? await seoPayloadCache.get(store.cacheKey, load) : await load();
      projection = {
        schemaVersion: 1, published: true, sourceRevision: 0,
        updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
        versionId: JSON.parse(legacy.encoded).version.id, ...legacy,
      };
    }
    if (!projection) throw new Error('SEO projection recovery returned no result.');
    const resolved = projection;
    headers.ETag = resolved.etag;
    headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
    const conditional = req.headers.get('If-None-Match')?.split(',').map(v => v.trim()) || [];
    if (conditional.some(v => v === '*' || v.replace(/^W\//, '') === headers.ETag.replace(/^W\//, ''))) return new Response(null, { status: 304, headers });
    if (!resolved.published) return json({ success: false, errorCode: 'SEO_NOT_PUBLISHED', error: 'No SEO configuration has been published.' }, 404);
    return new Response(req.method === 'HEAD' ? null : resolved.encoded, { status: 200, headers });
  } catch (error) {
    if (isQuotaError(error)) return quotaResponse(req, error);
    if (error instanceof Error && error.message === 'SEO_NOT_PUBLISHED') return json({ success: false, errorCode: 'SEO_NOT_PUBLISHED', error: 'No SEO configuration has been published.' }, 404);
    return json({ success: false, errorCode: 'SEO_UNAVAILABLE', error: 'Published SEO configuration is temporarily unavailable.' }, 503);
  }
}