import { quoteForRequest, paymentIdForRequest, idempotencyKeyForPayment, invoiceNumberForPayment, TapPaymentProvider, canTransition, PAYMENT_STATES, stateForProvider, pricingConfig, type PaymentQuote, type PaymentState } from './payment';
import { handleAdmin, type AdminRole } from './admin';
import { canApplyProviderResult, defaultVerificationPolicy, defaultVerificationProfile, deriveProviderTrust, evaluateRisk, normalizeVerificationPolicy, providerComponentNames, providerVerificationFor, type IdentityVerificationProvider, type ProviderComponents, type VerificationPolicy } from './verification';

interface KVNamespace { get(key: string, type?: 'json'): Promise<any>; put(key: string, value: string, options?: { expirationTtl: number }): Promise<void>; delete(key: string): Promise<void>; }
export interface Env {
  CLOUDINARY_CLOUD_NAME?: string; CLOUDINARY_API_KEY?: string; CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_FOLDER?: string; TAP_SECRET_KEY_TEST?: string; RESEND_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string; FIREBASE_CLIENT_EMAIL?: string; FIREBASE_PRIVATE_KEY?: string;
  CORS_ORIGINS?: string; PAYMENT_PLATFORM_FEE_RATE?: string; PAYMENT_VAT_RATE?: string; OTP_KV?: KVNamespace;
  IDENTITY_PROVIDER_MODE?: 'official';
  VERIFICATION_RETENTION_DAYS?: string;
}
type User = { uid: string; admin: boolean; role?: AdminRole; email?: string };
let authOverride: User | undefined;
let firestoreOverride: ((collection: string, id: string) => any) | undefined;
let assetOwnedOverride: boolean | undefined;
let firestoreWrites: Array<{ path: string; fields: Record<string, unknown> }> | undefined;
let reservationConflict = false;
let capturedCommits: unknown[] | undefined;
let verificationProviderOverride: IdentityVerificationProvider | undefined;
export const __test = { setAuth(user?: User) { authOverride = user; }, setFirestore(fn?: (collection: string, id: string) => any) { firestoreOverride = fn; }, setAssetOwned(value?: boolean) { assetOwnedOverride = value; }, captureWrites(target?: Array<{ path: string; fields: Record<string, unknown> }>) { firestoreWrites = target; }, captureCommits(target?: unknown[]) { capturedCommits = target; }, setReservationConflict(value: boolean) { reservationConflict = value; }, setVerificationProvider(provider?: IdentityVerificationProvider) { verificationProviderOverride = provider; }, firestoreUrl(env: Env, path: string) { return firestoreUrl(env, path); }, verifyToken: auth, quoteForRequest, canTransition, paymentStates: PAYMENT_STATES };
const TAP = 'https://api.tap.company/v2';
const enc = new TextEncoder();
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64u = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cors = (env: Env, origin: string | null) => {
  const allow = (env.CORS_ORIGINS || 'https://heavyar.app,https://www.heavyar.app,https://heavyar-app.web.app,https://heavyar-app.firebaseapp.com').split(',').map(x => x.trim());
  return { 'Access-Control-Allow-Origin': allow.includes(origin || '') ? origin! : 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-ID', Vary: 'Origin' };
};
const out = (env: Env, req: Request, value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...cors(env, req.headers.get('Origin')) } });
const err = (message: string): never => { throw new Error(message); };
const authErr = (): never => { throw new Error('AUTH_REQUIRED'); };

