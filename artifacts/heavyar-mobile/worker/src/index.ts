import { quoteForRequest, quoteFromCommercial, paymentIdForRequest, idempotencyKeyForPayment, invoiceNumberForPayment, TapPaymentProvider, canTransition, PAYMENT_STATES, stateForProvider, pricingConfig, type PaymentQuote, type PaymentState } from './payment';
import { buildLegacyCatalog, calculateCommercial, majorToMinor, minorToMajor, resolveRule, type CommercialCatalog, type CommercialSnapshot, type CommissionRule } from './commercial';
import { acceptStaffInvitation, staffInvitationDetails, AdminDocumentUnavailableError, handleAdmin, handleAdminDocument, handlePublishedSeo, handlePublicEarlyAccess, processEarlyAccessRetention, processScheduledCampaigns, processStaffClaimSync, processDeletionJobs, type AdminRole } from './admin';
import { canApplyProviderResult, defaultVerificationPolicy, defaultVerificationProfile, deriveProviderTrust, evaluateRisk, normalizeVerificationPolicy, providerComponentNames, providerVerificationFor, type IdentityVerificationProvider, type ProviderComponents, type VerificationPolicy } from './verification';
import { allowedNotificationEvent, defaultNotificationPreferences, notificationFields, notificationWrite, type NotificationEvent, type NotificationCategory, NOTIFICATION_CATEGORIES, isCriticalCategory } from './notifications';
import { availabilityAllows, hasActiveRental, publicDriverProfile, transitionDriverRequest, validateDateRange, gatewayRegistry } from './completion';
import { PUBLIC_IDENTIFIER_COUNTER_IDS, PUBLIC_IDENTIFIER_FIELDS, formatPublicIdentifier, type PublicIdentifierKind } from './public-identifiers';
import { isPublicRentableListing, legacyProviderReady, listingVisibilityForOwnerActive, requiresListingRereview } from './moderation';
import { createInvoicePdfService, type InvoiceBusinessSettings, type TrustedInvoiceSource } from './admin-documents';
import { quotaFetch, isQuotaError, quotaResponse, quotaBlocked } from './quota-policy';
import { earlyAccessDeliveryProof } from './early-access-delivery';
import { evaluateCanonicalCompleteness, type CompletenessResult } from './integrity';

interface KVNamespace { get(key: string, type?: 'json'): Promise<any>; put(key: string, value: string, options?: { expirationTtl: number }): Promise<void>; delete(key: string): Promise<void>; }
export interface Env {
  CLOUDINARY_CLOUD_NAME?: string; CLOUDINARY_API_KEY?: string; CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_FOLDER?: string; TAP_SECRET_KEY_TEST?: string; MOYASAR_SECRET_KEY?: string; MYFATOORAH_API_KEY?: string; RESEND_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string; FIREBASE_CLIENT_EMAIL?: string; FIREBASE_PRIVATE_KEY?: string; FIREBASE_WEB_API_KEY?: string;
  RESEND_FROM_EMAIL?: string; RESEND_SUPPORT_EMAIL?: string; RESEND_SENDER_DOMAIN_VERIFIED?: string; RESEND_WEBHOOK_SECRET?: string;
  CORS_ORIGINS?: string; PAYMENT_PLATFORM_FEE_RATE?: string; PAYMENT_VAT_RATE?: string; OTP_KV?: KVNamespace;
  IDENTITY_PROVIDER_MODE?: 'official';
  AUTH_RATE_LIMIT_KV?: KVNamespace;
  SEO_PUBLIC_KV?: KVNamespace;
  VERIFICATION_RETENTION_DAYS?: string;
  FIREBASE_MESSAGING_SENDER_ID?: string;
  __executionCtx?: { waitUntil(promise: Promise<unknown>): void };
}
type User = { uid: string; admin: boolean; role?: AdminRole; permissionRole?: string; email?: string; emailVerified?: boolean; authTime?: number; testInjected?: true };
let authOverride: User | undefined;
let firestoreOverride: ((collection: string, id: string) => any) | undefined;
let assetOwnedOverride: boolean | undefined;
let firestoreWrites: Array<{ path: string; fields: Record<string, unknown> }> | undefined;
let reservationConflict = false;
let capturedCommits: unknown[] | undefined;
let verificationProviderOverride: IdentityVerificationProvider | undefined;
let notificationDeliveryQueryOverride: any[] | undefined;
let deletionDeviceQueryOverride: any[] | undefined;
let refreshTokenRevokeOverride: ((env: Env, uid: string) => Promise<void>) | undefined;
let passwordVerifierOverride: ((email: string, password: string) => Promise<{ localId?: string }>) | undefined;
let customTokenOverride: ((uid: string) => Promise<string>) | undefined;
let phoneLoginLimiterOverride: ((phoneHash: string, ipHash: string) => Promise<boolean | null>) | undefined;
let publicDriverLimiterOverride: ((scope: 'search' | 'detail', ipHash: string) => Promise<boolean | null>) | undefined;
let capturedDriverQueries: any[] | undefined;
let identityQueryOverride: ((collection: string, uid: string) => any[]) | undefined;
  export const __test = { setAuth(user?: User) { authOverride = user; }, setFirestore(fn?: (collection: string, id: string) => any) { firestoreOverride = fn; }, setAssetOwned(value?: boolean) { assetOwnedOverride = value; }, captureWrites(target?: Array<{ path: string; fields: Record<string, unknown> }>) { firestoreWrites = target; }, captureCommits(target?: unknown[]) { capturedCommits = target; }, captureDriverQueries(target?: any[]) { capturedDriverQueries = target; }, setIdentityQuery(fn?: (collection: string, uid: string) => any[]) { identityQueryOverride = fn; }, setReservationConflict(value: boolean) { reservationConflict = value; }, setVerificationProvider(provider?: IdentityVerificationProvider) { verificationProviderOverride = provider; }, setDeliveryQuery(value?: any[]) { notificationDeliveryQueryOverride = value; }, setDeletionDevices(value?: any[]) { deletionDeviceQueryOverride = value; }, setRefreshTokenRevoke(fn?: (env: Env, uid: string) => Promise<void>) { refreshTokenRevokeOverride = fn; }, setPasswordVerifier(fn?: (email: string, password: string) => Promise<{ localId?: string }>) { passwordVerifierOverride = fn; }, setCustomToken(fn?: (uid: string) => Promise<string>) { customTokenOverride = fn; }, setPhoneLoginLimiter(fn?: (phoneHash: string, ipHash: string) => Promise<boolean | null>) { phoneLoginLimiterOverride = fn; }, setPublicDriverLimiter(fn?: (scope: 'search' | 'detail', ipHash: string) => Promise<boolean | null>) { publicDriverLimiterOverride = fn; }, mintFirebaseCustomToken, firestoreUrl(env: Env, path: string) { return firestoreUrl(env, path); }, verifyToken: auth, quoteForRequest, canTransition, paymentStates: PAYMENT_STATES, hashId: hashedId, normalizeSaudiPhone, normalizeGccPhone, effectiveAuthConfig, normalizeEmailVerificationPolicy, resendFrom, resendSenderDomainValid, runRetryDelivery: retryDueNotificationDeliveries, authoritativeCommercialSnapshot, recalculateLockedCommercial, legacyRecordCommercialSnapshot, quoteFromDoc, trustedInvoiceSource };
const TAP = 'https://api.tap.company/v2';
const enc = new TextEncoder();
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64u = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cors = (env: Env, origin: string | null) => {
  const allow = ['https://heavyar.com', ...(env.CORS_ORIGINS || 'https://heavyar.app,https://www.heavyar.app,https://heavyar-app.web.app,https://heavyar-app.firebaseapp.com').split(',').map(x => x.trim())];
  const trustedExpoPreview = /^https:\/\/[a-z0-9-]+(?:\.expo)?\.sisko\.replit\.dev$/i.test(origin || '');
  return { 'Access-Control-Allow-Origin': allow.includes(origin || '') || trustedExpoPreview ? origin! : 'null', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-ID', Vary: 'Origin' };
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
  if (authOverride && req.headers.has('Authorization')) return { ...authOverride, authTime: authOverride.authTime || Date.now(), permissionRole: authOverride.permissionRole || authOverride.role, testInjected: true };
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
  const permissionRole = typeof payload.heavyarRole === 'string' ? payload.heavyarRole : typeof payload.role === 'string' ? payload.role : undefined;
  const role = payload.heavyarRole === 'super_admin' || payload.role === 'super_admin'
    ? 'super_admin'
    : payload.heavyarRole === 'admin' || payload.role === 'admin' || payload.admin === true
      ? 'admin'
      : undefined;
  return { uid: payload.sub, admin: role === 'admin' || role === 'super_admin' || !!permissionRole, role, permissionRole, email: payload.email, emailVerified: payload.email_verified === true, authTime: Number(payload.auth_time) * 1000 };
}
async function authenticatedUser(req: Request, env: Env, allowAccountManagement = false): Promise<User> {
  const user = await auth(req, env);
  if (user.admin || allowAccountManagement) return user;
  // Test authentication is intentionally injectable; preserve unit tests that
  // exercise downstream validation without a Firestore fixture.
  if (authOverride && !firestoreOverride) return user;
  const profile = await getDoc(env, 'users', user.uid);
  if (!user.testInjected) {
    if (!profile) err('ACCOUNT_PROVISIONING_INCOMPLETE');
    const roleProfile = profile.role === 'driver' ? await getDoc(env, 'driverProfiles', user.uid) : null;
    if (evaluateCanonicalCompleteness(user, profile, roleProfile).state !== 'authenticated_complete') err('ACCOUNT_PROVISIONING_INCOMPLETE');
  }
  if (profile?.accountStatus === 'deletion_requested' || profile?.accountStatus === 'restricted' ||
      profile?.suspensionStatus === 'temporarily_suspended' || profile?.suspensionStatus === 'permanently_suspended') {
    err(profile.accountStatus === 'deletion_requested' ? 'ACCOUNT_DELETION_REQUESTED' : 'ACCOUNT_SUSPENDED');
  }
  return user;
}
async function googleToken(env: Env, scope = 'https://www.googleapis.com/auth/datastore'): Promise<string> {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) err('Firestore unavailable');
  const privateKey = env.FIREBASE_PRIVATE_KEY as string;
  const now = Math.floor(Date.now() / 1000), h = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const p = b64u(enc.encode(JSON.stringify({ iss: env.FIREBASE_CLIENT_EMAIL, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const key = await crypto.subtle.importKey('pkcs8', b64(privateKey.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const jwt = `${h}.${p}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${h}.${p}`)))}`;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` });
  if (!r.ok) err('Firestore unavailable'); return (await r.json() as { access_token: string }).access_token;
}
export async function listFirebaseAuthIdentities(env: Env, limit = 50, pageToken?: string) {
  const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
  const query = new URLSearchParams({ maxResults: String(Math.min(50, Math.max(1, Math.floor(limit)))) });
  if (pageToken) query.set('nextPageToken', pageToken);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(String(env.FIREBASE_PROJECT_ID))}/accounts:batchGet?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('AUTH_DIRECTORY_UNAVAILABLE');
  const result: any = await response.json();
  return { identities: (result.users || []).map((identity: any) => ({ uid: String(identity.localId || ''), email: typeof identity.email === 'string' ? identity.email : null, emailVerified: identity.emailVerified === true, disabled: identity.disabled === true, createdAt: identity.createdAt ? new Date(Number(identity.createdAt)).toISOString() : undefined })).filter((identity: any) => identity.uid), nextPageToken: typeof result.nextPageToken === 'string' ? result.nextPageToken : null };
}
const val = (v: any): any => v?.stringValue ?? v?.integerValue ?? v?.doubleValue ?? v?.booleanValue ?? v?.timestampValue ?? (v?.arrayValue ? (v.arrayValue.values || []).map(val) : v?.mapValue ? decode(v.mapValue) : undefined);
const decode = (d: any) => Object.fromEntries(Object.entries(d?.fields || {}).map(([k, v]) => [k, val(v)]));
function fullName(env: Env, path: string) { return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`; }
function firestoreUrl(env: Env, path: string) {
  const suffix = path.startsWith(':') ? `documents${path}` : `documents/${path}`;
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/${suffix}`;
}
async function commitWrites(env: Env, writes: unknown[], transaction?: string) {
  if (capturedCommits) { capturedCommits.push(writes); return; }
  const sourceWrites = (writes as any[]).map(write => String(write?.update?.name || '').includes('/notificationOutbox/')
    ? { ...write, currentDocument: undefined } : write);
  const businessWrites = sourceWrites.filter(write => !String(write?.update?.name || '').includes('/notificationOutbox/'));
  let r: any = true;
  try { r = sourceWrites.length ? await fs(env, ':commit', { method: 'POST', body: JSON.stringify({ writes: sourceWrites, ...(transaction ? { transaction } : {}) }) }) : true; }
  catch (error) { if (businessWrites.length) throw error; return; }
  if (!r) err('Firestore commit failed');
  // Outbox processing is request-scoped and never changes the source result.
  for (const write of sourceWrites) {
    const fields = write?.update?.fields, name = String(write?.update?.name || '');
    if (fields?.notificationId?.stringValue && name.includes('/notificationOutbox/')) {
      env.__executionCtx?.waitUntil(processNotificationOutbox(env, fields));
    }
  }
}
async function fs(env: Env, path: string, init?: RequestInit): Promise<any> {
  const r = await quotaFetch(firestoreUrl(env, path), { ...init, headers: { Authorization: `Bearer ${await googleToken(env)}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (r.status === 404) return null; if (!r.ok) err('Firestore unavailable'); return r.status === 204 ? null : r.json();
}
async function beginTransaction(env: Env): Promise<string | undefined> {
  if (firestoreWrites || capturedCommits || firestoreOverride) return undefined;
  const response = await fs(env, ':beginTransaction', { method: 'POST', body: JSON.stringify({ options: { readWrite: {} } }) });
  return response?.transaction;
}
async function createDoc(env: Env, path: string, fields: Record<string, unknown>) {
  if (firestoreWrites) { firestoreWrites.push({ path: `${path}?currentDocument.exists=false`, fields }); return null; }
  return fs(env, `${path}?currentDocument.exists=false`, { method: 'PATCH', body: JSON.stringify({ fields }) });
}
function standardBase64Bytes(value: string): Uint8Array | null {
  if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  try {
    const decoded = Uint8Array.from(atob(value), char => char.charCodeAt(0));
    return btoa(String.fromCharCode(...decoded)) === value ? decoded : null;
  } catch { return null; }
}
function webhookSecretBytes(value: string): Uint8Array | null {
  const raw = value.replace(/^whsec_/, '');
  const standard = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = standard + '='.repeat((4 - standard.length % 4) % 4);
  return standardBase64Bytes(padded);
}
function constantTimeBytesEqual(expected: Uint8Array, supplied: Uint8Array): boolean {
  let difference = expected.length ^ supplied.length;
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ (supplied[i] || 0);
  return difference === 0;
}
async function resendWebhook(req: Request, env: Env) {
  if (!env.RESEND_WEBHOOK_SECRET) return out(env, req, { success: false, error: 'Webhook not configured' }, 503);
  const body = await req.text(), id = req.headers.get('svix-id') || '', timestamp = req.headers.get('svix-timestamp') || '', supplied = req.headers.get('svix-signature') || '';
  const numericTimestamp = Number(timestamp);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^\d{1,16}$/.test(timestamp) || !Number.isFinite(numericTimestamp) ||
      !Number.isInteger(numericTimestamp) || Math.abs(Date.now() / 1000 - numericTimestamp) > 300 || !supplied) {
    return out(env, req, { success: false, error: 'Invalid webhook signature' }, 401);
  }
  const secret = webhookSecretBytes(env.RESEND_WEBHOOK_SECRET);
  if (!secret) return out(env, req, { success: false, error: 'Invalid webhook configuration' }, 503);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new Uint8Array(secret).buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(`${id}.${timestamp}.${body}`)));
  const signatures = supplied.trim().split(/\s+/).map(value => {
    const match = /^v1,(.+)$/.exec(value);
    return match ? standardBase64Bytes(match[1]) : null;
  });
  if (!signatures.some(signature => signature && constantTimeBytesEqual(expected, signature))) return out(env, req, { success: false, error: 'Invalid webhook signature' }, 401);

  let event: any;
  try { event = JSON.parse(body); } catch { return out(env, req, { success: false, error: 'Invalid webhook payload' }, 400); }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') return out(env, req, { success: false, error: 'Invalid webhook payload' }, 400);
  const statuses: Record<string, string> = {
    'email.sent': 'accepted', 'email.delivered': 'delivered', 'email.bounced': 'bounced',
    'email.complained': 'complained', 'email.failed': 'failed',
  };
  const type = event.type;
  if (!Object.hasOwn(statuses, type)) return out(env, req, { success: true, ignored: true });
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return out(env, req, { success: false, error: 'Invalid webhook payload' }, 400);
  const rawProviderMessageId = event.data.email_id ?? event.data.id;
  if (typeof rawProviderMessageId !== 'string' || !rawProviderMessageId || rawProviderMessageId.length > 512) return out(env, req, { success: false, error: 'Invalid webhook payload' }, 400);
  const parsedEventTime = event.created_at === undefined ? numericTimestamp * 1000 : typeof event.created_at === 'string' ? Date.parse(event.created_at) : NaN;
  if (!Number.isFinite(parsedEventTime)) return out(env, req, { success: false, error: 'Invalid webhook payload' }, 400);
  const providerMessageId = rawProviderMessageId, status = statuses[type], eventAt = new Date(parsedEventTime).toISOString();
  const markerPath = `resendWebhookEvents/${id}`, markerName = fullName(env, markerPath);
  if (await fs(env, markerPath)) return out(env, req, { success: true, duplicate: true });

  const writes: any[] = [];
  for (const collection of ['emailVerificationRateLimits', 'staffInvitations', 'earlyAccessDeliveries']) {
    const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: 'providerMessageId' }, op: 'EQUAL', value: { stringValue: providerMessageId } } }, limit: 20 } }) }) as any[] || [];
    for (const row of rows.filter((item: any) => item.document && decode(item.document).providerMessageId === providerMessageId)) {
      const prior = decode(row.document), priorStatus = String(prior.deliveryStatus || ''), priorEventTime = Date.parse(String(prior.deliveryEventAt || ''));
      const priorIsFinal = ['delivered', 'bounced', 'failed', 'complained'].includes(priorStatus);
      const terminalSubscriberEvent = collection === 'earlyAccessDeliveries' && prior.subscriberId && ['bounced', 'complained'].includes(status);
      if (!terminalSubscriberEvent && (status === 'accepted' && priorIsFinal || Number.isFinite(priorEventTime) && parsedEventTime < priorEventTime)) continue;
      const fields = { deliveryStatus: { stringValue: status }, deliveryUpdatedAt: { timestampValue: new Date().toISOString() }, deliveryEventAt: { timestampValue: eventAt },
        ...(collection === 'earlyAccessDeliveries' ? earlyAccessDeliveryProof(prior, status) : {}) };
      writes.push({ update: { name: row.document.name, fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: row.document.updateTime ? { updateTime: row.document.updateTime } : undefined });
    }
  }
  const processedAt = new Date().toISOString();
  writes.push({ update: { name: markerName, fields: { status: { stringValue: status }, eventType: { stringValue: type }, providerMessageId: { stringValue: providerMessageId }, processed: { booleanValue: true }, processedAt: { timestampValue: processedAt }, receivedAt: { timestampValue: processedAt }, eventAt: { timestampValue: eventAt } } }, currentDocument: { exists: false } });
  try {
    await commitWrites(env, writes);
  } catch (error) {
    if (await fs(env, markerPath)) return out(env, req, { success: true, duplicate: true });
    throw error;
  }
  return out(env, req, { success: true });
}
async function priorResendWebhookEvent(env: Env, providerMessageId: string) {
  if (!providerMessageId) return null;
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'resendWebhookEvents' }],
    where: { fieldFilter: { field: { fieldPath: 'providerMessageId' }, op: 'EQUAL', value: { stringValue: providerMessageId } } },
    limit: 20,
  } }) }) as any[] || [];
  const allowed = new Set(['accepted', 'delivered', 'bounced', 'complained', 'failed']);
  return rows.flatMap(row => row.document ? [decode(row.document)] : [])
    .filter(event => event.providerMessageId === providerMessageId && allowed.has(String(event.status)))
    .sort((a, b) => Date.parse(String(b.eventAt || b.processedAt || '')) - Date.parse(String(a.eventAt || a.processedAt || '')))[0] || null;
}
async function reconcileResendWebhookProjection(env: Env, collection: 'emailVerificationRateLimits' | 'staffInvitations', id: string, providerMessageId: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const event = await priorResendWebhookEvent(env, providerMessageId);
    if (!event) return;
    const record = await getRawDoc(env, collection, id);
    if (!record?.updateTime || record.data.providerMessageId !== providerMessageId) return;
    const eventTime = Date.parse(String(event.eventAt || event.processedAt || ''));
    const projectedTime = Date.parse(String(record.data.deliveryEventAt || ''));
    const projectedFinal = ['delivered', 'bounced', 'failed', 'complained'].includes(String(record.data.deliveryStatus));
    if (!Number.isFinite(eventTime) || Number.isFinite(projectedTime) && (eventTime < projectedTime || eventTime === projectedTime && event.status === record.data.deliveryStatus) ||
        event.status === 'accepted' && projectedFinal) return;
    const fields = { deliveryStatus: { stringValue: String(event.status) }, deliveryEventAt: { timestampValue: new Date(eventTime).toISOString() }, deliveryUpdatedAt: { timestampValue: new Date().toISOString() } };
    try {
      await commitWrites(env, [{ update: { name: fullName(env, `${collection}/${encodeURIComponent(id)}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: record.updateTime } }]);
      return;
    } catch {
      if (attempt === 1) throw new Error('Webhook reconciliation conflict');
    }
  }
}
async function hashedId(value: string): Promise<string> { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(value))); }

