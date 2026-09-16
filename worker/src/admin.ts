import type { Env } from './index';

export type AdminRole = 'super_admin' | 'admin';
export type AdminUser = { uid: string; admin: boolean; role?: AdminRole; email?: string };

type RawDoc = { data: any; updateTime?: string; name?: string };
let firestoreOverride: ((collection: string, id: string) => any) | undefined;
let commitOverride: unknown[][] | undefined;
let identityOverride: ((uid: string, role: AdminRole | null) => Promise<{ role: AdminRole | null; previousRole: unknown }>) | undefined;
export const __adminTest = {
  setFirestore(fn?: (collection: string, id: string) => any) { firestoreOverride = fn; },
  captureCommits(target?: unknown[][]) { commitOverride = target; },
  setIdentity(fn?: (uid: string, role: AdminRole | null) => Promise<{ role: AdminRole | null; previousRole: unknown }>) { identityOverride = fn; },
};

const enc = new TextEncoder();
const b64u = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const jsonValue = (value: unknown): any => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(jsonValue) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonValue(v)])) } };
  return { nullValue: null };
};
const decodeValue = (v: any): any => v?.stringValue ?? (v?.integerValue !== undefined ? Number(v.integerValue) : undefined) ?? v?.doubleValue ?? v?.booleanValue ?? v?.timestampValue ?? (v?.nullValue !== undefined ? null : v?.arrayValue ? (v.arrayValue.values || []).map(decodeValue) : v?.mapValue ? decode(v.mapValue) : undefined);
const decode = (d: any) => Object.fromEntries(Object.entries(d?.fields || {}).map(([k, v]) => [k, decodeValue(v)]));
const fullName = (env: Env, path: string) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
const firestoreUrl = (env: Env, path: string) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/${path.startsWith(':') ? `documents${path}` : `documents/${path}`}`;

async function googleToken(env: Env, scope = 'https://www.googleapis.com/auth/datastore') {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) throw new Error('Firestore unavailable');
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = b64u(enc.encode(JSON.stringify({ iss: env.FIREBASE_CLIENT_EMAIL, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const key = await crypto.subtle.importKey('pkcs8', b64(env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const assertion = `${header}.${payload}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${payload}`)))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}` });
  if (!response.ok) throw new Error('Identity service unavailable');
  return (await response.json() as { access_token: string }).access_token;
}