type FirebaseJwk = JsonWebKey & { kid?: string };
let firebaseKeys: Record<string, FirebaseJwk> = {};
async function refreshFirebaseKeys() {
  const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!response.ok) err('Authentication unavailable');
  const { keys = [] } = await response.json() as { keys?: FirebaseJwk[] };
  firebaseKeys = Object.fromEntries(keys.filter(key => key.kid).map(key => [key.kid!, key]));
}
async function auth(req: Request, env: Env): Promise<User> {
  if (authOverride && req.headers.has('Authorization')) return authOverride;
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!token || !env.FIREBASE_PROJECT_ID) authErr();
  const [h, p, s] = token.split('.'); if (!h || !p || !s) authErr();
  let header: any, payload: any;
  try { header = JSON.parse(new TextDecoder().decode(b64(h))); payload = JSON.parse(new TextDecoder().decode(b64(p))); } catch { authErr(); }
  // A small allowance avoids rejecting a legitimate device with a minor clock
  // offset without accepting a materially future-issued Firebase token.
  const now = Date.now(), skew = 30_000;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid ||
      payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` ||
      typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128 ||
      typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) ||
      typeof payload.auth_time !== 'number' || !Number.isFinite(payload.auth_time) ||
      payload.exp * 1000 <= now || payload.iat * 1000 > now + skew || payload.auth_time * 1000 > now + skew ||
      payload.auth_time > payload.iat || payload.iat >= payload.exp) authErr();
  if (!firebaseKeys[header.kid]) await refreshFirebaseKeys();
  let firebaseKey = firebaseKeys[header.kid];
  if (!firebaseKey) { await refreshFirebaseKeys(); firebaseKey = firebaseKeys[header.kid]; }
  if (!firebaseKey) authErr();
  let key: CryptoKey;
  try { key = await crypto.subtle.importKey('jwk', firebaseKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']); } catch { authErr(); }
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key!, b64(s), enc.encode(`${h}.${p}`))) authErr();
  const role = payload.heavyarRole === 'super_admin' || payload.role === 'super_admin'
    ? 'super_admin'
    : payload.heavyarRole === 'admin' || payload.role === 'admin' || payload.admin === true
      ? 'admin'
      : undefined;
  return { uid: payload.sub, admin: role === 'admin' || role === 'super_admin', role, email: payload.email };
}
async function googleToken(env: Env): Promise<string> {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) err('Firestore unavailable');
  const privateKey = env.FIREBASE_PRIVATE_KEY as string;
  const now = Math.floor(Date.now() / 1000), h = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const p = b64u(enc.encode(JSON.stringify({ iss: env.FIREBASE_CLIENT_EMAIL, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const key = await crypto.subtle.importKey('pkcs8', b64(privateKey.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const jwt = `${h}.${p}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${h}.${p}`)))}`;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` });
  if (!r.ok) err('Firestore unavailable'); return (await r.json() as { access_token: string }).access_token;
}
const val = (v: any): any => v?.stringValue ?? v?.integerValue ?? v?.doubleValue ?? v?.booleanValue ?? v?.timestampValue ?? (v?.arrayValue ? (v.arrayValue.values || []).map(val) : v?.mapValue ? decode(v.mapValue) : undefined);
const decode = (d: any) => Object.fromEntries(Object.entries(d?.fields || {}).map(([k, v]) => [k, val(v)]));
function fullName(env: Env, path: string) { return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`; }
function firestoreUrl(env: Env, path: string) {
  const suffix = path.startsWith(':') ? `documents${path}` : `documents/${path}`;
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/${suffix}`;
}
async function commitWrites(env: Env, writes: unknown[]) {
  if (capturedCommits) { capturedCommits.push(writes); return; }
  const r = await fs(env, ':commit', { method: 'POST', body: JSON.stringify({ writes }) });
  if (!r) err('Firestore commit failed');
}
async function fs(env: Env, path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(firestoreUrl(env, path), { ...init, headers: { Authorization: `Bearer ${await googleToken(env)}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (r.status === 404) return null; if (!r.ok) err('Firestore unavailable'); return r.status === 204 ? null : r.json();
}
async function createDoc(env: Env, path: string, fields: Record<string, unknown>) {
  if (firestoreWrites) { firestoreWrites.push({ path: `${path}?currentDocument.exists=false`, fields }); return null; }
  return fs(env, `${path}?currentDocument.exists=false`, { method: 'PATCH', body: JSON.stringify({ fields }) });
}
async function hashedId(value: string): Promise<string> { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(value))); }
async function deleteDocCas(env: Env, path: string, updateTime: string) { if (firestoreWrites) { firestoreWrites.push({ path: `${path}?currentDocument.updateTime=${encodeURIComponent(updateTime)}`, fields: {} }); return null; } return fs(env, `${path}?currentDocument.updateTime=${encodeURIComponent(updateTime)}`, { method: 'DELETE' }); }
async function getDoc(env: Env, collection: string, id: string) { if (firestoreOverride) return firestoreOverride(collection, id); const d = await fs(env, `${collection}/${encodeURIComponent(id)}`); return d ? decode(d) : null; }
async function getRawDoc(env: Env, collection: string, id: string): Promise<{ data: any; updateTime?: string } | null> {
  if (firestoreOverride) { const data = firestoreOverride(collection, id); return data ? { data, updateTime: 'test-update-time' } : null; }
  const d = await fs(env, `${collection}/${encodeURIComponent(id)}`); return d ? { data: decode(d), updateTime: d.updateTime } : null;
}
async function patchDoc(env: Env, path: string, fields: Record<string, unknown>) {
  if (firestoreWrites) { firestoreWrites.push({ path, fields }); return null; }
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&') + '&currentDocument.exists=true';
  return fs(env, `${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
}
async function compareAndSwap(env: Env, path: string, updateTime: string, fields: Record<string, unknown>) {
  if (reservationConflict) throw new Error('precondition failed');
  if (firestoreWrites) { firestoreWrites.push({ path, fields }); return null; }
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&') + `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
  return fs(env, `${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
}
function amount(r: any, e: any): number { return quoteForRequest(r, e, String(r?.id || 'request')).amount; }
function paymentPricing(env: Env) {
  return pricingConfig(
    env.PAYMENT_PLATFORM_FEE_RATE === undefined ? 0.10 : Number(env.PAYMENT_PLATFORM_FEE_RATE),
    env.PAYMENT_VAT_RATE === undefined ? 0.15 : Number(env.PAYMENT_VAT_RATE),
  );
}
function paymentQuote(env: Env, r: any, e: any, requestId: string) {
  return quoteForRequest(r, e, requestId, Date.now(), paymentPricing(env));
}
function owned(u: User, r: any) { return !!r && (u.admin || r.customerUid === u.uid || r.renterUid === u.uid); }
async function enforceOperationalAccess(env: Env, u: User, equipment?: any) {
  if (!u.admin) {
    const profile = await getDoc(env, 'users', u.uid);
    if (profile?.suspensionStatus === 'temporarily_suspended' || profile?.suspensionStatus === 'permanently_suspended') err('ACCOUNT_SUSPENDED');
  }
  if (equipment?.isActive === false || equipment?.moderationStatus === 'suspended' || equipment?.moderationStatus === 'hidden' || equipment?.adminHidden === true) err('LISTING_UNAVAILABLE');
}
function verificationProfileFields(uid: string, now: string) {
  const profile = defaultVerificationProfile(uid, now);
  return {
    uid: { stringValue: profile.uid },
    identity: { mapValue: { fields: { status: { stringValue: 'unverified' }, provider: { stringValue: 'unconfigured' } } } },
    business: { mapValue: { fields: { status: { stringValue: 'unverified' } } } },
    bankAccount: { mapValue: { fields: { status: { stringValue: 'unverified' } } } },
    manualReview: { mapValue: { fields: { status: { stringValue: 'unverified' } } } },
    overallTrust: { mapValue: { fields: { status: { stringValue: 'unverified' } } } },
    providerVerification: { mapValue: { fields: {
      status: { stringValue: profile.providerVerification.status },
      requiredComponents: { arrayValue: { values: profile.providerVerification.requiredComponents.map(component => ({ stringValue: component })) } },
      components: { mapValue: { fields: Object.fromEntries(providerComponentNames.map(component => [component, { stringValue: profile.providerVerification.components[component] }])) } },
    } } },
    updatedAt: { timestampValue: now },
  };
}
function safeProfile(profile: any, uid: string) {
  const p = profile || defaultVerificationProfile(uid, new Date().toISOString());
  const identityExpiresAt = p.identity?.expiresAt || null;
  // Expiry is derived only from a backend-written timestamp. This ensures a
  // stale pending attempt is never presented as still actionable to clients.
  const identityStatus = p.identity?.status === 'pending' &&
    Number.isFinite(Date.parse(String(identityExpiresAt))) &&
    Date.parse(String(identityExpiresAt)) <= Date.now()
    ? 'expired'
    : String(p.identity?.status || 'unverified');
  return {
    uid,
    identity: { status: identityStatus, provider: String(p.identity?.provider || 'unconfigured'), verifiedAt: p.identity?.verifiedAt || null, expiresAt: identityExpiresAt },
    business: { status: String(p.business?.status || 'unverified') },
    bankAccount: { status: String(p.bankAccount?.status || 'unverified') },
    manualReview: { status: String(p.manualReview?.status || 'unverified') },
    overallTrust: { status: String(p.overallTrust?.status || 'unverified') },
    providerVerification: (() => {
      const provider = providerVerificationFor(p);
      return { status: provider.status, requiredComponents: provider.requiredComponents, components: provider.components };
    })(),
  };
}
function safeAttempt(id: string, value: any) {
  return { attemptId: id, status: String(value?.status || 'unverified'), provider: String(value?.provider || 'unconfigured'), verificationType: String(value?.verificationType || 'identity'), createdAt: value?.createdAt || null, expiresAt: value?.expiresAt || null, verifiedAt: value?.verifiedAt || null, failureCode: value?.failureCode || null, reviewRequired: value?.reviewRequired === true };
}
async function verificationProfile(req: Request, env: Env, u: User) {
  const profile = await getDoc(env, 'verificationProfiles', u.uid);
  return out(env, req, { success: true, profile: safeProfile(profile, u.uid) });
}
async function verificationAttempt(req: Request, env: Env, u: User, attemptId: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(attemptId)) return out(env, req, { success: false, error: 'Not found' }, 404);
  const item = await getDoc(env, 'verificationAttempts', attemptId);
  if (!item || item.uid !== u.uid) return out(env, req, { success: false, error: 'Not found' }, 404);
  return out(env, req, { success: true, attempt: safeAttempt(attemptId, item) });
}
async function verificationPolicy(req: Request, env: Env, _u: User) {
  const stored = await getDoc(env, 'verificationPolicies', 'default');
  // A malformed stored document is not an authorization bypass: it behaves as
  // the deliberately disabled default until trusted operations replace it.
  const policy = normalizeVerificationPolicy(stored) || defaultVerificationPolicy();
  return out(env, req, { success: true, policy: {
    enabled: policy.enabled,
    requireCustomerIdentityVerification: policy.requireCustomerIdentityVerification,
    verificationRequiredAboveAmountSAR: policy.verificationRequiredAboveAmountSAR,
    verificationRequiredForHighRiskEquipment: policy.verificationRequiredForHighRiskEquipment,
    verificationRequiredForSpecificRequestTypes: policy.verificationRequiredForSpecificRequestTypes,
    version: Number(stored?.version || policy.version || 1),
  } });
}
type ProviderResult = { uid: string; correlationId: string; status: 'verified' | 'rejected' };
/**
 * This is deliberately fed only by an official provider validator.  There is
 * no client route which can select the test adapter or submit a result.
 */
async function consumeVerificationResult(env: Env, attemptId: string, result: ProviderResult) {
  const raw = await getRawDoc(env, 'verificationAttempts', attemptId);
  const attempt = raw?.data;
  if (!raw?.updateTime || !attempt || !/^[A-Za-z0-9_-]{16,128}$/.test(attemptId) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(result.uid) ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(result.correlationId) ||
      !['verified', 'rejected'].includes(result.status)) return { status: 400, body: { success: false, error: 'Invalid verification callback' } };
  if (attempt.consumedAt) {
    if (attempt.uid === result.uid && attempt.correlationId === result.correlationId && attempt.status === result.status) {
      return { status: 200, body: { success: true, idempotent: true } };
    }
    return { status: 409, body: { success: false, error: 'Verification callback rejected' } };
  }
  if (!canApplyProviderResult(attempt, { uid: result.uid, correlationId: result.correlationId, now: Date.now() })) {
    return { status: 409, body: { success: false, error: 'Verification callback rejected' } };
  }
  const now = new Date().toISOString();
  const profile = await getRawDoc(env, 'verificationProfiles', result.uid);
  const event = result.status === 'verified' ? 'verification_completed' : 'verification_rejected';
  const profileFields = profile?.data || defaultVerificationProfile(result.uid, now);
  const identity = { ...(profileFields.identity || {}), status: result.status, provider: String(attempt.provider || 'official'), ...(result.status === 'verified' ? { verifiedAt: now } : {}) };
  if (result.status === 'verified') delete identity.expiresAt;
  // A provider result proves only identity. It cannot clear a separate
  // operator manual-review or restriction state.
  const manualStatus = String(profileFields.manualReview?.status || 'unverified');
  const overallStatus = manualStatus === 'manual_review' ? 'manual_review'
    : manualStatus === 'rejected' || manualStatus === 'restricted' ? 'restricted'
      : result.status === 'verified' ? 'verified' : 'rejected';
  const overall = { ...(profileFields.overallTrust || {}), status: overallStatus };
  const providerVerification = providerVerificationFor(profileFields);
  const providerComponents: ProviderComponents = {
    ...providerVerification.components,
    individualIdentity: result.status,
  };
  const providerTrust = deriveProviderTrust(providerComponents, providerVerification.requiredComponents);
  const writes: any[] = [
    { update: { name: fullName(env, `verificationAttempts/${attemptId}`), fields: {
      status: { stringValue: result.status }, consumedAt: { timestampValue: now },
      ...(result.status === 'verified' ? { verifiedAt: { timestampValue: now } } : { failureCode: { stringValue: 'provider_rejected' } }),
    } }, updateMask: { fieldPaths: result.status === 'verified' ? ['status', 'consumedAt', 'verifiedAt'] : ['status', 'consumedAt', 'failureCode'] }, currentDocument: { updateTime: raw.updateTime } },
    { update: { name: fullName(env, `verificationProfiles/${encodeURIComponent(result.uid)}`), fields: {
      identity: { mapValue: { fields: Object.fromEntries(Object.entries(identity).map(([key, value]) => [key, { stringValue: String(value) }])) } },
      overallTrust: { mapValue: { fields: Object.fromEntries(Object.entries(overall).map(([key, value]) => [key, { stringValue: String(value) }])) } },
      providerVerification: { mapValue: { fields: {
        status: { stringValue: providerTrust },
        requiredComponents: { arrayValue: { values: providerVerification.requiredComponents.map(component => ({ stringValue: component })) } },
        components: { mapValue: { fields: Object.fromEntries(providerComponentNames.map(component => [component, { stringValue: providerComponents[component] }])) } },
      } } },
      updatedAt: { timestampValue: now },
    } }, updateMask: { fieldPaths: ['identity', 'overallTrust', 'providerVerification', 'updatedAt'] }, currentDocument: profile?.updateTime ? { updateTime: profile.updateTime } : { exists: false } },
    { update: { name: fullName(env, `verificationEvents/${attemptId}:${event}:${result.correlationId}`), fields: {
      uid: { stringValue: result.uid }, attemptId: { stringValue: attemptId }, correlationId: { stringValue: result.correlationId },
      type: { stringValue: event }, provider: { stringValue: String(attempt.provider || 'official') }, status: { stringValue: result.status }, timestamp: { timestampValue: now },
    } }, currentDocument: { exists: false } },
  ];
  try { await commitWrites(env, writes); } catch { return { status: 409, body: { success: false, error: 'Verification callback rejected' } }; }
  return { status: 200, body: { success: true, idempotent: false } };
}
async function identityCallback(req: Request, env: Env, attemptId: string) {
  // Official signing/certificate requirements are provider documentation
  // dependent.  Until configured, this endpoint fails closed before parsing
  // untrusted payloads. Test adapters are only injectable through __test.
  if (env.IDENTITY_PROVIDER_MODE !== 'official' || !verificationProviderOverride || verificationProviderOverride.mode !== 'official') {
    return out(env, req, { success: false, error: 'Identity provider unavailable' }, 503);
  }
  let raw: unknown;
  try { raw = await req.json(); } catch { return out(env, req, { success: false, error: 'Invalid verification callback' }, 400); }
  let result: ProviderResult;
  try { result = await verificationProviderOverride.validateResult(raw); } catch { return out(env, req, { success: false, error: 'Invalid verification callback' }, 400); }
  const attempt = await getDoc(env, 'verificationAttempts', attemptId);
  if (!attempt || attempt.provider !== verificationProviderOverride.name) {
    return out(env, req, { success: false, error: 'Verification callback rejected' }, 409);
  }
  const consumed = await consumeVerificationResult(env, attemptId, result);
  return out(env, req, consumed.body, consumed.status);
}
async function startVerification(req: Request, env: Env, u: User) {
  let body: any; try { body = await req.json(); } catch { return out(env, req, { success: false, error: 'Invalid verification request' }, 400); }
  // Initiation has no client-controlled provider, UID, status, or reference:
  // accepting only an empty object prevents schema-smuggling as fields evolve.
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) return out(env, req, { success: false, error: 'Invalid verification request' }, 400);
  await enforceOperationalAccess(env, u);
  const now = Date.now(), nowIso = new Date(now).toISOString();
  const rate = await getRawDoc(env, 'verificationRateLimits', u.uid);
  const prior = rate?.data;
  const windowStart = Date.parse(String(prior?.windowStartedAt || ''));
  const count = Number(prior?.count || 0);
  if (Number.isFinite(windowStart) && now - windowStart < 3600000 && count >= 3) return out(env, req, { success: false, error: 'Verification temporarily unavailable' }, 429);
  const nextCount = Number.isFinite(windowStart) && now - windowStart < 3600000 ? count + 1 : 1;
  const attemptId = b64u(crypto.getRandomValues(new Uint8Array(24)));
  const correlationId = b64u(crypto.getRandomValues(new Uint8Array(24)));
  const expiresAt = new Date(now + 15 * 60 * 1000).toISOString();
  const officialProvider = env.IDENTITY_PROVIDER_MODE === 'official' && verificationProviderOverride?.mode === 'official'
    ? verificationProviderOverride
    : undefined;
  let providerName = 'manual_review';
  let providerReference: string | undefined;
  if (officialProvider) {
    try {
      const started = await officialProvider.start({ uid: u.uid, attemptId, correlationId, expiresAt });
      if (!started?.referenceId || typeof started.referenceId !== 'string' || started.referenceId.length > 256) throw new Error('invalid');
      providerName = officialProvider.name;
      providerReference = started.referenceId;
    } catch {
      return out(env, req, { success: false, error: 'Identity provider unavailable' }, 503);
    }
  }
  const profile = await getRawDoc(env, 'verificationProfiles', u.uid);
  const writes: any[] = [
    { update: { name: fullName(env, `verificationAttempts/${attemptId}`), fields: {
        attemptId: { stringValue: attemptId }, uid: { stringValue: u.uid }, provider: { stringValue: providerName },
      verificationType: { stringValue: 'identity' }, status: { stringValue: 'pending' }, correlationId: { stringValue: correlationId },
        createdAt: { timestampValue: nowIso }, expiresAt: { timestampValue: expiresAt }, reviewRequired: { booleanValue: !officialProvider },
        ...(providerReference ? { providerReference: { stringValue: providerReference } } : {}),
    } }, currentDocument: { exists: false } },
    { update: { name: fullName(env, `verificationRateLimits/${encodeURIComponent(u.uid)}`), fields: {
      uid: { stringValue: u.uid }, windowStartedAt: { timestampValue: Number.isFinite(windowStart) && now - windowStart < 3600000 ? prior.windowStartedAt : nowIso },
      count: { integerValue: String(nextCount) }, updatedAt: { timestampValue: nowIso },
    } }, currentDocument: rate?.updateTime ? { updateTime: rate.updateTime } : { exists: false } },
    { update: { name: fullName(env, `verificationEvents/${attemptId}:started`), fields: {
        uid: { stringValue: u.uid }, attemptId: { stringValue: attemptId }, correlationId: { stringValue: correlationId }, type: { stringValue: 'verification_started' },
        provider: { stringValue: providerName }, status: { stringValue: 'pending' }, timestamp: { timestampValue: nowIso },
    } }, currentDocument: { exists: false } },
  ];
  if (profile?.updateTime) writes.push({ update: { name: fullName(env, `verificationProfiles/${encodeURIComponent(u.uid)}`), fields: {
    identity: { mapValue: { fields: { status: { stringValue: 'pending' }, provider: { stringValue: providerName }, expiresAt: { timestampValue: expiresAt } } } },
    manualReview: { mapValue: { fields: { status: { stringValue: officialProvider ? 'unverified' : 'manual_review' } } } },
    overallTrust: { mapValue: { fields: { status: { stringValue: officialProvider ? 'pending' : 'manual_review' } } } }, updatedAt: { timestampValue: nowIso },
  } }, updateMask: { fieldPaths: ['identity.status', 'identity.provider', 'identity.expiresAt', 'manualReview.status', 'overallTrust.status', 'updatedAt'] }, currentDocument: { updateTime: profile.updateTime } });
  else {
    const initial = verificationProfileFields(u.uid, nowIso);
    (initial.identity as any).mapValue.fields.status = { stringValue: 'pending' };
    (initial.identity as any).mapValue.fields.provider = { stringValue: providerName };
    (initial.identity as any).mapValue.fields.expiresAt = { timestampValue: expiresAt };
    (initial.manualReview as any).mapValue.fields.status = { stringValue: officialProvider ? 'unverified' : 'manual_review' };
    (initial.overallTrust as any).mapValue.fields.status = { stringValue: officialProvider ? 'pending' : 'manual_review' };
    writes.push({ update: { name: fullName(env, `verificationProfiles/${encodeURIComponent(u.uid)}`), fields: initial }, currentDocument: { exists: false } });
  }
  try { await commitWrites(env, writes); } catch { return out(env, req, { success: false, error: 'Verification temporarily unavailable' }, 409); }
  return out(env, req, { success: true, attempt: safeAttempt(attemptId, { status: 'pending', provider: providerName, verificationType: 'identity', createdAt: nowIso, expiresAt, reviewRequired: !officialProvider }) }, 202);
}
async function enforceTrustForCustomerAction(env: Env, customerUid: string, request: any, equipment: any) {
  const [profile, storedPolicy, account] = await Promise.all([getDoc(env, 'verificationProfiles', customerUid), getDoc(env, 'verificationPolicies', 'default'), getDoc(env, 'users', customerUid)]);
  const policy = normalizeVerificationPolicy(storedPolicy) || defaultVerificationPolicy();
  const suspension = account?.suspensionStatus === 'temporarily_suspended' || account?.suspensionStatus === 'permanently_suspended';
  const outcome = evaluateRisk({ suspended: suspension, identityStatus: profile?.identity?.status, manualReviewStatus: profile?.manualReview?.status, policy, amount: Number(request?.finalAmount ?? request?.amount), highRiskEquipment: equipment?.highRisk === true, requestType: request?.requestMode, verificationFailures: Number(profile?.verificationFailures || 0) });
  if (outcome !== 'allow') err(`TRUST_${outcome.toUpperCase()}`);
}
async function enforceTrustForPayment(env: Env, u: User, request: any, equipment: any) {
  return enforceTrustForCustomerAction(env, u.uid, request, equipment);
}
async function startRequest(req: Request, env: Env, u: User) {
  await enforceOperationalAccess(env, u);
  const { requestId } = await req.json() as { requestId?: string }; const raw = requestId ? await getRawDoc(env, 'equipmentRequests', requestId) : null;
  if (!raw?.data || (raw.data.providerUid !== u.uid && !u.admin) || raw.data.status !== 'accepted' || !raw.updateTime) return out(env, req, { success: false, error: 'Invalid request state' }, 409);
  try {
    const equipment = await getDoc(env, 'equipment', raw.data.equipmentId);
    await enforceTrustForCustomerAction(env, String(raw.data.customerUid || ''), raw.data, equipment);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return out(env, req, { success: false, error: message === 'TRUST_BLOCK' ? 'Account suspended' : 'Identity verification required', code: message.startsWith('TRUST_') ? message.replace('TRUST_', '').toLowerCase() : undefined }, 403);
  }
  try { await compareAndSwap(env, `equipmentRequests/${encodeURIComponent(requestId!)}`, raw.updateTime, { status: { stringValue: 'in_progress' }, startedAt: { timestampValue: new Date().toISOString() } }); return out(env, req, { success: true, status: 'in_progress' }); } catch { return out(env, req, { success: false, error: 'Request changed' }, 409); }
}
async function confirmCompletion(req: Request, env: Env, u: User) {
  await enforceOperationalAccess(env, u);
  const { requestId } = await req.json() as { requestId?: string }; const raw = requestId ? await getRawDoc(env, 'equipmentRequests', requestId) : null, r = raw?.data;
  if (!r || r.customerUid !== u.uid || r.status !== 'completion_requested' || !raw?.updateTime) return out(env, req, { success: false, error: 'Invalid request state' }, 409);
  const now = Date.now(), started = Date.parse(r.startedAt || ''), lockedRate = Number(r.amount);
  if (!Number.isFinite(started) || (r.requestMode === 'open_ended' && (!Number.isFinite(lockedRate) || lockedRate <= 0))) return out(env, req, { success: false, error: 'Invalid request state' }, 409);
  const days = r.requestMode === 'open_ended' ? Math.max(1, Math.ceil((now - started) / 86400000)) : Number(r.numberOfDays || 1);
  const subtotal = r.requestMode === 'open_ended' ? lockedRate * days : Number(r.finalAmount ?? r.amount), fee = Math.round(subtotal * paymentPricing(env).platformFeeRate * 100) / 100, end = new Date(now).toISOString();
  const fields: Record<string, any> = { status: { stringValue: 'completed' }, endedAt: { timestampValue: end }, endDate: { timestampValue: end }, allowChat: { booleanValue: false } };
  if (r.requestMode === 'open_ended') Object.assign(fields, { finalAmount: { doubleValue: subtotal }, finalPlatformFee: { doubleValue: fee }, finalProviderAmount: { doubleValue: subtotal - fee } });
  try { await compareAndSwap(env, `equipmentRequests/${encodeURIComponent(requestId!)}`, raw.updateTime, fields); return out(env, req, { success: true, status: 'completed', finalAmount: subtotal }); } catch { return out(env, req, { success: false, error: 'Request changed' }, 409); }
}
function quoteFromDoc(d: any): PaymentQuote {
  const subtotal = Number(d?.subtotal);
  const platformFee = Number(d?.platformFee);
  const vatAmount = Number(d?.vatAmount);
  const quote = {
    amount: Number(d?.amount), total: Number(d?.total ?? d?.amount), subtotal,
    platformFee, providerAmount: Number(d?.providerAmount),
    vatAmount, tax: Number(d?.tax ?? d?.vatAmount), currency: 'SAR' as const,
    platformFeeRate: Number(d?.platformFeeRate ?? platformFee / subtotal),
    vatRate: Number(d?.vatRate ?? vatAmount / subtotal),
    policyVersion: String(d?.policyVersion || 'legacy-derived'),
    quoteId: String(d?.quoteId || ''), expiresAt: String(d?.expiresAt || ''),
  };
  if (!quote.quoteId || !Number.isFinite(quote.amount) || quote.amount <= 0 || !Number.isFinite(quote.platformFeeRate) || !Number.isFinite(quote.vatRate) || quote.currency !== 'SAR') err('Invalid payment quote');
  return quote;
}
function quoteWrite(env: Env, requestId: string, r: any, quote: PaymentQuote, now: string) {
  return { update: { name: fullName(env, `paymentQuotes/${encodeURIComponent(requestId)}`), fields: {
    requestId: { stringValue: requestId }, customerUid: { stringValue: String(r.customerUid) },
    providerUid: { stringValue: String(r.providerUid || '') }, equipmentId: { stringValue: String(r.equipmentId || '') },
    quoteId: { stringValue: quote.quoteId }, subtotal: { doubleValue: quote.subtotal },
    platformFee: { doubleValue: quote.platformFee }, providerAmount: { doubleValue: quote.providerAmount },
    vatAmount: { doubleValue: quote.vatAmount }, tax: { doubleValue: quote.tax },
    platformFeeRate: { doubleValue: quote.platformFeeRate }, vatRate: { doubleValue: quote.vatRate },
    policyVersion: { stringValue: quote.policyVersion },
    total: { doubleValue: quote.total }, amount: { doubleValue: quote.amount },
    currency: { stringValue: quote.currency }, createdAt: { timestampValue: now },
    expiresAt: { timestampValue: quote.expiresAt },
  } }, currentDocument: { exists: false } };
}
function eventWrite(env: Env, eventId: string, requestId: string, r: any, type: string, state: PaymentState, now: string, providerReference?: string) {
  return { update: { name: fullName(env, `paymentEvents/${encodeURIComponent(eventId)}`), fields: {
    requestId: { stringValue: requestId }, customerUid: { stringValue: String(r.customerUid) },
    providerUid: { stringValue: String(r.providerUid || '') }, paymentId: { stringValue: paymentIdForRequest(requestId) },
    provider: { stringValue: 'tap' }, providerReference: { stringValue: providerReference || '' },
    state: { stringValue: state }, type: { stringValue: type }, timestamp: { timestampValue: now },
  } }, currentDocument: { exists: false } };
}
async function fullySettled(env: Env, requestId: string) {
  const request = await getDoc(env, 'equipmentRequests', requestId);
  if (request?.paymentState !== 'paid' || request?.paymentStatus !== 'paid' || !request?.invoiceId) return false;
  const [invoice, payment] = await Promise.all([
    getDoc(env, 'invoices', String(request.invoiceId)),
    getDoc(env, 'payments', requestId),
  ]);
  return !!invoice && payment?.state === 'paid' && payment?.invoiceId === request.invoiceId;
}
async function settlePaid(env: Env, requestId: string, raw: { data: any; updateTime?: string }, quote: PaymentQuote, d: { id: string; amount: number; currency: string }, source: 'create' | 'verify' | 'webhook', quoteExists: boolean) {
  const r = raw.data;
  if (r.paymentState === 'paid' && r.paymentStatus === 'paid' && r.invoiceId) {
    if (await fullySettled(env, requestId)) return String(r.invoiceId);
    err('Incomplete payment settlement');
  }
  if (!raw.updateTime || (r.paymentState && !canTransition(String(r.paymentState) as PaymentState, 'paid'))) err('Invalid payment transition');
  const payment = await getDoc(env, 'payments', requestId);
  const provider = r.providerUid ? await getDoc(env, 'users', r.providerUid) : null;
  const customer = r.customerUid ? await getDoc(env, 'users', r.customerUid) : null;
  const sellerName = String(r.providerPublic?.nameEn || r.providerPublic?.nameAr || provider?.nameEn || provider?.nameAr || '').trim();
  const buyerName = String(r.customerPublic?.nameEn || r.customerPublic?.nameAr || customer?.nameEn || customer?.nameAr || '').trim();
  if (!sellerName || !buyerName) err('Invoice participants unavailable');
  const invoice = invoiceNumberForPayment(requestId, d.id);
  const now = new Date().toISOString();
  const invoiceFields = {
    invoiceNumber: { stringValue: invoice }, requestId: { stringValue: requestId },
    equipmentId: { stringValue: String(r.equipmentId || '') }, providerId: { stringValue: String(r.providerUid || '') },
    customerId: { stringValue: String(r.customerUid) }, sellerName: { stringValue: sellerName },
    buyerName: { stringValue: buyerName }, subtotal: { doubleValue: quote.subtotal },
    platformFee: { doubleValue: quote.platformFee }, providerAmount: { doubleValue: quote.providerAmount },
    vatRate: { doubleValue: quote.vatRate }, vatAmount: { doubleValue: quote.vatAmount },
    policyVersion: { stringValue: quote.policyVersion },
    totalAmount: { doubleValue: quote.total }, currency: { stringValue: quote.currency },
    status: { stringValue: 'paid' }, createdAt: { timestampValue: now }, paidAt: { timestampValue: now },
    paymentReference: { stringValue: d.id },
  };
  const writes: any[] = [
    { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(requestId)}`), fields: {
      paymentStatus: { stringValue: 'paid' }, paymentState: { stringValue: 'paid' },
      paymentId: { stringValue: d.id }, paidAt: { timestampValue: now }, invoiceId: { stringValue: invoice },
    } }, updateMask: { fieldPaths: ['paymentStatus', 'paymentState', 'paymentId', 'paidAt', 'invoiceId'] }, currentDocument: { updateTime: raw.updateTime } },
    { update: { name: fullName(env, `invoices/${encodeURIComponent(invoice)}`), fields: invoiceFields }, currentDocument: { exists: false } },
    payment
      ? { update: { name: fullName(env, `payments/${encodeURIComponent(requestId)}`), fields: {
          state: { stringValue: 'paid' }, invoiceId: { stringValue: invoice }, paidAt: { timestampValue: now },
          providerReference: { stringValue: d.id },
        } }, updateMask: { fieldPaths: ['state', 'invoiceId', 'paidAt', 'providerReference'] }, currentDocument: { exists: true } }
      : { update: { name: fullName(env, `payments/${encodeURIComponent(requestId)}`), fields: {
          requestId: { stringValue: requestId }, paymentId: { stringValue: paymentIdForRequest(requestId) },
          provider: { stringValue: 'tap' }, providerReference: { stringValue: d.id }, state: { stringValue: 'paid' },
          quoteId: { stringValue: quote.quoteId }, amount: { doubleValue: quote.amount },
          currency: { stringValue: quote.currency }, customerUid: { stringValue: String(r.customerUid) },
          invoiceId: { stringValue: invoice }, paidAt: { timestampValue: now },
        } }, currentDocument: { exists: false } },
    eventWrite(env, `${requestId}:payment_confirmed`, requestId, r, 'payment_confirmed', 'paid', now, d.id),
    eventWrite(env, `${requestId}:invoice_created`, requestId, r, 'invoice_created', 'paid', now, d.id),
    { update: { name: fullName(env, `paymentIdempotency/${encodeURIComponent(`${source}:${d.id}`)}`), fields: {
      requestId: { stringValue: requestId }, paymentId: { stringValue: paymentIdForRequest(requestId) },
      providerReference: { stringValue: d.id }, operation: { stringValue: source }, state: { stringValue: 'paid' },
      completedAt: { timestampValue: now },
    } }, currentDocument: { exists: false } },
  ];
  if (!quoteExists) writes.push(quoteWrite(env, requestId, r, quote, now));
  await commitWrites(env, writes);
  return invoice;
}
async function persistProviderState(env: Env, requestId: string, raw: { data: any; updateTime?: string }, state: PaymentState, providerReference: string) {
  const r = raw.data;
  if (!raw.updateTime || (r.paymentState && !canTransition(String(r.paymentState) as PaymentState, state))) err('Invalid payment transition');
  if (r.paymentState === state) return;
  const payment = await getDoc(env, 'payments', requestId);
  const attempt = Math.max(1, Number(payment?.attempt || 1));
  const now = new Date().toISOString();
  const terminal = state === 'failed' || state === 'cancelled' || state === 'expired';
  await commitWrites(env, [
    { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(requestId)}`), fields: {
      paymentStatus: { stringValue: terminal ? 'unpaid' : 'pending_payment' }, paymentState: { stringValue: state },
    } }, updateMask: { fieldPaths: ['paymentStatus', 'paymentState'] }, currentDocument: { updateTime: raw.updateTime } },
    { update: { name: fullName(env, `payments/${encodeURIComponent(requestId)}`), fields: {
      state: { stringValue: state }, providerReference: { stringValue: providerReference },
    } }, updateMask: { fieldPaths: ['state', 'providerReference'] }, currentDocument: { exists: true } },
    eventWrite(env, `${requestId}:attempt_${attempt}:payment_${state}`, requestId, r, `payment_${state}`, state, now, providerReference),
  ]);
}
async function create(req: Request, env: Env, u: User) {
  const body = await req.json() as { requestId?: string; amount?: number; purpose?: string };
  if (!body.requestId || body.amount !== undefined || (body.purpose && body.purpose !== 'equipment_request')) return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  const raw = await getRawDoc(env, 'equipmentRequests', body.requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId);
  try { await enforceOperationalAccess(env, u, e); await enforceTrustForPayment(env, u, r, e); } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const trust = message.startsWith('TRUST_');
    return out(env, req, { success: false, error: trust ? 'Identity verification required' : message === 'ACCOUNT_SUSPENDED' ? 'Account suspended' : 'Listing unavailable', code: trust ? message.replace('TRUST_', '').toLowerCase() : undefined }, 403);
  }
  if (!owned(u, r) || !r?.customerUid || r.customerUid !== u.uid) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  if (String(r.requestMode || '').toLowerCase() === 'open_ended' && !(Number.isFinite(Number(r.finalAmount)) && Number(r.finalAmount) > 0)) return out(env, req, { success: false, error: 'Final amount required' }, 409);
  let quote: PaymentQuote;
  const storedQuote = await getDoc(env, 'paymentQuotes', body.requestId);
  try {
    quote = storedQuote?.quoteId ? quoteFromDoc(storedQuote) : paymentQuote(env, r, e, body.requestId);
  } catch { return out(env, req, { success: false, error: 'Invalid payment quote' }, 409); }
  const expected = quote.amount;
  const existingPayment = await getDoc(env, 'payments', body.requestId);
  const reservationPrefix = `reservation:${idempotencyKeyForPayment(u.uid, body.requestId)}`;
  const isReserved = r.paymentStatus === 'pending_payment' && String(r.paymentId || '').startsWith(reservationPrefix);
  const terminalRetry = !!existingPayment && ['failed', 'cancelled', 'expired'].includes(String(existingPayment.state)) && r.paymentStatus === 'unpaid';
  const attempt = terminalRetry ? Math.max(2, Number(existingPayment.attempt || 1) + 1) : Math.max(1, Number(existingPayment?.attempt || 1));
  const idempotencyKey = isReserved
    ? String(existingPayment?.idempotencyKey || String(r.paymentId).replace(/^reservation:/, ''))
    : `${idempotencyKeyForPayment(u.uid, body.requestId)}${attempt > 1 ? `:${attempt}` : ''}`;
  const reservation = `reservation:${idempotencyKey}`;
  if (r.paymentStatus === 'pending_payment' && r.paymentId && !String(r.paymentId).startsWith('reservation:')) {
    const state = String(existingPayment?.state || r.paymentState || 'pending') as PaymentState;
    return out(env, req, { success: true, paymentId: r.paymentId, chargeId: r.paymentId, status: state, canonicalStatus: state, paymentState: state, checkoutUrl: String(existingPayment?.checkoutUrl || ''), paymentUrl: String(existingPayment?.checkoutUrl || ''), amount: expected, currency: quote.currency, quote, provider: 'tap' });
  }
  if (terminalRetry && Date.parse(quote.expiresAt) <= Date.now()) return out(env, req, { success: false, error: 'Payment quote expired' }, 409);
  if (!isReserved && (String(r.status).toLowerCase() !== 'completed' || !['unpaid', ''].includes(String(r.paymentStatus || '').toLowerCase()))) return out(env, req, { success: false, error: 'Invalid payment state' }, 409);
  if (!env.TAP_SECRET_KEY_TEST) return out(env, req, { success: false, error: 'Payment unavailable' }, 503);
  if (!raw?.updateTime) return out(env, req, { success: false, error: 'Payment unavailable' }, 503);
  if (!isReserved) {
    try {
      if (reservationConflict) throw new Error('precondition failed');
      const now = new Date().toISOString();
      const writes: any[] = [
        { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(body.requestId)}`), fields: { paymentStatus: { stringValue: 'pending_payment' }, paymentState: { stringValue: 'pending' }, paymentId: { stringValue: reservation } } }, updateMask: { fieldPaths: ['paymentStatus', 'paymentState', 'paymentId'] }, currentDocument: { updateTime: raw.updateTime } },
      ];
      if (!existingPayment) {
        writes.push(
          quoteWrite(env, body.requestId, r, quote, now),
          { update: { name: fullName(env, `payments/${encodeURIComponent(body.requestId)}`), fields: { requestId: { stringValue: body.requestId }, paymentId: { stringValue: paymentIdForRequest(body.requestId) }, provider: { stringValue: 'tap' }, state: { stringValue: 'created' }, quoteId: { stringValue: quote.quoteId }, amount: { doubleValue: expected }, currency: { stringValue: 'SAR' }, customerUid: { stringValue: u.uid }, idempotencyKey: { stringValue: idempotencyKey }, attempt: { integerValue: attempt } } }, currentDocument: { exists: false } },
          eventWrite(env, `${body.requestId}:payment_created`, body.requestId, r, 'payment_created', 'created', now),
        );
      } else {
        writes.push(
          { update: { name: fullName(env, `payments/${encodeURIComponent(body.requestId)}`), fields: { state: { stringValue: 'created' }, idempotencyKey: { stringValue: idempotencyKey }, attempt: { integerValue: attempt }, providerReference: { nullValue: null }, checkoutUrl: { nullValue: null } } }, updateMask: { fieldPaths: ['state', 'idempotencyKey', 'attempt', 'providerReference', 'checkoutUrl'] }, currentDocument: { exists: true } },
          eventWrite(env, `${body.requestId}:payment_retry_${attempt}`, body.requestId, r, 'payment_retry', 'created', now),
        );
      }
      writes.push({ update: { name: fullName(env, `paymentIdempotency/${encodeURIComponent(idempotencyKey)}`), fields: { requestId: { stringValue: body.requestId }, customerUid: { stringValue: u.uid }, provider: { stringValue: 'tap' }, key: { stringValue: idempotencyKey }, attempt: { integerValue: attempt }, state: { stringValue: 'created' } } }, currentDocument: { exists: false } });
      await commitWrites(env, writes);
    } catch {
      const current = await getDoc(env, 'equipmentRequests', body.requestId);
      if (current?.paymentStatus === 'pending_payment' && current.paymentId && !String(current.paymentId).startsWith('reservation:')) return out(env, req, { success: true, paymentId: current.paymentId, chargeId: current.paymentId, status: 'pending', canonicalStatus: 'pending', paymentState: 'pending', amount: expected, currency: 'SAR', quote });
      return out(env, req, { success: false, error: 'Payment reservation conflict' }, 409);
    }
  }
  const provider = new TapPaymentProvider(env.TAP_SECRET_KEY_TEST);
  let data; try { data = await provider.create({ amount: expected, currency: 'SAR', idempotencyKey, metadata: { requestId: body.requestId, customerUid: u.uid, amount: String(expected), currency: 'SAR', quoteId: quote.quoteId, paymentId: paymentIdForRequest(body.requestId), idempotencyKey } }); } catch {
    const reservedRaw = capturedCommits ? { data: { ...r, paymentId: reservation, paymentState: 'pending' }, updateTime: 'test-reserved' } : await getRawDoc(env, 'equipmentRequests', body.requestId);
    if (reservedRaw?.updateTime && reservedRaw.data.paymentId === reservation && reservedRaw.data.paymentState !== 'processing') {
      const now = new Date().toISOString();
      await commitWrites(env, [
        { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(body.requestId)}`), fields: { paymentStatus: { stringValue: 'pending_payment' }, paymentState: { stringValue: 'processing' } } }, updateMask: { fieldPaths: ['paymentStatus', 'paymentState'] }, currentDocument: { updateTime: reservedRaw.updateTime } },
        { update: { name: fullName(env, `payments/${encodeURIComponent(body.requestId)}`), fields: { state: { stringValue: 'processing' } } }, updateMask: { fieldPaths: ['state'] }, currentDocument: { exists: true } },
        { update: { name: fullName(env, `paymentIdempotency/${encodeURIComponent(idempotencyKey)}`), fields: { state: { stringValue: 'processing' }, uncertain: { booleanValue: true } } }, updateMask: { fieldPaths: ['state', 'uncertain'] }, currentDocument: { exists: true } },
        eventWrite(env, `${body.requestId}:payment_creation_uncertain_${attempt}`, body.requestId, r, 'payment_creation_uncertain', 'processing', now),
      ]);
    }
    return out(env, req, { success: false, error: 'Payment status uncertain; retry verification', paymentState: 'processing', canonicalStatus: 'processing', retryable: true }, 502); }
  if (!data.id || data.amount !== expected || data.currency !== quote.currency) return out(env, req, { success: false, error: 'Invalid provider response' }, 502);
  const state = stateForProvider(data.status);
  if (!canTransition('created', state)) return out(env, req, { success: false, error: 'Invalid payment transition' }, 409);
  const reservedRaw = capturedCommits ? { data: { ...r, paymentId: reservation }, updateTime: 'test-reserved' } : await getRawDoc(env, 'equipmentRequests', body.requestId);
  if (!reservedRaw?.updateTime || reservedRaw.data.paymentId !== reservation) return out(env, req, { success: false, error: 'Payment reservation changed' }, 409);
  if (state === 'paid') {
    try {
      await settlePaid(env, body.requestId, reservedRaw, quote, data, 'create', true);
    } catch {
      if (!await fullySettled(env, body.requestId)) {
        return out(env, req, { success: false, paymentId: data.id, chargeId: data.id, status: 'processing', paymentState: 'processing', canonicalStatus: 'processing', error: 'Payment received; settlement pending', retryable: true }, 409);
      }
    }
    return out(env, req, { success: true, paymentId: data.id, chargeId: data.id, status: 'paid', providerStatus: data.status, paymentState: 'paid', canonicalStatus: 'paid', checkoutUrl: '', paymentUrl: '', quote, amount: data.amount, currency: data.currency, quoteId: quote.quoteId, provider: 'tap' });
  }
  {
    const now = new Date().toISOString();
    await commitWrites(env, [
      { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(body.requestId)}`), fields: { paymentStatus: { stringValue: state === 'failed' ? 'unpaid' : 'pending_payment' }, paymentState: { stringValue: state }, paymentId: { stringValue: String(data.id) } } }, updateMask: { fieldPaths: ['paymentStatus', 'paymentState', 'paymentId'] }, currentDocument: { updateTime: reservedRaw.updateTime } },
      { update: { name: fullName(env, `payments/${encodeURIComponent(body.requestId)}`), fields: { state: { stringValue: state }, providerReference: { stringValue: String(data.id) }, checkoutUrl: { stringValue: String(data.checkoutUrl || '') } } }, updateMask: { fieldPaths: ['state', 'providerReference', 'checkoutUrl'] }, currentDocument: { exists: true } },
      { update: { name: fullName(env, `paymentIdempotency/${encodeURIComponent(idempotencyKey)}`), fields: { state: { stringValue: state }, providerReference: { stringValue: String(data.id) } } }, updateMask: { fieldPaths: ['state', 'providerReference'] }, currentDocument: { exists: true } },
      eventWrite(env, `${body.requestId}:attempt_${attempt}:payment_${state}`, body.requestId, r, `payment_${state}`, state, now, String(data.id)),
    ]);
  }
  return out(env, req, { success: true, paymentId: data.id, chargeId: data.id, status: state, providerStatus: data.status, paymentState: state, canonicalStatus: state, checkoutUrl: data.checkoutUrl || '', paymentUrl: data.checkoutUrl || '', quote, amount: data.amount, currency: data.currency, quoteId: quote.quoteId, provider: 'tap' });
}
async function verify(req: Request, env: Env, u: User) {
  const body = await req.json() as { chargeId?: string; paymentId?: string }, chargeId = body.paymentId || body.chargeId;
  if (!chargeId || !env.TAP_SECRET_KEY_TEST) return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  let d; try { d = await new TapPaymentProvider(env.TAP_SECRET_KEY_TEST).retrieve(chargeId); } catch { return out(env, req, { success: false, error: 'Payment unavailable' }, 502); }
  const m = d.metadata || {};
  const raw = await getRawDoc(env, 'equipmentRequests', m.requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId);
  let quote: PaymentQuote; const storedQuote = await getDoc(env, 'paymentQuotes', String(m.requestId));
  try { quote = storedQuote?.quoteId ? quoteFromDoc(storedQuote) : paymentQuote(env, r, e, String(m.requestId)); } catch { return out(env, req, { success: false, error: 'Invalid payment quote' }, 409); }
  const expected = quote.amount;
  if (!owned(u, r) || m.customerUid !== u.uid && !u.admin) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  const payment = await getDoc(env, 'payments', String(m.requestId));
  const reservation = `reservation:${String(m.idempotencyKey || idempotencyKeyForPayment(String(m.customerUid), String(m.requestId)))}`;
  const valid = !!raw && (r?.paymentId === chargeId || r?.paymentId === reservation) && d.id === chargeId && Number(d.amount) === expected && String(m.amount) === String(expected) && m.currency === 'SAR' && d.currency === 'SAR' && m.requestId === String(r?.id || m.requestId) && m.customerUid === r?.customerUid &&
    (!payment || (payment.provider === 'tap' && (!payment.providerReference || payment.providerReference === chargeId) && Number(payment.amount) === expected && payment.currency === 'SAR' && payment.customerUid === r.customerUid));
  if (!valid) return out(env, req, { success: false, error: 'Transaction association mismatch' }, 409);
  const state = stateForProvider(d.status);
  if (state === 'paid') {
    try { await settlePaid(env, String(m.requestId), raw!, quote, d, 'verify', !!storedQuote); }
    catch {
      if (!await fullySettled(env, String(m.requestId))) return out(env, req, { success: false, error: 'Payment settlement conflict' }, 409);
    }
  } else {
    try { await persistProviderState(env, String(m.requestId), raw!, state, d.id); }
    catch { return out(env, req, { success: false, error: 'Invalid payment transition' }, 409); }
  }
  return out(env, req, { success: true, paymentId: d.id, chargeId: d.id, status: state, providerStatus: d.status, canonicalStatus: state, paymentState: state, isPaid: state === 'paid', amount: d.amount, currency: d.currency, requestId: m.requestId, quote });
}

