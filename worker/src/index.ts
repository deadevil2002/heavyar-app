interface KVNamespace { get(key: string, type?: 'json'): Promise<any>; put(key: string, value: string, options?: { expirationTtl: number }): Promise<void>; delete(key: string): Promise<void>; }
export interface Env {
  CLOUDINARY_CLOUD_NAME?: string; CLOUDINARY_API_KEY?: string; CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_FOLDER?: string; TAP_SECRET_KEY_TEST?: string; RESEND_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string; FIREBASE_CLIENT_EMAIL?: string; FIREBASE_PRIVATE_KEY?: string;
  CORS_ORIGINS?: string; OTP_KV?: KVNamespace;
}
type User = { uid: string; admin: boolean; email?: string };
let authOverride: User | undefined;
let firestoreOverride: ((collection: string, id: string) => any) | undefined;
let assetOwnedOverride: boolean | undefined;
let firestoreWrites: Array<{ path: string; fields: Record<string, unknown> }> | undefined;
let reservationConflict = false;
let capturedCommits: unknown[] | undefined;
export const __test = { setAuth(user?: User) { authOverride = user; }, setFirestore(fn?: (collection: string, id: string) => any) { firestoreOverride = fn; }, setAssetOwned(value?: boolean) { assetOwnedOverride = value; }, captureWrites(target?: Array<{ path: string; fields: Record<string, unknown> }>) { firestoreWrites = target; }, captureCommits(target?: unknown[]) { capturedCommits = target; }, setReservationConflict(value: boolean) { reservationConflict = value; }, firestoreUrl(env: Env, path: string) { return firestoreUrl(env, path); } };
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
function amount(r: any, e: any): number { const raw = Number(r?.finalAmount); const fallback = Number(r?.amount); const subtotal = Number.isFinite(raw) && raw > 0 ? raw : (Number.isFinite(fallback) && fallback > 0 ? fallback : Number(r?.dailyRate ?? e?.dailyRate ?? e?.pricePerDay) * Number(r?.days ?? r?.durationDays ?? 1)); return Math.round((subtotal + subtotal * 0.15) * 100) / 100; }
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
  const subtotal = r.requestMode === 'open_ended' ? lockedRate * days : Number(r.finalAmount ?? r.amount), fee = Math.round(subtotal * 0.1), end = new Date(now).toISOString();
  const fields: Record<string, any> = { status: { stringValue: 'completed' }, endedAt: { timestampValue: end }, endDate: { timestampValue: end }, allowChat: { booleanValue: false } };
  if (r.requestMode === 'open_ended') Object.assign(fields, { finalAmount: { doubleValue: subtotal }, finalPlatformFee: { doubleValue: fee }, finalProviderAmount: { doubleValue: subtotal - fee } });
  try { await compareAndSwap(env, `equipmentRequests/${encodeURIComponent(requestId!)}`, raw.updateTime, fields); return out(env, req, { success: true, status: 'completed', finalAmount: subtotal }); } catch { return out(env, req, { success: false, error: 'Request changed' }, 409); }
}
async function create(req: Request, env: Env, u: User) {
  const body = await req.json() as { requestId?: string; amount?: number }; if (!body.requestId) return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  const raw = await getRawDoc(env, 'equipmentRequests', body.requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId);
  if (!owned(u, r) || !r?.customerUid || r.customerUid !== u.uid) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  if (String(r.requestMode || '').toLowerCase() === 'open_ended' && !(Number.isFinite(Number(r.finalAmount)) && Number(r.finalAmount) > 0)) return out(env, req, { success: false, error: 'Final amount required' }, 409);
  const expected = amount(r, e); if (!expected || (body.amount !== undefined && Number(body.amount) !== expected)) return out(env, req, { success: false, error: 'Amount mismatch' }, 409);
  if (String(r.paymentStatus || '').toLowerCase() === 'pending_payment' && r.paymentId) return out(env, req, { success: true, chargeId: r.paymentId.startsWith('reservation:') ? undefined : r.paymentId, status: 'PENDING', amount: expected, currency: 'SAR' });
  if (String(r.status || '').toLowerCase() !== 'completed' || !['unpaid', ''].includes(String(r.paymentStatus || '').toLowerCase())) return out(env, req, { success: false, error: 'Invalid payment state' }, 409);
  if (!env.TAP_SECRET_KEY_TEST) return out(env, req, { success: false, error: 'Payment unavailable' }, 503);
  const idempotencyKey = `heavyar-payment:${u.uid}:${body.requestId}`;
  if (!raw?.updateTime) return out(env, req, { success: false, error: 'Payment unavailable' }, 503);
  const reservation = `reservation:${idempotencyKey}`;
  try {
    await compareAndSwap(env, `equipmentRequests/${encodeURIComponent(body.requestId)}`, raw.updateTime, { paymentStatus: { stringValue: 'pending_payment' }, paymentId: { stringValue: reservation } });
  } catch {
    const current = await getDoc(env, 'equipmentRequests', body.requestId);
    if (current?.paymentStatus === 'pending_payment' && current.paymentId) return out(env, req, { success: true, chargeId: current.paymentId.startsWith('reservation:') ? undefined : current.paymentId, status: 'PENDING', amount: expected, currency: 'SAR' });
    return out(env, req, { success: false, error: 'Payment reservation conflict' }, 409);
  }
  const tap = await fetch(`${TAP}/charges`, { method: 'POST', headers: { Authorization: `Bearer ${env.TAP_SECRET_KEY_TEST}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ amount: expected, currency: 'SAR', customer_initiated: true, threeDSecure: true, save_card: false, description: `Heavyar rental payment - ${body.requestId}`, metadata: { requestId: body.requestId, customerUid: u.uid, amount: String(expected), currency: 'SAR', idempotencyKey }, source: { id: 'src_all' }, redirect: { url: 'https://heavyar.app/payment/callback' } }) });
  const data = await tap.json() as any; if (!tap.ok) { try { await patchDoc(env, `equipmentRequests/${encodeURIComponent(body.requestId)}`, { paymentStatus: { stringValue: 'unpaid' }, paymentId: { nullValue: null } }); } catch { /* preserve reservation if cleanup races */ } return out(env, req, { success: false, error: 'Payment unavailable' }, 502); }
  await patchDoc(env, `equipmentRequests/${encodeURIComponent(body.requestId)}`, { paymentStatus: { stringValue: 'pending_payment' }, paymentId: { stringValue: String(data.id) } });
  return out(env, req, { success: true, chargeId: data.id, status: data.status, paymentUrl: data.redirect?.url || '', amount: data.amount, currency: data.currency });
}
async function verify(req: Request, env: Env, u: User) {
  const { chargeId } = await req.json() as { chargeId?: string }; if (!chargeId || !env.TAP_SECRET_KEY_TEST) return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  const tap = await fetch(`${TAP}/charges/${encodeURIComponent(chargeId)}`, { headers: { Authorization: `Bearer ${env.TAP_SECRET_KEY_TEST}` } }), d = await tap.json() as any, m = d.metadata || {};
  const raw = await getRawDoc(env, 'equipmentRequests', m.requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId), expected = amount(r, e);
  if (!owned(u, r) || m.customerUid !== u.uid && !u.admin) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  const paid = tap.ok && r?.paymentId === chargeId && d.status === 'CAPTURED' && Number(d.amount) === expected && m.amount === String(expected) && (m.currency || 'SAR') === 'SAR' && m.requestId === String(r?.id || m.requestId);
  if (paid) {
    const invoice = `INV-${m.requestId}-${String(d.id).slice(-8)}`;
    const now = new Date().toISOString();
    const provider = r?.providerUid ? await getDoc(env, 'users', r.providerUid) : null, customer = r?.customerUid ? await getDoc(env, 'users', r.customerUid) : null;
    const sellerName = String(r?.providerPublic?.nameEn || r?.providerPublic?.nameAr || provider?.nameEn || provider?.nameAr || '').trim(), buyerName = String(r?.customerPublic?.nameEn || r?.customerPublic?.nameAr || customer?.nameEn || customer?.nameAr || '').trim();
    if (!sellerName || !buyerName) return out(env, req, { success: false, error: 'Invoice participants unavailable' }, 503);
    const subtotal = Math.round((Number(r?.finalAmount ?? r?.amount) || 0) * 100) / 100, vatAmount = Math.round(subtotal * 0.15 * 100) / 100, totalAmount = Math.round((subtotal + vatAmount) * 100) / 100;
    const invoiceFields = { invoiceNumber: { stringValue: invoice }, requestId: { stringValue: String(m.requestId) }, equipmentId: { stringValue: String(r?.equipmentId || '') }, providerId: { stringValue: String(r?.providerUid || '') }, customerId: { stringValue: String(r?.customerUid || u.uid) }, sellerName: { stringValue: sellerName }, buyerName: { stringValue: buyerName }, subtotal: { doubleValue: subtotal }, vatRate: { doubleValue: 0.15 }, vatAmount: { doubleValue: vatAmount }, totalAmount: { doubleValue: totalAmount }, currency: { stringValue: 'SAR' }, status: { stringValue: 'paid' }, createdAt: { timestampValue: now }, paidAt: { timestampValue: now }, paymentReference: { stringValue: String(d.id) } };
    const existing = await getDoc(env, 'invoices', invoice);
    if (!existing && raw?.updateTime) await commitWrites(env, [
      { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(m.requestId)}`), fields: { paymentStatus: { stringValue: 'paid' }, paymentId: { stringValue: String(d.id) }, paidAt: { timestampValue: now }, invoiceId: { stringValue: invoice } } }, updateMask: { fieldPaths: ['paymentStatus', 'paymentId', 'paidAt', 'invoiceId'] }, currentDocument: { updateTime: raw.updateTime } },
      { update: { name: fullName(env, `invoices/${encodeURIComponent(invoice)}`), fields: invoiceFields }, currentDocument: { exists: false } },
    ]);
  }
  return out(env, req, { success: true, chargeId: d.id, status: d.status, isPaid: paid, amount: d.amount, currency: d.currency, requestId: m.requestId });
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
    if (path === '/cloudinary/delete' && req.method === 'POST') return removeAsset(req, env, await auth(req, env));
    return out(env, req, { success: false, error: 'Not found' }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    return out(env, req, { success: false, error: message === 'AUTH_REQUIRED' ? 'Authentication required' : 'Internal service error' }, message === 'AUTH_REQUIRED' ? 401 : 500);
  }
} };