async function fs(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch(firestoreUrl(env, path), { ...init, headers: { Authorization: `Bearer ${await googleToken(env)}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Firestore unavailable');
  return response.status === 204 ? null : response.json();
}

async function rawDoc(env: Env, collection: string, id: string): Promise<RawDoc | null> {
  if (firestoreOverride) {
    const data = firestoreOverride(collection, id);
    return data ? { data, updateTime: 'test-update-time' } : null;
  }
  const response = await fs(env, `${collection}/${encodeURIComponent(id)}`);
  return response ? { data: decode(response), updateTime: response.updateTime, name: response.name } : null;
}

async function commit(env: Env, writes: unknown[]) {
  if (commitOverride) { commitOverride.push(writes); return; }
  await fs(env, ':commit', { method: 'POST', body: JSON.stringify({ writes }) });
}

function cursorValue(env: Env, collection: string, cursor: string | null) {
  if (!cursor) return undefined;
  try {
    const name = new TextDecoder().decode(Uint8Array.from(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
    if (name.startsWith(fullName(env, `${collection}/`))) return { values: [{ referenceValue: name }] };
  } catch { /* malformed cursors are treated as absent */ }
  throw new Error('Invalid cursor');
}

function nextCursor(name?: string) {
  return name ? b64u(enc.encode(name)) : undefined;
}

const FILTERS: Record<string, string[]> = {
  users: ['role', 'accountStatus', 'suspensionStatus', 'emailLower', 'email'],
  equipment: ['ownerUid', 'isActive', 'moderationStatus', 'slug'],
  equipmentRequests: ['status', 'paymentStatus', 'paymentState', 'customerUid', 'providerUid'],
  payments: ['state', 'provider'],
  invoices: ['status', 'customerId', 'providerId'],
  refunds: ['state', 'requestId'],
  refundReservations: ['refundId'],
  complaints: ['status', 'requestId', 'customerUid', 'providerUid'],
  verificationCases: ['status', 'type'],
  providerConfigs: ['enabled', 'environment'],
  heavyarConfig: ['key'],
  adminAudit: ['actorUid', 'action', 'targetType'],
};

async function listCollection(env: Env, collection: string, query: Record<string, string>, limit = 30, cursor: string | null = null) {
  if (!FILTERS[collection]) throw new Error('Unsupported collection');
  const safeLimit = Math.min(50, Math.max(1, Number.isFinite(limit) ? limit : 30));
  const field = FILTERS[collection].find(key => query[key] !== undefined);
  const structuredQuery: any = {
    from: [{ collectionId: collection }],
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit: safeLimit + 1,
  };
  if (field) {
    const rawValue = query[field];
    const value = ['isActive', 'enabled'].includes(field) ? rawValue === 'true' : ['priority'].includes(field) && Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue;
    structuredQuery.where = { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: jsonValue(value) } };
  }
  const startAt = cursorValue(env, collection, cursor);
  if (startAt) structuredQuery.startAt = startAt;
  const response = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) }) as any[] || [];
  const docs = response.filter(item => item.document).slice(0, safeLimit);
  return {
    items: docs.map(item => ({ id: String(item.document.name).split('/').pop(), ...redact(decode(item.document)) })),
    nextCursor: response.length > safeLimit ? nextCursor(docs[docs.length - 1]?.document?.name) : undefined,
  };
}

async function countCollection(env: Env, collection: string, filter?: { field: string; value: unknown }) {
  return aggregateCollection(env, collection, filter);
}

async function aggregateCollection(env: Env, collection: string, filter?: { field: string; value: unknown }, sumField?: string) {
  try {
    const structuredQuery: any = { from: [{ collectionId: collection }] };
    if (filter) structuredQuery.where = { fieldFilter: { field: { fieldPath: filter.field }, op: 'EQUAL', value: jsonValue(filter.value) } };
    const aggregations: any[] = [{ alias: 'count', count: {} }];
    if (sumField) aggregations.push({ alias: 'sum', sum: { field: { fieldPath: sumField } } });
    const response = await fs(env, ':runAggregationQuery', { method: 'POST', body: JSON.stringify({ structuredAggregationQuery: { structuredQuery, aggregations } }) }) as any[] || [];
    const values = response[0]?.result?.aggregateFields || {};
    return sumField ? Number(values.sum?.doubleValue ?? values.sum?.integerValue ?? 0) : Number(values.count?.integerValue || 0);
  } catch { return null; }
}

async function recentAudit(env: Env) {
  try {
    const response = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'adminAudit' }], orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }], limit: 10,
    } }) }) as any[] || [];
    return response.filter(item => item.document).map(item => ({ id: String(item.document.name).split('/').pop(), ...redact(decode(item.document)) }));
  } catch { return []; }
}

function allowed(u: AdminUser, role: AdminRole) { return u.role === 'super_admin' || (role === 'admin' && u.role === 'admin'); }
function auditId(correlationId: string) { return `audit:${correlationId}`; }

async function auditWrite(env: Env, u: AdminUser, action: string, targetType: string, targetId: string, correlationId: string, reason: string, before?: any, after?: any) {
  return { update: { name: fullName(env, `adminAudit/${encodeURIComponent(auditId(correlationId))}`), fields: {
    actorUid: jsonValue(u.uid), actorRole: jsonValue(u.role || 'admin'), action: jsonValue(action), targetType: jsonValue(targetType), targetId: jsonValue(targetId),
    reason: jsonValue(reason.slice(0, 1000)), correlationId: jsonValue(correlationId), timestamp: { timestampValue: new Date().toISOString() },
    before: jsonValue(before ? redact(before) : null), after: jsonValue(after ? redact(after) : null),
  } }, currentDocument: { exists: false } };
}
function redact(value: any): any {
  if (!value || typeof value !== 'object') return value;
  const secretWords = /secret|private|token|password|credential|key/i;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !secretWords.test(key)).map(([key, item]) => [key, item && typeof item === 'object' ? redact(item) : item]));
}

async function identityClaims(env: Env, uid: string) {
  const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
  const endpoint = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID || '')}/accounts:lookup`;
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid] }) });
  if (!response.ok) throw new Error('Identity service unavailable');
  const record = (await response.json() as any).users?.[0];
  let claims: Record<string, unknown> = {};
  try { claims = record?.customAttributes ? JSON.parse(record.customAttributes) : {}; } catch { throw new Error('Invalid identity claims'); }
  return { token, claims };
}

