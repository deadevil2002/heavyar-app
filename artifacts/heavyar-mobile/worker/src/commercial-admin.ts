import {
  applyCommercialChange, buildLegacyCatalog, calculateCommercial, resolveRule, validateRule,
  type CommercialCatalog, type CommercialChangeResult,
} from './commercial';
import { GCC_COUNTRIES } from '../../constants/gcc';
import { mockCategories } from '../../mocks/categories';
import { isQuotaError } from './quota-policy';
import { commercialReadCache, commercialExpiry } from './config-cache';

export interface CommercialAdminStore {
  read(collection: string, id: string): Promise<{ data: any; updateTime?: string } | null>;
  save(prior: { data: any; updateTime?: string } | null, change: CommercialChangeResult, before: CommercialCatalog): Promise<void>;
}
export interface CommercialAdminActor { uid: string; canRead: boolean; canManage: boolean }
export interface CommercialEnvironment { PAYMENT_PLATFORM_FEE_RATE?: string; PAYMENT_VAT_RATE?: string; FIREBASE_PROJECT_ID?: string }

const precedence = ['provider', 'country_category', 'country', 'category', 'global'];
const jsonBody = async (req: Request) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request body');
  return body as Record<string, any>;
};
function validCatalog(data: any): CommercialCatalog {
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 1 || !Array.isArray(data.rules) || !data.rules.length) {
    throw new Error('Stored commercial configuration is invalid');
  }
  return { revision: data.revision, rules: data.rules.map(validateRule) };
}
export function commercialView(catalog: CommercialCatalog, actor: CommercialAdminActor, legacyFallback: boolean, now: string) {
  return {
    success: true, revision: catalog.revision, canManage: actor.canManage, legacyFallback,
    rules: catalog.rules.map(rule => ({
      ...rule,
      status: rule.status === 'draft' || rule.status === 'retired' ? rule.status
        : rule.effectiveTo && rule.effectiveTo <= now ? 'retired'
          : rule.effectiveFrom > now ? 'scheduled' : 'active',
    })),
    countries: GCC_COUNTRIES, categories: mockCategories, serverTime: now, precedence,
  };
}
async function validProvider(store: CommercialAdminStore, uid: unknown) {
  if (uid == null || uid === '') return;
  if (typeof uid !== 'string' || uid.length > 128 || !/^[A-Za-z0-9_-]+$/.test(uid)) throw new Error('Invalid provider identifier');
  const provider = await store.read('users', uid);
  if (!provider || provider.data.role !== 'provider' || provider.data.accountStatus === 'deletion_requested') throw new Error('Provider does not exist or is not eligible for a negotiated rule');
}