async function publicDriverRateLimit(req: Request, env: Env, scope: 'search' | 'detail'): Promise<boolean | null> {
  const address = (req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0] || 'unknown').trim().slice(0, 128);
  const bucket = Math.floor(Date.now() / 60000), ipHash = await hashedId(`public-driver-ip:${address}`);
  if (publicDriverLimiterOverride) return publicDriverLimiterOverride(scope, ipHash);
  if (firestoreOverride) return true;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;
  const key = await hashedId(`${scope}:${ipHash}:${bucket}`), name = fullName(env, `publicDriverRateLimits/${key}`), limit = scope === 'search' ? 60 : 120;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) return null;
      const result = await fs(env, ':batchGet', { method: 'POST', body: JSON.stringify({ documents: [name], transaction }) });
      const found = (result || []).find((row: any) => row.found)?.found;
      const count = Number(found ? decode(found).count : 0);
      if (count >= limit) return false;
      const write = { update: { name, fields: {
        scope: { stringValue: scope }, bucket: { integerValue: String(bucket) }, count: { integerValue: String(count + 1) },
        expiresAt: { timestampValue: new Date((bucket + 2) * 60000).toISOString() },
      } }, ...(found ? { updateMask: { fieldPaths: ['scope', 'bucket', 'count', 'expiresAt'] } } : {}), currentDocument: found ? undefined : { exists: false } };
      try {
        await fs(env, ':commit', { method: 'POST', body: JSON.stringify({ writes: [write], transaction }) });
        return true;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
  } catch { return null; }
  return null;
}
export type GccCountryCode = 'SA' | 'AE' | 'KW' | 'QA' | 'BH' | 'OM';
export const GCC_COUNTRIES: Readonly<Record<GccCountryCode, {
  code: GccCountryCode; nameEn: string; nameAr: string; dialCode: string; currency: string; enabled: boolean;
}>> = Object.freeze({
  SA: { code: 'SA', nameEn: 'Saudi Arabia', nameAr: 'المملكة العربية السعودية', dialCode: '+966', currency: 'SAR', enabled: true },
  AE: { code: 'AE', nameEn: 'United Arab Emirates', nameAr: 'الإمارات العربية المتحدة', dialCode: '+971', currency: 'AED', enabled: false },
  KW: { code: 'KW', nameEn: 'Kuwait', nameAr: 'الكويت', dialCode: '+965', currency: 'KWD', enabled: false },
  QA: { code: 'QA', nameEn: 'Qatar', nameAr: 'قطر', dialCode: '+974', currency: 'QAR', enabled: false },
  BH: { code: 'BH', nameEn: 'Bahrain', nameAr: 'البحرين', dialCode: '+973', currency: 'BHD', enabled: false },
  OM: { code: 'OM', nameEn: 'Oman', nameAr: 'عُمان', dialCode: '+968', currency: 'OMR', enabled: false },
});
const GCC_PHONE_PATTERNS: Record<GccCountryCode, RegExp> = {
  SA: /^5\d{8}$/, AE: /^5\d{8}$/, KW: /^[569]\d{7}$/, QA: /^[3567]\d{7}$/, BH: /^[36]\d{7}$/, OM: /^[79]\d{7}$/,
};
export function normalizeGccPhone(value: unknown, country?: string): { phone: string; countryCode: GccCountryCode } | null {
  const raw = String(value || '').trim().replace(/[()\s-]/g, '');
  if (!raw) return null;
  const byDial = Object.values(GCC_COUNTRIES).find(item => raw.startsWith(item.dialCode) || raw.startsWith(`00${item.dialCode.slice(1)}`));
  const code = (String(country || '').toUpperCase() as GccCountryCode);
  const selected = byDial?.code || (GCC_COUNTRIES[code] ? code : 'SA');
  const config = GCC_COUNTRIES[selected];
  let national = raw;
  if (raw.startsWith(config.dialCode)) national = raw.slice(config.dialCode.length);
  else if (raw.startsWith(`00${config.dialCode.slice(1)}`)) national = raw.slice(config.dialCode.length + 1);
  else if (selected === 'SA' && national.startsWith('05')) national = national.slice(1);
  else if (national.startsWith('0')) national = national.slice(1);
  if (!GCC_PHONE_PATTERNS[selected].test(national)) return null;
  return { phone: `${config.dialCode}${national}`, countryCode: selected };
}
async function countrySettings(env: Env, code: string) {
  const country = String(code || 'SA').toUpperCase() as GccCountryCode, base = GCC_COUNTRIES[country] || GCC_COUNTRIES.SA;
  if (!env.FIREBASE_PROJECT_ID && !firestoreOverride) return { ...base, marketplaceAvailable: base.enabled, providerOnboardingAvailable: base.enabled, crossBorderAvailable: false };
  const stored = await getDoc(env, 'countryConfigs', base.code);
  const enabled = stored?.enabled === undefined ? base.enabled : stored.enabled === true;
  return { ...base, ...stored, enabled, marketplaceAvailable: enabled && (stored?.marketplaceAvailable === undefined ? base.enabled : stored.marketplaceAvailable === true), providerOnboardingAvailable: enabled && (stored?.providerOnboardingAvailable === undefined ? base.enabled : stored.providerOnboardingAvailable === true), crossBorderAvailable: enabled && stored?.crossBorderAvailable === true };
}
async function getDoc(env: Env, collection: string, id: string) {
  if (firestoreOverride) {
    const value = firestoreOverride(collection, id);
    // Existing injected fixtures predate the canonical gateway document. Keep
    // those fixtures usable while explicit gateway fixtures remain authoritative.
    if (collection === 'paymentGateways' && (value == null || value.enabled === undefined) && !String(firestoreOverride).includes('paymentGateways')) return { enabled: true };
    return value;
  }
  const d = await fs(env, `${collection}/${encodeURIComponent(id)}`); return d ? decode(d) : null;
}
async function getRawDoc(env: Env, collection: string, id: string): Promise<{ data: any; updateTime?: string } | null> {
  if (firestoreOverride) { const data = firestoreOverride(collection, id); return data ? { data, updateTime: 'test-update-time' } : null; }
  const d = await fs(env, `${collection}/${encodeURIComponent(id)}`); return d ? { data: decode(d), updateTime: d.updateTime } : null;
}
async function queryOwnedDocuments(env: Env, collection: string, uid: string, fields = ['uid']): Promise<any[]> {
  if (identityQueryOverride) return identityQueryOverride(collection, uid) || [];
  if (firestoreOverride) return [];
  const filters = fields.map(field => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: uid } } }));
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: collection }], where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'OR', filters } }, limit: 100,
  } }) }) as any[] || [];
  return rows.filter(row => row.document).map(row => ({ id: String(row.document.name).split('/').pop(), data: decode(row.document), updateTime: row.document.updateTime }));
}
async function deleteFirebaseIdentity(env: Env, uid: string) {
  if (refreshTokenRevokeOverride) return refreshTokenRevokeOverride(env, uid);
  const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(String(env.FIREBASE_PROJECT_ID))}/accounts:delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }) });
  if (!response.ok && response.status !== 404) throw new Error('AUTH_IDENTITY_DELETE_UNAVAILABLE');
}
async function destroyOwnedCloudinaryAsset(env: Env, publicId: string, uid: string): Promise<boolean> {
  const folder = env.CLOUDINARY_FOLDER || 'heavyar';
  if (!publicId.startsWith(`${folder}/${uid}/`) || !env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return false;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = await crypto.subtle.digest('SHA-1', enc.encode(`public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`));
  const signature = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
  const form = new FormData(); form.append('public_id', publicId); form.append('timestamp', timestamp); form.append('api_key', env.CLOUDINARY_API_KEY); form.append('signature', signature);
  return (await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: 'POST', body: form })).ok;
}
async function identityStatus(env: Env, u: User): Promise<CompletenessResult> {
  const profile = await getDoc(env, 'users', u.uid);
  return evaluateCanonicalCompleteness(u, profile, profile?.role === 'driver' ? await getDoc(env, 'driverProfiles', u.uid) : null);
}
async function accountProfileStatus(req: Request, env: Env, u: User) {
  const result = await identityStatus(env, u);
  return out(env, req, { success: true, ...result, accountStatus: (await getDoc(env, 'users', u.uid))?.accountStatus || null });
}
async function identityOnlyDeletion(req: Request, env: Env, u: User) {
  const body: any = await req.json().catch(() => null);
  if (!body || Object.keys(body).length !== 1 || body.confirmation !== 'DELETE_INCOMPLETE_ACCOUNT') return out(env, req, { success: false, error: 'Confirmation required', errorCode: 'CONFIRMATION_REQUIRED' }, 400);
  const profile = await getRawDoc(env, 'users', u.uid);
  const roleProfile = profile?.data?.role === 'driver' ? await getDoc(env, 'driverProfiles', u.uid) : null;
  if (evaluateCanonicalCompleteness(u, profile?.data || null, roleProfile).state === 'authenticated_complete') {
    return out(env, req, { success: false, error: 'Complete accounts use the account deletion lifecycle.', errorCode: 'COMPLETE_ACCOUNT_USE_DELETION' }, 409);
  }
  const marker = await getRawDoc(env, 'identityDeletionRequests', u.uid);
  if (marker?.data?.status === 'completed') return out(env, req, { success: true, status: 'completed', alreadyDeleted: true });
  // Shared marketplace transactions are deliberately preserved. This cleanup
  // only removes identity-owned profile, device, verification, and draft media.
  const targets: Array<[string, string[]]> = [['phoneOwners', ['uid']], ['driverProfiles', ['uid']], ['providerProfiles', ['uid']], ['equipment', ['ownerUid']], ['notifications', ['uid']], ['deviceTokens', ['uid']], ['notificationTokenOwners', ['uid']], ['notificationInstallations', ['uid']], ['verificationProfiles', ['uid']], ['verificationAttempts', ['uid']], ['verificationEvents', ['uid']]];
  const rows: any[] = profile ? [{ collection: 'users', id: u.uid, ...profile }] : [];
  for (const [collection, fields] of targets) {
    const owned = await queryOwnedDocuments(env, collection, u.uid, fields);
    if (owned.length >= 100) return out(env, req, { success: false, error: 'Incomplete account cleanup requires review.', errorCode: 'INCOMPLETE_ACCOUNT_CLEANUP_REQUIRES_REVIEW' }, 409);
    rows.push(...owned.map(row => ({ collection, ...row })));
  }
  const uniqueRows = [...new Map(rows.map(row => [`${row.collection}/${row.id}`, row])).values()];
  if (uniqueRows.length > 450) return out(env, req, { success: false, error: 'Incomplete account cleanup requires review.', errorCode: 'INCOMPLETE_ACCOUNT_CLEANUP_REQUIRES_REVIEW' }, 409);
  const media = new Set<string>(Array.isArray(marker?.data?.mediaPublicIds) ? marker.data.mediaPublicIds.filter((id: unknown) => typeof id === 'string') : []);
  for (const row of uniqueRows) {
    if (typeof row.data?.avatarPublicId === 'string') media.add(row.data.avatarPublicId);
    for (const image of Array.isArray(row.data?.images) ? row.data.images : []) if (typeof image?.publicId === 'string') media.add(image.publicId);
  }
  const now = new Date().toISOString();
  const writes: any[] = uniqueRows.map(row => ({ delete: fullName(env, `${row.collection}/${encodeURIComponent(row.id)}`), ...(row.updateTime ? { currentDocument: { updateTime: row.updateTime } } : {}) }));
  const markerFields = { uid: { stringValue: u.uid }, status: { stringValue: 'pending' }, lifecycle: { stringValue: 'identity_only' }, mediaPublicIds: { arrayValue: { values: [...media].map(id => ({ stringValue: id })) } }, requestedAt: { timestampValue: marker?.data?.requestedAt || now }, updatedAt: { timestampValue: now } };
  writes.push({ update: { name: fullName(env, `identityDeletionRequests/${encodeURIComponent(u.uid)}`), fields: markerFields }, ...(marker?.updateTime ? { updateMask: { fieldPaths: Object.keys(markerFields) }, currentDocument: { updateTime: marker.updateTime } } : { currentDocument: { exists: false } }) });
  try {
    await commitWrites(env, writes);
    const mediaResults = await Promise.all([...media].map(id => destroyOwnedCloudinaryAsset(env, id, u.uid).catch(() => false)));
    if (mediaResults.some(result => !result)) return out(env, req, { success: false, status: 'pending', error: 'Incomplete account deletion is pending.', errorCode: 'MEDIA_CLEANUP_PENDING' }, 503);
    await deleteFirebaseIdentity(env, u.uid);
  } catch { return out(env, req, { success: false, status: 'pending', error: 'Incomplete account deletion is pending.', errorCode: 'AUTH_IDENTITY_DELETE_UNAVAILABLE' }, 503); }
  await commitWrites(env, [{ update: { name: fullName(env, `identityDeletionRequests/${encodeURIComponent(u.uid)}`), fields: { status: { stringValue: 'completed' }, updatedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'updatedAt'] } }, { update: { name: fullName(env, `adminAudit/identity-delete:${encodeURIComponent(u.uid)}`), fields: { actorUid: { stringValue: u.uid }, action: { stringValue: 'identity_only_account_deleted' }, targetId: { stringValue: u.uid }, timestamp: { timestampValue: new Date().toISOString() } } }, currentDocument: { exists: false } }]).catch(() => undefined);
  return out(env, req, { success: true, status: 'completed', cleanedRecords: uniqueRows.length });
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
function safeNotificationId(id: string) { return /^[A-Za-z0-9:_-]{3,180}$/.test(id); }
function notificationCursor(value: string | null) {
  if (!value) return undefined;
  try { const decoded = JSON.parse(new TextDecoder().decode(b64(value))); return decoded?.createdAt && decoded?.id ? { createdAt: String(decoded.createdAt), id: String(decoded.id) } : undefined; } catch { return undefined; }
}
function nextNotificationCursor(createdAt: string, id: string) {
  return b64u(enc.encode(JSON.stringify({ createdAt, id })));
}
async function notificationDevices(env: Env, uid: string) {
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'deviceTokens' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
  } }) });
  const devices = [];
  for (const x of (result || [])) {
    const value: any = { name: x.document?.name, ...decode(x.document || x) };
    if (value.active !== true || typeof value.token !== 'string') continue;
    const tokenHash = await hashedId(value.token), owner = await getDoc(env, 'notificationTokenOwners', tokenHash), installation = await getDoc(env, 'notificationInstallations', await hashedId(String(value.installationId || '')));
    if (owner?.uid === uid && owner?.active === true && owner?.tokenHash === tokenHash && installation?.uid === uid && installation?.tokenId === tokenHash) devices.push({ ...value, tokenHash });
  }
  return devices;
}
async function deletionDeviceRows(env: Env, uid: string) {
  if (deletionDeviceQueryOverride) return deletionDeviceQueryOverride;
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'deviceTokens' }],
    where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
  } }) });
  return (result || []).filter((row: any) => decode(row.document || row).active === true);
}
async function revokeFirebaseRefreshTokens(env: Env, uid: string) {
  if (refreshTokenRevokeOverride) return refreshTokenRevokeOverride(env, uid);
  const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(String(env.FIREBASE_PROJECT_ID))}/accounts:update`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, validSince: String(Math.floor(Date.now() / 1000)) }),
  });
  if (!response.ok) err('AUTH_REVOCATION_UNAVAILABLE');
}
async function accountDeletionStatus(req: Request, env: Env, u: User) {
  const request = await getDoc(env, 'deletionRequests', u.uid);
  return out(env, req, { success: true, status: String(request?.status || 'none') });
}
async function accountDeletionRequest(req: Request, env: Env, u: User) {
  let body: any;
  try { body = await req.json(); } catch { return out(env, req, { success: false, error: 'Confirmation required' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || body.confirmation !== 'DELETE_MY_ACCOUNT') {
    return out(env, req, { success: false, error: 'Confirmation required' }, 400);
  }
  const user = await getRawDoc(env, 'users', u.uid);
  if (!user?.data) return out(env, req, { success: false, error: 'Account unavailable' }, 404);
  const existing = await getRawDoc(env, 'deletionRequests', u.uid);
  if (existing?.data?.status === 'completed' ||
      (existing?.data?.status === 'pending' && user.data.accountStatus === 'deletion_requested' &&
       existing.data.refreshTokenRevocationStatus === 'succeeded')) {
    return out(env, req, { success: true, status: String(existing.data.status) });
  }
  const now = new Date().toISOString(), writes: any[] = [];
  const requestFields = {
    uid: { stringValue: u.uid }, lifecycle: { stringValue: 'user_deletion' }, status: { stringValue: 'pending' },
    refreshTokenRevocationStatus: { stringValue: 'pending' },
    requestedAt: { timestampValue: String(existing?.data?.requestedAt || now) }, updatedAt: { timestampValue: now },
  };
  writes.push({ update: { name: fullName(env, `deletionRequests/${encodeURIComponent(u.uid)}`), fields: requestFields }, currentDocument: existing?.updateTime ? { updateTime: existing.updateTime } : { exists: false } });
  writes.push({ update: { name: fullName(env, `users/${encodeURIComponent(u.uid)}`), fields: {
    accountStatus: { stringValue: 'deletion_requested' }, deletionRequestedAt: { timestampValue: String(user.data.deletionRequestedAt || now) }, updatedAt: { timestampValue: now },
  } }, updateMask: { fieldPaths: ['accountStatus', 'deletionRequestedAt', 'updatedAt'] }, currentDocument: { updateTime: user.updateTime } });
  const rows = await deletionDeviceRows(env, u.uid), seen = new Set<string>();
  for (const row of rows) {
    const data = decode(row.document || row), tokenHash = await hashedId(String(data.token || ''));
    if (!data.token || seen.has(tokenHash)) continue;
    seen.add(tokenHash);
    const deviceName = String(row.document?.name || '').split('/documents/')[1] || `deviceTokens/${tokenHash}`;
    writes.push({ update: { name: fullName(env, deviceName), fields: { active: { booleanValue: false }, revokedAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['active', 'revokedAt', 'updatedAt'] }, currentDocument: row.document?.updateTime ? { updateTime: row.document.updateTime } : { exists: true } });
    const owner = await getRawDoc(env, 'notificationTokenOwners', tokenHash);
    if (owner?.data?.uid === u.uid && owner.data.active === true && owner.updateTime) writes.push({ update: { name: fullName(env, `notificationTokenOwners/${tokenHash}`), fields: { active: { booleanValue: false }, revokedAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['active', 'revokedAt', 'updatedAt'] }, currentDocument: { updateTime: owner.updateTime } });
    const installationId = String(data.installationId || ''), installationKey = installationId ? await hashedId(installationId) : '';
    if (installationKey) {
      const installation = await getRawDoc(env, 'notificationInstallations', installationKey);
      if (installation?.data?.uid === u.uid && installation.data.tokenId === tokenHash && installation.updateTime) writes.push({ update: { name: fullName(env, `notificationInstallations/${installationKey}`), fields: { active: { booleanValue: false }, revokedAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['active', 'revokedAt', 'updatedAt'] }, currentDocument: { updateTime: installation.updateTime } });
    }
  }
  try { await commitWrites(env, writes); } catch { return out(env, req, { success: false, error: 'Deletion request unavailable' }, 409); }
  try {
    await revokeFirebaseRefreshTokens(env, u.uid);
    await commitWrites(env, [{ update: { name: fullName(env, `deletionRequests/${encodeURIComponent(u.uid)}`), fields: {
      refreshTokenRevocationStatus: { stringValue: 'succeeded' }, updatedAt: { timestampValue: new Date().toISOString() },
    } }, updateMask: { fieldPaths: ['refreshTokenRevocationStatus', 'updatedAt'] } }]);
  } catch {
    try {
      await commitWrites(env, [{ update: { name: fullName(env, `deletionRequests/${encodeURIComponent(u.uid)}`), fields: {
        refreshTokenRevocationStatus: { stringValue: 'failed' }, updatedAt: { timestampValue: new Date().toISOString() },
      } }, updateMask: { fieldPaths: ['refreshTokenRevocationStatus', 'updatedAt'] } }]);
    } catch { /* durable account lock remains authoritative */ }
    // The Firestore lock is durable and deliberately remains in place if Auth
    // revocation is temporarily unavailable. Clients receive no token detail.
    return out(env, req, { success: false, status: 'pending', error: 'Deletion request pending' }, 503);
  }
  return out(env, req, { success: true, status: 'pending' }, 202);
}
async function notificationList(req: Request, env: Env, u: User) {
  const url = new URL(req.url), rawLimit = Number(url.searchParams.get('limit') || 20), limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 20));
  const cursor = notificationCursor(url.searchParams.get('pageToken') || url.searchParams.get('cursor')), where: any = { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: u.uid } } };
  const structuredQuery: any = { from: [{ collectionId: 'notifications' }], where, orderBy: [
    { field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' },
    { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
  ], limit: cursor ? limit + 1 : limit };
  if (cursor) structuredQuery.startAt = { before: false, values: [{ timestampValue: cursor.createdAt }, { referenceValue: fullName(env, `notifications/${cursor.id}`) }] };
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) });
  const items = (result || []).map((x: any) => ({ ...decode(x.document || x), id: String(x.document?.name || '').split('/').pop() || decode(x.document || x).notificationId || '' })).filter((x: any) => x.uid === u.uid && (!cursor || x.id !== cursor.id || x.createdAt !== cursor.createdAt)).slice(0, limit).map((x: any) => ({
    id: String(x.id || x.notificationId || ''), event: x.event, category: x.category, titleAr: x.titleAr, titleEn: x.titleEn,
    bodyAr: x.bodyAr || x.titleAr, bodyEn: x.bodyEn || x.titleEn, read: x.read === true, critical: x.critical === true, createdAt: x.createdAt, action: x.action, subjectId: x.subjectId || null,
  }));
  const last = items[items.length - 1];
  let unreadCount = items.filter((x: any) => !x.read).length;
  try {
    const aggregate = await fs(env, ':runAggregationQuery', { method: 'POST', body: JSON.stringify({ structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: 'notifications' }], where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: u.uid } } },
        { fieldFilter: { field: { fieldPath: 'read' }, op: 'EQUAL', value: { booleanValue: false } } },
      ] } } }, aggregations: [{ alias: 'unread', count: {} }],
    } }) });
    unreadCount = Number(aggregate?.[0]?.result?.aggregateFields?.unread?.integerValue || unreadCount);
  } catch { /* page-local count remains a safe fallback if aggregation is unavailable */ }
  return out(env, req, { success: true, notifications: items, unreadCount, nextPageToken: last ? nextNotificationCursor(last.createdAt, last.id) : null });
}
async function notificationRead(req: Request, env: Env, u: User, id: string) {
  if (!safeNotificationId(id)) return out(env, req, { success: false, error: 'Not found' }, 404);
  const raw = await getRawDoc(env, 'notifications', id);
  if (!raw?.data || raw.data.uid !== u.uid) return out(env, req, { success: false, error: 'Not found' }, 404);
  await compareAndSwap(env, `notifications/${encodeURIComponent(id)}`, raw.updateTime!, { read: { booleanValue: true }, updatedAt: { timestampValue: new Date().toISOString() } });
  return out(env, req, { success: true });
}
async function notificationReadAll(req: Request, env: Env, u: User) {
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notifications' }], where: { compositeFilter: { op: 'AND', filters: [
    { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: u.uid } } },
    { fieldFilter: { field: { fieldPath: 'read' }, op: 'EQUAL', value: { booleanValue: false } } },
  ] } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }], limit: 101 } }) });
  const now = new Date().toISOString(), writes = (result || []).slice(0, 100).map((x: any) => ({ update: { name: x.document?.name, fields: { read: { booleanValue: true }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['read', 'updatedAt'] }, currentDocument: { updateTime: x.document?.updateTime } }));
  if (writes.length) await commitWrites(env, writes);
  const remaining = Math.max(0, (result || []).length - writes.length);
  return out(env, req, { success: true, marked: writes.length, remainingUnread: remaining, hasMore: remaining > 0 });
}
async function notificationPreferences(req: Request, env: Env, u: User) {
  const existing = await getDoc(env, 'notificationPreferences', u.uid);
  if (req.method === 'GET') return out(env, req, { success: true, preferences: { ...defaultNotificationPreferences(), ...(existing || {}) } });
  let body: any; try { body = await req.json(); } catch { return out(env, req, { success: false, error: 'Invalid preferences' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out(env, req, { success: false, error: 'Invalid preferences' }, 400);
  const fields: Record<string, any> = { uid: { stringValue: u.uid }, updatedAt: { timestampValue: new Date().toISOString() } };
  for (const category of NOTIFICATION_CATEGORIES) if (typeof body[category] === 'boolean') fields[category] = { booleanValue: isCriticalCategory(category) ? true : body[category] };
  await (existing ? patchDoc(env, `notificationPreferences/${encodeURIComponent(u.uid)}`, fields) : createDoc(env, `notificationPreferences/${encodeURIComponent(u.uid)}`, { ...fields, ...Object.fromEntries(NOTIFICATION_CATEGORIES.map(c => [c, fields[c] || { booleanValue: true }])) }));
  return out(env, req, { success: true, preferences: { ...defaultNotificationPreferences(), ...Object.fromEntries(Object.entries(fields).filter(([k]) => NOTIFICATION_CATEGORIES.includes(k as any)).map(([k, v]: any) => [k, v.booleanValue])) } });
}
async function registerDevice(req: Request, env: Env, u: User, revoke = false) {
  let body: any; try { body = await req.json(); } catch { return out(env, req, { success: false, error: 'Invalid device token' }, 400); }
  const token = String(body?.token || ''), platform = body?.platform === 'ios' || body?.platform === 'android' || body?.platform === 'web' ? body.platform : '';
  const installationId = String(body?.installationId || '');
  if (!token || token.length > 4096 || (!revoke && !/^Expo(nent)?PushToken\[[^\]]{8,4000}\]$/.test(token)) || (!revoke && !platform) || !/^[A-Za-z0-9._:-]{8,200}$/.test(installationId)) return out(env, req, { success: false, error: 'Invalid device token' }, 400);
  const tokenId = await hashedId(token), installationKey = await hashedId(installationId), now = new Date().toISOString(), path = `deviceTokens/${tokenId}`;
  const ownershipWrites: any[] = [];
  const canonicalInstallation = await getRawDoc(env, 'notificationInstallations', installationKey);
  const canonicalOwner = await getRawDoc(env, 'notificationTokenOwners', tokenId);
  if (!revoke) {
    const prior = firestoreOverride ? [] : await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'deviceTokens' }], where: { compositeFilter: { op: 'OR', filters: [
      { fieldFilter: { field: { fieldPath: 'token' }, op: 'EQUAL', value: { stringValue: token } } },
      { fieldFilter: { field: { fieldPath: 'installationId' }, op: 'EQUAL', value: { stringValue: installationId } } },
    ] } } } }) });
    const transfers = (prior || []).filter((x: any) => decode(x.document || x).uid !== u.uid && decode(x.document || x).active === true);
    for (const item of transfers) {
      ownershipWrites.push({ update: { name: item.document?.name, fields: { active: { booleanValue: false }, revokedAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['active', 'revokedAt', 'updatedAt'] }, currentDocument: { updateTime: item.document?.updateTime } });
    }
  }
  const current = await getRawDoc(env, 'deviceTokens', tokenId);
  const fields: Record<string, any> = { uid: { stringValue: u.uid }, token: { stringValue: token }, installationId: { stringValue: installationId }, platform: { stringValue: platform }, active: { booleanValue: !revoke }, updatedAt: { timestampValue: now }, lastSeenAt: { timestampValue: now } };
  if (revoke) fields.revokedAt = { timestampValue: now };
  ownershipWrites.push(current
    ? { update: { name: fullName(env, path), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { exists: true } }
    : { update: { name: fullName(env, path), fields: { ...fields, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } });
  const installationFields = { installationId: { stringValue: installationId }, uid: { stringValue: u.uid }, tokenId: { stringValue: tokenId }, updatedAt: { timestampValue: now } };
  const ownerFields = { tokenHash: { stringValue: tokenId }, uid: { stringValue: u.uid }, installationId: { stringValue: installationId }, active: { booleanValue: !revoke }, updatedAt: { timestampValue: now } };
  ownershipWrites.push({ update: { name: fullName(env, `notificationInstallations/${installationKey}`), fields: installationFields }, ...(canonicalInstallation?.updateTime ? { currentDocument: { updateTime: canonicalInstallation.updateTime } } : { currentDocument: { exists: false } }) });
  ownershipWrites.push({ update: { name: fullName(env, `notificationTokenOwners/${tokenId}`), fields: ownerFields }, ...(canonicalOwner?.updateTime ? { currentDocument: { updateTime: canonicalOwner.updateTime } } : { currentDocument: { exists: false } }) });
  if (firestoreWrites) {
    for (const write of ownershipWrites) firestoreWrites.push({ path: String(write.update?.name || '').split('/documents/')[1] || '', fields: write.update?.fields || {} });
  } else {
    let committed = false;
    for (let attempt = 0; attempt < 2 && !committed; attempt += 1) {
      try { await commitWrites(env, ownershipWrites); committed = true; }
      catch { if (attempt === 1) return out(env, req, { success: false, error: 'Device ownership changed; retry registration' }, 409); }
    }
  }
  return out(env, req, { success: true, active: !revoke });
}
async function enqueueNotifications(env: Env, full: (path: string) => string, uid: string | undefined, event: NotificationEvent, subjectId: string | undefined, now: string, occurrenceId?: string) {
  return uid ? [await notificationWrite(full, uid, event, now, subjectId, occurrenceId)] : [];
}
async function processNotificationOutbox(env: Env, fields: any) {
  const uid = fields.uid?.stringValue, notificationId = fields.notificationId?.stringValue;
  if (!uid || !notificationId) return;
  const existing = await getRawDoc(env, 'notifications', notificationId);
  if (!existing) {
    try { await createDoc(env, `notifications/${notificationId}`, fields); }
    catch { return; }
  }
  if (await deliverNotificationPush(env, uid, notificationId, fields)) {
    try { await patchDoc(env, `notificationOutbox/${notificationId}`, { status: { stringValue: 'processed' }, processedAt: { timestampValue: new Date().toISOString() } }); } catch { /* cron retries */ }
  }
}
async function deliverNotificationPush(env: Env, uid: string, notificationId: string, fields: any, onlyTokenHash?: string) {
  try {
    const preferences = await getDoc(env, 'notificationPreferences', uid);
    const category = String(fields.category?.stringValue || 'security') as NotificationCategory;
    if (!isCriticalCategory(category) && preferences?.[category] === false) return;
    const devices = (await notificationDevices(env, uid)).filter((device: any) => !onlyTokenHash || device.tokenHash === onlyTokenHash);
    const batches = [];
    for (let i = 0; i < devices.length; i += 100) batches.push(devices.slice(i, i + 100));
    for (const batch of batches.slice(0, 2)) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((device: any) => ({ to: device.token, title: fields.titleEn?.stringValue, body: fields.bodyEn?.stringValue, data: {
          notificationId, category,
          action: String(fields.action?.mapValue?.fields?.type?.stringValue || 'profile'),
          subjectId: String(fields.action?.mapValue?.fields?.subjectId?.stringValue || ''),
        } }))),
      });
      const body = await response.json().catch(() => ({})) as any;
      const tickets = Array.isArray(body?.data) ? body.data : [];
      for (let i = 0; i < batch.length; i += 1) {
        const ticket = tickets[i] || {};
        const status = ticket.status === 'ok' ? 'ticketed' : 'retryable';
        await createDoc(env, `notificationDeliveries/${encodeURIComponent(`${notificationId}:${await hashedId(batch[i].token)}`)}`, {
          uid: { stringValue: uid }, notificationId: { stringValue: notificationId }, status: { stringValue: status },
          tokenHash: { stringValue: await hashedId(batch[i].token) },
          ticketId: { stringValue: String(ticket.id || '').slice(0, 160) }, receiptPending: { booleanValue: ticket.status === 'ok' },
          attempts: { integerValue: '1' }, nextAttemptAt: { timestampValue: new Date(Date.now() + 60000).toISOString() }, errorCode: { stringValue: String(ticket.details?.error || '').slice(0, 80) }, createdAt: { timestampValue: new Date().toISOString() },
        });
      }
    }
    return true;
  } catch { return false; /* push delivery never changes the source transaction */ }
}
async function processPendingNotificationOutbox(env: Env) {
  try {
    const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notificationOutbox' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }], limit: 100 } }) }) as any[] || [];
    for (const row of rows) {
      const fields = row.document?.fields || {};
      if (fields.status?.stringValue === 'pending' && fields.notificationId) await processNotificationOutbox(env, fields);
    }
  } catch { /* next cron retries pending records */ }
}
async function retryDueNotificationDeliveries(env: Env) {
  try {
    const now = new Date().toISOString();
    const rows = notificationDeliveryQueryOverride || await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'notificationDeliveries' }], where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'retryable' } } },
        { fieldFilter: { field: { fieldPath: 'nextAttemptAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: now } } },
      ] } }, limit: 100,
    } }) }) as any[] || [];
    for (const row of rows) {
      const delivery = decode(row.document || row), attempts = Number(delivery.attempts || 1);
      if (attempts >= 5) { await patchDoc(env, String(row.document?.name || '').split('/documents/')[1], { status: { stringValue: 'permanent' } }); continue; }
      const inbox = await getRawDoc(env, 'notifications', delivery.notificationId);
      if (!inbox) continue;
      const tokenDoc = await getRawDoc(env, 'deviceTokens', delivery.tokenHash);
      const owner = await getDoc(env, 'notificationTokenOwners', delivery.tokenHash);
      const installation = tokenDoc?.data?.installationId && await getDoc(env, 'notificationInstallations', await hashedId(String(tokenDoc.data.installationId)));
      if (!tokenDoc?.data?.token || owner?.uid !== delivery.uid || owner?.active !== true || installation?.uid !== delivery.uid || installation?.tokenId !== delivery.tokenHash) continue;
      const action = inbox.data.action && typeof inbox.data.action === 'object' ? inbox.data.action : {};
      const push = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ to: tokenDoc.data.token, title: String(inbox.data.titleEn || ''), body: String(inbox.data.bodyEn || ''), data: { notificationId: delivery.notificationId, action: String(action.type || 'profile'), subjectId: String(action.subjectId || '') } }]) });
      const ticket = (await push.json().catch(() => ({})) as any)?.data?.[0] || {}, nextAt = new Date(Date.now() + Math.min(3600000, 60000 * (2 ** attempts))).toISOString();
      const fields = { status: { stringValue: ticket.status === 'ok' ? 'ticketed' : 'retryable' }, ticketId: { stringValue: String(ticket.id || '') }, receiptPending: { booleanValue: ticket.status === 'ok' }, attempts: { integerValue: String(attempts + 1) }, nextAttemptAt: { timestampValue: nextAt }, updatedAt: { timestampValue: new Date().toISOString() } };
      try { await compareAndSwap(env, String(row.document?.name || '').split('/documents/')[1], row.document.updateTime, fields); } catch { continue; }
    }
  } catch { /* next cron retries */ }
}
async function pollNotificationReceipts(env: Env) {
  try {
    const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'notificationDeliveries' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'ticketed' } } },
        { fieldFilter: { field: { fieldPath: 'receiptPending' }, op: 'EQUAL', value: { booleanValue: true } } },
      ] } },
      limit: 100,
    } }) }) as any[] || [];
    const ids = rows.map(row => decode(row.document || row).ticketId).filter((id: string) => id);
    if (!ids.length) return;
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    const data = await response.json().catch(() => ({})) as any;
    const receipts = data?.data || {};
    for (const row of rows) {
      const value = decode(row.document || row), receipt = receipts[value.ticketId];
      if (!receipt) continue;
      const error = String(receipt.details?.error || '');
      const status = receipt.status === 'ok' ? 'success' : error === 'DeviceNotRegistered' ? 'permanent' : 'retryable';
      await patchDoc(env, String(row.document?.name || '').split('/documents/')[1], {
        status: { stringValue: status }, ticketId: { stringValue: status === 'success' ? '' : value.ticketId }, receiptPending: { booleanValue: false }, errorCode: { stringValue: error.slice(0, 80) }, receiptAt: { timestampValue: new Date().toISOString() },
      });
      if (error === 'DeviceNotRegistered' && value.tokenHash) await patchDoc(env, `deviceTokens/${value.tokenHash}`, { active: { booleanValue: false }, revokedAt: { timestampValue: new Date().toISOString() } });
    }
  } catch { /* maintenance is retried by the next scheduled invocation */ }
}
function amount(r: any, e: any): number { return quoteForRequest(r, e, String(r?.id || 'request')).amount; }
function paymentPricing(env: Env) {
  return pricingConfig(
    env.PAYMENT_PLATFORM_FEE_RATE === undefined ? 0.10 : Number(env.PAYMENT_PLATFORM_FEE_RATE),
    env.PAYMENT_VAT_RATE === undefined ? 0.15 : Number(env.PAYMENT_VAT_RATE),
  );
}
async function paymentQuote(env: Env, r: any, e: any, requestId: string) {
  const baseAmount = Number(r?.finalAmount ?? r?.amount);
  const calculatedAt = new Date().toISOString();
  const snapshot = r?.finalCommercialSnapshot
    ? r.finalCommercialSnapshot as CommercialSnapshot
    : r?.commercialSnapshot
      ? recalculateLockedCommercial(env, r.commercialSnapshot, baseAmount, calculatedAt)
      : legacyRecordCommercialSnapshot(env, r, e, baseAmount, calculatedAt);
  return quoteFromCommercial(snapshot, requestId);
}
async function commercialCatalog(env: Env): Promise<CommercialCatalog> {
  const stored = await getDoc(env, 'commercialSettings', 'catalog');
  if (stored === null || stored === undefined) return buildLegacyCatalog(paymentPricing(env).platformFeeRate);
  if (!Number.isSafeInteger(stored.revision) || !Array.isArray(stored.rules)) err('Commercial configuration unavailable');
  return stored as CommercialCatalog;
}
function commercialContext(r: any, e: any) {
  const currency = String(e?.nativeCurrency || e?.currency || r?.nativeCurrency || r?.currency || 'SAR').toUpperCase();
  const countryCode = String(e?.countryCode || r?.countryCode || ({ SAR: 'SA', AED: 'AE', KWD: 'KW', QAR: 'QA', BHD: 'BH', OMR: 'OM' } as Record<string, string>)[currency] || '').toUpperCase();
  // `other` is the canonical bucket for pre-category legacy listings.
  const categoryId = String(e?.category || r?.categoryId || 'other');
  const providerUid = String(e?.ownerUid || r?.providerUid || '');
  return { currency, countryCode, categoryId, providerUid };
}
type LockedCommercialSnapshot = CommercialSnapshot & {
  ruleEffectiveFrom?: string;
  ruleEffectiveTo?: string | null;
  ruleCreatedAt?: string;
  ruleCreatedBy?: string;
  ruleUpdatedAt?: string;
  ruleUpdatedBy?: string;
  ruleNotes?: string;
};
function configuredVatRateBps(env: Env): number {
  const rate = paymentPricing(env).vatRate;
  const bps = Math.round(rate * 10_000);
  if (Math.abs(rate * 10_000 - bps) > Number.EPSILON * 10_000) err('VAT rate must be representable in basis points');
  return bps;
}
function taxMinor(env: Env, baseAmountMinor: number, currency: string): { amount?: number; rateBps?: number | null; reference?: string } {
  if (currency !== 'SAR') return {};
  const bps = configuredVatRateBps(env);
  return { amount: Number((BigInt(baseAmountMinor) * BigInt(bps) + 5_000n) / 10_000n), reference: 'legacy-sar-vat-policy' };
}
async function authoritativeCommercialSnapshot(env: Env, r: any, e: any, baseAmount: number, calculatedAt = new Date().toISOString()): Promise<CommercialSnapshot> {
  const context = commercialContext(r, e);
  const baseAmountMinor = majorToMinor(baseAmount, context.currency);
  const catalog = await commercialCatalog(env);
  const rule = resolveRule(catalog, { ...context, at: calculatedAt });
  const tax = taxMinor(env, baseAmountMinor, context.currency);
  const snapshot = calculateCommercial(rule, {
    ...context, baseAmountMinor, calculatedAt,
    ...(tax.amount === undefined ? {} : { taxAmountMinor: tax.amount, taxReference: tax.reference }),
  });
  return Object.assign(snapshot, {
    taxRateBps: tax.amount === undefined ? null : configuredVatRateBps(env),
    ruleEffectiveFrom: rule.effectiveFrom, ruleEffectiveTo: rule.effectiveTo,
    ruleCreatedAt: rule.createdAt, ruleCreatedBy: rule.createdBy,
    ruleUpdatedAt: rule.updatedAt, ruleUpdatedBy: rule.updatedBy, ruleNotes: rule.notes,
  }) as LockedCommercialSnapshot;
}
function lockedRule(snapshot: LockedCommercialSnapshot): CommissionRule {
  const legacy = snapshot.ruleVersion.startsWith('legacy-');
  if (!legacy && (!snapshot.ruleEffectiveFrom || !snapshot.ruleCreatedAt || !snapshot.ruleCreatedBy || !snapshot.ruleUpdatedAt || !snapshot.ruleUpdatedBy)) {
    err('Locked commercial rule metadata unavailable');
  }
  return {
    version: snapshot.ruleVersion, status: snapshot.ruleStatus,
    effectiveFrom: snapshot.ruleEffectiveFrom || '1970-01-01T00:00:00.000Z',
    effectiveTo: snapshot.ruleEffectiveTo ?? null,
    createdAt: snapshot.ruleCreatedAt || '1970-01-01T00:00:00.000Z', createdBy: snapshot.ruleCreatedBy || 'legacy',
    updatedAt: snapshot.ruleUpdatedAt || '1970-01-01T00:00:00.000Z', updatedBy: snapshot.ruleUpdatedBy || 'legacy',
    notes: snapshot.ruleNotes || '',
    mode: snapshot.mode, percentageBps: snapshot.percentageBps,
    fixedAmountMinor: snapshot.fixedAmountMinor, minimumFeeMinor: snapshot.minimumFeeMinor,
    maximumFeeMinor: snapshot.maximumFeeMinor, payer: snapshot.payer,
    customerShareBps: snapshot.customerShareBps, scope: snapshot.scope, currency: snapshot.currency,
  };
}
function recalculateLockedCommercial(env: Env, snapshot: CommercialSnapshot, baseAmount: number, calculatedAt: string): CommercialSnapshot {
  const baseAmountMinor = majorToMinor(baseAmount, snapshot.currency);
  const locked = snapshot as LockedCommercialSnapshot;
  const taxRateBps = locked.taxRateBps;
  if (locked.currency === 'SAR' && !Number.isSafeInteger(taxRateBps)) err('Locked VAT policy unavailable');
  const taxAmountMinor = taxRateBps === null || taxRateBps === undefined ? undefined
    : Number((BigInt(baseAmountMinor) * BigInt(taxRateBps) + 5_000n) / 10_000n);
  const result = calculateCommercial(lockedRule(locked), {
    baseAmountMinor, countryCode: snapshot.countryCode, categoryId: snapshot.categoryId,
    providerUid: snapshot.providerUid, currency: snapshot.currency, calculatedAt,
    ...(taxAmountMinor === undefined ? {} : { taxAmountMinor, taxReference: snapshot.taxReference }),
  });
  return Object.assign(result, {
    taxRateBps: taxRateBps ?? null,
    ruleEffectiveFrom: locked.ruleEffectiveFrom, ruleEffectiveTo: locked.ruleEffectiveTo ?? null,
    ruleCreatedAt: locked.ruleCreatedAt, ruleCreatedBy: locked.ruleCreatedBy,
    ruleUpdatedAt: locked.ruleUpdatedAt, ruleUpdatedBy: locked.ruleUpdatedBy, ruleNotes: locked.ruleNotes,
  });
}
function legacyRecordCommercialSnapshot(env: Env, r: any, e: any, baseAmount: number, calculatedAt: string): LockedCommercialSnapshot {
  const context = commercialContext(r, e);
  const baseAmountMinor = majorToMinor(baseAmount, context.currency);
  const storedBase = Number(r.finalAmount ?? r.amount);
  let storedFee = Number(r.finalPlatformFee ?? r.platformFee);
  if (!Number.isFinite(storedBase) || storedBase <= 0) err('Legacy commercial values unavailable');
  const hasStoredFee = Number.isFinite(storedFee) && storedFee >= 0 &&
    !(r.requestMode === 'open_ended' && r.finalAmount === undefined && storedFee === 0);
  if (!hasStoredFee) storedFee = Math.round(storedBase * paymentPricing(env).platformFeeRate * 100) / 100;
  const sourceBaseMinor = majorToMinor(storedBase, context.currency);
  const sourceFeeMinor = majorToMinor(storedFee, context.currency);
  const platformFeeMinor = baseAmountMinor === sourceBaseMinor ? sourceFeeMinor
    : Number((BigInt(sourceFeeMinor) * BigInt(baseAmountMinor) + BigInt(sourceBaseMinor) / 2n) / BigInt(sourceBaseMinor));
  const providerReceivableMinor = baseAmountMinor - platformFeeMinor;
  if (providerReceivableMinor < 0) err('Invalid legacy commercial values');
  const tax = taxMinor(env, baseAmountMinor, context.currency);
  const taxAmountMinor = tax.amount ?? null;
  return {
    ruleVersion: hasStoredFee ? 'legacy-record-values' : 'legacy-commission-v1', ruleStatus: hasStoredFee ? 'retired' : 'active', mode: hasStoredFee ? 'fixed' : 'percentage',
    percentageBps: hasStoredFee ? 0 : Math.round(paymentPricing(env).platformFeeRate * 10_000), fixedAmountMinor: hasStoredFee ? sourceFeeMinor : 0, minimumFeeMinor: 0, maximumFeeMinor: null,
    payer: 'provider', customerShareBps: 0, scope: { countryCode: null, categoryId: null, providerUid: null },
    baseAmountMinor, platformFeeMinor, customerFeeMinor: 0, providerFeeMinor: platformFeeMinor,
    providerReceivableMinor, customerPayableMinor: baseAmountMinor + (taxAmountMinor ?? 0),
    taxAmountMinor, gatewayFeeMinor: null, currency: context.currency, countryCode: context.countryCode,
    categoryId: context.categoryId, providerUid: context.providerUid, calculatedAt,
    ...(tax.reference ? { taxReference: tax.reference } : {}),
    taxRateBps: tax.amount === undefined ? null : configuredVatRateBps(env),
    ruleEffectiveFrom: '1970-01-01T00:00:00.000Z', ruleEffectiveTo: null,
    ruleCreatedAt: '1970-01-01T00:00:00.000Z', ruleCreatedBy: 'legacy',
    ruleUpdatedAt: '1970-01-01T00:00:00.000Z', ruleUpdatedBy: 'legacy', ruleNotes: '',
  };
}
function assertSarSettlement(r: any, e: any) {
  const currency = String(e?.nativeCurrency || r?.nativeCurrency || r?.currency || 'SAR').toUpperCase();
  if (currency !== 'SAR') err('FOREIGN_SETTLEMENT_DISABLED');
}
function owned(u: User, r: any) { return !!r && (u.admin || r.customerUid === u.uid || r.renterUid === u.uid); }
async function enforceOperationalAccess(env: Env, u: User, equipment?: any) {
  if (!u.admin) {
    const profile = await getDoc(env, 'users', u.uid);
    if (profile?.accountStatus === 'deletion_requested') err('ACCOUNT_DELETION_REQUESTED');
    if (profile?.suspensionStatus === 'temporarily_suspended' || profile?.suspensionStatus === 'permanently_suspended') err('ACCOUNT_SUSPENDED');
  }
  // Existing rentals remain operational after a listing is hidden or sent
  // back for review. Public-rentability is enforced at request creation.
  void equipment;
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
  if (item.status === 'pending' && item.expiresAt && Date.parse(item.expiresAt) <= Date.now()) {
    const now = new Date().toISOString();
    await commitWrites(env, [await notificationWrite(fullName.bind(null, env), u.uid, 'verification_expired', now, attemptId)]);
    return out(env, req, { success: true, attempt: safeAttempt(attemptId, { ...item, status: 'expired' }) });
  }
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
    await notificationWrite(fullName.bind(null, env), result.uid, result.status === 'verified' ? 'verification_completed' : 'verification_rejected', now, attemptId),
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
    await notificationWrite(fullName.bind(null, env), u.uid, officialProvider ? 'verification_pending' : 'manual_review_required', nowIso, attemptId),
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
  if (outcome !== 'allow') {
    if (outcome === 'require_verification') {
      await commitWrites(env, [await notificationWrite(fullName.bind(null, env), customerUid, 'verification_required', new Date().toISOString(), String(request?.id || 'request'))]);
    }
    err(`TRUST_${outcome.toUpperCase()}`);
  }
}
async function enforceTrustForPayment(env: Env, u: User, request: any, equipment: any) {
  return enforceTrustForCustomerAction(env, u.uid, request, equipment);
}
function requestDto(id: string, value: any) {
  return { id, publicRequestNumber: value.publicRequestNumber ?? null, equipmentId: value.equipmentId, customerUid: value.customerUid, providerUid: value.providerUid, status: value.status, requestMode: value.requestMode, numberOfDays: value.numberOfDays ?? null, startDate: value.startDate ?? null, endDate: value.endDate ?? null, amount: value.amount, platformFee: value.platformFee, providerAmount: value.providerAmount, paymentStatus: value.paymentStatus, paymentState: value.paymentState ?? null, currency: value.currency, allowChat: value.allowChat === true, commercialSnapshot: value.commercialSnapshot ?? null, commercialSnapshotStatus: value.commercialSnapshotStatus ?? null, finalCommercialSnapshot: value.finalCommercialSnapshot ?? null, createdAt: value.createdAt, updatedAt: value.updatedAt };
}
function rentalDates(from: string, until: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${until}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 364 * 86400000) return [];
  const dates: string[] = [];
  for (let t = start; t <= end; t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}
function reservationPath(equipmentId: string, date: string) {
  return `equipmentReservations/${encodeURIComponent(`${equipmentId}:${date}`)}`;
}
async function createRequest(req: Request, env: Env, u: User) {
  const body: any = await req.json().catch(() => ({}));
  // A supplied public number is intentionally ignored for legacy-client
  // compatibility; the Worker transaction always allocates the real value.
  const allowedRequestFields = new Set(['equipmentId', 'requestMode', 'numberOfDays', 'startDate', 'endDate', 'publicRequestNumber']);
  if (Object.keys(body).some(key => !allowedRequestFields.has(key))) return out(env, req, { success: false, error: 'Invalid request' }, 400);
  const equipmentId = String(body.equipmentId || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(equipmentId)) return out(env, req, { success: false, error: 'Invalid request' }, 400);
  const equipment = await getDoc(env, 'equipment', equipmentId);
  if (!equipment || equipment.ownerUid === u.uid || !isPublicRentableListing(equipment)) return out(env, req, { success: false, error: 'Listing unavailable' }, 409);
  await enforceOperationalAccess(env, u, equipment);
  try { await enforceEmailVerified(env, u, 'rental'); } catch (error) { if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403); throw error; }
  const mode = body.requestMode === 'open_ended' ? 'open_ended' : 'fixed_days';
  const days = Number(body.numberOfDays || 0), amount = mode === 'fixed_days' ? Number(equipment.pricePerDay) * days : Number(equipment.pricePerDay);
  const fallbackStart = new Date().toISOString().slice(0, 10), fallbackEnd = new Date(Date.now() + Math.max(0, days - 1) * 86400000).toISOString().slice(0, 10);
  const requestedRange = { from: String(body.startDate || fallbackStart), until: body.endDate === undefined ? fallbackEnd : String(body.endDate) };
  const dateCheck = validateDateRange(requestedRange);
  if (!dateCheck.ok || !requestedRange.until || (mode === 'fixed_days' && Math.round((Date.parse(`${requestedRange.until}T00:00:00Z`) - Date.parse(`${requestedRange.from}T00:00:00Z`)) / 86400000) + 1 !== days)) return out(env, req, { success: false, error: 'Invalid rental dates' }, 400);
  const availabilityCheckResult = availabilityAllows(equipment.availability || { from: requestedRange.from }, requestedRange);
  if (!availabilityCheckResult.ok) return out(env, req, { success: false, error: availabilityCheckResult.error }, 409);
  const existingRequests = firestoreOverride ? [] : await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'equipmentRequests' }], where: { fieldFilter: { field: { fieldPath: 'equipmentId' }, op: 'EQUAL', value: { stringValue: equipmentId } } }, limit: 100 } }) }) as any[] || [];
  const overlap = existingRequests.map(row => decode(row.document || row)).some(existing => hasActiveRental([existing]) && existing.startDate && String(existing.startDate) <= String(requestedRange.until || '9999-12-31') && String(requestedRange.from) <= String(existing.endDate || '9999-12-31'));
  if (overlap) return out(env, req, { success: false, error: 'An active request or rental overlaps this period.', errorCode: 'ACTIVE_RENTAL_OVERLAP', details: { ar: 'يوجد طلب أو تأجير نشط يتعارض مع الفترة المحددة. اختر فترة أخرى.', en: 'An active request or rental overlaps this period. Choose different dates.' } }, 409);
  if (!Number.isFinite(amount) || amount <= 0 || (mode === 'fixed_days' && (!Number.isInteger(days) || days < 1 || days > 365))) return out(env, req, { success: false, error: 'Invalid request amount' }, 400);
  const id = `r_${crypto.randomUUID().replace(/-/g, '')}`, now = new Date().toISOString();
  let commercialSnapshot: CommercialSnapshot;
  try {
    commercialSnapshot = await authoritativeCommercialSnapshot(env, { providerUid: equipment.ownerUid }, equipment, amount, now);
  } catch (error) {
    if (isQuotaError(error)) throw error;
    return out(env, req, { success: false, error: 'Commercial configuration unavailable' }, 503);
  }
  const initialQuote = quoteFromCommercial(commercialSnapshot, id, Date.parse(now));
  const value: any = { equipmentId, customerUid: u.uid, providerUid: equipment.ownerUid, categoryId: String(equipment.category || ''), countryCode: commercialSnapshot.countryCode, status: 'pending', requestMode: mode, ...(mode === 'fixed_days' ? { numberOfDays: days } : {}), startDate: requestedRange.from, endDate: requestedRange.until, availabilitySnapshot: equipment.availability || null, amount, platformFee: Number(minorToMajor(commercialSnapshot.platformFeeMinor, commercialSnapshot.currency)), providerAmount: Number(minorToMajor(commercialSnapshot.providerReceivableMinor, commercialSnapshot.currency)), paymentStatus: 'unpaid', paymentId: '', paidAt: null, currency: commercialSnapshot.currency, nativeCurrency: commercialSnapshot.currency, nativeAmount: amount, commercialSnapshot, commercialSnapshotStatus: mode === 'fixed_days' ? 'finalized' : 'estimated', allowChat: false, createdAt: now, updatedAt: now };
  const publicRequestNumber = await createWithPublicIdentifier(
    env, 'request', `equipmentRequests/${id}`, value,
    [await notificationWrite(fullName.bind(null, env), String(equipment.ownerUid), 'rental_request_created', now, id, `${id}:created`)],
  );
  return out(env, req, { success: true, request: requestDto(id, { ...value, publicRequestNumber }), quote: initialQuote, commercialSnapshot }, 201);
}
async function transitionRequest(req: Request, env: Env, u: User, requestId: string) {
  const body: any = await req.json().catch(() => ({})), action = body.action;
  if (!['accept', 'reject', 'cancel', 'request_completion', 'start', 'complete'].includes(action) || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return out(env, req, { success: false, error: 'Invalid transition' }, 400);
  const raw = await getRawDoc(env, 'equipmentRequests', requestId), r = raw?.data;
  if (!raw?.updateTime || !r) return out(env, req, { success: false, error: 'Not found' }, 404);
  await enforceOperationalAccess(env, u, await getDoc(env, 'equipment', r.equipmentId));
  const [customerAccount, providerAccount] = await Promise.all([getDoc(env, 'users', r.customerUid), getDoc(env, 'users', r.providerUid)]);
  const blocked = (account: any) => account?.suspensionStatus === 'temporarily_suspended' || account?.suspensionStatus === 'permanently_suspended' || account?.accountStatus === 'restricted' || account?.accountStatus === 'deletion_requested';
  if (blocked(customerAccount) || blocked(providerAccount)) return out(env, req, { success: false, error: 'ACCOUNT_SUSPENDED' }, 403);
  const provider = r.providerUid === u.uid || u.admin, customer = r.customerUid === u.uid;
  const allowed = action === 'cancel' ? customer : action === 'accept' || action === 'reject' || action === 'start' ? provider : action === 'request_completion' ? provider : action === 'complete' ? customer : false;
  if (!allowed) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  const transitions: Record<string, [string, string[]]> = { accept: ['accepted', ['pending']], reject: ['rejected', ['pending']], cancel: ['cancelled', ['pending', 'accepted']], request_completion: ['completion_requested', ['in_progress']], start: ['in_progress', ['accepted']], complete: ['completed', ['completion_requested']] };
  const [next, prior] = transitions[action];
  if (!prior.includes(String(r.status))) return out(env, req, { success: false, error: 'Invalid request state' }, 409);
  if (action === 'accept' || action === 'start') await enforceTrustForCustomerAction(env, String(r.customerUid), r, await getDoc(env, 'equipment', r.equipmentId));
  const now = new Date().toISOString(), updates: any = { status: { stringValue: next }, updatedAt: { timestampValue: now } };
  if (next === 'accepted') {
    updates.allowChat = { booleanValue: true };
    if (!r.commercialSnapshot) {
      try {
        const equipment = await getDoc(env, 'equipment', r.equipmentId);
        const snapshot = legacyRecordCommercialSnapshot(env, r, equipment, Number(r.amount), now);
        updates.commercialSnapshot = firestoreValue(snapshot);
        updates.commercialSnapshotStatus = { stringValue: r.requestMode === 'open_ended' ? 'estimated' : 'finalized' };
      } catch { return out(env, req, { success: false, error: 'Invalid request accounting' }, 409); }
    }
  }
  if (next === 'in_progress') updates.startedAt = { timestampValue: now };
  if (next === 'completed') {
    const started = Date.parse(String(r.startedAt || '')), daily = Number(r.amount);
    if (!Number.isFinite(started) || !Number.isFinite(daily) || daily <= 0) return out(env, req, { success: false, error: 'Invalid request accounting' }, 409);
    const days = r.requestMode === 'open_ended' ? Math.max(1, Math.ceil((Date.now() - started) / 86400000)) : Number(r.numberOfDays || 1);
    const finalAmount = r.requestMode === 'open_ended' ? daily * days : Number(r.finalAmount ?? r.amount);
    let finalCommercial: CommercialSnapshot;
    try {
      finalCommercial = r.commercialSnapshot
        ? recalculateLockedCommercial(env, r.commercialSnapshot, finalAmount, now)
        : legacyRecordCommercialSnapshot(env, r, await getDoc(env, 'equipment', r.equipmentId), finalAmount, now);
    } catch { return out(env, req, { success: false, error: 'Invalid request accounting' }, 409); }
    const fee = Number(minorToMajor(finalCommercial.platformFeeMinor, finalCommercial.currency));
    const providerAmount = Number(minorToMajor(finalCommercial.providerReceivableMinor, finalCommercial.currency));
    updates.endedAt = { timestampValue: now }; updates.endDate = { timestampValue: now }; updates.allowChat = { booleanValue: false };
    updates.finalAmount = { doubleValue: finalAmount }; updates.finalPlatformFee = { doubleValue: fee }; updates.finalProviderAmount = { doubleValue: providerAmount };
    updates.finalCommercialSnapshot = firestoreValue(finalCommercial); updates.commercialSnapshotStatus = { stringValue: 'finalized' };
  }
  const reservationDates = (r.startDate && r.endDate) ? rentalDates(String(r.startDate), String(r.endDate)) : [];
  if (next === 'accepted' && reservationDates.length === 0) return out(env, req, { success: false, error: 'Invalid rental dates' }, 409);
  const reservationWrites: any[] = next === 'accepted'
    ? reservationDates.map((date) => ({ update: { name: fullName(env, reservationPath(String(r.equipmentId), date)), fields: { equipmentId: { stringValue: String(r.equipmentId) }, requestId: { stringValue: requestId }, date: { stringValue: date }, status: { stringValue: 'active' }, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } }))
    : (action === 'cancel' || action === 'reject') && reservationDates.length
      ? (await Promise.all(reservationDates.map(async (date) => {
        const reservation = await getRawDoc(env, 'equipmentReservations', `${r.equipmentId}:${date}`);
        return reservation?.data?.requestId === requestId && reservation.updateTime
          ? { delete: fullName(env, reservationPath(String(r.equipmentId), date)), currentDocument: { updateTime: reservation.updateTime } }
          : null;
      }))).filter(Boolean)
      : [];
  try {
    await commitWrites(env, [{ update: { name: fullName(env, `equipmentRequests/${requestId}`), fields: updates }, updateMask: { fieldPaths: Object.keys(updates) }, currentDocument: { updateTime: raw.updateTime } }, ...reservationWrites, await notificationWrite(fullName.bind(null, env), String(action === 'cancel' || action === 'complete' ? r.providerUid : r.customerUid), action === 'accept' ? 'rental_accepted' : action === 'reject' ? 'rental_rejected' : action === 'cancel' ? 'rental_cancelled' : action === 'request_completion' ? 'completion_requested' : action === 'start' ? 'rental_starting' : 'rental_completed', now, requestId, `${requestId}:transition:${action}:${r.updatedAt || r.createdAt}`)]);
  } catch {
    return out(env, req, { success: false, error: next === 'accepted' ? 'BOOKING_CONFLICT' : 'Request changed' }, 409);
  }
  return out(env, req, { success: true, request: requestDto(requestId, { ...r, ...Object.fromEntries(Object.entries(updates).map(([k, v]: any) => [k, v.stringValue ?? v.timestampValue ?? v.booleanValue ?? v.doubleValue ?? (v.mapValue ? decode(v.mapValue) : undefined)])) }) });
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
  try {
    await compareAndSwap(env, `equipmentRequests/${encodeURIComponent(requestId!)}`, raw.updateTime, { status: { stringValue: 'in_progress' }, startedAt: { timestampValue: new Date().toISOString() } });
    await commitWrites(env, [await notificationWrite(fullName.bind(null, env), String(raw.data.customerUid || ''), 'rental_starting', new Date().toISOString(), requestId)]);
    return out(env, req, { success: true, status: 'in_progress' });
  } catch { return out(env, req, { success: false, error: 'Request changed' }, 409); }
}
async function confirmCompletion(req: Request, env: Env, u: User) {
  await enforceOperationalAccess(env, u);
  const { requestId } = await req.json() as { requestId?: string }; const raw = requestId ? await getRawDoc(env, 'equipmentRequests', requestId) : null, r = raw?.data;
  if (!r || r.customerUid !== u.uid || r.status !== 'completion_requested' || !raw?.updateTime) return out(env, req, { success: false, error: 'Invalid request state' }, 409);
  const now = Date.now(), started = Date.parse(r.startedAt || ''), lockedRate = Number(r.amount);
  if (!Number.isFinite(started) || (r.requestMode === 'open_ended' && (!Number.isFinite(lockedRate) || lockedRate <= 0))) return out(env, req, { success: false, error: 'Invalid request state' }, 409);
  const days = r.requestMode === 'open_ended' ? Math.max(1, Math.ceil((now - started) / 86400000)) : Number(r.numberOfDays || 1);
  const subtotal = r.requestMode === 'open_ended' ? lockedRate * days : Number(r.finalAmount ?? r.amount), end = new Date(now).toISOString();
  let finalCommercial: CommercialSnapshot;
  try {
    finalCommercial = r.commercialSnapshot
      ? recalculateLockedCommercial(env, r.commercialSnapshot, subtotal, end)
      : legacyRecordCommercialSnapshot(env, r, await getDoc(env, 'equipment', r.equipmentId), subtotal, end);
  } catch { return out(env, req, { success: false, error: 'Invalid request accounting' }, 409); }
  const fee = Number(minorToMajor(finalCommercial.platformFeeMinor, finalCommercial.currency));
  const providerAmount = Number(minorToMajor(finalCommercial.providerReceivableMinor, finalCommercial.currency));
  const fields: Record<string, any> = { status: { stringValue: 'completed' }, endedAt: { timestampValue: end }, endDate: { timestampValue: end }, allowChat: { booleanValue: false } };
  Object.assign(fields, { finalAmount: { doubleValue: subtotal }, finalPlatformFee: { doubleValue: fee }, finalProviderAmount: { doubleValue: providerAmount }, finalCommercialSnapshot: firestoreValue(finalCommercial), commercialSnapshotStatus: { stringValue: 'finalized' } });
  try {
    await compareAndSwap(env, `equipmentRequests/${encodeURIComponent(requestId!)}`, raw.updateTime, fields);
    await commitWrites(env, [await notificationWrite(fullName.bind(null, env), String(r.providerUid || ''), 'rental_completed', end, requestId)]);
    return out(env, req, { success: true, status: 'completed', finalAmount: subtotal });
  } catch { return out(env, req, { success: false, error: 'Request changed' }, 409); }
}
function quoteFromDoc(d: any): PaymentQuote {
  const subtotal = Number(d?.subtotal);
  const platformFee = Number(d?.platformFee);
  const vatAmount = Number(d?.vatAmount);
  const quote = {
    amount: Number(d?.amount), total: Number(d?.total ?? d?.amount), subtotal,
    platformFee, providerAmount: Number(d?.providerAmount),
    vatAmount, tax: Number(d?.tax ?? d?.vatAmount), currency: String(d?.currency || ''),
    platformFeeRate: Number.isFinite(Number(d?.platformFeeRate)) ? Number(d.platformFeeRate) : 0,
    vatRate: Number.isFinite(Number(d?.vatRate)) ? Number(d.vatRate) : 0,
    policyVersion: String(d?.policyVersion || 'legacy-record-values'),
    quoteId: String(d?.quoteId || ''), expiresAt: String(d?.expiresAt || ''),
    ...(d?.commercialSnapshot ? { commercialSnapshot: d.commercialSnapshot as CommercialSnapshot } : {}),
  };
  if (!quote.quoteId || !Number.isFinite(quote.amount) || quote.amount <= 0 ||
      ![quote.total, subtotal, platformFee, quote.providerAmount, vatAmount, quote.tax].every(Number.isFinite) ||
      Math.abs(quote.total - quote.amount) > 0.0001 || Math.abs(subtotal + (quote.commercialSnapshot?.customerFeeMinor ? Number(minorToMajor(quote.commercialSnapshot.customerFeeMinor, quote.currency)) : 0) + vatAmount - quote.total) > 0.0001) err('Invalid payment quote');
  if (quote.commercialSnapshot) {
    const canonical = quoteFromCommercial(quote.commercialSnapshot, String(d?.requestId || 'stored'), 0);
    if (['amount', 'total', 'subtotal', 'platformFee', 'providerAmount', 'vatAmount'].some(key => Math.abs(Number((quote as any)[key]) - Number((canonical as any)[key])) > 0.0001) ||
        canonical.currency !== quote.currency || canonical.policyVersion !== quote.policyVersion) err('Invalid payment quote');
  }
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
    ...(quote.commercialSnapshot ? { commercialSnapshot: firestoreValue(quote.commercialSnapshot) } : {}),
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

function verifiedStoredCommercial(snapshot: any, currency: string): CommercialSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.currency !== currency) return null;
  const integerFields = [
    'baseAmountMinor', 'platformFeeMinor', 'customerFeeMinor', 'providerFeeMinor',
    'providerReceivableMinor', 'customerPayableMinor',
  ] as const;
  if (integerFields.some(field => !Number.isSafeInteger(snapshot[field]) || snapshot[field] < 0) ||
      snapshot.taxAmountMinor !== null && (!Number.isSafeInteger(snapshot.taxAmountMinor) || snapshot.taxAmountMinor < 0) ||
      snapshot.taxRateBps !== undefined && snapshot.taxRateBps !== null && (!Number.isSafeInteger(snapshot.taxRateBps) || snapshot.taxRateBps < 0 || snapshot.taxRateBps >= 10_000) ||
      snapshot.gatewayFeeMinor !== null && (!Number.isSafeInteger(snapshot.gatewayFeeMinor) || snapshot.gatewayFeeMinor < 0) ||
      snapshot.customerFeeMinor + snapshot.providerFeeMinor !== snapshot.platformFeeMinor ||
      snapshot.providerReceivableMinor !== snapshot.baseAmountMinor - snapshot.providerFeeMinor ||
      snapshot.customerPayableMinor !== snapshot.baseAmountMinor + snapshot.customerFeeMinor + (snapshot.taxAmountMinor ?? 0)) return null;
  return snapshot as CommercialSnapshot;
}
function sameStoredCommercial(left: any, right: any): boolean {
  const fields = [
    'ruleVersion', 'ruleStatus', 'mode', 'percentageBps', 'fixedAmountMinor', 'minimumFeeMinor',
    'maximumFeeMinor', 'payer', 'customerShareBps', 'baseAmountMinor', 'platformFeeMinor',
    'customerFeeMinor', 'providerFeeMinor', 'providerReceivableMinor', 'customerPayableMinor',
    'taxAmountMinor', 'gatewayFeeMinor', 'currency', 'countryCode', 'categoryId', 'providerUid',
    'calculatedAt', 'taxReference', 'taxRateBps', 'ruleEffectiveFrom', 'ruleEffectiveTo',
    'ruleCreatedAt', 'ruleCreatedBy', 'ruleUpdatedAt', 'ruleUpdatedBy', 'ruleNotes',
  ];
  return !!left && !!right && fields.every(field => left[field] === right[field]) &&
    left.scope?.countryCode === right.scope?.countryCode &&
    left.scope?.categoryId === right.scope?.categoryId &&
    left.scope?.providerUid === right.scope?.providerUid;
}

async function trustedInvoiceSource(env: Env, invoiceId: string): Promise<TrustedInvoiceSource | null> {
  const invoice = await getDoc(env, 'invoices', invoiceId);
  const requestId = typeof invoice?.requestId === 'string' ? invoice.requestId : '';
  if (!invoice || !requestId) return null;
  const [rental, payment] = await Promise.all([
    getDoc(env, 'equipmentRequests', requestId),
    getDoc(env, 'payments', requestId),
  ]);
  const settledState = (value: unknown) => ['paid', 'refunded', 'partially_refunded'].includes(String(value));
  const equivalentAmount = (left: number, right: number) => Math.abs(left - right) < 0.005;
  const invoiceNumber = String(invoice.invoiceNumber || '');
  const subtotal = Number(invoice.subtotal);
  const vatAmount = Number(invoice.vatAmount);
  const total = Number(invoice.totalAmount);
  const paymentAmount = Number(payment?.amount);
  const rentalSubtotal = Number(rental?.finalAmount ?? rental?.amount);
  const commercial = verifiedStoredCommercial(invoice.commercialSnapshot, String(invoice.currency));
  const customerFee = commercial ? Number(minorToMajor(commercial.customerFeeMinor, String(invoice.currency))) : 0;
  const providerReceivable = commercial ? Number(minorToMajor(commercial.providerReceivableMinor, String(invoice.currency))) : undefined;
  const gatewayFee = commercial?.gatewayFeeMinor === null || !commercial ? undefined : Number(minorToMajor(commercial.gatewayFeeMinor, String(invoice.currency)));
  const invoicePlatformFee = Number(invoice.platformFee);
  const invoiceProviderAmount = Number(invoice.providerAmount);
  const commercialRecordsAgree = !invoice.commercialSnapshot || !!commercial &&
    sameStoredCommercial(commercial, payment?.commercialSnapshot) &&
    sameStoredCommercial(commercial, rental?.paidCommercialSnapshot) &&
    equivalentAmount(subtotal, Number(minorToMajor(commercial.baseAmountMinor, commercial.currency))) &&
    equivalentAmount(invoicePlatformFee, Number(minorToMajor(commercial.platformFeeMinor, commercial.currency))) &&
    equivalentAmount(invoiceProviderAmount, Number(minorToMajor(commercial.providerReceivableMinor, commercial.currency))) &&
    equivalentAmount(vatAmount, Number(minorToMajor(commercial.taxAmountMinor ?? 0, commercial.currency))) &&
    equivalentAmount(total, Number(minorToMajor(commercial.customerPayableMinor, commercial.currency)));
  const paymentReference = typeof payment?.providerReference === 'string' ? payment.providerReference : '';
  if (!rental || !payment ||
      invoiceNumber !== invoiceId || !settledState(invoice.status) ||
      rental.customerUid !== invoice.customerId || rental.providerUid !== invoice.providerId ||
      rental.equipmentId !== invoice.equipmentId || rental.paymentStatus !== 'paid' ||
      rental.paymentState !== 'paid' || rental.invoiceId !== invoiceId || rental.currency !== 'SAR' ||
      payment.requestId !== requestId || !settledState(payment.state) || payment.invoiceId !== invoiceId ||
      payment.customerUid !== rental.customerUid || payment.currency !== 'SAR' ||
      !paymentReference || invoice.paymentReference !== paymentReference || rental.paymentId !== paymentReference ||
      ![subtotal, vatAmount, customerFee, total, paymentAmount, rentalSubtotal].every(Number.isFinite) ||
      subtotal < 0 || vatAmount < 0 || total <= 0 ||
      !equivalentAmount(subtotal + customerFee + vatAmount, total) ||
      !equivalentAmount(paymentAmount, total) || !equivalentAmount(rentalSubtotal, subtotal) ||
      !commercialRecordsAgree) {
    return null;
  }
  const publicRequestNumber = rental.publicRequestNumber;
  if (typeof publicRequestNumber !== 'string' || !/^HV-REQ-[0-9]{6,12}$/.test(publicRequestNumber)) return null;
  const equipment = await getDoc(env, 'equipment', String(rental.equipmentId));
  const customerName = String(invoice.buyerName || '').trim();
  const providerName = String(invoice.sellerName || '').trim();
  if (!customerName || !providerName || invoice.currency !== 'SAR') return null;
  return {
    invoiceNumber,
    requestNumber: publicRequestNumber,
    issueDate: String(invoice.createdAt || invoice.paidAt || ''),
    paymentStatus: String(payment.state),
    paymentProvider: typeof payment.provider === 'string' ? payment.provider : undefined,
    paymentReference: typeof payment.providerReference === 'string' ? payment.providerReference : undefined,
    customer: { uid: String(rental.customerUid), name: customerName },
    provider: { uid: String(rental.providerUid), name: providerName },
    equipmentName: String(equipment?.titleEn || equipment?.titleAr || ''),
    rentalStart: typeof rental.startDate === 'string' ? rental.startDate : undefined,
    rentalEnd: typeof rental.endDate === 'string' ? rental.endDate : undefined,
    subtotal,
    platformFee: Number.isFinite(Number(invoice.platformFee)) ? Number(invoice.platformFee) : undefined,
    customerFee: commercial ? customerFee : undefined,
    providerReceivable,
    gatewayFee,
    commissionConfigVersion: commercial?.ruleVersion,
    vatAmount: Number.isFinite(Number(invoice.vatAmount)) ? Number(invoice.vatAmount) : undefined,
    total,
    currency: 'SAR',
  };
}

async function selfServiceInvoicePdf(req: Request, env: Env, u: User, invoiceId: string) {
  let authorizedParticipants: { customerUid: string; providerUid: string } | undefined;
  const service = createInvoicePdfService({
    authorizeInvoice: async (actor, requestedInvoiceId) => {
      const source = await trustedInvoiceSource(env, requestedInvoiceId);
      // This route is intentionally participant-only. Admin PDF authorization
      // belongs to the separate finance-scoped admin route.
      if (!source || (actor.uid !== source.customer.uid && actor.uid !== source.provider.uid)) {
        throw new Error('Invoice not found');
      }
      authorizedParticipants = { customerUid: source.customer.uid, providerUid: source.provider.uid };
    },
    readInvoice: async invoice => {
      const source = await trustedInvoiceSource(env, invoice);
      // Fence the second read against a concurrent relationship mutation. The
      // PDF service intentionally authorizes before reading the printable data.
      if (!source || !authorizedParticipants ||
          source.customer.uid !== authorizedParticipants.customerUid ||
          source.provider.uid !== authorizedParticipants.providerUid) return null;
      return source;
    },
    readBusinessSettings: async (): Promise<InvoiceBusinessSettings | null> => {
      const settings = await getDoc(env, 'heavyarConfig', 'main');
      if (!settings) return null;
      return {
        legalNameArabic: typeof settings.legalBusinessNameAr === 'string' ? settings.legalBusinessNameAr : undefined,
        legalNameEnglish: typeof settings.legalBusinessNameEn === 'string' ? settings.legalBusinessNameEn : undefined,
        commercialRegistrationNumber: typeof settings.commercialRegistrationNumber === 'string' ? settings.commercialRegistrationNumber : undefined,
        vatRegistrationNumber: typeof settings.vatRegistrationNumber === 'string' ? settings.vatRegistrationNumber : undefined,
        supportEmail: typeof settings.supportEmail === 'string' ? settings.supportEmail : undefined,
        supportPhone: typeof settings.supportPhone === 'string' ? settings.supportPhone : undefined,
        businessAddress: typeof settings.businessAddress === 'string' ? settings.businessAddress : undefined,
      };
    },
  });
  try {
    const result = await service.downloadInvoice({ actor: { uid: u.uid }, invoiceId });
    return new Response(result.body as unknown as BodyInit, {
      status: result.status,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...cors(env, req.headers.get('Origin')),
      },
    });
  } catch {
    // Do not let an arbitrary invoice ID disclose whether another account has
    // an invoice or whether its linked payment records are complete.
    return out(env, req, { success: false, error: 'Invoice not found' }, 404);
  }
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
    ...(quote.commercialSnapshot ? { commercialSnapshot: firestoreValue(quote.commercialSnapshot) } : {}),
    status: { stringValue: 'paid' }, createdAt: { timestampValue: now }, paidAt: { timestampValue: now },
    paymentReference: { stringValue: d.id },
  };
  const writes: any[] = [
    { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(requestId)}`), fields: {
      paymentStatus: { stringValue: 'paid' }, paymentState: { stringValue: 'paid' },
      paymentId: { stringValue: d.id }, paidAt: { timestampValue: now }, invoiceId: { stringValue: invoice },
       ...(quote.commercialSnapshot ? { paidCommercialSnapshot: firestoreValue(quote.commercialSnapshot) } : {}),
    } }, updateMask: { fieldPaths: ['paymentStatus', 'paymentState', 'paymentId', 'paidAt', 'invoiceId', ...(quote.commercialSnapshot ? ['paidCommercialSnapshot'] : [])] }, currentDocument: { updateTime: raw.updateTime } },
    { update: { name: fullName(env, `invoices/${encodeURIComponent(invoice)}`), fields: invoiceFields }, currentDocument: { exists: false } },
    payment
      ? { update: { name: fullName(env, `payments/${encodeURIComponent(requestId)}`), fields: {
          state: { stringValue: 'paid' }, invoiceId: { stringValue: invoice }, paidAt: { timestampValue: now },
          providerReference: { stringValue: d.id },
           ...(quote.commercialSnapshot ? { commercialSnapshot: firestoreValue(quote.commercialSnapshot) } : {}),
        } }, updateMask: { fieldPaths: ['state', 'invoiceId', 'paidAt', 'providerReference', ...(quote.commercialSnapshot ? ['commercialSnapshot'] : [])] }, currentDocument: { exists: true } }
      : { update: { name: fullName(env, `payments/${encodeURIComponent(requestId)}`), fields: {
          requestId: { stringValue: requestId }, paymentId: { stringValue: paymentIdForRequest(requestId) },
          provider: { stringValue: 'tap' }, providerReference: { stringValue: d.id }, state: { stringValue: 'paid' },
          quoteId: { stringValue: quote.quoteId }, amount: { doubleValue: quote.amount },
          currency: { stringValue: quote.currency }, customerUid: { stringValue: String(r.customerUid) },
          invoiceId: { stringValue: invoice }, paidAt: { timestampValue: now },
           ...(quote.commercialSnapshot ? { commercialSnapshot: firestoreValue(quote.commercialSnapshot) } : {}),
        } }, currentDocument: { exists: false } },
    eventWrite(env, `${requestId}:payment_confirmed`, requestId, r, 'payment_confirmed', 'paid', now, d.id),
    eventWrite(env, `${requestId}:invoice_created`, requestId, r, 'invoice_created', 'paid', now, d.id),
    ...(await enqueueNotifications(env, fullName.bind(null, env), String(r.customerUid || ''), 'payment_confirmed', requestId, now)),
    ...(await enqueueNotifications(env, fullName.bind(null, env), String(r.providerUid || ''), 'payment_confirmed', requestId, now)),
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
      ...(await enqueueNotifications(env, fullName.bind(null, env), String(r.customerUid || ''), state === 'failed' ? 'payment_failed' : 'payment_pending', requestId, now, `${requestId}:attempt_${attempt}:payment_${state}`)),
  ]);
}
async function create(req: Request, env: Env, u: User) {
  const body = await req.json() as { requestId?: string; amount?: number; purpose?: string };
  if (!body.requestId || Object.keys(body).some(key => !['requestId', 'purpose'].includes(key)) || (body.purpose && body.purpose !== 'equipment_request')) return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  const raw = await getRawDoc(env, 'equipmentRequests', body.requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId);
  try { await enforceOperationalAccess(env, u, e); await enforceTrustForPayment(env, u, r, e); } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const trust = message.startsWith('TRUST_');
    return out(env, req, { success: false, error: trust ? 'Identity verification required' : message === 'ACCOUNT_SUSPENDED' ? 'Account suspended' : 'Listing unavailable', code: trust ? message.replace('TRUST_', '').toLowerCase() : undefined }, 403);
  }
  if (!owned(u, r) || !r?.customerUid || r.customerUid !== u.uid) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  try { assertSarSettlement(r, e); } catch { return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409); }
  if (String(r.requestMode || '').toLowerCase() === 'open_ended' && !(Number.isFinite(Number(r.finalAmount)) && Number(r.finalAmount) > 0)) return out(env, req, { success: false, error: 'Final amount required' }, 409);
  let quote: PaymentQuote;
  const storedQuote = await getDoc(env, 'paymentQuotes', body.requestId);
  try {
    quote = storedQuote?.quoteId ? quoteFromDoc(storedQuote) : await paymentQuote(env, r, e, body.requestId);
  } catch (error) { if (error instanceof Error && error.message === 'FOREIGN_SETTLEMENT_DISABLED') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409); return out(env, req, { success: false, error: 'Invalid payment quote' }, 409); }
  if (quote.currency !== 'SAR') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409);
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
  const tapConfig = await getDoc(env, 'paymentGateways', 'tap'), tapGateway = gatewayRegistry(env).tap;
  if (!tapConfig || tapConfig.enabled !== true || !tapGateway.configured || !tapGateway.adapterAvailable) return out(env, req, { success: false, error: 'Payment gateway unavailable' }, 503);
  if (r.paymentStatus === 'pending_payment' && r.paymentId && !String(r.paymentId).startsWith('reservation:')) {
    const state = String(existingPayment?.state || r.paymentState || 'pending') as PaymentState;
    return out(env, req, { success: true, paymentId: r.paymentId, chargeId: r.paymentId, status: state, canonicalStatus: state, paymentState: state, checkoutUrl: String(existingPayment?.checkoutUrl || ''), paymentUrl: String(existingPayment?.checkoutUrl || ''), amount: expected, currency: quote.currency, quote, provider: 'tap' });
  }
  if (terminalRetry && Date.parse(quote.expiresAt) <= Date.now()) return out(env, req, { success: false, error: 'Payment quote expired' }, 409);
  if (!isReserved && (String(r.status).toLowerCase() !== 'completed' || !['unpaid', ''].includes(String(r.paymentStatus || '').toLowerCase()))) return out(env, req, { success: false, error: 'Invalid payment state' }, 409);
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
          { update: { name: fullName(env, `payments/${encodeURIComponent(body.requestId)}`), fields: { requestId: { stringValue: body.requestId }, paymentId: { stringValue: paymentIdForRequest(body.requestId) }, provider: { stringValue: 'tap' }, state: { stringValue: 'created' }, quoteId: { stringValue: quote.quoteId }, amount: { doubleValue: expected }, currency: { stringValue: 'SAR' }, customerUid: { stringValue: u.uid }, idempotencyKey: { stringValue: idempotencyKey }, attempt: { integerValue: attempt }, ...(quote.commercialSnapshot ? { commercialSnapshot: firestoreValue(quote.commercialSnapshot) } : {}) } }, currentDocument: { exists: false } },
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
  const provider = new TapPaymentProvider(env.TAP_SECRET_KEY_TEST!);
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
  if (Object.keys(body).some(key => !['chargeId', 'paymentId'].includes(key))) return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  if (!chargeId || !env.TAP_SECRET_KEY_TEST) return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  let d; try { d = await new TapPaymentProvider(env.TAP_SECRET_KEY_TEST).retrieve(chargeId); } catch { return out(env, req, { success: false, error: 'Payment unavailable' }, 502); }
  const m = d.metadata || {};
  const raw = await getRawDoc(env, 'equipmentRequests', m.requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId);
  let quote: PaymentQuote; const storedQuote = await getDoc(env, 'paymentQuotes', String(m.requestId));
  try { assertSarSettlement(r, e); quote = storedQuote?.quoteId ? quoteFromDoc(storedQuote) : await paymentQuote(env, r, e, String(m.requestId)); } catch (error) { if (error instanceof Error && error.message === 'FOREIGN_SETTLEMENT_DISABLED') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409); return out(env, req, { success: false, error: 'Invalid payment quote' }, 409); }
  if (quote.currency !== 'SAR') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409);
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
  let quote; try { assertSarSettlement(r, e); quote = storedQuote?.quoteId ? quoteFromDoc(storedQuote) : await paymentQuote(env, r, e, requestId); } catch (error) { if (error instanceof Error && error.message === 'FOREIGN_SETTLEMENT_DISABLED') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409); return out(env, req, { success: false, error: 'Invalid transaction' }, 400); }
  if (quote.currency !== 'SAR') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409);
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
  const { publicId } = await req.json() as { publicId?: string }; if (!publicId || typeof publicId !== 'string' || publicId.length > 512) return out(env, req, { success: false, error: 'Invalid asset', errorCode: 'ASSET_INVALID' }, 400);
  const folder = env.CLOUDINARY_FOLDER || 'heavyar';
  if (!u.admin && !publicId.startsWith(`${folder}/${u.uid}/`)) return out(env, req, { success: false, error: 'Asset ownership could not be verified', errorCode: 'ASSET_NOT_OWNED' }, 403);
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return out(env, req, { success: false, error: 'Asset service unavailable', errorCode: 'ASSET_SERVICE_UNAVAILABLE' }, 503);
  const timestamp = String(Math.floor(Date.now() / 1000)), digest = await crypto.subtle.digest('SHA-1', enc.encode(`public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`));
  const hex = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join(''), form = new FormData();
  form.append('public_id', publicId); form.append('timestamp', timestamp); form.append('api_key', env.CLOUDINARY_API_KEY); form.append('signature', hex);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: 'POST', body: form });
  return out(env, req, { success: r.ok, ...(r.ok ? {} : { errorCode: 'CLOUDINARY_DELETE_FAILED' }) }, r.ok ? 200 : 502);
}
async function cloudinaryUpload(req: Request, env: Env, u: User) {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return out(env, req, { success: false, error: 'Asset service unavailable', errorCode: 'ASSET_SERVICE_UNAVAILABLE' }, 503);
  const declaredLength = Number(req.headers.get('Content-Length') || 0);
  if (!declaredLength || declaredLength > 10 * 1024 * 1024 + 65536) return out(env, req, { success: false, error: 'Upload too large' }, 413);
  const account = await getDoc(env, 'users', u.uid);
  if (!u.admin && (account?.suspensionStatus === 'temporarily_suspended' || account?.suspensionStatus === 'permanently_suspended' || account?.accountStatus === 'restricted')) {
    return out(env, req, { success: false, error: 'ACCOUNT_SUSPENDED' }, 403);
  }
  const roleProfile = account?.role === 'driver' ? await getDoc(env, 'driverProfiles', u.uid) : null;
  if (!u.admin && evaluateCanonicalCompleteness(u, account || null, roleProfile).state !== 'authenticated_complete') {
    return out(env, req, { success: false, error: 'Complete your account setup before uploading media.', errorCode: 'PROFILE_REQUIRED' }, 409);
  }
  const now = Date.now(), windowStart = new Date(Math.floor(now / 60000) * 60000).toISOString(), ratePath = `cloudinaryUploadRates/${encodeURIComponent(u.uid)}`;
  const rate = await getRawDoc(env, 'cloudinaryUploadRates', u.uid);
  const count = rate?.data?.windowStart === windowStart ? Number(rate.data.count || 0) : 0;
  if (count >= 10) return out(env, req, { success: false, error: 'RATE_LIMITED' }, 429);
  const rateFields = { uid: { stringValue: u.uid }, windowStart: { timestampValue: windowStart }, count: { integerValue: String(count + 1) }, updatedAt: { timestampValue: new Date(now).toISOString() } };
  try {
    if (rate?.updateTime) await compareAndSwap(env, ratePath, rate.updateTime, rateFields);
    else await createDoc(env, ratePath, rateFields);
  } catch { return out(env, req, { success: false, error: 'RATE_LIMITED' }, 429); }
  const form: any = await req.formData().catch(() => null), file = form?.get('file');
  if (!(file instanceof Blob)) return out(env, req, { success: false, error: 'File required' }, 400);
  const mime = String(file.type || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime)) return out(env, req, { success: false, error: 'Unsupported image type' }, 415);
  if (file.size > 10 * 1024 * 1024) return out(env, req, { success: false, error: 'Upload too large' }, 413);
  const timestamp = String(Math.floor(now / 1000)), folder = `${env.CLOUDINARY_FOLDER || 'heavyar'}/${u.uid}`;
  const digest = await crypto.subtle.digest('SHA-1', enc.encode(`folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`));
  const signature = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
  const upload = new FormData(); upload.append('file', file); upload.append('folder', folder); upload.append('timestamp', timestamp); upload.append('api_key', env.CLOUDINARY_API_KEY); upload.append('signature', signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: upload });
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.public_id !== 'string' || typeof result.secure_url !== 'string' || !result.public_id.startsWith(`${folder}/`)) return out(env, req, { success: false, error: 'Upload failed' }, 502);
  return out(env, req, { success: true, url: result.secure_url, publicId: result.public_id });
}
export const DEFAULT_AUTH_CONFIG = Object.freeze({
  requirePhoneOnSignup: false,
  allowEmailLogin: true,
  allowPhoneLogin: false,
  requirePhoneVerification: false,
  phoneIndexReady: false,
});
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}
const DEFAULT_RESEND_FROM = 'Heavyar <noreply@mail.heavyar.com>';
const DEFAULT_RESEND_SUPPORT = 'support@mail.heavyar.com';
function emailFrame(primary: string, secondary: string, supportEmail: string): string {
  const support = escapeHtml(supportEmail);
  return `<div style="background:#f3f6f5;padding:24px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:580px;margin:auto;background:#fff;border:1px solid #dfe8e5;border-radius:12px;overflow:hidden"><div style="background:#073f3a;color:#fff;padding:22px 28px"><div style="font-size:28px;font-weight:800;letter-spacing:.4px">HEAVYAR</div><div style="color:#d8b24b;font-size:13px;margin-top:4px">Equipment marketplace</div></div><div style="padding:28px">${primary}<hr style="border:0;border-top:1px solid #e8eeec;margin:24px 0">${secondary}<p style="color:#65736f;font-size:13px;margin-top:28px">الدعم / Support: <a href="mailto:${support}" style="color:#0b6b61">${support}</a></p></div></div></div>`;
}
/** Firebase owns the action code; templates only present the escaped official action URL. */
export function heavyarPasswordResetTemplate(resetUrl: string, supportEmail = DEFAULT_RESEND_SUPPORT, language: 'ar' | 'en' = 'ar'): string {
  const url = escapeHtml(resetUrl);
  const ar = `<div dir="rtl" lang="ar"><p>مرحباً،</p><p>استخدم الزر الآمن أدناه لإعادة تعيين كلمة مرور حسابك في Heavyar.</p><p><a href="${url}" style="background:#0b6b61;color:#fff;padding:12px 20px;border-radius:7px;text-decoration:none;display:inline-block;font-weight:700">إعادة تعيين كلمة المرور</a></p><p>استخدم الرابط قريباً؛ تتحكم Firebase في صلاحيته ومدة انتهائه. لن تطلب Heavyar كلمة مرورك أبداً.</p><p>إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة واترك كلمة مرورك دون تغيير.</p></div>`;
  const en = `<div dir="ltr" lang="en"><p>Hello,</p><p>Use the secure button below to reset your Heavyar account password.</p><p><a href="${url}" style="background:#0b6b61;color:#fff;padding:12px 20px;border-radius:7px;text-decoration:none;display:inline-block;font-weight:700">Reset password</a></p><p>Use the link promptly; Firebase controls its validity and expiry. Heavyar will never ask for your password.</p><p>If you did not request a reset, ignore this email and leave your password unchanged.</p></div>`;
  return emailFrame(language === 'ar' ? ar : en, language === 'ar' ? en : ar, supportEmail);
}
export function heavyarEmailVerificationTemplate(verificationUrl: string, name = '', supportEmail = DEFAULT_RESEND_SUPPORT, language: 'ar' | 'en' = 'ar'): string {
  const url = escapeHtml(verificationUrl), greeting = escapeHtml(name.trim() || (language === 'ar' ? 'مستخدم Heavyar' : 'Heavyar user'));
  const ar = `<div dir="rtl" lang="ar"><p>مرحباً ${greeting}،</p><p>وثّق بريدك الإلكتروني لتأكيد حسابك والاستفادة من خدمات Heavyar.</p><p><a href="${url}" style="background:#0b6b61;color:#fff;padding:12px 20px;border-radius:7px;text-decoration:none;display:inline-block;font-weight:700">توثيق البريد الإلكتروني</a></p><p>استخدم الرابط قريباً؛ تتحكم Firebase في صلاحيته ومدة انتهائه. لن تطلب Heavyar كلمة مرورك أبداً.</p><p>إذا لم تطلب التسجيل في Heavyar، تجاهل هذه الرسالة.</p></div>`;
  const en = `<div dir="ltr" lang="en"><p>Hello ${greeting},</p><p>Verify your email to confirm your account and use Heavyar services.</p><p><a href="${url}" style="background:#0b6b61;color:#fff;padding:12px 20px;border-radius:7px;text-decoration:none;display:inline-block;font-weight:700">Verify email</a></p><p>Use the link promptly; Firebase controls its validity and expiry. Heavyar will never ask for your password.</p><p>If you did not register for Heavyar, ignore this email.</p></div>`;
  return emailFrame(language === 'ar' ? ar : en, language === 'ar' ? en : ar, supportEmail);
}
function resendFrom(env: Env) { return env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM; }
function resendSenderDomainValid(sender: string): boolean {
  const match = sender.match(/@([A-Za-z0-9.-]+)>?\s*$/);
  return match?.[1]?.toLowerCase() === 'mail.heavyar.com';
}
type ResendOutcome = 'accepted' | 'auth_failed' | 'sender_rejected' | 'rate_limited' | 'provider_error' | 'not_configured';
type EmailDeliveryResult = { delivered: boolean; provider: 'resend' | 'firebase' | 'none'; outcome: ResendOutcome | 'firebase_accepted' | 'firebase_failed'; messageId?: string };
let resendLastDeliverySucceeded = false;
let resendLastOutcome: ResendOutcome = 'not_configured';
async function resendSenderReady(env: Env) {
  if (!env.RESEND_API_KEY) { resendLastOutcome = 'not_configured'; return false; }
  if (!resendSenderDomainValid(resendFrom(env))) { resendLastOutcome = 'sender_rejected'; return false; }
  return true;
}
export async function sendResend(env: Env, to: string, subject: string, html: string, idempotencyKey?: string): Promise<EmailDeliveryResult> {
  if (!await resendSenderReady(env)) return { delivered: false, provider: 'none', outcome: resendLastOutcome };
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, body: JSON.stringify({ from: resendFrom(env), to: [to], subject, html }) });
  const result: any = await response.json().catch(() => null);
  resendLastOutcome = response.ok ? 'accepted' : response.status === 401 || response.status === 403 ? 'auth_failed' : response.status === 429 ? 'rate_limited' : response.status === 400 && /sender|domain|from/i.test(String(result?.name || result?.message || '')) ? 'sender_rejected' : 'provider_error';
  resendLastDeliverySucceeded = response.ok;
  return { delivered: response.ok, provider: response.ok ? 'resend' : 'none', outcome: resendLastOutcome, ...(response.ok && typeof result?.id === 'string' ? { messageId: result.id } : {}) };
}
async function firebaseActionLink(env: Env, email: string, requestType: 'VERIFY_EMAIL' | 'PASSWORD_RESET'): Promise<string | null> {
  if (!env.FIREBASE_PROJECT_ID || !email) return null;
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(String(env.FIREBASE_PROJECT_ID))}/accounts:sendOobCode`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit')}` },
      body: JSON.stringify({ requestType, email, returnOobLink: true }),
    });
    const value = await response.json().catch(() => ({})) as any;
    return response.ok && typeof value.oobLink === 'string' ? value.oobLink : null;
  } catch { return null; }
}
async function firebasePasswordResetDelivery(env: Env, email: string): Promise<boolean> {
  if (!email || email.endsWith('@invalid.heavyar')) return true;
  try {
    const endpoint = env.FIREBASE_WEB_API_KEY
      ? `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`
      : `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(String(env.FIREBASE_PROJECT_ID))}/accounts:sendOobCode`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!env.FIREBASE_WEB_API_KEY) headers.Authorization = `Bearer ${await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit')}`;
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }) });
    return response.ok;
  } catch { return false; }
}
type EmailVerificationPolicy = {
  enabled: boolean; requireBeforeRentalRequest: boolean; requireBeforeListingSubmission: boolean;
  requireBeforeDriverActivation: boolean; allowReminders: boolean; reminderCooldownSeconds: number; version: number;
};
function defaultEmailVerificationPolicy(): EmailVerificationPolicy {
  return { enabled: true, requireBeforeRentalRequest: true, requireBeforeListingSubmission: true, requireBeforeDriverActivation: true, allowReminders: true, reminderCooldownSeconds: 86400, version: 1 };
}
function normalizeEmailVerificationPolicy(raw: any): EmailVerificationPolicy {
  const d = defaultEmailVerificationPolicy(), value = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: value.enabled !== false, requireBeforeRentalRequest: value.requireBeforeRentalRequest !== false,
    requireBeforeListingSubmission: value.requireBeforeListingSubmission !== false, requireBeforeDriverActivation: value.requireBeforeDriverActivation !== false,
    allowReminders: value.allowReminders !== false, reminderCooldownSeconds: Math.min(604800, Math.max(300, Number(value.reminderCooldownSeconds) || d.reminderCooldownSeconds)),
    version: Math.max(1, Math.floor(Number(value.version) || d.version)),
  };
}
async function emailVerificationPolicy(env: Env) {
  return normalizeEmailVerificationPolicy(await getDoc(env, 'emailVerificationPolicies', 'default'));
}
async function enforceEmailVerified(env: Env, u: User, action: 'rental' | 'listing' | 'driver') {
  const policy = await emailVerificationPolicy(env);
  const required = action === 'rental' ? policy.requireBeforeRentalRequest : action === 'listing' ? policy.requireBeforeListingSubmission : policy.requireBeforeDriverActivation;
  // Test-injected users without the field represent legacy fixtures. Explicit
  // emailVerified=false remains enforceable in tests.
  if (policy.enabled && required && u.emailVerified !== true && !(u.testInjected && u.emailVerified === undefined)) err('EMAIL_VERIFICATION_REQUIRED');
}
async function deliverEmailVerification(env: Env, email: string, idToken: string, name: string, language: 'ar' | 'en'): Promise<EmailDeliveryResult> {
  const link = await firebaseActionLink(env, email, 'VERIFY_EMAIL');
  if (link) {
    const resend = await sendResend(env, email, language === 'ar' ? 'وثّق بريدك الإلكتروني في Heavyar / Verify your Heavyar email' : 'Verify your Heavyar email / وثّق بريدك الإلكتروني في Heavyar', heavyarEmailVerificationTemplate(link, name, env.RESEND_SUPPORT_EMAIL || DEFAULT_RESEND_SUPPORT, language));
    if (resend.delivered) return resend;
  }
  // Firebase remains the safe delivery fallback while Resend is absent or
  // its sender domain is not yet accepted; the account/link authority stays
  // entirely within Firebase in either case.
  try {
    const endpoint = env.FIREBASE_WEB_API_KEY
      ? `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`
      : `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(String(env.FIREBASE_PROJECT_ID))}/accounts:sendOobCode`;
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.FIREBASE_WEB_API_KEY ? {} : { Authorization: `Bearer ${await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit')}` }) }, body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken }),
    });
    return { delivered: response.ok, provider: response.ok ? 'firebase' : 'none', outcome: response.ok ? 'firebase_accepted' : 'firebase_failed' };
  } catch { return { delivered: false, provider: 'none', outcome: 'firebase_failed' }; }
}
async function emailVerificationSend(req: Request, env: Env, u: User) {
  const raw = req.headers.get('Authorization') || '', token = raw.replace(/^Bearer\s+/, '');
  if (u.emailVerified === true) return out(env, req, { success: true, alreadyVerified: true });
  const rate = await getRawDoc(env, 'emailVerificationRateLimits', u.uid), now = Date.now(), prior = rate?.data;
  if (prior?.nextAllowedAt && Date.parse(String(prior.nextAllowedAt)) > now) return out(env, req, { success: false, error: 'Verification email cooldown active' }, 429);
  const account = await getDoc(env, 'users', u.uid), email = String(u.email || account?.email || account?.emailLower || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return out(env, req, { success: false, error: 'Verification unavailable' }, 503);
  const policy = await emailVerificationPolicy(env);
  const language = account?.language === 'en' || account?.preferredLanguage === 'en' ? 'en' : 'ar';
  const delivery = await deliverEmailVerification(env, email, token, String(account?.nameEn || account?.nameAr || ''), language);
  const reconciled = delivery.provider === 'resend' && delivery.messageId ? await priorResendWebhookEvent(env, delivery.messageId) : null;
  const cooldown = new Date(now + policy.reminderCooldownSeconds * 1000).toISOString();
  await commitWrites(env, [{ update: { name: fullName(env, `emailVerificationRateLimits/${encodeURIComponent(u.uid)}`), fields: { uid: { stringValue: u.uid }, lastSentAt: { timestampValue: new Date(now).toISOString() }, nextAllowedAt: { timestampValue: cooldown }, count: { integerValue: String(Number(prior?.count || 0) + 1) }, ...(delivery.messageId ? { providerMessageId: { stringValue: delivery.messageId }, deliveryStatus: { stringValue: String(reconciled?.status || 'accepted') }, deliveryEventAt: reconciled?.eventAt ? { timestampValue: reconciled.eventAt } : { nullValue: null } } : {}) } }, currentDocument: rate?.updateTime ? { updateTime: rate.updateTime } : { exists: false } }, { update: { name: fullName(env, `emailVerificationEvents/${crypto.randomUUID()}`), fields: { uid: { stringValue: u.uid }, type: { stringValue: 'self_resend' }, delivery: { booleanValue: delivery.delivered }, provider: { stringValue: delivery.provider }, deliveryOutcome: { stringValue: delivery.outcome }, ...(delivery.messageId ? { providerMessageId: { stringValue: delivery.messageId } } : {}), createdAt: { timestampValue: new Date(now).toISOString() } } }, currentDocument: { exists: false } }]);
  if (delivery.provider === 'resend' && delivery.messageId) await reconcileResendWebhookProjection(env, 'emailVerificationRateLimits', u.uid, delivery.messageId);
  return out(env, req, { success: delivery.delivered, accepted: true, deliveryStatus: delivery.delivered ? 'sent' : 'delivery_unavailable', provider: delivery.provider }, delivery.delivered ? 202 : 503);
}
async function emailVerificationStatus(req: Request, env: Env, u: User) {
  const profile = await getDoc(env, 'users', u.uid);
  const verified = u.emailVerified === true;
  if (profile && profile.emailVerified !== verified) {
    await patchDoc(env, `users/${encodeURIComponent(u.uid)}`, { emailVerified: { booleanValue: verified }, ...(verified ? { emailVerifiedAt: { timestampValue: new Date().toISOString() } } : {}) }).catch(() => undefined);
  }
  return out(env, req, { success: true, emailVerified: verified, email: u.email || profile?.email || null, policy: await emailVerificationPolicy(env) });
}
function effectiveAuthConfig(config: any, passwordEndpointReady = false) {
  const value = { ...DEFAULT_AUTH_CONFIG, ...(config || {}) };
  const phoneProviderReady = value.phoneIndexReady === true;
  return {
    requirePhoneOnSignup: phoneProviderReady && value.requirePhoneOnSignup === true,
    allowEmailLogin: value.allowEmailLogin !== false,
    allowPhoneLogin: phoneProviderReady && passwordEndpointReady && value.allowPhoneLogin === true,
    requirePhoneVerification: false,
    phoneIndexReady: phoneProviderReady,
    version: Number.isFinite(Number(value.version)) ? Number(value.version) : 1,
  };
}
export function normalizeSaudiPhone(value: unknown): string | null {
  const result = normalizeGccPhone(value, 'SA');
  return result?.countryCode === 'SA' ? result.phone : null;
}
async function authConfig(req: Request, env: Env) {
  const stored = await getDoc(env, 'heavyarConfig', 'auth');
  const requested = { ...DEFAULT_AUTH_CONFIG, ...(stored || {}) };
  const effective = effectiveAuthConfig(stored, !!env.FIREBASE_WEB_API_KEY && !!env.FIREBASE_PROJECT_ID && !!env.FIREBASE_CLIENT_EMAIL && !!env.FIREBASE_PRIVATE_KEY);
  await resendSenderReady(env);
  const senderDomainVerified = env.RESEND_SENDER_DOMAIN_VERIFIED === 'true' || resendLastDeliverySucceeded;
  const emailVerification = await emailVerificationPolicy(env);
  const status = {
    emailReset: env.FIREBASE_WEB_API_KEY || env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY ? 'configured' : 'blocked',
    phone: 'disabled',
    phoneRecovery: effective.phoneIndexReady ? 'configured' : 'disabled',
    resend: senderDomainVerified ? 'configured' : env.RESEND_API_KEY ? 'available_delivery_unconfirmed' : 'not_configured',
    firebaseReset: env.FIREBASE_WEB_API_KEY || env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY ? 'configured' : 'blocked',
     phoneProvider: 'not_required_for_alias', phonePasswordLogin: effective.allowPhoneLogin ? 'configured' : 'blocked', senderDomainVerified, resendOutcome: resendLastOutcome,
  };
  const projection = { requested: { ...requested, requireMobileDuringSignup: requested.requirePhoneOnSignup }, effective: { ...effective, requireMobileDuringSignup: effective.requirePhoneOnSignup }, emailVerification, status, accountRecovery: { firebaseReset: status.firebaseReset, resend: { bound: !!env.RESEND_API_KEY, delivery: senderDomainVerified, senderDomainVerified }, phoneRecovery: status.phoneRecovery }, mismatch: { email: requested.allowEmailLogin !== effective.allowEmailLogin, phone: requested.allowPhoneLogin !== effective.allowPhoneLogin, verification: requested.requirePhoneVerification !== effective.requirePhoneVerification, phoneRequirement: requested.requirePhoneOnSignup !== effective.requirePhoneOnSignup }, version: effective.version };
  return out(env, req, { success: true, config: projection, version: effective.version, requireMobileDuringSignup: effective.requirePhoneOnSignup });
}
async function marketConfig(req: Request, env: Env) {
  const countries = await Promise.all(Object.values(GCC_COUNTRIES).map(async country => {
    const value = await countrySettings(env, country.code);
    return { ...value, nativeCurrency: value.currency, marketplaceAvailable: value.marketplaceAvailable, providerOnboardingAvailable: value.providerOnboardingAvailable };
  }));
  return out(env, req, { success: true, countries, currencies: countries.map(country => ({ code: country.currency, countryCode: country.code, enabled: country.enabled })), fx: { enabled: false, provider: null, status: 'disabled', sourceCurrency: null, displayCurrencies: countries.map(country => country.currency), rateSnapshotSupported: true }, phoneVerification: { enabled: false, provider: null, requireAfterSignup: false, requireBeforeRentalRequest: false, requireBeforeProviderActivation: false, requireBeforeDriverActivation: false } });
}
const PHONE_LOGIN_INVALID = 'Invalid mobile number or password.';
async function phoneLoginRateLimit(env: Env, phoneHash: string, ipHash: string): Promise<boolean | null> {
  if (phoneLoginLimiterOverride) return phoneLoginLimiterOverride(phoneHash, ipHash);
  const bucket = Math.floor(Date.now() / 60000), suffix = String(bucket);
  const keys = [`ip:${ipHash}:${suffix}`, `phone:${phoneHash}:${suffix}`, `pair:${phoneHash}:${ipHash}:${suffix}`];
  const limits = [20, 5, 5];
  try {
    if ((!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) && !firestoreOverride) return null;
    if (firestoreOverride) return true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) return null;
      const result = await fs(env, ':batchGet', { method: 'POST', body: JSON.stringify({ documents: keys.map(key => fullName(env, `phoneLoginRateLimits/${key}`)), transaction }) });
      const docs = (result || []).map((row: any) => row.found).filter(Boolean);
      const byName = new Map<string, any>(docs.map((doc: any) => [String(doc.name), decode(doc)]));
      const counts = keys.map(key => Number(byName.get(fullName(env, `phoneLoginRateLimits/${key}`))?.count || 0));
      if (counts.some((count, index) => count >= limits[index])) return false;
      const writes = keys.map((key, index) => ({ update: { name: fullName(env, `phoneLoginRateLimits/${key}`), fields: { bucket: { integerValue: suffix }, count: { integerValue: String(counts[index] + 1) }, expiresAt: { timestampValue: new Date((bucket + 2) * 60000).toISOString() } } }, ...(byName.has(fullName(env, `phoneLoginRateLimits/${key}`)) ? { updateMask: { fieldPaths: ['bucket', 'count', 'expiresAt'] } } : {}), currentDocument: byName.has(fullName(env, `phoneLoginRateLimits/${key}`)) ? undefined : { exists: false } }));
      try { await fs(env, ':commit', { method: 'POST', body: JSON.stringify({ writes, transaction }) }); return true; }
      catch (error) { if (attempt === 2) throw error; }
    }
    return null;
  } catch { return null; }
}
async function mintFirebaseCustomToken(env: Env, uid: string): Promise<string> {
  if (customTokenOverride) return customTokenOverride(uid);
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) err('Authentication unavailable');
  const privateKey = env.FIREBASE_PRIVATE_KEY!;
  const now = Math.floor(Date.now() / 1000), header = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = b64u(enc.encode(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL, sub: env.FIREBASE_CLIENT_EMAIL,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 3600, uid,
  })));
  const key = await crypto.subtle.importKey('pkcs8', b64(privateKey.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return `${header}.${payload}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${payload}`)))}`;
}
async function phonePasswordLogin(req: Request, env: Env) {
  let body: any;
  try { body = await req.json(); } catch { return out(env, req, { success: false, error: PHONE_LOGIN_INVALID }, 401); }
  const phone = normalizeGccPhone(body?.phone)?.phone, password = body?.password;
  if (!phone || typeof password !== 'string' || password.length === 0 || password.length > 4096) return out(env, req, { success: false, error: PHONE_LOGIN_INVALID }, 401);
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_WEB_API_KEY || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return out(env, req, { success: false, error: 'Authentication unavailable' }, 503);
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
  const phoneHash = await hashedId(`phone:${phone}`), ipHash = await hashedId(`ip:${ip}`);
  const rateResult = await phoneLoginRateLimit(env, phoneHash, ipHash);
  if (rateResult === null) return out(env, req, { success: false, error: 'Authentication unavailable' }, 503);
  if (!rateResult) return out(env, req, { success: false, error: 'Too many attempts' }, 429);
  try {
    const config = effectiveAuthConfig(await getDoc(env, 'heavyarConfig', 'auth'), true);
    if (!config.allowPhoneLogin) return out(env, req, { success: false, error: PHONE_LOGIN_INVALID }, 401);
    const owner = await getDoc(env, 'phoneOwners', phoneHash);
    // A protected owner must be singular and canonical; legacy/conflicting
    // shapes are deliberately indistinguishable from an unknown phone.
    const ownerUid = owner && typeof owner.uid === 'string' && owner.uid && owner.phoneHash === phoneHash ? owner.uid : '';
    const lookupUid = ownerUid || 'invalid-phone-alias-uid';
    const user = await getDoc(env, 'users', lookupUid);
    const validStatus = !!user && String(user.uid || ownerUid) === ownerUid && user.deleted !== true && user.disabled !== true &&
        user.accountStatus !== 'deletion_requested' && user.accountStatus !== 'restricted' &&
        !['temporarily_suspended', 'permanently_suspended', 'suspended'].includes(String(user.suspensionStatus)) &&
        user.status !== 'disabled' && user.status !== 'deleted';
    const expectedUid = ownerUid;
    const email = validStatus && typeof user?.email === 'string' ? user.email : validStatus && typeof user?.emailLower === 'string' ? user.emailLower : '';
    // Always perform equivalent provider work, using a fixed non-existent
    // account when the alias cannot be resolved. This prevents timing leaks.
    const verifyEmail = email || 'invalid-phone-alias@invalid.heavyar';
    const verified: any = passwordVerifierOverride
      ? await passwordVerifierOverride(verifyEmail, password)
      : await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmail, password, returnSecureToken: false }),
      })).json().catch(() => ({}));
    if (!validStatus || !expectedUid || verified.localId !== expectedUid) return out(env, req, { success: false, error: PHONE_LOGIN_INVALID }, 401);
    return out(env, req, { customToken: await mintFirebaseCustomToken(env, expectedUid) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication unavailable') return out(env, req, { success: false, error: 'Authentication unavailable' }, 503);
    return out(env, req, { success: false, error: 'Authentication unavailable' }, 503);
  }
}
async function recoveryResponse(req: Request, env: Env, identifier: string, type: string, outcome: string, provider: 'resend' | 'firebase' | 'none' = 'none', providerMessageId?: string) {
  try {
    const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
    await createDoc(env, `authRecoveryAudit/${crypto.randomUUID()}`, { identifierType: { stringValue: type }, identifierHash: { stringValue: await hashedId(identifier.slice(0, 256)) }, ipHash: { stringValue: await hashedId(`ip:${ip}`) }, outcome: { stringValue: outcome }, provider: { stringValue: provider }, ...(providerMessageId ? { providerMessageId: { stringValue: providerMessageId } } : {}), createdAt: { timestampValue: new Date().toISOString() } });
  } catch { /* recovery remains enumeration-safe if audit storage is degraded */ }
  return out(env, req, { success: true, accepted: true }, 202);
}
async function recoveryRateLimit(env: Env, idHash: string, ipHash: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60000), suffix = String(bucket);
  const paths = [`authRecoveryRateLimits/id:${idHash}:${suffix}`, `authRecoveryRateLimits/ip:${ipHash}:${suffix}`, `authRecoveryRateLimits/pair:${idHash}:${ipHash}:${suffix}`];
  try {
    await commitWrites(env, paths.map(path => ({ update: { name: fullName(env, path), fields: { bucket: { integerValue: suffix }, expiresAt: { timestampValue: new Date((bucket + 2) * 60000).toISOString() } } }, currentDocument: { exists: false } })));
    return true;
  } catch { return false; }
}
async function passwordReset(req: Request, env: Env) {
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const identifier = String(body?.identifier ?? body?.email ?? body?.phone ?? '').trim();
  const email = identifier.toLowerCase(), phone = normalizeGccPhone(identifier)?.phone, type = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'email' : phone ? 'phone' : 'invalid';
  const auditId = phone || email || identifier.toLowerCase().slice(0, 256), auditType = type;
  if (!env.OTP_KV && !env.FIREBASE_PROJECT_ID && !firestoreOverride) return recoveryResponse(req, env, auditId, auditType, 'rate_limit_unavailable');
  // Never reveal account existence. This bounded KV gate is keyed by a
  // one-way identifier and client address, and stores no PII.
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
  if (type === 'invalid') return recoveryResponse(req, env, auditId, auditType, 'invalid_identifier');
  const idHash = await hashedId(`${type}:${type === 'email' ? email : phone}`), ipHash = await hashedId(`ip:${ip}`);
  const keys = [`password-reset:id:${idHash}`, `password-reset:ip:${ipHash}`, `password-reset:pair:${idHash}:${ipHash}`];
  if (env.OTP_KV) {
    const limited = (await Promise.all(keys.map(key => env.OTP_KV!.get(key)))).some(Boolean);
    if (limited) return recoveryResponse(req, env, auditId, auditType, 'rate_limited');
    await Promise.all(keys.map(key => env.OTP_KV!.put(key, '1', { expirationTtl: 60 })));
  } else if (!await recoveryRateLimit(env, idHash, ipHash)) {
    return recoveryResponse(req, env, auditId, auditType, 'rate_limited');
  }
  let resetEmail = email;
  if (type === 'phone') {
    if (!env.FIREBASE_PROJECT_ID && !firestoreOverride) return recoveryResponse(req, env, auditId, auditType, 'phone_index_unavailable');
    const config = effectiveAuthConfig(await getDoc(env, 'heavyarConfig', 'auth'));
    if (!config.phoneIndexReady) return recoveryResponse(req, env, auditId, auditType, 'phone_index_disabled');
    const ownerHash = await hashedId(`phone:${phone}`), owner = await getDoc(env, 'phoneOwners', ownerHash);
    const canonical = owner?.uid && owner.phoneHash === ownerHash ? owner : null;
    const user = await getDoc(env, 'users', canonical ? String(canonical.uid) : 'invalid-phone-alias-uid');
    // Keep provider work equivalent for unresolved/collision aliases, but
    // never deliver to an address resolved from a non-canonical owner.
    resetEmail = user?.email ? String(user.email).trim().toLowerCase() : 'invalid-phone-alias@invalid.heavyar';
  }
  // Firebase's official OOB endpoint performs the account lookup and sends
  // the provider-controlled email without returning a link to this API.
  let deliveryOutcome = 'provider_unavailable', deliveryProvider: 'resend' | 'firebase' | 'none' = 'none', providerMessageId: string | undefined;
  if (env.FIREBASE_WEB_API_KEY || env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    try {
      if (env.RESEND_API_KEY && await resendSenderReady(env) && !resetEmail.endsWith('@invalid.heavyar')) {
        const link = await firebaseActionLink(env, resetEmail, 'PASSWORD_RESET');
        const language: 'ar' | 'en' = 'ar';
        const branded = link ? await sendResend(env, resetEmail, 'إعادة تعيين كلمة مرور Heavyar / Reset your Heavyar password', heavyarPasswordResetTemplate(link, env.RESEND_SUPPORT_EMAIL || DEFAULT_RESEND_SUPPORT, language)) : null;
        if (branded?.delivered) {
          deliveryOutcome = 'branded_delivery_requested'; deliveryProvider = 'resend'; providerMessageId = branded.messageId;
        } else {
          const firebase = await firebasePasswordResetDelivery(env, resetEmail);
          deliveryOutcome = firebase ? 'delivery_requested' : 'provider_error'; deliveryProvider = firebase ? 'firebase' : 'none';
        }
      } else {
        const firebase = await firebasePasswordResetDelivery(env, resetEmail);
        deliveryOutcome = firebase ? 'delivery_requested' : 'provider_error'; deliveryProvider = firebase ? 'firebase' : 'none';
      }
    } catch { /* generic 202 response is intentional */ }
  }
  return recoveryResponse(req, env, auditId, auditType, deliveryOutcome, deliveryProvider, providerMessageId);
}
async function registerProfile(req: Request, env: Env, u: User) {
  if (!env.FIREBASE_PROJECT_ID || !u.email) return out(env, req, { success: false, error: 'Registration unavailable' }, 503);
   const email = u.email.trim().toLowerCase(), body = await req.json().catch(() => null) as any;
   if (!body || typeof body !== 'object' || Array.isArray(body)) return out(env, req, { success: false, error: 'Invalid registration details', errorCode: 'INVALID_REGISTRATION_DETAILS', safeToDeleteIdentity: true }, 400);
  const role = String(body.role || body.requestedRole || 'customer');
   const existingRaw = await getRawDoc(env, 'users', u.uid), existing = existingRaw?.data;
    if (existing) {
     const existingEmail = String(existing.email || existing.emailLower || '').trim().toLowerCase();
     if (existingEmail === email && String(existing.role || '') === role) {
       const roleProfile = role === 'driver' ? await getDoc(env, 'driverProfiles', u.uid) : null;
       if (evaluateCanonicalCompleteness(u, existing, roleProfile).state === 'authenticated_complete') return out(env, req, { success: true, alreadyProvisioned: true, existingRole: String(existing.role) });
      } else if (existingEmail === email) {
       return out(env, req, { success: false, error: 'Profile already exists for a different role', errorCode: 'ROLE_MISMATCH', existingRole: String(existing.role || '') }, 409);
      } else {
        return out(env, req, { success: false, error: 'Profile already exists', errorCode: 'PROFILE_ALREADY_EXISTS' }, 409);
      }
   }
  const config = effectiveAuthConfig(await getDoc(env, 'heavyarConfig', 'auth'));
  if (!['customer', 'provider', 'driver'].includes(role) || body.termsAccepted !== true && body.acceptedTerms !== true) return out(env, req, { success: false, error: 'Invalid registration details', errorCode: 'INVALID_REGISTRATION_DETAILS', safeToDeleteIdentity: true }, 400);
  const allowed = new Set(['role', 'requestedRole', 'termsAccepted', 'acceptedTerms', 'nameAr', 'nameEn', 'phone', 'countryCode', 'region', 'city', 'customCity', 'crNumber', 'providerType']);
  if (Object.keys(body).some(key => !allowed.has(key))) return out(env, req, { success: false, error: 'Invalid registration details', errorCode: 'INVALID_REGISTRATION_DETAILS', safeToDeleteIdentity: true }, 400);
  const nameAr = String(body.nameAr || '').trim(), nameEn = String(body.nameEn || '').trim(), country = await countrySettings(env, String(body.countryCode || 'SA')), normalizedPhone = normalizeGccPhone(body.phone, country.code), phone = normalizedPhone && normalizedPhone.countryCode === country.code ? normalizedPhone.phone : null, region = String(body.region || '').trim(), city = String(body.city || '').trim(), customCity = String(body.customCity || '').trim();
  if ((!nameAr && !nameEn) || nameAr.length > 120 || nameEn.length > 120 || (nameAr && nameAr.length < 2) || (nameEn && nameEn.length < 2) || !region || region.length > 120 || (!city && !customCity) || city.length > 120 || customCity.length > 120) return out(env, req, { success: false, error: 'Invalid registration details', errorCode: 'INVALID_REGISTRATION_DETAILS', safeToDeleteIdentity: true }, 400);
   if (!country.enabled) return out(env, req, { success: false, error: 'Country unavailable', errorCode: 'COUNTRY_DISABLED', safeToDeleteIdentity: true }, 400);
   if (role === 'provider' && !country.providerOnboardingAvailable) return out(env, req, { success: false, error: 'Provider onboarding unavailable', errorCode: 'PROVIDER_ONBOARDING_UNAVAILABLE', safeToDeleteIdentity: true }, 400);
   if (config.requirePhoneOnSignup && !phone || body.phone && !phone) return out(env, req, { success: false, error: 'Invalid phone', errorCode: 'INVALID_PHONE', safeToDeleteIdentity: true }, 400);
   if (phone && !config.phoneIndexReady) return out(env, req, { success: false, error: 'Phone reservation unavailable', errorCode: 'PHONE_RESERVATION_UNAVAILABLE', safeToDeleteIdentity: true }, 503);
  const crNumber = String(body.crNumber || '').trim();
   const providerType = body.providerType === undefined ? (role === 'provider' ? 'individual' : undefined) : String(body.providerType);
   if (role === 'provider' && !['individual', 'company'].includes(providerType!)) return out(env, req, { success: false, error: 'Invalid registration details', errorCode: 'INVALID_REGISTRATION_DETAILS', safeToDeleteIdentity: true }, 400);
   if (role !== 'provider' && (body.providerType !== undefined || crNumber)) return out(env, req, { success: false, error: 'Invalid registration details', errorCode: 'INVALID_REGISTRATION_DETAILS', safeToDeleteIdentity: true }, 400);
   if (role === 'provider' && providerType === 'individual' && crNumber) return out(env, req, { success: false, error: 'Invalid registration details', errorCode: 'INVALID_REGISTRATION_DETAILS', safeToDeleteIdentity: true }, 400);
  const registrationPattern = country.code === 'SA' ? /^\d{10}$/ : /^[A-Za-z0-9-]{3,32}$/;
   if (role === 'provider' && providerType === 'company' && country.code === 'SA' && !registrationPattern.test(crNumber) || crNumber && !registrationPattern.test(crNumber)) return out(env, req, { success: false, error: 'Invalid registration details', errorCode: 'INVALID_REGISTRATION_DETAILS', safeToDeleteIdentity: true }, 400);
   const providerOnboardingCompleted = role === 'provider' && Boolean(nameAr || nameEn) && Boolean(region) && Boolean(city || customCity) && Boolean(country.enabled && country.providerOnboardingAvailable);
   const now = new Date().toISOString(), idToken = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, ''), fields: Record<string, any> = { uid: { stringValue: u.uid }, email: { stringValue: email }, emailLower: { stringValue: email }, emailVerified: { booleanValue: u.emailVerified === true }, emailVerificationVersion: { integerValue: '1' }, nameAr: { stringValue: nameAr }, nameEn: { stringValue: nameEn }, ...(phone ? { phone: { stringValue: phone } } : {}), countryCode: { stringValue: country.code }, currency: { stringValue: country.currency }, region: { stringValue: region }, city: { stringValue: city }, customCity: { stringValue: customCity }, ...(crNumber ? { crNumber: { stringValue: crNumber } } : {}), ...(role === 'provider' ? { providerType: { stringValue: providerType! }, providerOnboardingCompleted: { booleanValue: providerOnboardingCompleted } } : {}), role: { stringValue: role }, requestedRole: { stringValue: role }, termsAccepted: { booleanValue: true }, termsAcceptedAt: { timestampValue: now }, createdAt: { timestampValue: now } };
  const writes: any[] = [{ update: { name: fullName(env, `users/${encodeURIComponent(u.uid)}`), fields }, currentDocument: existingRaw?.updateTime ? { updateTime: existingRaw.updateTime } : { exists: false } }];
  if (phone) {
    const ownerId = await hashedId(`phone:${phone}`), owner = await getRawDoc(env, 'phoneOwners', ownerId);
    if (owner && owner.data.uid !== u.uid) return out(env, req, { success: false, error: 'Registration unavailable', errorCode: 'PHONE_ALREADY_IN_USE', safeToDeleteIdentity: true }, 409);
    writes.push({ update: { name: fullName(env, `phoneOwners/${ownerId}`), fields: { uid: { stringValue: u.uid }, phoneHash: { stringValue: ownerId }, createdAt: { timestampValue: now } } }, currentDocument: owner?.updateTime ? { updateTime: owner.updateTime } : { exists: false } });
  }
   if (role === 'driver') {
     const driverRaw = await getRawDoc(env, 'driverProfiles', u.uid);
     writes.push({ update: { name: fullName(env, `driverProfiles/${encodeURIComponent(u.uid)}`), fields: { uid: { stringValue: u.uid }, publicId: { stringValue: await canonicalDriverPublicId(u.uid) }, countryCode: { stringValue: country.code }, currency: { stringValue: country.currency }, displayName: { stringValue: String(body.nameEn || body.nameAr || '') }, ...(phone ? { phone: { stringValue: phone } } : {}), region: { stringValue: String(body.region || '') }, city: { stringValue: String(body.city || '') }, customCity: { stringValue: customCity }, equipmentCategories: { arrayValue: { values: [] } }, experience: { integerValue: '0' }, active: { booleanValue: false }, verified: { booleanValue: false }, moderationStatus: { stringValue: 'pending_review' }, availabilityStatus: { stringValue: 'offline' }, trustStatus: { stringValue: 'unverified' }, createdAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, currentDocument: driverRaw?.updateTime ? { updateTime: driverRaw.updateTime } : { exists: false } });
   }
  try { await commitWrites(env, writes); } catch {
    try {
      const after = await getDoc(env, 'users', u.uid);
      if (after && String(after.email || after.emailLower || '').trim().toLowerCase() === email) return out(env, req, { success: true, uid: u.uid });
    } catch { /* preserve ambiguous retry response */ }
    return out(env, req, { success: false, error: 'Registration temporarily unavailable', errorCode: 'REGISTRATION_RETRY_REQUIRED' }, 503);
  }
  if (u.emailVerified !== true && idToken) {
    const delivered = await deliverEmailVerification(env, email, idToken, nameEn || nameAr, 'ar');
    await commitWrites(env, [{ update: { name: fullName(env, `users/${encodeURIComponent(u.uid)}`), fields: { lastEmailVerificationSentAt: { timestampValue: new Date().toISOString() }, lastEmailVerificationDelivery: { booleanValue: delivered } } }, updateMask: { fieldPaths: ['lastEmailVerificationSentAt', 'lastEmailVerificationDelivery'] } }]).catch(() => undefined);
  }
  return out(env, req, { success: true, uid: u.uid, emailVerified: u.emailVerified === true });
}
const firestoreValue = (v: any): any => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { doubleValue: v } : typeof v === 'string' ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(firestoreValue) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v || {}).map(([k, x]) => [k, firestoreValue(x)])) } };

function publicIdentifierCounterPath(kind: PublicIdentifierKind) {
  return `publicIdentifierCounters/${PUBLIC_IDENTIFIER_COUNTER_IDS[kind]}`;
}

async function transactionDocument(env: Env, path: string, transaction: string) {
  const raw = await fs(env, `${path}?transaction=${encodeURIComponent(transaction)}`);
  return raw ? { data: decode(raw), updateTime: raw.updateTime as string | undefined } : null;
}

/**
 * Allocates an immutable public number while creating the target document in
 * the same Firestore transaction. Counter conflicts are retried, so concurrent
 * requests can leave gaps but never reuse a public identifier.
 */
async function createWithPublicIdentifier(
  env: Env,
  kind: PublicIdentifierKind,
  targetPath: string,
  value: Record<string, unknown>,
  additionalWrites: any[] = [],
): Promise<string> {
  const counterPath = publicIdentifierCounterPath(kind);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const transaction = await beginTransaction(env);
    const counter = transaction
      ? await transactionDocument(env, counterPath, transaction)
      : await getRawDoc(env, 'publicIdentifierCounters', PUBLIC_IDENTIFIER_COUNTER_IDS[kind]);
    const sequence = Math.max(1, Math.floor(Number(counter?.data?.nextSequence || 1)));
    const identifier = formatPublicIdentifier(kind, sequence);
    const withIdentifier = { ...value, [PUBLIC_IDENTIFIER_FIELDS[kind]]: identifier };
    const writes: any[] = [
      {
        update: {
          name: fullName(env, targetPath),
          fields: Object.fromEntries(Object.entries(withIdentifier).map(([key, item]) => [key, firestoreValue(item)])),
        },
        currentDocument: { exists: false },
      },
      {
        update: {
          name: fullName(env, counterPath),
          fields: {
            nextSequence: { integerValue: String(sequence + 1) },
            updatedAt: { timestampValue: new Date().toISOString() },
          },
        },
        updateMask: { fieldPaths: ['nextSequence', 'updatedAt'] },
        currentDocument: counter?.updateTime ? { updateTime: counter.updateTime } : { exists: false },
      },
      ...additionalWrites,
    ];
    try {
      await commitWrites(env, writes, transaction);
      return identifier;
    } catch (error) {
      if (!transaction || attempt === 7) throw error;
    }
  }
  throw new Error('Public identifier allocation failed');
}
async function listingAvailability(req: Request, env: Env, u: User, id: string) {
  const listing = await getDoc(env, 'equipment', id);
  if (!listing || (listing.ownerUid !== u.uid && !isPublicRentableListing(listing))) return out(env, req, { success: false, error: 'Listing not found' }, 404);
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'equipmentRequests' }], where: { fieldFilter: { field: { fieldPath: 'equipmentId' }, op: 'EQUAL', value: { stringValue: id } } }, limit: 100 } }) });
  const rentals = (result || []).map((x: any) => decode(x.document || x)).filter((x: any) => ['pending', 'accepted', 'in_progress', 'completion_requested'].includes(String(x.status)) || x.paymentState === 'paid');
  return out(env, req, { success: true, listingId: id, availability: listing.availability || null, activeRentals: rentals.map((x: any) => ({ from: x.startDate, until: x.endDate, status: x.status })) });
}
async function listingCreate(req: Request, env: Env, u: User) {
  try { await enforceEmailVerified(env, u, 'listing'); } catch (error) { if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403); throw error; }
  const profile = await getDoc(env, 'users', u.uid);
  // Publication eligibility is account/onboarding policy, not identity
  // verification.  Keep aliases here for providers created by older
  // registration versions, while never consulting isVerified/crVerified.
  const legacyProviderProfileComplete = legacyProviderReady(profile);
  const onboardingComplete = profile?.providerOnboardingCompleted === true
    || profile?.providerOnboardingComplete === true
    || profile?.onboardingCompleted === true
    || profile?.providerOnboardingStatus === 'completed'
    || profile?.onboardingStatus === 'completed'
    || legacyProviderProfileComplete;
  if (!profile || profile.role !== 'provider' || profile.accountStatus === 'deletion_requested'
      || profile.accountStatus === 'restricted'
      || ['temporarily_suspended', 'permanently_suspended'].includes(String(profile.suspensionStatus))
      || !onboardingComplete) return out(env, req, { success: false, error: 'Provider onboarding required' }, 403);
  const body: any = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out(env, req, { success: false, error: 'Invalid listing' }, 400);
  const allowed = ['title', 'titleAr', 'titleEn', 'description', 'descriptionAr', 'descriptionEn', 'images', 'dailyPrice', 'pricePerDay', 'category', 'countryCode', 'region', 'city', 'customCity', 'district', 'location', 'customCategory', 'availability'];
  const forbidden = ['ownerUid', 'providerUid', 'moderationStatus', 'verificationStatus', 'status', 'isActive', 'adminHidden', 'createdAt', 'updatedAt'];
  if (Object.keys(body).some((key) => forbidden.includes(key) || !allowed.includes(key))) return out(env, req, { success: false, error: 'Unsupported listing field' }, 400);
  const titleEn = String(body.titleEn || body.title || '').trim(), titleAr = String(body.titleAr || body.title || '').trim();
  const descriptionEn = String(body.descriptionEn || body.description || '').trim(), descriptionAr = String(body.descriptionAr || body.description || '').trim();
  const dailyPrice = Number(body.dailyPrice ?? body.pricePerDay);
  if (!titleEn || !titleAr || titleEn.length > 160 || titleAr.length > 160 || descriptionEn.length > 5000 || descriptionAr.length > 5000 || !Number.isFinite(dailyPrice) || dailyPrice <= 0 || dailyPrice > 100000) return out(env, req, { success: false, error: 'Invalid listing fields' }, 400);
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > 20 || images.some((image: any) => !image || typeof image !== 'object' || typeof image.publicId !== 'string' || typeof image.url !== 'string' || image.publicId.length > 300 || image.url.length > 2000)) return out(env, req, { success: false, error: 'Invalid listing images' }, 400);
  const availability = body.availability || { from: new Date().toISOString().slice(0, 10) }, availabilityCheck = validateDateRange(availability);
  if (!availabilityCheck.ok) return out(env, req, { success: false, error: availabilityCheck.error }, 400);
  if (Array.isArray(availability.blocked) && availability.blocked.some((range: any) => !validateDateRange(range).ok)) return out(env, req, { success: false, error: 'Invalid blocked dates' }, 400);
  const requestedCountry = String(body.countryCode || profile.countryCode || 'SA').toUpperCase();
  if (profile.countryCode && requestedCountry !== String(profile.countryCode).toUpperCase()) return out(env, req, { success: false, error: 'Listing country must match provider country' }, 400);
  const country = await countrySettings(env, requestedCountry);
  if (!country.enabled || !country.providerOnboardingAvailable || !country.marketplaceAvailable) return out(env, req, { success: false, error: 'Country marketplace unavailable' }, 400);
  const id = `eq_${crypto.randomUUID().replace(/-/g, '')}`, now = new Date().toISOString();
  const ownerPublic = { uid: u.uid, nameAr: String(profile.nameAr || ''), nameEn: String(profile.nameEn || ''), avatar: String(profile.avatar || '') };
  const publicationReason = 'automated_post_moderation_eligible_provider';
  const value: any = { ownerUid: u.uid, countryCode: country.code, nativeCurrency: country.currency, nativePricePerDay: dailyPrice, titleAr, titleEn, descriptionAr, descriptionEn, category: String(body.category || '').slice(0, 100), region: String(body.region || '').slice(0, 100), city: String(body.city || '').slice(0, 100), customCity: String(body.customCity || '').slice(0, 100), district: String(body.district || '').slice(0, 100), location: body.location || null, customCategory: String(body.customCategory || '').slice(0, 100), pricePerDay: dailyPrice, images, availability, ownerPublic, isActive: true, visibility: 'visible', moderationStatus: 'approved', moderationReason: publicationReason, createdAt: now, updatedAt: now };
  const writes: any[] = [
    { update: { name: fullName(env, `listingAudit/${encodeURIComponent(`${id}:create`)}`), fields: { listingId: { stringValue: id }, ownerUid: { stringValue: u.uid }, action: { stringValue: 'create' }, reason: { stringValue: publicationReason }, automated: { booleanValue: true }, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } },
  ];
  const publicEquipmentNumber = await createWithPublicIdentifier(env, 'equipment', `equipment/${id}`, value, writes);
  return out(env, req, { success: true, id, listing: { id, ...value, publicEquipmentNumber, dailyPrice } }, 201);
}
async function listingUpdate(req: Request, env: Env, u: User, id: string) {
  const raw = await getRawDoc(env, 'equipment', id);
  if (!raw?.data || raw.data.ownerUid !== u.uid) return out(env, req, { success: false, error: 'Listing not found' }, 404);
  if (raw.data.visibility === 'archived') return out(env, req, { success: false, error: 'Listing is archived' }, 409);
  const body: any = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out(env, req, { success: false, error: 'Invalid listing update' }, 400);
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'equipmentRequests' }], where: { fieldFilter: { field: { fieldPath: 'equipmentId' }, op: 'EQUAL', value: { stringValue: id } } }, limit: 100 } }) });
  const rentals = (result || []).map((x: any) => decode(x.document || x));
  if (hasActiveRental(rentals)) return out(env, req, { success: false, error: 'LISTING_EDIT_LOCKED' }, 409);
  const allowed = ['title', 'titleAr', 'titleEn', 'description', 'descriptionAr', 'descriptionEn', 'category', 'region', 'city', 'customCity', 'district', 'location', 'customCategory', 'dailyPrice', 'pricePerDay', 'images', 'availability', 'isActive'];
  const forbidden = ['ownerUid', 'providerUid', 'moderationStatus', 'verificationStatus', 'status', 'adminHidden', 'createdAt', 'updatedAt'];
  if (Object.keys(body).some((key) => forbidden.includes(key) || !allowed.includes(key))) return out(env, req, { success: false, error: 'Unsupported listing field' }, 400);
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k) && !['title', 'description', 'dailyPrice'].includes(k)));
  if (body.title !== undefined) { patch.titleAr = String(body.title); patch.titleEn = String(body.title); }
  if (body.description !== undefined) { patch.descriptionAr = String(body.description); patch.descriptionEn = String(body.description); }
  if (body.dailyPrice !== undefined) { patch.pricePerDay = Number(body.dailyPrice); patch.nativePricePerDay = Number(body.dailyPrice); }
  if (Object.keys(patch).length === 0) return out(env, req, { success: false, error: 'No editable fields' }, 400);
  if (patch.pricePerDay !== undefined && (!Number.isFinite(Number(patch.pricePerDay)) || Number(patch.pricePerDay) <= 0 || Number(patch.pricePerDay) > 100000)) return out(env, req, { success: false, error: 'Invalid daily price' }, 400);
  if (patch.availability) {
    const a = patch.availability as any, valid = validateDateRange(a);
    if (!valid.ok) return out(env, req, { success: false, error: valid.error }, 400);
    const overlaps = rentals.some((r: any) => r.startDate && availabilityAllows(a, { from: String(r.startDate), until: r.endDate }).ok === false);
    if (overlaps) return out(env, req, { success: false, error: 'AVAILABILITY_CONFLICT' }, 409);
  }
  if (patch.isActive !== undefined) patch.visibility = listingVisibilityForOwnerActive(patch.isActive === true);
  // Owners may hide an approved listing, but can never undo an Admin
  // restriction (or self-approve a listing awaiting review).
  if (patch.isActive === true && raw.data.moderationStatus !== 'approved') return out(env, req, { success: false, error: 'LISTING_MODERATION_LOCKED' }, 403);
  if (requiresListingRereview(raw.data, patch)) {
    patch.moderationStatus = 'pending_review';
    patch.moderationReason = '';
    patch.isActive = false;
    patch.visibility = 'hidden';
    patch.reviewedBy = '';
    patch.reviewedAt = null;
  }
  const fields = Object.fromEntries(Object.entries({ ...patch, updatedAt: new Date().toISOString() }).map(([k, v]) => [k, firestoreValue(v)]));
  try { await compareAndSwap(env, `equipment/${encodeURIComponent(id)}`, raw.updateTime!, fields); } catch { return out(env, req, { success: false, error: 'LISTING_UPDATE_CONFLICT' }, 409); }
  return out(env, req, { success: true, listingId: id, listing: { ...raw.data, ...patch } });
}
async function listingLifecycle(req: Request, env: Env, u: User, id: string, archive: boolean) {
  const raw = await getRawDoc(env, 'equipment', id);
  if (!raw?.data || raw.data.ownerUid !== u.uid) return out(env, req, { success: false, error: 'Listing not found' }, 404);
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'equipmentRequests' }], where: { fieldFilter: { field: { fieldPath: 'equipmentId' }, op: 'EQUAL', value: { stringValue: id } } }, limit: 100 } }) });
  const rentals = (result || []).map((x: any) => decode(x.document || x));
  if (hasActiveRental(rentals)) return out(env, req, { success: false, error: 'LISTING_LIFECYCLE_LOCKED' }, 409);
  const now = new Date().toISOString(), history = rentals.length > 0;
  const writes: any[] = archive || history
    ? [{ update: { name: fullName(env, `equipment/${encodeURIComponent(id)}`), fields: { isActive: { booleanValue: false }, visibility: { stringValue: 'archived' }, archivedAt: { timestampValue: now }, archivedBy: { stringValue: u.uid }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['isActive', 'visibility', 'archivedAt', 'archivedBy', 'updatedAt'] }, currentDocument: { updateTime: raw.updateTime } }]
    : [{ delete: fullName(env, `equipment/${encodeURIComponent(id)}`), currentDocument: { updateTime: raw.updateTime } }];
  writes.push({ update: { name: fullName(env, `listingAudit/${encodeURIComponent(`${id}:${Date.now()}`)}`), fields: { listingId: { stringValue: id }, ownerUid: { stringValue: u.uid }, action: { stringValue: archive || history ? 'archive' : 'delete' }, reason: { stringValue: archive ? 'owner_archive' : 'owner_delete' }, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } });
  try { await commitWrites(env, writes); } catch { return out(env, req, { success: false, error: 'LISTING_LIFECYCLE_CONFLICT' }, 409); }
  return out(env, req, { success: true, listingId: id, action: archive || history ? 'archived' : 'deleted', preservedRentalHistory: history });
}
async function availabilityCheck(req: Request, env: Env, u: User, id: string) {
  const listing = await getDoc(env, 'equipment', id);
  if (!listing || (listing.ownerUid !== u.uid && !isPublicRentableListing(listing))) return out(env, req, { success: false, error: 'Listing not found' }, 404);
  const body: any = await req.json().catch(() => null), requested = { from: String(body?.from || ''), until: body?.until === undefined ? undefined : String(body.until) };
  const valid = validateDateRange(requested);
  if (!valid.ok) return out(env, req, { success: false, error: valid.error }, 400);
  const availability = listing.availability || { from: requested.from };
  const base = availabilityAllows(availability, requested);
  if (!base.ok) return out(env, req, { success: true, available: false, reason: base.error });
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'equipmentRequests' }], where: { fieldFilter: { field: { fieldPath: 'equipmentId' }, op: 'EQUAL', value: { stringValue: id } } }, limit: 100 } }) });
  const conflict = (result || []).map((x: any) => decode(x.document || x)).some((r: any) => hasActiveRental([r]) && r.startDate && !(requested.until && String(r.startDate) > requested.until) && !(r.endDate && String(r.endDate) < requested.from));
  return out(env, req, { success: true, available: !conflict, reason: conflict ? 'ACTIVE_RENTAL_OVERLAP' : null });
}
async function publicGatewayDiscovery(req: Request, env: Env, u: User) {
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({
    structuredQuery: { from: [{ collectionId: 'paymentGateways' }], limit: 20 },
  }) });
  const registry = gatewayRegistry(env), enabled: any[] = [];
  for (const row of (result || [])) {
    const id = String(row.document?.name || '').split('/').pop() as keyof typeof registry, config: any = decode(row.document || row), gateway = registry[id];
    if (gateway && config.enabled === true && gateway.configured && gateway.adapterAvailable) enabled.push({ provider: gateway.provider, environment: gateway.environment, supportsSplit: gateway.supportsSplit, capabilities: { refunds: false, savedCards: false, split: gateway.supportsSplit } });
  }
  return out(env, req, { success: true, gateways: enabled });
}
const DRIVER_PUBLIC_ID_PATTERN = /^drv_[A-Za-z0-9_-]{43}$/;

async function canonicalDriverPublicId(uid: string): Promise<string> {
  return `drv_${b64u(await crypto.subtle.digest('SHA-256', enc.encode(`heavyar:driver:${uid}`)))}`;
}

function driverDocument(name: string, data: any) {
  return { name, data: data?.decoded || decode(data) };
}

async function driverQueryRows(env: Env, structuredQuery: any): Promise<Array<{ name: string; data: any }>> {
  capturedDriverQueries?.push(structuredQuery);
  if (firestoreOverride) {
    const injected = firestoreOverride('__queries', 'driverProfiles');
    const fixtures = Array.isArray(injected) ? injected : (() => {
      const legacy = firestoreOverride!('driverProfiles', 'test');
      return legacy ? [{ id: 'test', ...legacy }] : [];
    })();
    let rows = fixtures.map((item: any) => ({
      name: item.name || fullName(env, `driverProfiles/${encodeURIComponent(String(item.id || 'test'))}`),
      data: item.data || item,
    })).sort((a: any, b: any) => a.name.localeCompare(b.name));
    const filters = structuredQuery?.where?.compositeFilter?.filters || (structuredQuery?.where?.fieldFilter ? [structuredQuery.where] : []);
    rows = rows.filter((row: any) => filters.every((filter: any) => {
      const rule = filter.fieldFilter, field = rule?.field?.fieldPath, expected = val(rule?.value);
      return !rule || (rule.op === 'EQUAL' && row.data[field] === expected);
    }));
    const start = structuredQuery?.startAt?.values?.[0]?.referenceValue;
    if (start) rows = rows.filter((row: any) => row.name > start);
    return rows.slice(0, Number(structuredQuery?.limit || rows.length));
  }
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) });
  return (result || []).filter((item: any) => item.document).map((item: any) => driverDocument(item.document.name, item.document));
}

async function ensureDriverPublicId(env: Env, uid: string, profile: any): Promise<string> {
  const expected = await canonicalDriverPublicId(uid);
  if (profile?.publicId === expected) return expected;
  if (!firestoreOverride || firestoreWrites) {
    await patchDoc(env, `driverProfiles/${encodeURIComponent(uid)}`, { publicId: { stringValue: expected } });
  }
  profile.publicId = expected;
  return expected;
}

async function resolveDriverPublicId(env: Env, publicId: string): Promise<{ uid: string; profile: any } | null> {
  if (!DRIVER_PUBLIC_ID_PATTERN.test(publicId)) return null;
  const rows = await driverQueryRows(env, {
    from: [{ collectionId: 'driverProfiles' }],
    where: { fieldFilter: { field: { fieldPath: 'publicId' }, op: 'EQUAL', value: { stringValue: publicId } } },
    limit: 2,
  });
  const matching = rows.filter(row => row.data.publicId === publicId);
  if (matching.length !== 1) return null;
  return { uid: decodeURIComponent(matching[0].name.split('/').pop() || ''), profile: matching[0].data };
}

function eligibleAccount(account: any, role: 'driver' | 'requester'): boolean {
  if (!account || (account.accountStatus !== undefined && account.accountStatus !== 'active') || account.isActive === false ||
      ['temporarily_suspended', 'permanently_suspended', 'suspended'].includes(String(account.suspensionStatus || '')) ||
      ['restricted', 'deletion_requested', 'suspended'].includes(String(account.accountStatus || ''))) return false;
  return role === 'driver' ? account.role === 'driver' : ['customer', 'provider'].includes(String(account.role));
}

async function emailEligible(env: Env, verified: unknown, action: 'rental' | 'driver'): Promise<boolean> {
  const policy = await emailVerificationPolicy(env);
  const required = action === 'rental' ? policy.requireBeforeRentalRequest : policy.requireBeforeDriverActivation;
  return !policy.enabled || !required || verified === true;
}

async function eligibleDriver(env: Env, uid: string, profile: any): Promise<boolean> {
  if (!profile || profile.active !== true || profile.moderationStatus !== 'approved') return false;
  const account = await getDoc(env, 'users', uid);
  if (!eligibleAccount(account, 'driver') || !await emailEligible(env, account.emailVerified, 'driver')) return false;
  const country = await countrySettings(env, String(profile.countryCode || account.countryCode || ''));
  return country.enabled === true && country.marketplaceAvailable === true && country.code === String(profile.countryCode || '').toUpperCase();
}

async function ownerDriverProfile(env: Env, uid: string, profile: any) {
  const id = await ensureDriverPublicId(env, uid, profile);
  return { ...publicDriverProfile({ ...profile, id }), active: profile.active === true, moderationStatus: String(profile.moderationStatus || 'pending_review') };
}

async function driverProfile(req: Request, env: Env, u: User) {
  const id = u.uid, raw = await getRawDoc(env, 'driverProfiles', id);
  const account = await getDoc(env, 'users', id);
  if (!u.admin && account?.role !== 'driver') return out(env, req, { success: false, error: 'Driver profile unavailable for this account' }, 403);
  if (req.method === 'GET') return out(env, req, { success: true, profile: raw ? await ownerDriverProfile(env, id, raw.data) : null });
  const body: any = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out(env, req, { success: false, error: 'Invalid driver profile' }, 400);
  if (raw && ['suspended', 'rejected'].includes(String(raw.data.moderationStatus)) && !u.admin) return out(env, req, { success: false, error: 'DRIVER_MODERATION_LOCKED' }, 403);
  const allowed = ['displayName', 'photoUrl', 'countryCode', 'region', 'city', 'equipmentTypes', 'yearsExperience', 'description', 'availabilityStatus', 'availableFrom', 'availableUntil'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return out(env, req, { success: false, error: 'Unsupported driver profile field' }, 400);
  if (!u.admin && !eligibleAccount(account, 'driver')) return out(env, req, { success: false, error: 'Driver profile unavailable for this account' }, 403);
  const country = await countrySettings(env, String(body.countryCode || account?.countryCode || raw?.data?.countryCode || 'SA'));
  if (!country.enabled || !country.providerOnboardingAvailable) return out(env, req, { success: false, error: 'Country driver onboarding unavailable' }, 400);
  if ((raw?.data?.moderationStatus === 'approved' || body.availabilityStatus === 'available') && !u.admin) {
    try { await enforceEmailVerified(env, u, 'driver'); } catch (error) { if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403); throw error; }
  }
  const fallbackName = String(account?.nameEn || account?.nameAr || '');
  const displayName = String(body.displayName || raw?.data?.displayName || fallbackName).trim();
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  patch.displayName = displayName;
  if (displayName.length < 2 || displayName.length > 120 ||
      (patch.equipmentTypes !== undefined && (!Array.isArray(patch.equipmentTypes) || patch.equipmentTypes.length > 30 || patch.equipmentTypes.some((type: unknown) => typeof type !== 'string' || !type.trim() || type.length > 100))) ||
      (patch.yearsExperience !== undefined && (!Number.isInteger(patch.yearsExperience) || Number(patch.yearsExperience) < 0 || Number(patch.yearsExperience) > 80))) {
    return out(env, req, { success: false, error: 'Invalid driver profile' }, 400);
  }
  const fields = Object.fromEntries(Object.entries({
    uid: id,
    publicId: await canonicalDriverPublicId(id),
    countryCode: country.code,
    currency: country.currency,
    active: raw?.data?.active === true && raw?.data?.moderationStatus === 'approved',
    moderationStatus: raw?.data?.moderationStatus || 'pending_review',
    nameAr: String(account?.nameAr || raw?.data?.nameAr || ''),
    nameEn: String(account?.nameEn || raw?.data?.nameEn || ''),
    email: String(account?.email || raw?.data?.email || u.email || ''),
    phone: String(account?.phone || raw?.data?.phone || ''),
    createdAt: raw?.data?.createdAt || new Date().toISOString(),
    ...patch,
    updatedAt: new Date().toISOString(),
  }).map(([k, v]) => [k, firestoreValue(v)]));
  try {
    if (raw) await compareAndSwap(env, `driverProfiles/${encodeURIComponent(id)}`, raw.updateTime!, fields);
    else await createDoc(env, `driverProfiles/${encodeURIComponent(id)}`, fields);
  } catch (error) {
    if (String(error).includes('precondition')) return out(env, req, { success: false, error: 'Driver profile changed; refresh and retry' }, 409);
    throw error;
  }
  return out(env, req, { success: true, profile: await ownerDriverProfile(env, id, { ...raw?.data, ...patch, publicId: await canonicalDriverPublicId(id), active: raw?.data?.active === true && raw?.data?.moderationStatus === 'approved', moderationStatus: raw?.data?.moderationStatus || 'pending_review' }) });
}
async function driverSearch(req: Request, env: Env) {
  const rate = await publicDriverRateLimit(req, env, 'search');
  if (rate === null) return out(env, req, { success: false, error: 'Driver discovery temporarily unavailable' }, 503);
  if (!rate) return out(env, req, { success: false, error: 'Too many requests' }, 429);
  const url = new URL(req.url), countryCode = String(url.searchParams.get('countryCode') || 'SA').toUpperCase(), q = url.searchParams.get('q'), region = url.searchParams.get('region'), city = url.searchParams.get('city'), equipmentType = url.searchParams.get('equipment'), availabilityStatus = url.searchParams.get('availabilityStatus'), requestedFrom = url.searchParams.get('availableFrom'), requestedUntil = url.searchParams.get('availableUntil'), trustStatus = url.searchParams.get('trustStatus'), cursor = url.searchParams.get('cursor');
  const rawLimit = url.searchParams.get('limit'), limit = rawLimit === null ? 20 : Number(rawLimit);
  const unknown = [...url.searchParams.keys()].filter((key) => !['countryCode', 'q', 'equipment', 'availabilityStatus', 'availableFrom', 'availableUntil', 'trustStatus', 'region', 'city', 'cursor', 'limit'].includes(key));
  if (unknown.length) return out(env, req, { success: false, error: 'Unsupported driver search filter' }, 400);
  const safeText = (value: string | null) => value === null || (value.length >= 1 && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value) && value.trim() === value);
  if (!GCC_COUNTRIES[countryCode as GccCountryCode] || !safeText(q) || !safeText(region) || !safeText(city) || !safeText(equipmentType) || !safeText(availabilityStatus) || !Number.isInteger(limit) || limit < 1 || limit > 50) return out(env, req, { success: false, error: 'Invalid driver search filter' }, 400);
  if (trustStatus !== null && !['unverified', 'pending', 'verified', 'rejected', 'expired', 'manual_review', 'restricted'].includes(trustStatus)) return out(env, req, { success: false, error: 'Invalid trust status' }, 400);
  const dateOnly = (value: string | null) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly(requestedFrom) || !dateOnly(requestedUntil) || (requestedFrom && requestedUntil && requestedFrom > requestedUntil)) return out(env, req, { success: false, error: 'Invalid availability range' }, 400);
  const market = await countrySettings(env, countryCode);
  if (!market.enabled || !market.marketplaceAvailable) return out(env, req, { success: true, drivers: [], nextCursor: undefined });
  let cursorReference: string | undefined;
  if (cursor) {
    const resolved = await resolveDriverPublicId(env, cursor);
    if (!resolved) return out(env, req, { success: false, error: 'Invalid cursor' }, 400);
    cursorReference = fullName(env, `driverProfiles/${encodeURIComponent(resolved.uid)}`);
  }
  const drivers: any[] = [];
  let pagesScanned = 0, lastBatchFull = false, lastScanned: { uid: string; profile: any } | undefined;
  for (let page = 0; page < 20 && drivers.length <= limit; page += 1) {
    const query: any = { from: [{ collectionId: 'driverProfiles' }],
      where: { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 50 };
    if (cursorReference) query.startAt = { before: false, values: [{ referenceValue: cursorReference }] };
    const rows = await driverQueryRows(env, query);
    if (!rows.length) break;
    pagesScanned += 1;
    lastBatchFull = rows.length === 50;
    for (const row of rows) {
      const uid = decodeURIComponent(row.name.split('/').pop() || ''), raw = row.data, types = Array.isArray(raw.equipmentTypes) ? raw.equipmentTypes : [];
      cursorReference = row.name;
      lastScanned = { uid, profile: raw };
      const matches = raw.countryCode === countryCode && (!region || raw.region === region) && (!city || raw.city === city) &&
        (!q || String(raw.displayName || '').toLocaleLowerCase().includes(q.toLocaleLowerCase())) &&
        (!equipmentType || types.includes(equipmentType)) && (!availabilityStatus || raw.availabilityStatus === availabilityStatus) &&
        (!trustStatus || raw.trustStatus === trustStatus) &&
        (!requestedFrom || (raw.availableFrom && String(raw.availableFrom) <= requestedFrom)) &&
        (!requestedUntil || (raw.availableUntil && String(raw.availableUntil) >= requestedUntil));
      if (matches && await eligibleDriver(env, uid, raw)) {
        const id = await ensureDriverPublicId(env, uid, raw);
        drivers.push(publicDriverProfile({ ...raw, id }));
        if (drivers.length > limit) break;
      }
    }
    if (rows.length < 50) break;
  }
  const hasMore = drivers.length > limit;
  const visible = drivers.slice(0, limit);
  const budgetExhausted = pagesScanned === 20 && lastBatchFull && !hasMore;
  const continuation = hasMore
    ? String(visible[visible.length - 1]?.id)
    : budgetExhausted && lastScanned
      ? await ensureDriverPublicId(env, lastScanned.uid, lastScanned.profile)
      : undefined;
  return out(env, req, { success: true, drivers: visible, nextCursor: continuation });
}

async function publicDriverDetail(req: Request, env: Env, id: string) {
  const rate = await publicDriverRateLimit(req, env, 'detail');
  if (rate === null) return out(env, req, { success: false, error: 'Driver discovery temporarily unavailable' }, 503);
  if (!rate) return out(env, req, { success: false, error: 'Too many requests' }, 429);
  const resolved = await resolveDriverPublicId(env, id);
  if (!resolved || !await eligibleDriver(env, resolved.uid, resolved.profile)) return out(env, req, { success: false, error: 'Not found' }, 404);
  return out(env, req, { success: true, profile: publicDriverProfile({ ...resolved.profile, id }) });
}

async function driverRequestRows(env: Env, field: 'requesterUid' | 'driverUid', uid: string, limit: number, cursor?: { id: string; createdAt: string }): Promise<Array<{ id: string; data: any; updateTime?: string }>> {
  const query: any = {
    from: [{ collectionId: 'driverRequests' }],
    where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: uid } } },
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'DESCENDING' }],
    limit,
  };
  if (cursor) query.startAt = { before: false, values: [{ referenceValue: fullName(env, `driverRequests/${encodeURIComponent(cursor.id)}`) }] };
  capturedDriverQueries?.push(query);
  if (firestoreOverride) {
    const injected = firestoreOverride('__queries', 'driverRequests');
    let rows = (Array.isArray(injected) ? injected : []).filter((item: any) => (item.data || item)[field] === uid).map((item: any) => ({
      id: String(item.id || item.name?.split('/').pop() || ''),
      data: item.data || item,
      updateTime: item.updateTime || 'test-update-time',
    })).sort((a: any, b: any) => b.id.localeCompare(a.id));
    if (cursor) rows = rows.filter((row: any) => row.id < cursor.id);
    return rows.slice(0, limit);
  }
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    ...query,
  } }) });
  return (result || []).filter((item: any) => item.document).map((item: any) => ({
    id: decodeURIComponent(String(item.document.name).split('/').pop() || ''),
    data: decode(item.document),
    updateTime: item.document.updateTime,
  }));
}

async function driverRequestList(req: Request, env: Env, u: User) {
  const url = new URL(req.url), rawLimit = url.searchParams.get('limit'), limit = rawLimit === null ? 20 : Number(rawLimit), cursorId = url.searchParams.get('cursor');
  if ([...url.searchParams.keys()].some(key => !['limit', 'cursor'].includes(key)) || !Number.isInteger(limit) || limit < 1 || limit > 50 ||
      cursorId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(cursorId)) return out(env, req, { success: false, error: 'Invalid driver request pagination' }, 400);
  const account = await getDoc(env, 'users', u.uid);
  const asDriver = eligibleAccount(account, 'driver');
  if (!asDriver && !eligibleAccount(account, 'requester')) return out(env, req, { success: false, error: 'Driver requests unavailable for this account' }, 403);
  if (!await emailEligible(env, account.emailVerified ?? u.emailVerified, asDriver ? 'driver' : 'rental')) return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403);
  let cursor: { id: string; createdAt: string } | undefined;
  if (cursorId) {
    const raw = await getRawDoc(env, 'driverRequests', cursorId);
    const field = asDriver ? 'driverUid' : 'requesterUid';
    if (!raw?.data || raw.data[field] !== u.uid) return out(env, req, { success: false, error: 'Invalid driver request cursor' }, 400);
    cursor = { id: cursorId, createdAt: String(raw.data.createdAt || '') };
  }
  const rows = await driverRequestRows(env, asDriver ? 'driverUid' : 'requesterUid', u.uid, limit + 1, cursor);
  const requests = [];
  for (const row of rows.slice(0, limit)) {
    const driverRaw = await getDoc(env, 'driverProfiles', String(row.data.driverUid || ''));
    const driverIsPublic = driverRaw && await eligibleDriver(env, String(row.data.driverUid), driverRaw);
    const driverId = driverIsPublic ? await ensureDriverPublicId(env, String(row.data.driverUid), driverRaw) : null;
    const requester = await getDoc(env, 'users', String(row.data.requesterUid || ''));
    requests.push({
      id: row.id,
      status: String(row.data.status || ''),
      notes: String(row.data.notes || ''),
      createdAt: row.data.createdAt,
      updatedAt: row.data.updatedAt,
      driver: driverIsPublic ? publicDriverProfile({ ...driverRaw, id: driverId }) : null,
      requesterName: String(requester?.nameEn || requester?.nameAr || requester?.displayName || ''),
      isRequester: row.data.requesterUid === u.uid,
    });
  }
  return out(env, req, { success: true, requests, nextCursor: rows.length > limit ? rows[limit - 1].id : undefined });
}

async function driverRequest(req: Request, env: Env, u: User, id?: string) {
  if (id) {
    const raw = await getRawDoc(env, 'driverRequests', id);
    if (!raw?.data || (raw.data.requesterUid !== u.uid && raw.data.driverUid !== u.uid)) return out(env, req, { success: false, error: 'Not found' }, 404);
    const account = await getDoc(env, 'users', u.uid);
    const isDriver = raw.data.driverUid === u.uid;
    if (!eligibleAccount(account, isDriver ? 'driver' : 'requester') ||
        !await emailEligible(env, account.emailVerified ?? u.emailVerified, isDriver ? 'driver' : 'rental')) {
      return out(env, req, { success: false, error: 'Driver request action unavailable for this account' }, 403);
    }
    const body: any = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['action', 'status'].includes(key))) return out(env, req, { success: false, error: 'Invalid driver request action' }, 400);
    const action = String(body.action || ''), next = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : action === 'close' ? 'closed' : String(body.status || '');
    const driverAction = ['accepted', 'declined'].includes(next);
    if (driverAction && raw.data.driverUid !== u.uid) return out(env, req, { success: false, error: 'Only assigned driver may respond' }, 403);
    if (next === 'closed' && raw.data.requesterUid !== u.uid) return out(env, req, { success: false, error: 'Only requester may close' }, 403);
    if (!transitionDriverRequest(String(raw.data.status) as any, next as any)) return out(env, req, { success: false, error: 'Invalid request transition' }, 409);
    try {
      await compareAndSwap(env, `driverRequests/${encodeURIComponent(id)}`, raw.updateTime!, { status: { stringValue: next }, updatedAt: { timestampValue: new Date().toISOString() } });
    } catch (error) {
      if (String(error).includes('precondition')) return out(env, req, { success: false, error: 'Driver request changed' }, 409);
      throw error;
    }
    return out(env, req, { success: true, requestId: id, status: next });
  }
  const body: any = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['driverId', 'notes'].includes(key))) return out(env, req, { success: false, error: 'Invalid driver request' }, 400);
  const requester = await getDoc(env, 'users', u.uid);
  if (!eligibleAccount(requester, 'requester')) return out(env, req, { success: false, error: 'Driver requests require an active customer or provider account' }, 403);
  if (!await emailEligible(env, requester.emailVerified ?? u.emailVerified, 'rental')) return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403);
  const resolved = await resolveDriverPublicId(env, String(body.driverId || ''));
  if (!resolved || resolved.uid === u.uid || !await eligibleDriver(env, resolved.uid, resolved.profile)) return out(env, req, { success: false, error: 'Invalid driver' }, 400);
  const notes = String(body.notes || '');
  if (notes.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes)) return out(env, req, { success: false, error: 'Invalid driver request notes' }, 400);
  const requestId = crypto.randomUUID(), now = new Date().toISOString();
  await createDoc(env, `driverRequests/${requestId}`, { requesterUid: { stringValue: u.uid }, driverUid: { stringValue: resolved.uid }, status: { stringValue: 'open' }, notes: firestoreValue(notes), createdAt: { timestampValue: now }, updatedAt: { timestampValue: now } });
  return out(env, req, { success: true, requestId, status: 'open' }, 201);
}
export default { async fetch(req: Request, env: Env, executionCtx?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  env = { ...env, __executionCtx: executionCtx };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req.headers.get('Origin')) });
  const path = new URL(req.url).pathname;
  try {
    if (path === '/health') return out(env, req, { success: true, service: 'heavyar-api' });
    if (path.startsWith('/api/early-access/')) {
      const result = await handlePublicEarlyAccess(req, env);
      if (result instanceof Response) return result;
      const { status = 200, ...payload } = result as Record<string, any>;
      const response = out(env, req, payload, status);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return response;
    }
    if (path === '/api/seo/published') {
      const response = await handlePublishedSeo(req, env);
      const scopedCors = cors(env, req.headers.get('Origin'));
      response.headers.set('Access-Control-Allow-Origin', scopedCors['Access-Control-Allow-Origin']);
      response.headers.set('Vary', scopedCors.Vary);
      return response;
    }
    if ((path === '/api/send-email-otp' || path === '/api/verify-email-otp') && req.method === 'POST') return out(env, req, { success: false, error: 'Deprecated verification flow', errorCode: 'DEPRECATED_VERIFICATION_FLOW' }, 410);
     if (path === '/api/auth/config' && req.method === 'GET') return await authConfig(req, env);
      if (path === '/api/config/markets' && req.method === 'GET') return await marketConfig(req, env);
      if (path === '/api/auth/email-verification' && req.method === 'GET') return await emailVerificationStatus(req, env, await authenticatedUser(req, env, true));
      if (path === '/api/auth/email-verification' && req.method === 'POST') return await emailVerificationSend(req, env, await authenticatedUser(req, env, true));
      if (path === '/api/auth/email-verification/send' && req.method === 'POST') return await emailVerificationSend(req, env, await authenticatedUser(req, env, true));
      if ((path === '/api/auth/phone-login' || path === '/api/auth/login-phone' || path === '/api/auth/alias-login') && req.method === 'POST') return await phonePasswordLogin(req, env);
     if (path === '/api/auth/password-reset' && req.method === 'POST') return await passwordReset(req, env);
     if (path === '/api/register-profile' && req.method === 'POST') return await registerProfile(req, env, await auth(req, env));
     if (path === '/api/account/profile-status' && req.method === 'GET') return await accountProfileStatus(req, env, await auth(req, env));
     if (path === '/api/account/identity-delete' && req.method === 'POST') return await identityOnlyDeletion(req, env, await auth(req, env));
     if (path === '/api/account/deletion-request' && req.method === 'GET') return await accountDeletionStatus(req, env, await authenticatedUser(req, env, true));
     if (path === '/api/account/deletion-request' && req.method === 'POST') return await accountDeletionRequest(req, env, await authenticatedUser(req, env, true));
     if (path === '/api/verification/profile' && req.method === 'GET') return await verificationProfile(req, env, await authenticatedUser(req, env));
     if (path === '/api/verification/policy' && req.method === 'GET') return await verificationPolicy(req, env, await authenticatedUser(req, env));
     if (path === '/api/verification/attempts' && req.method === 'POST') return await startVerification(req, env, await authenticatedUser(req, env));
     if (path === '/api/requests' && req.method === 'POST') return await createRequest(req, env, await authenticatedUser(req, env));
      const listingMatch = path.match(/^\/api\/listings\/([^/]+)\/availability$/);
      if (listingMatch && req.method === 'GET') return await listingAvailability(req, env, await authenticatedUser(req, env), decodeURIComponent(listingMatch[1]));
      if (path === '/api/listings' && req.method === 'POST') return await listingCreate(req, env, await authenticatedUser(req, env));
      const listingEditMatch = path.match(/^\/api\/listings\/([^/]+)$/);
      if (listingEditMatch && req.method === 'PATCH') return await listingUpdate(req, env, await authenticatedUser(req, env), decodeURIComponent(listingEditMatch[1]));
      const listingArchiveMatch = path.match(/^\/api\/listings\/([^/]+)\/archive$/);
      if (listingArchiveMatch && req.method === 'POST') return await listingLifecycle(req, env, await authenticatedUser(req, env), decodeURIComponent(listingArchiveMatch[1]), true);
      const listingDeleteMatch = path.match(/^\/api\/listings\/([^/]+)$/);
      if (listingDeleteMatch && req.method === 'DELETE') return await listingLifecycle(req, env, await authenticatedUser(req, env), decodeURIComponent(listingDeleteMatch[1]), false);
      const availabilityCheckMatch = path.match(/^\/api\/listings\/([^/]+)\/availability\/check$/);
      if (availabilityCheckMatch && req.method === 'POST') return await availabilityCheck(req, env, await authenticatedUser(req, env), decodeURIComponent(availabilityCheckMatch[1]));
      if (path === '/api/checkout/gateways' && req.method === 'GET') return await publicGatewayDiscovery(req, env, await authenticatedUser(req, env));
       if (path === '/api/drivers/profile' && (req.method === 'GET' || req.method === 'PUT')) return await driverProfile(req, env, await authenticatedUser(req, env));
       if (path === '/api/drivers/search' && req.method === 'GET') return await driverSearch(req, env);
       const publicDriverMatch = path.match(/^\/api\/drivers\/public\/([^/]+)$/);
       if (publicDriverMatch && req.method === 'GET') return await publicDriverDetail(req, env, decodeURIComponent(publicDriverMatch[1]));
       if (path === '/api/drivers/requests' && req.method === 'GET') return await driverRequestList(req, env, await authenticatedUser(req, env));
      if (path === '/api/drivers/requests' && req.method === 'POST') return await driverRequest(req, env, await authenticatedUser(req, env));
      const driverRequestMatch = path.match(/^\/api\/drivers\/requests\/([^/]+)$/);
      if (driverRequestMatch && req.method === 'POST') return await driverRequest(req, env, await authenticatedUser(req, env), decodeURIComponent(driverRequestMatch[1]));
       if (path === '/api/staff/invitations/accept' && req.method === 'POST') {
         const result = await acceptStaffInvitation(req, env, await authenticatedUser(req, env));
         const status = typeof result === 'object' && result && typeof (result as any).status === 'number' ? Number((result as any).status) : 200;
         if (status !== 200) { const { status: _status, ...body } = result as any; return out(env, req, body, status); }
         return out(env, req, result);
       }
        if ((path === '/api/staff/invitations/details' || path === '/api/staff/invitations/readiness' || path === '/api/admin/staff/invitations/details') && req.method === 'GET') {
          const result = await staffInvitationDetails(req, env);
          const status = typeof result === 'object' && result && typeof (result as any).status === 'number' ? Number((result as any).status) : 200;
          if (status !== 200) { const { status: _status, ...body } = result as any; return out(env, req, body, status); }
          return out(env, req, result);
        }
       const selfServiceInvoiceMatch = path.match(/^\/api\/invoices\/([A-Za-z0-9:_-]{3,200})\.pdf$/);
       if (selfServiceInvoiceMatch && req.method === 'GET') return await selfServiceInvoicePdf(req, env, await authenticatedUser(req, env), selfServiceInvoiceMatch[1]);
    const requestTransitionMatch = path.match(/^\/api\/requests\/([^/]+)\/transition$/);
     if (requestTransitionMatch && req.method === 'POST') return await transitionRequest(req, env, await authenticatedUser(req, env), requestTransitionMatch[1]);
    const verificationAttemptMatch = path.match(/^\/api\/verification\/attempts\/([^/]+)$/);
     if (verificationAttemptMatch && req.method === 'GET') return await verificationAttempt(req, env, await authenticatedUser(req, env), verificationAttemptMatch[1]);
    const identityCallbackMatch = path.match(/^\/api\/webhooks\/identity\/([A-Za-z0-9_-]{16,128})$/);
    if (identityCallbackMatch && req.method === 'POST') return await identityCallback(req, env, identityCallbackMatch[1]);
     if (path === '/api/webhooks/resend' && req.method === 'POST') return await resendWebhook(req, env);
      if (path === '/api/notifications' && req.method === 'GET') return await notificationList(req, env, await authenticatedUser(req, env));
      if (path === '/api/notifications/read-all' && req.method === 'POST') return await notificationReadAll(req, env, await authenticatedUser(req, env));
      if (path === '/api/notifications/preferences' && (req.method === 'GET' || req.method === 'PUT')) return await notificationPreferences(req, env, await authenticatedUser(req, env));
      if (path === '/api/notifications/devices' && req.method === 'POST') return await registerDevice(req, env, await authenticatedUser(req, env));
      if (path === '/api/notifications/devices' && req.method === 'DELETE') return await registerDevice(req, env, await authenticatedUser(req, env), true);
      if (path === '/api/notifications/devices/revoke' && req.method === 'POST') return await registerDevice(req, env, await authenticatedUser(req, env), true);
     const notificationMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
      if (notificationMatch && req.method === 'POST') return await notificationRead(req, env, await authenticatedUser(req, env), decodeURIComponent(notificationMatch[1]));
     if (path === '/api/create-payment' && req.method === 'POST') return await create(req, env, await authenticatedUser(req, env));
     if (path === '/api/verify-payment' && req.method === 'POST') return await verify(req, env, await authenticatedUser(req, env));
    if (path.startsWith('/api/admin/')) {
       const user = await auth(req, env);
       const document = await handleAdminDocument(req, env, user);
       if (document) {
         const body = new Uint8Array(document.body.length);
         body.set(document.body);
         return new Response(body.buffer, {
           status: document.status,
           headers: {
             'Content-Type': document.contentType,
             'Content-Disposition': `attachment; filename="${document.filename}"`,
             'Cache-Control': 'private, no-store',
             'X-Content-Type-Options': 'nosniff',
             ...cors(env, req.headers.get('Origin')),
           },
         });
       }
       const result = await handleAdmin(req, env, user);
      const status = typeof result === 'object' && result && 'status' in result && typeof (result as any).status === 'number' ? Number((result as any).status) : 200;
       if (path === '/api/admin/seo' || path.startsWith('/api/admin/seo/')) {
         const { status: _status, ...body } = result as any;
         const response = out(env, req, body, status);
         response.headers.set('Cache-Control', 'private, no-store');
         response.headers.set('X-Robots-Tag', 'noindex, nofollow');
         response.headers.set('Vary', 'Origin, Authorization');
         return response;
       }
      if (status !== 200) { const { status: _status, ...body } = result as any; return out(env, req, body, status); }
      return out(env, req, result);
    }
     if (path === '/api/webhooks/tap' && req.method === 'POST') return await tapWebhook(req, env);
     if (path === '/cloudinary/delete' && req.method === 'POST') return await removeAsset(req, env, await authenticatedUser(req, env));
     if (path === '/cloudinary/upload' && req.method === 'POST') return await cloudinaryUpload(req, env, await authenticatedUser(req, env));
    return out(env, req, { success: false, error: 'Not found' }, 404);
  } catch (e) {
    if (isQuotaError(e)) {
      const response = quotaResponse(req, e);
      for (const [name, value] of Object.entries(cors(env, req.headers.get('Origin')))) response.headers.set(name, value);
      response.headers.set('Access-Control-Expose-Headers', 'Retry-After');
      return response;
    }
    if (e instanceof AdminDocumentUnavailableError) {
      return out(env, req, { success: false, error: e.message, code: e.code }, e.status);
    }
    const message = e instanceof Error ? e.message : '';
    if (message === 'EMAIL_VERIFICATION_REQUIRED') return out(env, req, { success: false, error: 'Email verification is required before performing this action.', errorCode: message, verificationSubject: 'actor' }, 403);
    if (message === 'ADMIN_REQUIRED') return out(env, req, { success: false, error: 'Admin authorization required', errorCode: 'PERMISSION_DENIED' }, 403);
    if (message === 'AUTH_REQUIRED') return out(env, req, { success: false, error: 'Authentication required', errorCode: 'AUTH_REQUIRED' }, 401);
     const forbidden = message === 'ADMIN_REQUIRED' || message === 'ACCOUNT_SUSPENDED' || message === 'ACCOUNT_DELETION_REQUESTED' || message === 'LISTING_UNAVAILABLE' || message.startsWith('TRUST_');
     return out(env, req, { success: false, error: message === 'AUTH_REQUIRED' ? 'Authentication required' : message === 'ADMIN_REQUIRED' ? 'Admin authorization required' : message === 'ACCOUNT_SUSPENDED' ? 'Account suspended' : message === 'ACCOUNT_DELETION_REQUESTED' ? 'Account deletion requested' : message === 'LISTING_UNAVAILABLE' ? 'Listing unavailable' : message.startsWith('TRUST_') ? 'Identity verification required' : 'Internal service error' }, message === 'AUTH_REQUIRED' ? 401 : forbidden ? 403 : 500);
} }, async scheduled(_event: unknown, env: Env, executionCtx: { waitUntil(promise: Promise<unknown>): void }) {
  const requestEnv = { ...env, __executionCtx: executionCtx };
  executionCtx.waitUntil((async () => {
    let processorFailed = false;
    // Sequence processors so exhaustion in one prevents the next scan. Existing
    // per-record leases/idempotency remain unchanged; future ticks can recover.
    for (const processor of [processPendingNotificationOutbox, processScheduledCampaigns,
      processStaffClaimSync, processDeletionJobs, retryDueNotificationDeliveries, pollNotificationReceipts, processEarlyAccessRetention]) {
      if (quotaBlocked()) break;
      try { await processor(requestEnv); }
      catch (error) { if (isQuotaError(error)) break; processorFailed = true; }
    }
    if (processorFailed) throw new Error('Scheduled maintenance temporarily unavailable.');
  })());
} };