async function setRole(env: Env, actor: AdminUser, targetUid: string, role: AdminRole | null) {
  if (identityOverride) return identityOverride(targetUid, role);
  const current = await identityClaims(env, targetUid);
  const claims = { ...current.claims };
  delete claims.admin;
  delete claims.role;
  delete claims.heavyarRole;
  if (role) { claims.role = role; claims.heavyarRole = role; claims.admin = true; }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID || '')}/accounts:batchUpdate`, { method: 'POST', headers: { Authorization: `Bearer ${current.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [targetUid], customAttributes: JSON.stringify(claims) }) });
  if (!response.ok) throw new Error('Identity service unavailable');
  return { role, previousRole: current.claims.heavyarRole || current.claims.role || null };
}

const TARGET_COLLECTIONS: Record<string, string> = {
  user: 'users', users: 'users', payment: 'payments', payments: 'payments',
  complaint: 'complaints', complaints: 'complaints', request: 'equipmentRequests', requests: 'equipmentRequests', equipmentRequests: 'equipmentRequests',
  provider: 'providerConfigs', providerConfig: 'providerConfigs', providerConfigs: 'providerConfigs', 'provider-config': 'providerConfigs', 'provider-configs': 'providerConfigs', provider_config: 'providerConfigs',
  config: 'heavyarConfig', heavyarConfig: 'heavyarConfig', verification: 'verificationCases', verificationCase: 'verificationCases', verificationCases: 'verificationCases', 'verification-case': 'verificationCases', 'verification-cases': 'verificationCases',
  equipment: 'equipment', listing: 'equipment', listings: 'equipment', refund: 'refunds', refunds: 'refunds',
};

