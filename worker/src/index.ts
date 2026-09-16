import { quoteForRequest, paymentIdForRequest, idempotencyKeyForPayment, invoiceNumberForPayment, TapPaymentProvider, canTransition, PAYMENT_STATES, stateForProvider, pricingConfig, type PaymentQuote, type PaymentState } from './payment';

interface KVNamespace { get(key: string, type?: 'json'): Promise<any>; put(key: string, value: string, options?: { expirationTtl: number }): Promise<void>; delete(key: string): Promise<void>; }
export interface Env {
  CLOUDINARY_CLOUD_NAME?: string; CLOUDINARY_API_KEY?: string; CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_FOLDER?: string; TAP_SECRET_KEY_TEST?: string; RESEND_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string; FIREBASE_CLIENT_EMAIL?: string; FIREBASE_PRIVATE_KEY?: string;
  CORS_ORIGINS?: string; PAYMENT_PLATFORM_FEE_RATE?: string; PAYMENT_VAT_RATE?: string; OTP_KV?: KVNamespace;
}
type User = { uid: string; admin: boolean; email?: string };
let authOverride: User | undefined;
let firestoreOverride: ((collection: string, id: string) => any) | undefined;
let assetOwnedOverride: boolean | undefined;
let firestoreWrites: Array<{ path: string; fields: Record<string, unknown> }> | undefined;
let reservationConflict = false;
let capturedCommits: unknown[] | undefined;
export const __test = { setAuth(user?: User) { authOverride = user; }, setFirestore(fn?: (collection: string, id: string) => any) { firestoreOverride = fn; }, setAssetOwned(value?: boolean) { assetOwnedOverride = value; }, captureWrites(target?: Array<{ path: string; fields: Record<string, unknown> }>) { firestoreWrites = target; }, captureCommits(target?: unknown[]) { capturedCommits = target; }, setReservationConflict(value: boolean) { reservationConflict = value; }, firestoreUrl(env: Env, path: string) { return firestoreUrl(env, path); }, quoteForRequest, canTransition, paymentStates: PAYMENT_STATES };
const TAP = 'https://api.tap.company/v2';
const enc = new TextEncoder();
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64u = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cors = (env: Env, origin: string | null) => {
  const allow = (env.CORS_ORIGINS || 'https://heavyar.app,https://www.heavyar.app').split(',').map(x => x.trim());
  return { 'Access-Control-Allow-Origin': allow.includes(origin || '') ? origin! : 'null', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', Vary: 'Origin' };
};
const out = (env: Env, req: Request, value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...cors(env, req.headers.get('Origin')) } });
const err = (message: string): never => { throw new Error(message); };
const authErr = (): never => { throw new Error('AUTH_REQUIRED'); };

let certs: Record<string, string> = {};
async function auth(req: Request, env: Env): Promise<User> {
  if (authOverride && req.headers.has('Authorization')) return authOverride;
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!token || !env.FIREBASE_PROJECT_ID) authErr();
  const [h, p, s] = token.split('.'); if (!h || !p || !s) authErr();
  let header: any, payload: any;
  try { header = JSON.parse(new TextDecoder().decode(b64(h))); payload = JSON.parse(new TextDecoder().decode(b64(p))); } catch { authErr(); }
  if (header.alg !== 'RS256' || payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` || !payload.sub || payload.exp * 1000 <= Date.now()) authErr();
  if (!certs[header.kid]) { const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'); if (!r.ok) err('Authentication unavailable'); certs = await r.json(); }
  const pem = certs[header.kid]; if (!pem) authErr();
  const key = await crypto.subtle.importKey('spki', b64(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s), enc.encode(`${h}.${p}`))) authErr();
  return { uid: payload.sub, admin: payload.admin === true || payload.role === 'admin', email: payload.email };
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
async function startRequest(req: Request, env: Env, u: User) {
  const { requestId } = await req.json() as { requestId?: string }; const raw = requestId ? await getRawDoc(env, 'equipmentRequests', requestId) : null;
  if (!raw?.data || (raw.data.providerUid !== u.uid && !u.admin) || raw.data.status !== 'accepted' || !raw.updateTime) return out(env, req, { success: false, error: 'Invalid request state' }, 409);
  try { await compareAndSwap(env, `equipmentRequests/${encodeURIComponent(requestId!)}`, raw.updateTime, { status: { stringValue: 'in_progress' }, startedAt: { timestampValue: new Date().toISOString() } }); return out(env, req, { success: true, status: 'in_progress' }); } catch { return out(env, req, { success: false, error: 'Request changed' }, 409); }
}
async function confirmCompletion(req: Request, env: Env, u: User) {
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
    if (path === '/api/send-email-otp' && req.method === 'POST') return otpSend(req, env);
    if (path === '/api/verify-email-otp' && req.method === 'POST') return otpVerify(req, env);
    if (path === '/api/register-profile' && req.method === 'POST') return registerProfile(req, env, await auth(req, env));
    if (path === '/api/start-request' && req.method === 'POST') return startRequest(req, env, await auth(req, env));
    if (path === '/api/confirm-completion' && req.method === 'POST') return confirmCompletion(req, env, await auth(req, env));
    if (path === '/api/create-payment' && req.method === 'POST') return create(req, env, await auth(req, env));
    if (path === '/api/verify-payment' && req.method === 'POST') return verify(req, env, await auth(req, env));
     if (path === '/api/webhooks/tap' && req.method === 'POST') return tapWebhook(req, env);
    if (path === '/cloudinary/delete' && req.method === 'POST') return removeAsset(req, env, await auth(req, env));
    return out(env, req, { success: false, error: 'Not found' }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    return out(env, req, { success: false, error: message === 'AUTH_REQUIRED' ? 'Authentication required' : 'Internal service error' }, message === 'AUTH_REQUIRED' ? 401 : 500);
  }
} };