/** Uses the same calculator as rentals; no browser amount/rate becomes a stored quote. */
export async function handleCommercialAdmin(
  req: Request, store: CommercialAdminStore, actor: CommercialAdminActor, env: CommercialEnvironment,
) {
  const path = new URL(req.url).pathname;
  const preview = path === '/api/admin/commercial/preview';
  if (!actor.uid || !actor.canRead) return { error: 'Commercial read permission required', status: 403 };
  if (!preview && req.method !== 'GET' && !actor.canManage) return { error: 'Commercial management permission required', status: 403 };
  if (preview && req.method !== 'POST' || !preview && !['GET', 'POST'].includes(req.method)) return { error: 'Method not allowed', status: 405 };
  // A storage outage never masquerades as a missing configuration.
  // Only informational reads may use this cache. Mutations and financial
  // snapshot creation always read authority (snapshot path lives in index.ts).
  const load = () => store.read('commercialSettings', 'catalog');
  const prior = env.FIREBASE_PROJECT_ID && (req.method === 'GET' || preview)
    ? await commercialReadCache.get(env.FIREBASE_PROJECT_ID, load, commercialExpiry) : await load();
  const catalog = prior ? validCatalog(prior.data) : buildLegacyCatalog(
    env.PAYMENT_PLATFORM_FEE_RATE === undefined ? 0.10 : Number(env.PAYMENT_PLATFORM_FEE_RATE));
  const now = new Date().toISOString();
  if (!preview && req.method === 'GET') return commercialView(catalog, actor, !prior, now);
  try {
    const body = await jsonBody(req);
    if (preview) {
      const allowed = ['baseAmountMinor', 'countryCode', 'categoryId', 'providerUid', 'currency', 'at', 'draftRule'];
      if (Object.keys(body).some(key => !allowed.includes(key))) throw new Error('Unsupported preview field');
      const country = GCC_COUNTRIES.find(c => c.code === body.countryCode);
      if (!country || country.currency !== body.currency) throw new Error('Country and native currency must match');
      await validProvider(store, body.providerUid);
      const input = { countryCode: body.countryCode, categoryId: body.categoryId, providerUid: body.providerUid || 'preview-provider', currency: body.currency, at: body.at || now };
      let matchedRule;
      if (body.draftRule) {
        await validProvider(store, body.draftRule.scope?.providerUid);
        const draft = applyCommercialChange(catalog, { action: 'create', expectedRevision: catalog.revision, reason: 'Informational preview', rule: body.draftRule }, actor.uid, now);
        matchedRule = draft.audit.after!;
      } else matchedRule = resolveRule(catalog, input);
      let taxAmountMinor: number | undefined;
      if (body.currency === 'SAR') {
        const rate = env.PAYMENT_VAT_RATE === undefined ? 0.15 : Number(env.PAYMENT_VAT_RATE);
        const bps = Math.round(rate * 10000);
        if (!Number.isFinite(rate) || rate < 0 || rate >= 1 || Math.abs(bps - rate * 10000) > 1e-8) throw new Error('Existing tax policy is invalid');
        if (!Number.isSafeInteger(body.baseAmountMinor) || body.baseAmountMinor < 0) throw new Error('Invalid base amount');
        taxAmountMinor = Number((BigInt(body.baseAmountMinor) * BigInt(bps) + 5000n) / 10000n);
      }
      const snapshot = calculateCommercial(matchedRule, {
        ...input, baseAmountMinor: body.baseAmountMinor, calculatedAt: now, taxAmountMinor,
        ...(taxAmountMinor === undefined ? {} : { taxReference: 'legacy-sar-vat-policy' }),
      });
      return { success: true, snapshot, matchedRule, informationalOnly: true };
    }
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision !== catalog.revision) {
      return { error: 'Commercial configuration changed. Reload before confirming.', errorCode: 'VERSION_PRECONDITION_FAILED', status: 412, revision: catalog.revision };
    }
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 1000) throw new Error('A reason of 3–1000 characters is required');
    // One-time, owner-authorized migration persists the verified legacy policy.
    // It cannot overwrite a catalog or accept browser-supplied economic terms.
    if (body.action === 'initialize') {
      if (Object.keys(body).some(key => !['action', 'expectedRevision', 'reason'].includes(key))) throw new Error('Initialization cannot accept commercial terms');
      if (prior) return { error: 'Commercial configuration is already initialized', status: 409 };
      const seeded = { ...catalog, rules: catalog.rules.map(rule => ({
        ...rule, createdAt: now, updatedAt: now, createdBy: actor.uid, updatedBy: actor.uid,
      })) };
      await store.save(null, {
        catalog: seeded, audit: {
          action: 'create', actorUid: actor.uid, at: now, reason: body.reason,
          version: seeded.rules[0].version, before: null, after: seeded.rules[0],
          revisionBefore: catalog.revision, revisionAfter: seeded.revision,
          changes: seeded.rules.map(after => ({ before: null, after })),
        },
      }, catalog);
      commercialReadCache.invalidate(env.FIREBASE_PROJECT_ID);
      return { ...commercialView(seeded, actor, false, now), initialized: true };
    }
    await validProvider(store, body.rule?.scope?.providerUid);
    if (body.version) await validProvider(store, catalog.rules.find(rule => rule.version === body.version)?.scope.providerUid);
    const change = applyCommercialChange(catalog, body as any, actor.uid, now);
    if (new TextEncoder().encode(JSON.stringify(change.catalog)).byteLength > 600_000) throw new Error('Commercial history capacity reached; no history has been removed');
    await store.save(prior, change, catalog);
    commercialReadCache.invalidate(env.FIREBASE_PROJECT_ID);
    return { ...commercialView(change.catalog, actor, false, now), changedVersion: change.audit.version };
  } catch (error) {
    if (isQuotaError(error)) throw error;
    // Only validation errors are returned as 400; storage/CAS failures are handled
    // by the adapter, preserving its retryable conflict/outage semantics.
    if (error instanceof CommercialPersistenceError) return { error: error.message, errorCode: error.status === 409 ? 'VERSION_PRECONDITION_FAILED' : 'COMMERCIAL_UNAVAILABLE', status: error.status };
    return { error: error instanceof Error ? error.message : 'Invalid commercial configuration', errorCode: 'COMMERCIAL_INVALID', status: 400 };
  }
}
export class CommercialPersistenceError extends Error {
  constructor(message: string, public status: 409 | 503) { super(message); }
}