async function action(req: Request, env: Env, u: AdminUser, suppliedBody?: any) {
  let body: any;
  try { body = (suppliedBody || await req.json()) as { action?: string; targetType?: string; targetId?: string; reason?: string; note?: string; amount?: number; role?: AdminRole; enabled?: boolean; priority?: number; status?: string; config?: Record<string, unknown>; payload?: Record<string, unknown>; }; } catch { return { error: 'Invalid JSON body', status: 400 }; }
  const payload = body.payload && typeof body.payload === 'object' ? { ...body, ...body.payload } : body;
  const actionName = String(payload.action || ''), targetType = String(payload.targetType || '');
  let targetId = String(payload.targetId || '');
  const rawTargetType = String(payload.targetType || targetType);
  const collection = TARGET_COLLECTIONS[rawTargetType];
  const normalizedType = collection === 'users' ? 'user' : collection === 'payments' ? 'payment' : collection === 'complaints' ? 'complaint' : collection === 'equipmentRequests' ? 'request' : collection === 'providerConfigs' ? 'providerConfig' : collection === 'heavyarConfig' ? 'config' : collection === 'verificationCases' ? 'verification' : collection;
  const reason = String(payload.reason || payload.note || '').trim();
  const correlationId = String(req.headers.get('X-Correlation-ID') || crypto.randomUUID());
  if (!actionName || !rawTargetType || !collection || !targetId || reason.length < 3 || reason.length > 1000) return { error: 'Invalid action target or reason', status: 400 };
  if (actionName === 'grant_role' || actionName === 'revoke_role') {
    if (!allowed(u, 'super_admin') || normalizedType !== 'user') return { error: 'Super admin required', status: 403 };
    const role: AdminRole | null = actionName === 'grant_role' ? payload.role! : null;
    if (actionName === 'grant_role' && role !== 'admin' && role !== 'super_admin') return { error: 'Invalid role', status: 400 };
    if (targetId === u.uid) return { error: 'Cannot change your own role', status: 409 };
    const intentId = `role-intent:${correlationId}`;
    await commit(env, [{ update: { name: fullName(env, `adminAudit/${encodeURIComponent(intentId)}`), fields: {
      actorUid: jsonValue(u.uid), actorRole: jsonValue(u.role || 'admin'), action: jsonValue('role_change_intent'),
      targetType: jsonValue('user'), targetId: jsonValue(targetId), requestedRole: jsonValue(role), correlationId: jsonValue(correlationId),
      state: jsonValue('pending'), reason: jsonValue(reason), timestamp: { timestampValue: new Date().toISOString() },
    } }, currentDocument: { exists: false } }]);
    let result: { role: AdminRole | null; previousRole: unknown };
    try { result = await setRole(env, u, targetId, role); } catch (error) {
      try { await commit(env, [{ update: { name: fullName(env, `adminAudit/${encodeURIComponent(intentId)}`), fields: { state: jsonValue('claim_update_failed'), error: jsonValue(error instanceof Error ? error.message : 'Identity service unavailable'), finalizedAt: { timestampValue: new Date().toISOString() } } } }]); } catch { /* durable pending intent remains */ }
      throw error;
    }
    await commit(env, [await auditWrite(env, u, actionName, targetType, targetId, correlationId, reason, { role: result.previousRole }, { role })]);
    try { await commit(env, [{ update: { name: fullName(env, `adminAudit/${encodeURIComponent(intentId)}`), fields: { state: jsonValue('finalized'), finalizedAt: { timestampValue: new Date().toISOString() } } } }]); } catch { /* intent already proves durable audit */ }
    return { success: true, correlationId, role };
  }
  const raw = await rawDoc(env, collection, targetId);
  if (!raw?.data || !raw.updateTime) return { error: 'Target not found', status: 404 };
  const current = raw.data;
  let fields: Record<string, any> = {};
  let targetCollection = collection;
  let auditTarget = normalizedType;
  if (normalizedType === 'user' && ['suspend_user', 'unsuspend_user', 'add_user_note'].includes(actionName)) {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    fields = actionName === 'add_user_note' ? { adminNote: jsonValue(reason), adminNoteAt: { timestampValue: new Date().toISOString() }, adminNoteBy: jsonValue(u.uid) } : { suspensionStatus: jsonValue(actionName === 'suspend_user' ? 'temporarily_suspended' : 'active'), suspensionReason: jsonValue(reason), suspensionActor: jsonValue(u.uid), suspensionAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'equipment' && ['hide_equipment', 'unhide_equipment', 'flag_equipment', 'suspend_equipment', 'suspend_listing'].includes(actionName)) {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    fields = actionName === 'hide_equipment' ? { isActive: { booleanValue: false }, moderationStatus: jsonValue('hidden'), moderationReason: jsonValue(reason), moderatedBy: jsonValue(u.uid) } : actionName === 'unhide_equipment' ? { isActive: { booleanValue: true }, moderationStatus: jsonValue('active'), moderationReason: jsonValue(reason), moderatedBy: jsonValue(u.uid) } : actionName === 'suspend_listing' || actionName === 'suspend_equipment' ? { isActive: { booleanValue: false }, moderationStatus: jsonValue('suspended'), moderationReason: jsonValue(reason), moderatedBy: jsonValue(u.uid), moderationAt: { timestampValue: new Date().toISOString() } } : { moderationStatus: jsonValue('flagged'), moderationReason: jsonValue(reason), moderatedBy: jsonValue(u.uid), moderationAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'request') {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    if (actionName === 'cancel_request' && !['pending', 'requested', 'accepted', 'draft'].includes(String(current.status))) return { error: 'Request cannot be cancelled in its current state', status: 409 };
    const statuses: Record<string, string> = { cancel_request: 'cancelled' };
    if (statuses[actionName]) fields = { status: jsonValue(statuses[actionName]), adminIntervention: jsonValue(actionName), adminInterventionReason: jsonValue(reason), adminInterventionBy: jsonValue(u.uid), adminInterventionAt: { timestampValue: new Date().toISOString() } };
    else if (['freeze_request', 'escalate_request', 'investigate_request'].includes(actionName)) fields = { operationsState: jsonValue(actionName === 'freeze_request' ? 'frozen' : actionName === 'escalate_request' ? 'escalated' : 'under_investigation'), adminIntervention: jsonValue(actionName), adminInterventionReason: jsonValue(reason), adminInterventionBy: jsonValue(u.uid), adminInterventionAt: { timestampValue: new Date().toISOString() } };
    else if (actionName === 'add_request_note') fields = { adminNote: jsonValue(reason), adminNoteAt: { timestampValue: new Date().toISOString() }, adminNoteBy: jsonValue(u.uid) };
    else return { error: 'Unsupported request action', status: 400 };
  } else if (normalizedType === 'complaint' && ['resolve_complaint', 'close_complaint', 'review_complaint', 'add_complaint_note'].includes(actionName)) {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    const statuses: Record<string, string> = { review_complaint: 'under_review', resolve_complaint: 'resolved', close_complaint: 'closed' };
    fields = statuses[actionName] ? { status: jsonValue(statuses[actionName]), resolvedBy: jsonValue(u.uid), resolvedAt: { timestampValue: new Date().toISOString() } } : { adminNote: jsonValue(reason), adminNoteBy: jsonValue(u.uid), adminNoteAt: { timestampValue: new Date().toISOString() } };
  } else if ((normalizedType === 'refunds' || normalizedType === 'payment') && actionName === 'request_refund') {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    const payment = normalizedType === 'payment' ? raw : await rawDoc(env, 'payments', String(current.paymentId || current.requestId || ''));
    if (!payment?.data || payment.data.state !== 'paid') return { error: 'Original payment is not paid', status: 409 };
    const requestId = String(payment.data.requestId || current.requestId || targetId);
    const reservation = await rawDoc(env, 'refundReservations', requestId);
    if (reservation) return { error: 'Refund already requested', status: 409 };
    const paidAmount = Number(payment.data.amount);
    if (!Number.isFinite(payload.amount) || Number(payload.amount) <= 0 || Number(payload.amount) > paidAmount) return { error: 'Invalid refund amount', status: 400 };
    targetCollection = 'refunds';
    targetId = `refund:${requestId}`;
    auditTarget = 'refund';
    const refundFields = { requestId: jsonValue(requestId), paymentId: jsonValue(String(payment.data.paymentId || current.paymentId || '')), originalPaidAmount: { doubleValue: paidAmount }, amount: { doubleValue: Number(payload.amount) }, currency: jsonValue('SAR'), state: jsonValue('refund_requested'), execution: jsonValue('disabled'), requestedBy: jsonValue(u.uid), reason: jsonValue(reason), requestedAt: { timestampValue: new Date().toISOString() } };
    const writes = [
      { update: { name: fullName(env, `refundReservations/${encodeURIComponent(requestId)}`), fields: { refundId: jsonValue(targetId), createdAt: { timestampValue: new Date().toISOString() } } }, currentDocument: { exists: false } },
      { update: { name: fullName(env, `${targetCollection}/${encodeURIComponent(targetId)}`), fields: refundFields }, currentDocument: { exists: false } },
      await auditWrite(env, u, actionName, auditTarget, targetId, correlationId, reason, undefined, Object.fromEntries(Object.entries(refundFields).map(([key, value]) => [key, decodeValue(value)]))),
    ];
    await commit(env, writes);
    return { success: true, correlationId, action: actionName, targetId };
  } else if (normalizedType === 'providerConfig' && actionName === 'update_provider_config') {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    if (typeof payload.enabled !== 'boolean' || !Number.isInteger(payload.priority) || Number(payload.priority) < 1 || Number(payload.priority) > 100) return { error: 'Invalid provider configuration', status: 400 };
    fields = { enabled: { booleanValue: payload.enabled }, priority: { integerValue: String(payload.priority) }, updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'config' && actionName === 'update_config') {
    if (!allowed(u, 'super_admin')) return { error: 'Super admin required', status: 403 };
    if (!payload.config || Object.keys(payload.config).some(key => /secret|private|token|password|credential|key/i.test(key))) return { error: 'Only non-secret configuration is allowed', status: 400 };
    fields = { ...Object.fromEntries(Object.entries(payload.config).map(([key, value]) => [key, jsonValue(value)])), version: { integerValue: String(Number(current.version || 0) + 1) }, updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'verification' && actionName === 'update_verification') {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    if (!['pending', 'approved', 'rejected', 'needs_review'].includes(String(payload.status))) return { error: 'Invalid verification state', status: 400 };
    fields = { status: jsonValue(payload.status), reviewedBy: jsonValue(u.uid), reviewedAt: { timestampValue: new Date().toISOString() }, reason: jsonValue(reason) };
  } else return { error: 'Unsupported action', status: 400 };
  const writes = [{ update: { name: fullName(env, `${targetCollection}/${encodeURIComponent(targetId)}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: raw.updateTime } }, await auditWrite(env, u, actionName, auditTarget, targetId, correlationId, reason, current, Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)])))];
  await commit(env, writes);
  return { success: true, correlationId, action: actionName, targetId };
}

export async function requireAdmin(u: AdminUser) {
  if (u.role !== 'admin' && u.role !== 'super_admin') throw new Error('ADMIN_REQUIRED');
  return u;
}

export async function handleAdmin(req: Request, env: Env, user: AdminUser) {
  await requireAdmin(user);
  const url = new URL(req.url);
  if (url.pathname === '/api/admin/session' && req.method === 'GET') return { success: true, uid: user.uid, role: user.role };
  if (url.pathname === '/api/admin/action' && req.method === 'POST') return action(req, env, user);
  if (url.pathname === '/api/admin/roles' && req.method === 'POST') {
    let body: any;
    try { body = await req.json(); } catch { return { error: 'Invalid JSON body', status: 400 }; }
    const operation = String(body.action || body.operation || '');
    if (!['grant', 'revoke', 'grant_role', 'revoke_role'].includes(operation)) return { error: 'Invalid role operation', status: 400 };
    return action(req, env, user, { ...body, action: operation === 'grant' ? 'grant_role' : operation === 'revoke' ? 'revoke_role' : operation, targetType: 'user', targetId: body.targetId || body.uid });
  }
  if (req.method !== 'GET') return { error: 'Method not allowed', status: 405 };
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 30)));
  const cursor = url.searchParams.get('cursor');
  const pathMap: Record<string, string> = {
    '/api/admin/users': 'users', '/api/admin/providers': 'users', '/api/admin/equipment': 'equipment', '/api/admin/requests': 'equipmentRequests',
    '/api/admin/payments': 'payments', '/api/admin/invoices': 'invoices', '/api/admin/refunds': 'refunds', '/api/admin/complaints': 'complaints',
    '/api/admin/verification': 'verificationCases', '/api/admin/provider-configs': 'providerConfigs', '/api/admin/config': 'heavyarConfig', '/api/admin/audit': 'adminAudit',
  };
  if (url.pathname === '/api/admin/overview') {
    const requestStatuses = ['pending', 'requested', 'accepted', 'in_progress', 'completion_requested', 'under_investigation', 'escalated'];
    const paymentStates = ['created', 'pending', 'requires_action', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refund_pending', 'refunded', 'partially_refunded'];
    const [users, providers, equipment, requests, payments, invoices, complaints, suspended, paidVolume, pendingVolume, failedPayments, recent] = await Promise.all([
      countCollection(env, 'users'),
      countCollection(env, 'users', { field: 'role', value: 'provider' }),
      countCollection(env, 'equipment', { field: 'isActive', value: true }),
      Promise.all(requestStatuses.map(status => countCollection(env, 'equipmentRequests', { field: 'status', value: status }))),
      countCollection(env, 'payments'),
      countCollection(env, 'invoices'),
      countCollection(env, 'complaints', { field: 'status', value: 'open' }),
      Promise.all(['temporarily_suspended', 'permanently_suspended'].map(status => countCollection(env, 'users', { field: 'suspensionStatus', value: status }))),
      aggregateCollection(env, 'payments', { field: 'state', value: 'paid' }, 'amount'),
      aggregateCollection(env, 'payments', { field: 'state', value: 'pending' }, 'amount'),
      countCollection(env, 'payments', { field: 'state', value: 'failed' }),
      recentAudit(env),
    ]);
    const requestsByStatus = Object.fromEntries(requestStatuses.map((status, index) => [status, (requests as any[])[index]]));
    const paymentCounts = await Promise.all(paymentStates.map(status => countCollection(env, 'payments', { field: 'state', value: status })));
    const paymentsByState = Object.fromEntries(paymentStates.map((status, index) => [status, paymentCounts[index]]));
    return { success: true, metrics: {
      totalUsers: users, activeProviders: providers, listings: equipment, equipmentListings: equipment,
      activeRequests: (requests as any[]).reduce((sum, value) => sum + (Number(value) || 0), 0),
      requestsByStatus, payments: payments, paymentsByState, paidSarVolume: paidVolume, pendingSarVolume: pendingVolume,
      failedPayments, openComplaints: complaints, suspendedAccounts: suspended,
      recentAuditEvents: recent, invoices,
    } };
  }
  const detailMatch = url.pathname.match(/^\/api\/admin\/detail\/([^/]+)\/([^/]+)$/);
  if (detailMatch) {
    const collection = detailMatch[1] === 'request' ? 'equipmentRequests' : detailMatch[1];
    if (!FILTERS[collection]) return { error: 'Not found', status: 404 };
    const raw = await rawDoc(env, collection, decodeURIComponent(detailMatch[2]));
    if (!raw?.data) return { error: 'Not found', status: 404 };
    return { success: true, item: { id: decodeURIComponent(detailMatch[2]), ...redact(raw.data) } };
  }
  const collection = pathMap[url.pathname];
  if (!collection) return { error: 'Not found', status: 404 };
  const query = Object.fromEntries(url.searchParams.entries());
  if (url.pathname === '/api/admin/providers') query.role = 'provider';
  if (query.q) {
    const q = query.q.trim();
    if (!q || q.length > 200) return { error: 'Invalid search query', status: 400 };
    const exactField = collection === 'users' ? 'emailLower' : collection === 'equipment' ? 'slug' : collection === 'equipmentRequests' || collection === 'payments' || collection === 'invoices' || collection === 'complaints' ? 'requestId' : null;
    if (!exactField && !['users', 'equipment', 'equipmentRequests', 'payments', 'invoices', 'complaints'].includes(collection)) return { error: 'Search supports exact document IDs only for this resource', status: 400 };
    const direct = await rawDoc(env, collection, q);
    if (direct?.data) return { success: true, items: [{ id: q, ...redact(direct.data) }] };
    if (!exactField) return { success: true, items: [] };
    query[exactField] = q.toLowerCase();
  }
  return { success: true, ...(await listCollection(env, collection, query, limit, cursor)) };
}