/** Tap sends no trusted identity in a webhook. The transaction is always re-fetched. */
async function tapWebhook(req: Request, env: Env) {
  let body: any; try { body = await req.json(); } catch { return out(env, req, { success: false, error: 'Invalid webhook' }, 400); }
  if (!env.TAP_SECRET_KEY_TEST) return out(env, req, { success: false, error: 'Payment unavailable' }, 503);
  const chargeId = String(body.id || body.chargeId || body.transaction?.id || '');
  if (!chargeId) return out(env, req, { success: false, error: 'Invalid webhook' }, 400);
  let d; try { d = await new TapPaymentProvider(env.TAP_SECRET_KEY_TEST).retrieve(chargeId); } catch { return out(env, req, { success: false, error: 'Invalid transaction' }, 400); }
  const m = d.metadata || {}, requestId = String(m.requestId || '');
  if (!requestId || d.id !== chargeId) return out(env, req, { success: false, error: 'Invalid transaction' }, 400);
  const raw = await getRawDoc(env, 'equipmentRequests', requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId);
  const storedQuote = await getDoc(env, 'paymentQuotes', requestId);
  let quote; try { quote = storedQuote?.quoteId ? quoteFromDoc(storedQuote) : paymentQuote(env, r, e, requestId); } catch { return out(env, req, { success: false, error: 'Invalid transaction' }, 400); }
  const payment = await getDoc(env, 'payments', requestId);
  const reservation = `reservation:${String(m.idempotencyKey || idempotencyKeyForPayment(String(m.customerUid), requestId))}`;
  const valid = !!r && (r.paymentId === chargeId || r.paymentId === reservation) && m.requestId === String(r.id || requestId) && m.customerUid === r.customerUid &&
    m.currency === 'SAR' && d.currency === 'SAR' && String(m.amount) === String(quote.amount) && Number(d.amount) === quote.amount &&
    (!payment || (payment.provider === 'tap' && (!payment.providerReference || payment.providerReference === chargeId) && Number(payment.amount) === quote.amount && payment.currency === 'SAR'));
  if (!valid) return out(env, req, { success: false, error: 'Transaction association mismatch' }, 409);
  const state = stateForProvider(d.status);
  if (state === 'paid') {
    try { await settlePaid(env, requestId, raw!, quote, d, 'webhook', !!storedQuote); }
    catch {
      if (!await fullySettled(env, requestId)) return out(env, req, { success: false, error: 'Payment settlement conflict' }, 409);
    }
  } else {
    try { await persistProviderState(env, requestId, raw!, state, chargeId); }
    catch { return out(env, req, { success: false, error: 'Invalid payment transition' }, 409); }
  }
  return out(env, req, { success: true, paymentId: chargeId, paymentState: state, canonicalStatus: state, status: state, providerStatus: d.status, chargeId, requestId, amount: d.amount, currency: d.currency });
}
async function removeAsset(req: Request, env: Env, u: User) {
  const { publicId } = await req.json() as { publicId?: string }; if (!publicId) return out(env, req, { success: false, error: 'Invalid asset' }, 400);
  const folder = env.CLOUDINARY_FOLDER || 'heavyar';
  if (!u.admin && !publicId.startsWith(`${folder}/${u.uid}/`)) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  if (!u.admin) {
    const snap = assetOwnedOverride === undefined ? await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'equipment' }], where: { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: { stringValue: u.uid } } } } }) }) : null;
    const docs = (snap || []).map((x: any) => decode(x.document || x));
    let matches = assetOwnedOverride ?? docs.some((d: any) => d.ownerUid === u.uid && (Array.isArray(d.images) && d.images.some((image: any) => image?.publicId === publicId)));
    if (!matches && assetOwnedOverride === undefined) {
      const users = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: '__name__' }, op: 'EQUAL', value: { referenceValue: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${u.uid}` } } } } }) });
      matches = (users || []).map((x: any) => decode(x.document || x)).some((d: any) => d.avatarPublicId === publicId);
    }
    if (!matches) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  }
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return out(env, req, { success: false, error: 'Asset service unavailable' }, 503);
  const timestamp = String(Math.floor(Date.now() / 1000)), digest = await crypto.subtle.digest('SHA-1', enc.encode(`public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`));
  const hex = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join(''), form = new FormData();
  form.append('public_id', publicId); form.append('timestamp', timestamp); form.append('api_key', env.CLOUDINARY_API_KEY); form.append('signature', hex);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: 'POST', body: form });
  return out(env, req, { success: r.ok }, r.ok ? 200 : 502);
}
async function otpSend(req: Request, env: Env) {
  if (!env.RESEND_API_KEY || !env.FIREBASE_PROJECT_ID) return out(env, req, { success: false, error: 'Verification unavailable' }, 503);
  const { email } = await req.json() as { email?: string }, key = (email || '').trim().toLowerCase(), ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) return out(env, req, { success: false, error: 'Verification unavailable' }, 400);
  const emailId = await hashedId(`email:${key}`), ipId = await hashedId(`ip:${ip}`), prior = await getRawDoc(env, 'otpState', emailId), ipPrior = await getRawDoc(env, 'otpState', ipId), now = Date.now();
  if ((prior?.data?.expiresAt && Date.parse(prior.data.expiresAt) > now) || (ipPrior?.data?.expiresAt && Date.parse(ipPrior.data.expiresAt) > now)) return out(env, req, { success: false, error: 'Verification unavailable' }, 429);
  const code = String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000), salt = crypto.randomUUID(), digest = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}:${code}`));
  await commitWrites(env, [
    { update: { name: fullName(env, `otpState/${emailId}`), fields: { kind: { stringValue: 'otp' }, emailHash: { stringValue: await hashedId(key) }, salt: { stringValue: salt }, hash: { stringValue: b64u(digest) }, attempts: { integerValue: '0' }, expiresAt: { timestampValue: new Date(now + 600000).toISOString() } } }, currentDocument: prior?.updateTime ? { updateTime: prior.updateTime } : { exists: false } },
    { update: { name: fullName(env, `otpState/${ipId}`), fields: { kind: { stringValue: 'ip' }, expiresAt: { timestampValue: new Date(now + 60000).toISOString() } } }, currentDocument: ipPrior?.updateTime ? { updateTime: ipPrior.updateTime } : { exists: false } },
  ]);
  const sent = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Heavyar <noreply@heavyar.app>', to: [key], subject: 'Heavyar verification code', html: `<strong>${code}</strong>` }) });
  if (!sent.ok) return out(env, req, { success: false, error: 'Verification unavailable' }, 502); return out(env, req, { success: true });
}
async function otpVerify(req: Request, env: Env) {
  if (!env.FIREBASE_PROJECT_ID) return out(env, req, { success: false, error: 'Verification unavailable' }, 503);
  const { email, code } = await req.json() as { email?: string; code?: string }, key = (email || '').trim().toLowerCase(), submittedCode = code?.trim(), id = await hashedId(`email:${key}`);
  let raw: Awaited<ReturnType<typeof getRawDoc>> = null, item: any, claimedUpdateTime = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    raw = await getRawDoc(env, 'otpState', id); item = raw?.data;
    if (!raw || !item || !submittedCode || !raw.updateTime || Number(item.attempts) >= 5 || (item.expiresAt && Date.parse(item.expiresAt) < Date.now())) return out(env, req, { success: false, error: 'Verification unavailable' }, 400);
    try {
      const claimed = await compareAndSwap(env, `otpState/${id}`, raw.updateTime, { attempts: { integerValue: String(Number(item.attempts) + 1) } });
      claimedUpdateTime = claimed?.updateTime || raw.updateTime;
      break;
    } catch {
      if (attempt === 7) return out(env, req, { success: false, error: 'Verification unavailable' }, 409);
    }
  }
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${item.salt}:${submittedCode}`));
  if (b64u(digest) !== item.hash) return out(env, req, { success: false, error: 'Verification unavailable' }, 400);
  const grant = crypto.randomUUID(), grantDigest = await crypto.subtle.digest('SHA-256', enc.encode(grant));
  await commitWrites(env, [
    { delete: fullName(env, `otpState/${id}`), currentDocument: { updateTime: claimedUpdateTime } },
    { update: { name: fullName(env, `registrationGrants/${b64u(grantDigest)}`), fields: { emailHash: { stringValue: await hashedId(key) }, expiresAt: { timestampValue: new Date(Date.now() + 300000).toISOString() } } }, currentDocument: { exists: false } },
  ]);
  return out(env, req, { success: true, verified: true, registrationGrant: grant });
}
async function registerProfile(req: Request, env: Env, u: User) {
  if (!env.FIREBASE_PROJECT_ID || !u.email) return out(env, req, { success: false, error: 'Registration unavailable' }, 503);
  const body = await req.json() as any, grant = String(body.registrationGrant || '');
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(grant)), grantId = b64u(digest), rawGrant = await getRawDoc(env, 'registrationGrants', grantId), record = rawGrant?.data;
  if (!rawGrant || !record || record.emailHash !== await hashedId(u.email.toLowerCase()) || Date.parse(record.expiresAt) < Date.now()) return out(env, req, { success: false, error: 'Invalid registration grant' }, 403);
  const fields: Record<string, any> = { uid: { stringValue: u.uid }, email: { stringValue: u.email }, nameAr: { stringValue: String(body.nameAr || '') }, nameEn: { stringValue: String(body.nameEn || '') }, phone: { stringValue: String(body.phone || '') }, region: { stringValue: String(body.region || '') }, city: { stringValue: String(body.city || '') }, customCity: { stringValue: String(body.customCity || '') }, role: { stringValue: 'customer' }, requestedRole: { stringValue: body.requestedRole === 'provider' ? 'provider' : 'customer' }, createdAt: { timestampValue: new Date().toISOString() } };
  const existing = await getDoc(env, 'users', u.uid);
  if (!existing) {
    await commitWrites(env, [
      { delete: fullName(env, `registrationGrants/${grantId}`), currentDocument: { updateTime: rawGrant.updateTime } },
      { update: { name: fullName(env, `users/${encodeURIComponent(u.uid)}`), fields }, currentDocument: { exists: false } },
    ]);
  }
  return out(env, req, { success: true, uid: u.uid });
}
export default { async fetch(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req.headers.get('Origin')) });
  const path = new URL(req.url).pathname;
  try {
    if (path === '/health') return out(env, req, { success: true, service: 'heavyar-api' });
    if (path === '/api/send-email-otp' && req.method === 'POST') return await otpSend(req, env);
    if (path === '/api/verify-email-otp' && req.method === 'POST') return await otpVerify(req, env);
    if (path === '/api/register-profile' && req.method === 'POST') return await registerProfile(req, env, await auth(req, env));
    if (path === '/api/verification/profile' && req.method === 'GET') return await verificationProfile(req, env, await auth(req, env));
    if (path === '/api/verification/policy' && req.method === 'GET') return await verificationPolicy(req, env, await auth(req, env));
    if (path === '/api/verification/attempts' && req.method === 'POST') return await startVerification(req, env, await auth(req, env));
    const verificationAttemptMatch = path.match(/^\/api\/verification\/attempts\/([^/]+)$/);
    if (verificationAttemptMatch && req.method === 'GET') return await verificationAttempt(req, env, await auth(req, env), verificationAttemptMatch[1]);
    const identityCallbackMatch = path.match(/^\/api\/webhooks\/identity\/([A-Za-z0-9_-]{16,128})$/);
    if (identityCallbackMatch && req.method === 'POST') return await identityCallback(req, env, identityCallbackMatch[1]);
    if (path === '/api/start-request' && req.method === 'POST') return await startRequest(req, env, await auth(req, env));
    if (path === '/api/confirm-completion' && req.method === 'POST') return await confirmCompletion(req, env, await auth(req, env));
    if (path === '/api/create-payment' && req.method === 'POST') return await create(req, env, await auth(req, env));
    if (path === '/api/verify-payment' && req.method === 'POST') return await verify(req, env, await auth(req, env));
    if (path.startsWith('/api/admin/')) {
      const result = await handleAdmin(req, env, await auth(req, env));
      const status = typeof result === 'object' && result && 'status' in result && typeof (result as any).status === 'number' ? Number((result as any).status) : 200;
      if (status !== 200) { const { status: _status, ...body } = result as any; return out(env, req, body, status); }
      return out(env, req, result);
    }
     if (path === '/api/webhooks/tap' && req.method === 'POST') return await tapWebhook(req, env);
    if (path === '/cloudinary/delete' && req.method === 'POST') return await removeAsset(req, env, await auth(req, env));
    return out(env, req, { success: false, error: 'Not found' }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    const forbidden = message === 'ADMIN_REQUIRED' || message === 'ACCOUNT_SUSPENDED' || message === 'LISTING_UNAVAILABLE' || message.startsWith('TRUST_');
    return out(env, req, { success: false, error: message === 'AUTH_REQUIRED' ? 'Authentication required' : message === 'ADMIN_REQUIRED' ? 'Admin authorization required' : message === 'ACCOUNT_SUSPENDED' ? 'Account suspended' : message === 'LISTING_UNAVAILABLE' ? 'Listing unavailable' : message.startsWith('TRUST_') ? 'Identity verification required' : 'Internal service error' }, message === 'AUTH_REQUIRED' ? 401 : forbidden ? 403 : 500);
  }
} };