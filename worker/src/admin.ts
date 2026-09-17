import type { Env } from './index';
import { canTransitionManualReview, deriveProviderTrust, isProviderComponentName, normalizeRequiredProviderComponents, providerComponentNames, providerVerificationFor, verificationStatuses } from './verification';
import { normalizeVerificationPolicy } from './verification';
import { notificationWrite } from './notifications';
import { gatewayRegistry, campaignRecipients, invitationExpiry, ownerTransferAllowed, normalizeStaffRole, hasPermission, type StaffRole, type Permission } from './completion';

export type AdminRole = 'super_admin' | 'admin';
export type AdminUser = { uid: string; admin: boolean; role?: AdminRole; permissionRole?: string; email?: string; authTime?: number; testInjected?: true };

type RawDoc = { data: any; updateTime?: string; name?: string };
let firestoreOverride: ((collection: string, id: string) => any) | undefined;
let commitOverride: unknown[][] | undefined;
let identityOverride: ((uid: string, role: StaffRole | null) => Promise<{ role: StaffRole | null; previousRole: unknown }>) | undefined;
let queryOverride: ((collection: string, before: string, limit: number) => RawDoc[]) | undefined;
export const __adminTest = {
  setFirestore(fn?: (collection: string, id: string) => any) { firestoreOverride = fn; },
  captureCommits(target?: unknown[][]) { commitOverride = target; },
  setIdentity(fn?: (uid: string, role: StaffRole | null) => Promise<{ role: StaffRole | null; previousRole: unknown }>) { identityOverride = fn; },
  setQuery(fn?: (collection: string, before: string, limit: number) => RawDoc[]) { queryOverride = fn; },
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
  const safeWrites = (writes as any[]).map(write => String(write?.update?.name || '').includes('/notificationOutbox/')
    ? { ...write, currentDocument: undefined } : write);
  await fs(env, ':commit', { method: 'POST', body: JSON.stringify({ writes: safeWrites }) });
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
  verificationProfiles: ['uid', 'overallTrust.status', 'identity.status'],
  verificationAttempts: ['uid', 'status', 'provider', 'verificationType'],
  verificationEvents: ['uid', 'attemptId', 'type', 'status'],
  verificationPolicies: ['enabled'],
  providerConfigs: ['enabled', 'environment'],
  heavyarConfig: ['key'],
  adminAudit: ['actorUid', 'action', 'targetType'],
  notificationDeliveries: ['status', 'uid'],
  notifications: ['uid', 'category', 'read'],
  deviceTokens: ['uid', 'active', 'platform'],
  deletionRequests: ['uid', 'status', 'refreshTokenRevocationStatus'],
  driverProfiles: ['active', 'region', 'city', 'moderationStatus'],
  driverRequests: ['driverUid', 'requesterUid', 'status'],
  campaigns: ['status', 'createdBy'],
  staffMembers: ['role', 'active'],
  staffInvitations: ['status', 'email'],
  paymentGateways: ['enabled'],
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
async function notificationHealth(env: Env) {
  const [success, permanent, retryable, ticketed, queued, active, deactivated] = await Promise.all([
    countCollection(env, 'notificationDeliveries', { field: 'status', value: 'success' }),
    countCollection(env, 'notificationDeliveries', { field: 'status', value: 'permanent' }),
    countCollection(env, 'notificationDeliveries', { field: 'status', value: 'retryable' }),
    countCollection(env, 'notificationDeliveries', { field: 'status', value: 'ticketed' }),
    countCollection(env, 'notificationOutbox', { field: 'status', value: 'pending' }),
    countCollection(env, 'deviceTokens', { field: 'active', value: true }),
    countCollection(env, 'deviceTokens', { field: 'active', value: false }),
    countCollection(env, 'notifications', { field: 'read', value: false }),
  ]);
  let recent: any[] = [];
  try {
    const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'notificationDeliveries' }],
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'retryable' } } },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 10,
    } }) }) as any[] || [];
    recent = rows.filter(row => row.document).map(row => { const d = decode(row.document); return {
      id: String(row.document.name).split('/').pop(), category: d.category || 'unknown', event: d.event || 'unknown',
      retryable: d.status === 'retryable', reasonCode: d.errorCode || 'unknown', createdAt: d.createdAt,
    }; });
  } catch { /* health remains available when delivery storage is degraded */ }
  return { success: true, health: { deliveries: { success, permanent, retryable, ticketed }, pending: Number(ticketed || 0) + Number(queued || 0), activeDevices: active, deactivatedTokens: deactivated }, recent };
}
async function cleanupNotificationDeliveries(req: Request, env: Env) {
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const limit = Number(body.limit || 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { error: 'Invalid cleanup limit', status: 400 };
  const before = new Date(Date.now() - 30 * 86400000).toISOString();
  const response = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notificationDeliveries' }], where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'LESS_THAN', value: { timestampValue: before } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }], limit } }) }) as any[] || [];
  const writes = response.filter(x => x.document).map(x => ({ delete: x.document.name, currentDocument: { updateTime: x.document.updateTime } }));
  if (writes.length) await commit(env, writes);
  return { success: true, deleted: writes.length, hasMore: response.length >= limit };
}
async function retryNotificationDeliveries(req: Request, env: Env) {
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const limit = Number(body.limit || 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { error: 'Invalid retry limit', status: 400 };
  const response = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notificationDeliveries' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'retryable' } } }, limit } }) }) as any[] || [];
  const now = new Date().toISOString();
  const writes = response.filter(x => x.document).map(x => {
    const d = decode(x.document), attempts = Number(d.attempts || 0);
    return { update: { name: x.document.name, fields: { attempts: { integerValue: String(Math.min(5, attempts + 1)) }, nextAttemptAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['attempts', 'nextAttemptAt'] }, currentDocument: { updateTime: x.document.updateTime } };
  }).filter((x: any, index: number) => Number(decode(response[index]?.document).attempts || 0) < 5);
  if (writes.length) await commit(env, writes);
  return { success: true, queued: writes.length, hasMore: response.length >= limit };
}

function allowed(u: AdminUser, role: AdminRole) { return u.role === 'super_admin' || (role === 'admin' && u.role === 'admin'); }
function can(u: AdminUser, permission: Permission) {
  const role = normalizeStaffRole(u.permissionRole || u.role);
  return hasPermission(role, permission);
}
async function listingRentalState(env: Env, equipmentId: string) {
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'equipmentRequests' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'equipmentId' }, op: 'EQUAL', value: jsonValue(equipmentId) } },
      { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: ['pending', 'accepted', 'in_progress', 'completion_requested'].map((x) => jsonValue(x)) } } } },
    ] } }, limit: 1,
  } }) }) as any[] || [];
  return rows.some((row) => row.document);
}
function auditId(correlationId: string) { return `audit:${correlationId}`; }
export function claimSyncWrite(env: Env, uid: string, role: StaffRole | null, active: boolean, version = 1) {
  const id = `staffClaimSync:${uid}:${version}`;
  return { update: { name: fullName(env, `staffClaimSync/${encodeURIComponent(id)}`), fields: {
    uid: jsonValue(uid), desiredRole: jsonValue(role), desiredActive: { booleanValue: active }, desiredVersion: { integerValue: String(version) },
    status: jsonValue('pending'), attempts: { integerValue: '0' }, nextAttemptAt: { timestampValue: new Date().toISOString() }, createdAt: { timestampValue: new Date().toISOString() },
  } }, currentDocument: { exists: false } };
}
async function claimSyncComplete(env: Env, uid: string, version = 1) {
  await commit(env, [{ update: { name: fullName(env, `staffClaimSync/${encodeURIComponent(`staffClaimSync:${uid}:${version}`)}`), fields: { status: jsonValue('completed'), completedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'completedAt'] } }]);
}
export async function processStaffClaimSync(env: Env) {
  const rows = queryOverride ? queryOverride('staffClaimSync', '', 25).map((item) => ({ document: { name: item.name || '', updateTime: item.updateTime, fields: Object.fromEntries(Object.entries(item.data || {}).map(([key, value]) => [key, jsonValue(value)])) } })) : await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'staffClaimSync' }],
    where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: jsonValue('pending') } },
    orderBy: [{ field: { fieldPath: 'nextAttemptAt' }, direction: 'ASCENDING' }], limit: 25,
  } }) }) as any[] || [];
  for (const row of rows.filter((x) => x.document)) {
    const job = decode(row.document), uid = String(job.uid || ''), attempts = Number(job.attempts || 0);
    if (!uid || (job.nextAttemptAt && Date.parse(String(job.nextAttemptAt)) > Date.now())) continue;
    try {
      const currentStaff = await rawDoc(env, 'staffMembers', uid);
      if (Number(currentStaff?.data?.roleVersion || 0) > Number(job.desiredVersion || 0)) {
        await commit(env, [{ update: { name: row.document.name, fields: { status: jsonValue('superseded'), supersededAt: { timestampValue: new Date().toISOString() } }, }, updateMask: { fieldPaths: ['status', 'supersededAt'] }, currentDocument: { updateTime: row.document.updateTime } }]);
        continue;
      }
      const lockId = encodeURIComponent(uid), lock = await rawDoc(env, 'staffClaimSyncLocks', lockId), leaseToken = crypto.randomUUID();
      if (lock?.data?.expiresAt && Date.parse(String(lock.data.expiresAt)) > Date.now()) continue;
      const renewLease = async () => {
        const current = await rawDoc(env, 'staffClaimSyncLocks', lockId);
        if (current?.data?.leaseToken !== leaseToken && current?.data?.leaseToken !== undefined) throw new Error('LEASE_LOST');
        const expiresAt = new Date(Date.now() + 120000).toISOString();
        await commit(env, [{ update: { name: fullName(env, `staffClaimSyncLocks/${lockId}`), fields: { uid: jsonValue(uid), jobId: jsonValue(String(row.document.name)), leaseToken: jsonValue(leaseToken), expiresAt: { timestampValue: expiresAt } } }, currentDocument: current?.updateTime ? { updateTime: current.updateTime } : { exists: false } }]);
        return expiresAt;
      };
      await renewLease();
      let stable = false;
      for (let attempt = 0; attempt < 3 && !stable; attempt++) {
        const before = await rawDoc(env, 'staffMembers', uid), version = Number(before?.data?.roleVersion || 0);
        await renewLease();
        await setRole(env, { uid: 'system', admin: true, role: 'super_admin' }, uid, before?.data?.active === true ? normalizeStaffRole(before.data.role) : null);
        const after = await rawDoc(env, 'staffMembers', uid);
        if (Number(after?.data?.roleVersion || 0) === version) {
          if (version === Number(job.desiredVersion || 0)) {
            await commit(env, [{ update: { name: row.document.name, fields: { status: jsonValue('completed'), completedAt: { timestampValue: new Date().toISOString() }, attempts: { integerValue: String(attempts + 1) } } }, updateMask: { fieldPaths: ['status', 'completedAt', 'attempts'] }, currentDocument: { updateTime: row.document.updateTime } }]);
          } else {
            await claimSyncComplete(env, uid, version);
            await commit(env, [{ update: { name: row.document.name, fields: { status: jsonValue('superseded'), supersededAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'supersededAt'] }, currentDocument: { updateTime: row.document.updateTime } }]);
          }
          stable = true;
        }
      }
      const finalLock = await rawDoc(env, 'staffClaimSyncLocks', lockId);
      if (stable && finalLock?.data?.leaseToken === leaseToken) await commit(env, [{ delete: fullName(env, `staffClaimSyncLocks/${lockId}`), currentDocument: { updateTime: finalLock.updateTime } }]);
      if (!stable) throw new Error('Claim reconciliation exhausted');
    } catch {
      const nextAttempts = attempts + 1, delay = Math.min(3600, 30 * (2 ** Math.min(nextAttempts, 7))), next = new Date(Date.now() + delay * 1000).toISOString();
      await commit(env, [{ update: { name: row.document.name, fields: { status: jsonValue('pending'), attempts: { integerValue: String(nextAttempts) }, nextAttemptAt: { timestampValue: next }, lastError: jsonValue('identity_sync_failed') } }, updateMask: { fieldPaths: ['status', 'attempts', 'nextAttemptAt', 'lastError'] }, currentDocument: { updateTime: row.document.updateTime } }, {
        update: { name: fullName(env, `adminAudit/claim-sync:${encodeURIComponent(uid)}:${nextAttempts}`), fields: { actorUid: jsonValue('system'), action: jsonValue('claim_sync_pending'), targetType: jsonValue('staff'), targetId: jsonValue(uid), reason: jsonValue('Identity claim synchronization retry scheduled'), timestamp: { timestampValue: new Date().toISOString() } } }, currentDocument: { exists: false },
      }]);
    }
  }
}

async function auditWrite(env: Env, u: AdminUser, action: string, targetType: string, targetId: string, correlationId: string, reason: string, before?: any, after?: any) {
  return { update: { name: fullName(env, `adminAudit/${encodeURIComponent(auditId(correlationId))}`), fields: {
    actorUid: jsonValue(u.uid), actorRole: jsonValue(u.role || 'admin'), action: jsonValue(action), targetType: jsonValue(targetType), targetId: jsonValue(targetId),
    reason: jsonValue(reason.slice(0, 1000)), correlationId: jsonValue(correlationId), timestamp: { timestampValue: new Date().toISOString() },
    before: jsonValue(before ? redact(before) : null), after: jsonValue(after ? redact(after) : null),
  } }, currentDocument: { exists: false } };
}
function redact(value: any): any {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  // References, correlation values, raw provider material and identity
  // documents are operationally unnecessary in browser responses.
  const sensitiveWords = /secret|private|token|password|credential|key|correlation|reference|raw|payload|document|national|identitynumber|iban/i;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitiveWords.test(key))
    .map(([key, item]) => [key, item && typeof item === 'object' ? redact(item) : item]));
}

function validCorrelationId(value: string) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

async function campaignEstimate(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'marketing.campaign')) return { error: 'Marketing permission required', status: 403 };
  const body: any = await req.json().catch(() => null), filter = body?.filter || { audience: 'all' };
  if (!['all', 'customers', 'providers', 'drivers'].includes(filter.audience)) return { error: 'Invalid audience', status: 400 };
  // Estimation is intentionally bounded; delivery itself walks the audience
  // with cursors and never truncates at an estimate cap.
  return { success: true, estimate: { recipients: null, chunks: null, estimated: true, suppressedOptOut: true } };
}
async function campaignCreate(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'marketing.campaign')) return { error: 'Marketing permission required', status: 403 };
  const body: any = await req.json().catch(() => null), title = String(body?.title || body?.titleEn || body?.titleAr || '').trim(), message = String(body?.message || body?.bodyEn || body?.bodyAr || '').trim();
  if (title.length < 1 || title.length > 160 || message.length < 1 || message.length > 2000) return { error: 'Invalid campaign content', status: 400 };
  const deepLink = body?.deepLink === undefined ? undefined : String(body.deepLink);
  if (deepLink !== undefined && !/^heavyar:\/\/[A-Za-z0-9/_?=&.-]{1,300}$/.test(deepLink)) return { error: 'Invalid campaign link', status: 400 };
  const filter = body?.filter || { audience: 'all' };
  if (!['all', 'customers', 'providers', 'drivers'].includes(filter.audience) || (filter.region !== undefined && typeof filter.region !== 'string') || (filter.city !== undefined && typeof filter.city !== 'string')) return { error: 'Invalid audience filter', status: 400 };
  if (body?.imageUrl !== undefined && !/^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9/_?=&.-]*)?$/.test(String(body.imageUrl))) return { error: 'Invalid campaign image', status: 400 };
  const id = crypto.randomUUID(), now = new Date().toISOString(), sendNow = !body?.scheduledAt || Date.parse(String(body.scheduledAt)) <= Date.now();
  const fields = { title: jsonValue(title), message: jsonValue(message), titleAr: jsonValue(String(body?.titleAr || title)), titleEn: jsonValue(String(body?.titleEn || title)), bodyAr: jsonValue(String(body?.bodyAr || message)), bodyEn: jsonValue(String(body?.bodyEn || message)), ...(body?.imageUrl ? { imageUrl: jsonValue(String(body.imageUrl)) } : {}), ...(deepLink ? { deepLink: jsonValue(deepLink) } : {}), filter: jsonValue(filter), recipientCount: { integerValue: '0' }, status: jsonValue(sendNow ? 'scheduled' : 'scheduled'), scheduledAt: { timestampValue: body?.scheduledAt ? String(body.scheduledAt) : now }, recipientCursor: { nullValue: null }, chunkId: { nullValue: null }, createdBy: jsonValue(user.uid), createdAt: { timestampValue: now } };
  await commit(env, [{ update: { name: fullName(env, `campaigns/${id}`), fields }, currentDocument: { exists: false } }, await auditWrite(env, user, 'campaign_create', 'campaign', id, crypto.randomUUID(), 'marketing campaign')]);
  if (sendNow) env.__executionCtx?.waitUntil(processScheduledCampaigns(env));
  return { success: true, campaignId: id, status: sendNow ? 'queued' : 'scheduled', recipients: null };
}
export async function processScheduledCampaigns(env: Env) {
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'campaigns' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: ['scheduled', 'processing'].map(jsonValue) } } } }, limit: 10 } }) }) as any[] || [];
  for (const row of rows) {
    if (!row.document) continue;
    const campaign = decode(row.document), scheduledAt = Date.parse(String(campaign.scheduledAt || ''));
    if (!Number.isFinite(scheduledAt) || scheduledAt > Date.now()) continue;
    const id = String(row.document.name).split('/').pop(), now = new Date().toISOString();
    const custom = { titleAr: campaign.titleAr || campaign.title, titleEn: campaign.titleEn || campaign.title, bodyAr: campaign.bodyAr || campaign.message, bodyEn: campaign.bodyEn || campaign.message, imageUrl: campaign.imageUrl, deepLink: campaign.deepLink };
    try {
      const users = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 301, ...(campaign.recipientCursor ? { startAt: { before: false, values: [{ referenceValue: campaign.recipientCursor }] } } : {}) } }) }) as any[] || [];
      const page = users.filter((x) => x.document).slice(0, 300);
      const prefDocs = await Promise.all(page.map((x: any) => fs(env, `notificationPreferences/${encodeURIComponent(String(x.document.name).split('/').pop() || '')}`)));
      const optedOut = new Set(page.flatMap((x: any, index: number) => prefDocs[index] && decode(prefDocs[index]).marketing === false ? [String(x.document.name).split('/').pop()] : []));
      const recipients = campaignRecipients(page.map((x) => ({ uid: String(x.document.name).split('/').pop(), ...decode(x.document), marketingOptOut: optedOut.has(String(x.document.name).split('/').pop()) })) as any, campaign.filter || { audience: 'all' });
      const writes: any[] = await Promise.all(recipients.map((uid) => notificationWrite(fullName.bind(null, env), uid, 'campaign_message' as any, now, id, `campaign:${id}:${uid}`, custom)));
      const last = page[page.length - 1]?.document?.name, done = users.length <= 300;
      writes.push({ update: { name: row.document.name, fields: { status: jsonValue(done ? 'sent' : 'processing'), recipientCursor: last ? jsonValue(last) : { nullValue: null }, chunkId: jsonValue(`${id}:${last || 'complete'}`), recipientCount: { integerValue: String(Number(campaign.recipientCount || 0) + recipients.length), ...(done ? {} : {}) }, ...(done ? { sentAt: { timestampValue: now } } : {}) } }, updateMask: { fieldPaths: ['status', 'recipientCursor', 'chunkId', 'recipientCount', ...(done ? ['sentAt'] : [])] }, currentDocument: { updateTime: row.document.updateTime } });
      await commit(env, writes);
    } catch { /* retry on the next scheduled tick; deterministic outbox ids make retry safe */ }
  }
}

function verificationEventWrite(env: Env, uid: string, attemptId: string, type: string, status: string, actorUid: string, correlationId: string, reason: string) {
  return {
    update: { name: fullName(env, `verificationEvents/${encodeURIComponent(`${attemptId}:${type}:${correlationId}`)}`), fields: {
      uid: jsonValue(uid), attemptId: jsonValue(attemptId), type: jsonValue(type), status: jsonValue(status),
      actorUid: jsonValue(actorUid), correlationId: jsonValue(correlationId), reasonCode: jsonValue(reason.slice(0, 1000)),
      timestamp: { timestampValue: new Date().toISOString() },
    } }, currentDocument: { exists: false },
  };
}

async function expiredVerificationAttempts(env: Env, before: string, limit: number): Promise<RawDoc[]> {
  if (queryOverride) return queryOverride('verificationAttempts', before, limit)
    .filter(item => item.data?.expiresAt && Date.parse(String(item.data.expiresAt)) < Date.parse(before))
    .slice(0, limit);
  const response = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'verificationAttempts' }],
    where: { fieldFilter: { field: { fieldPath: 'expiresAt' }, op: 'LESS_THAN', value: { timestampValue: before } } },
    orderBy: [{ field: { fieldPath: 'expiresAt' }, direction: 'ASCENDING' }],
    limit,
  } }) }) as any[] || [];
  return response.filter(item => item.document).map(item => ({
    data: decode(item.document), updateTime: item.document.updateTime, name: item.document.name,
  }));
}

async function cleanupVerificationRetention(req: Request, env: Env, user: AdminUser) {
  if (!allowed(user, 'super_admin')) return { error: 'Super admin required', status: 403 };
  let body: { limit?: unknown; reason?: unknown } = {};
  try { body = await req.json() as typeof body; } catch { return { error: 'Invalid JSON body', status: 400 }; }
  const limit = body.limit === undefined ? 25 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) return { error: 'Invalid cleanup limit', status: 400 };
  const supplied = req.headers.get('X-Correlation-ID');
  const correlationId = supplied || crypto.randomUUID();
  if (!validCorrelationId(correlationId)) return { error: 'Invalid correlation ID', status: 400 };
  const retentionDays = Number(env.VERIFICATION_RETENTION_DAYS === undefined ? 30 : env.VERIFICATION_RETENTION_DAYS);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) return { error: 'Verification retention configuration unavailable', status: 503 };
  const before = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const attempts = await expiredVerificationAttempts(env, before, limit);
  const deletes = attempts
    .filter(item => item.name && item.updateTime)
    .map(item => ({ delete: item.name, currentDocument: { updateTime: item.updateTime } }));
  const reason = typeof body.reason === 'string' && body.reason.trim().length >= 3 ? body.reason.trim() : 'retention_cleanup';
  const audit = await auditWrite(env, user, 'verification_retention_cleanup', 'verificationAttempt', `before:${before}`, correlationId, reason, undefined, { deletedAttempts: deletes.length, retentionDays });
  await commit(env, [...deletes, audit]);
  return { success: true, correlationId, deletedAttempts: deletes.length, retentionDays };
}

async function identityClaims(env: Env, uid: string, signal?: AbortSignal) {
  const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
  const endpoint = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID || '')}/accounts:lookup`;
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid] }), signal });
  if (!response.ok) throw new Error('Identity service unavailable');
  const record = (await response.json() as any).users?.[0];
  let claims: Record<string, unknown> = {};
  try { claims = record?.customAttributes ? JSON.parse(record.customAttributes) : {}; } catch { throw new Error('Invalid identity claims'); }
  return { token, claims };
}

async function setRole(env: Env, actor: AdminUser, targetUid: string, role: StaffRole | null) {
  if (identityOverride) return identityOverride(targetUid, role);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const current = await identityClaims(env, targetUid, controller.signal);
  const claims = { ...current.claims };
  delete claims.admin;
  delete claims.role;
  delete claims.heavyarRole;
  if (role) { claims.role = role; claims.heavyarRole = role; claims.admin = true; }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID || '')}/accounts:batchUpdate`, { method: 'POST', headers: { Authorization: `Bearer ${current.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [targetUid], customAttributes: JSON.stringify(claims) }), signal: controller.signal });
  if (!response.ok) throw new Error('Identity service unavailable');
  return { role, previousRole: current.claims.heavyarRole || current.claims.role || null };
  } finally { clearTimeout(timer); }
}

const TARGET_COLLECTIONS: Record<string, string> = {
  user: 'users', users: 'users', payment: 'payments', payments: 'payments',
  complaint: 'complaints', complaints: 'complaints', request: 'equipmentRequests', requests: 'equipmentRequests', equipmentRequests: 'equipmentRequests',
  provider: 'providerConfigs', providerConfig: 'providerConfigs', providerConfigs: 'providerConfigs', 'provider-config': 'providerConfigs', 'provider-configs': 'providerConfigs', provider_config: 'providerConfigs',
  config: 'heavyarConfig', heavyarConfig: 'heavyarConfig', verification: 'verificationCases', verificationCase: 'verificationCases', verificationCases: 'verificationCases', 'verification-case': 'verificationCases', 'verification-cases': 'verificationCases',
  verificationPolicy: 'verificationPolicies', verificationPolicies: 'verificationPolicies',
  verificationProfile: 'verificationProfiles', verificationProfiles: 'verificationProfiles',
  verificationAttempt: 'verificationAttempts', verificationAttempts: 'verificationAttempts',
  equipment: 'equipment', listing: 'equipment', listings: 'equipment', refund: 'refunds', refunds: 'refunds',
  driverProfile: 'driverProfiles', driverProfiles: 'driverProfiles',
  paymentGateway: 'paymentGateways', paymentGateways: 'paymentGateways',
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
  if (!validCorrelationId(correlationId)) return { error: 'Invalid correlation ID', status: 400 };
  if (!actionName || !rawTargetType || !collection || !targetId || reason.length < 3 || reason.length > 1000) return { error: 'Invalid action target or reason', status: 400 };
  if (actionName === 'grant_role' || actionName === 'revoke_role') {
    if (!can(u, 'staff.manage') || normalizedType !== 'user') return { error: 'Staff management permission required', status: 403 };
    const role: StaffRole | null = actionName === 'grant_role' ? normalizeStaffRole(payload.role) : null;
    if (actionName === 'grant_role' && !role) return { error: 'Invalid role', status: 400 };
    if (targetId === u.uid) return { error: 'Cannot change your own role', status: 409 };
    const existingStaff = u.testInjected ? null : await rawDoc(env, 'staffMembers', targetId), roleVersion = Number(existingStaff?.data?.roleVersion || 0) + 1;
    const intentId = `role-intent:${correlationId}`;
    await commit(env, [{ update: { name: fullName(env, `adminAudit/${encodeURIComponent(intentId)}`), fields: {
      actorUid: jsonValue(u.uid), actorRole: jsonValue(u.role || 'admin'), action: jsonValue('role_change_intent'),
      targetType: jsonValue('user'), targetId: jsonValue(targetId), requestedRole: jsonValue(role), correlationId: jsonValue(correlationId),
      state: jsonValue('pending'), reason: jsonValue(reason), timestamp: { timestampValue: new Date().toISOString() },
    } }, currentDocument: { exists: false } }]);
    const now = new Date().toISOString(), staffFields = actionName === 'grant_role'
      ? { uid: jsonValue(targetId), role: jsonValue(role), active: { booleanValue: true }, roleVersion: { integerValue: String(roleVersion) }, updatedAt: { timestampValue: now } }
      : { active: { booleanValue: false }, revokedAt: { timestampValue: now }, roleVersion: { integerValue: String(roleVersion) } };
    await commit(env, [
      { update: { name: fullName(env, `staffMembers/${encodeURIComponent(targetId)}`), fields: staffFields }, updateMask: { fieldPaths: Object.keys(staffFields) }, currentDocument: existingStaff?.updateTime ? { updateTime: existingStaff.updateTime } : { exists: false } },
      claimSyncWrite(env, targetId, role, actionName === 'grant_role', roleVersion),
      await auditWrite(env, u, actionName, 'staff', targetId, correlationId, reason, undefined, { role, active: actionName === 'grant_role' }),
    ]);
    env.__executionCtx?.waitUntil(processStaffClaimSync(env));
    return { success: true, correlationId, role, active: actionName === 'grant_role' };
  }
  let targetCollection = collection;
  let auditTarget = normalizedType;
  const raw = await rawDoc(env, collection, targetId);
  const isDefaultVerificationPolicy = targetCollection === 'verificationPolicies' && targetId === 'default' && actionName === 'update_verification_policy';
  if ((!raw?.data || !raw.updateTime) && !isDefaultVerificationPolicy && !(normalizedType === 'paymentGateway' && targetId === String(targetId)) && !(normalizedType === 'config' && can(u, 'staff.manage'))) return { error: 'Target not found', status: 404 };
  const current = raw?.data || {};
  let fields: Record<string, any> = {};
  if (normalizedType === 'equipment' && ['archive_listing', 'delete_listing', 'hide_listing', 'show_listing'].includes(actionName)) {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    if (await listingRentalState(env, targetId)) return { error: 'Listing has an active rental', status: 409 };
    if (actionName === 'delete_listing') {
      if (current.ownerUid && current.ownerUid !== u.uid && u.role !== 'super_admin' && u.role !== 'admin') return { error: 'Admin required', status: 403 };
      await commit(env, [{ delete: fullName(env, `equipment/${encodeURIComponent(targetId)}`), currentDocument: { updateTime: raw!.updateTime } }, await auditWrite(env, u, actionName, auditTarget, targetId, correlationId, reason, current, null)]);
      return { success: true, correlationId, action: actionName, targetId };
    }
    fields = actionName === 'archive_listing'
      ? { isActive: jsonValue(false), moderationStatus: jsonValue('archived'), archivedAt: { timestampValue: new Date().toISOString() }, archivedBy: jsonValue(u.uid) }
      : { isActive: jsonValue(actionName === 'show_listing'), moderationStatus: jsonValue(actionName === 'show_listing' ? 'active' : 'hidden'), moderatedBy: jsonValue(u.uid), moderationAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'driverProfile' && ['approve_driver', 'reject_driver', 'suspend_driver'].includes(actionName)) {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    fields = { active: jsonValue(actionName === 'approve_driver'), moderationStatus: jsonValue(actionName === 'approve_driver' ? 'approved' : actionName === 'reject_driver' ? 'rejected' : 'suspended'), moderationReason: jsonValue(reason), moderatedBy: jsonValue(u.uid), moderatedAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'paymentGateway' && actionName === 'update_gateway') {
    if (!allowed(u, 'super_admin')) return { error: 'Super admin required', status: 403 };
    const registry = gatewayRegistry(env), gateway = String(targetId) as keyof typeof registry;
    if (!registry[gateway] || payload.enabled !== true && payload.enabled !== false) return { error: 'Invalid gateway', status: 400 };
    if (payload.enabled && (!registry[gateway].configured || !registry[gateway].adapterAvailable)) return { error: 'Gateway unavailable', status: 409 };
    fields = { enabled: jsonValue(payload.enabled), updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
    targetCollection = 'paymentGateways';
  }
  if (!Object.keys(fields).length && normalizedType === 'user' && ['suspend_user', 'unsuspend_user', 'add_user_note'].includes(actionName)) {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    fields = actionName === 'add_user_note' ? { adminNote: jsonValue(reason), adminNoteAt: { timestampValue: new Date().toISOString() }, adminNoteBy: jsonValue(u.uid) } : { suspensionStatus: jsonValue(actionName === 'suspend_user' ? 'temporarily_suspended' : 'active'), suspensionReason: jsonValue(reason), suspensionActor: jsonValue(u.uid), suspensionAt: { timestampValue: new Date().toISOString() } };
  } else if (!Object.keys(fields).length && normalizedType === 'equipment' && ['hide_equipment', 'unhide_equipment', 'flag_equipment', 'suspend_equipment', 'suspend_listing'].includes(actionName)) {
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
      ...(payment.data.customerUid ? [await notificationWrite(fullName.bind(null, env), String(payment.data.customerUid), 'refund_updated', new Date().toISOString(), requestId)] : []),
    ];
    await commit(env, writes);
    return { success: true, correlationId, action: actionName, targetId };
  } else if (normalizedType === 'providerConfig' && actionName === 'update_provider_config') {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    if (typeof payload.enabled !== 'boolean' || !Number.isInteger(payload.priority) || Number(payload.priority) < 1 || Number(payload.priority) > 100) return { error: 'Invalid provider configuration', status: 400 };
    fields = { enabled: { booleanValue: payload.enabled }, priority: { integerValue: String(payload.priority) }, updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
  } else if (targetCollection === 'verificationPolicies' && actionName === 'update_verification_policy') {
    if (!allowed(u, 'super_admin')) return { error: 'Super admin required', status: 403 };
    const policy = normalizeVerificationPolicy(payload.policy);
    if (!policy) return { error: 'Invalid verification policy', status: 400 };
    fields = { ...Object.fromEntries(Object.entries(policy).map(([key, value]) => [key, jsonValue(value)])), version: { integerValue: String(Number(current.version || 0) + 1) }, updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'config' && actionName === 'update_config') {
    if (!allowed(u, 'super_admin')) return { error: 'Super admin required', status: 403 };
    if (!payload.config || Object.keys(payload.config).some(key => /secret|private|token|password|credential|key/i.test(key))) return { error: 'Only non-secret configuration is allowed', status: 400 };
    fields = { ...Object.fromEntries(Object.entries(payload.config).map(([key, value]) => [key, jsonValue(value)])), version: { integerValue: String(Number(current.version || 0) + 1) }, updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
  } else if (targetCollection === 'verificationProfiles' && ['start_manual_review', 'complete_manual_review', 'reject_manual_review', 'add_verification_note', 'set_provider_component', 'set_provider_requirements'].includes(actionName)) {
    if (!allowed(u, 'admin')) return { error: 'Admin required', status: 403 };
    const manualAction = actionName as 'start_manual_review' | 'complete_manual_review' | 'reject_manual_review';
    if (['start_manual_review', 'complete_manual_review', 'reject_manual_review'].includes(actionName)) {
      if (!canTransitionManualReview(current.manualReview?.status || 'unverified', manualAction)) {
        return { error: 'Invalid manual review transition', status: 409 };
      }
      // Manual decisions are intentionally separate from official
      // identity-provider verification; this action never writes identity.
      const status = actionName === 'start_manual_review' ? 'manual_review' : actionName === 'complete_manual_review' ? 'verified' : 'rejected';
      const overallStatus = actionName === 'start_manual_review'
        ? 'manual_review'
        : actionName === 'reject_manual_review'
          ? 'restricted'
          : current.identity?.status === 'verified' ? 'verified' : 'unverified';
      fields = {
        manualReview: jsonValue({ ...(current.manualReview || {}), status }),
        overallTrust: jsonValue({ ...(current.overallTrust || {}), status: overallStatus }),
        manualReviewReason: jsonValue(reason), manualReviewBy: jsonValue(u.uid), manualReviewAt: { timestampValue: new Date().toISOString() },
      };
      const eventType = actionName === 'start_manual_review' ? 'manual_review_started' : 'manual_review_completed';
      const writes = [
        { update: { name: fullName(env, `${targetCollection}/${encodeURIComponent(targetId)}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: raw!.updateTime } },
        verificationEventWrite(env, targetId, targetId, eventType, status, u.uid, correlationId, reason),
        await auditWrite(env, u, actionName, auditTarget, targetId, correlationId, reason, current, Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]))),
      ];
      await commit(env, writes);
      return { success: true, correlationId, action: actionName, targetId, manualReviewStatus: status };
    } else if (actionName === 'set_provider_component') {
      const component = payload.component;
      const status = payload.status;
      // Administrative review may record a component as awaiting review,
      // rejected, restricted, or reset. It must never manufacture a verified
      // external/business result. Verified values are reserved for a validated
      // official provider result processed by the callback boundary.
      if (!isProviderComponentName(component) ||
          !['unverified', 'pending', 'manual_review', 'rejected', 'restricted', 'expired'].includes(status)) {
        return { error: 'Invalid provider component update', status: 400 };
      }
      const provider = providerVerificationFor(current);
      const components = { ...provider.components, [component]: status };
      fields = { providerVerification: jsonValue({ ...provider, components, status: deriveProviderTrust(components, provider.requiredComponents) }), providerVerificationUpdatedBy: jsonValue(u.uid), providerVerificationUpdatedAt: { timestampValue: new Date().toISOString() } };
    } else if (actionName === 'set_provider_requirements') {
      if (!allowed(u, 'super_admin')) return { error: 'Super admin required', status: 403 };
      const requiredComponents = normalizeRequiredProviderComponents(payload.requiredComponents);
      if (!requiredComponents) return { error: 'Invalid provider component requirements', status: 400 };
      const provider = providerVerificationFor(current);
      fields = { providerVerification: jsonValue({ ...provider, requiredComponents, status: deriveProviderTrust(provider.components, requiredComponents) }), providerVerificationUpdatedBy: jsonValue(u.uid), providerVerificationUpdatedAt: { timestampValue: new Date().toISOString() } };
    } else fields = { adminNote: jsonValue(reason), adminNoteBy: jsonValue(u.uid), adminNoteAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'verification' && actionName === 'update_verification') {
    // Legacy verification cases cannot be used to confer any trusted
    // verification outcome. Manual operations are intentionally constrained to
    // verificationProfiles' manualReview state, while official results go
    // through the provider callback boundary.
    return { error: 'Verification case status changes are not supported', status: 400 };
  } else return { error: 'Unsupported action', status: 400 };
  const now = new Date().toISOString(), notify: any[] = [];
  if (normalizedType === 'user' && actionName === 'suspend_user') notify.push(await notificationWrite(fullName.bind(null, env), targetId, 'account_suspended', now, undefined, correlationId));
  if (normalizedType === 'user' && actionName === 'unsuspend_user') notify.push(await notificationWrite(fullName.bind(null, env), targetId, 'suspension_lifted', now, undefined, correlationId));
  if (normalizedType === 'complaint') {
    const event = actionName === 'resolve_complaint' || actionName === 'close_complaint' ? 'complaint_resolved' : 'complaint_status_changed';
    for (const uid of [current.customerUid, current.providerUid].filter((value, index, values) => typeof value === 'string' && value && values.indexOf(value) === index)) notify.push(await notificationWrite(fullName.bind(null, env), uid, event, now, targetId, correlationId));
  }
  if (normalizedType === 'request' && actionName === 'cancel_request') {
    for (const uid of [current.customerUid, current.providerUid].filter((value, index, values) => typeof value === 'string' && value && values.indexOf(value) === index)) notify.push(await notificationWrite(fullName.bind(null, env), uid, 'rental_cancelled', now, targetId, correlationId));
  }
  const writes = [{ update: { name: fullName(env, `${targetCollection}/${encodeURIComponent(targetId)}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: raw?.updateTime ? { updateTime: raw.updateTime } : { exists: false } },
    ...(targetCollection === 'heavyarConfig' && actionName === 'update_config' ? [{ update: { name: fullName(env, `configVersions/${encodeURIComponent(`${targetId}:${Number(current.version || 0) + 1}`)}`), fields: { ...fields, configKey: jsonValue(targetId), immutable: jsonValue(true) } }, currentDocument: { exists: false } }] : []),
    await auditWrite(env, u, actionName, auditTarget, targetId, correlationId, reason, current, Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]))), ...notify];
  await commit(env, writes);
  return { success: true, correlationId, action: actionName, targetId };
}

export async function requireAdmin(u: AdminUser, env?: Env) {
  if (env && !u.testInjected) {
    const staff = await rawDoc(env, 'staffMembers', u.uid);
    if (!staff?.data || staff.data.active === false || staff.data.status === 'suspended') throw new Error('ADMIN_REQUIRED');
    const authoritative = normalizeStaffRole(staff.data.role);
    if (!authoritative || (staff.data.roleVersion !== undefined && Number(staff.data.roleVersion) < 1)) throw new Error('ADMIN_REQUIRED');
    u.permissionRole = authoritative;
    if (authoritative === 'admin' || authoritative === 'super_admin' || authoritative === 'owner') u.role = authoritative === 'owner' ? 'super_admin' : authoritative;
  }
  if (!normalizeStaffRole(u.permissionRole || u.role) && u.role !== 'admin' && u.role !== 'super_admin') throw new Error('ADMIN_REQUIRED');
  return u;
}

export async function handleAdmin(req: Request, env: Env, user: AdminUser) {
  const url = new URL(req.url);
  const bootstrapConfig = user.testInjected ? null : await rawDoc(env, 'heavyarConfig', 'owner');
  const staff = user.testInjected ? null : await rawDoc(env, 'staffMembers', user.uid);
  const bootstrapException = (!bootstrapConfig?.data?.ownerUid && !staff?.data) &&
    ((url.pathname === '/api/admin/session' && (user.role === 'super_admin' || user.permissionRole === 'super_admin')) ||
      (url.pathname === '/api/admin/owner-bootstrap' && (user.role === 'super_admin' || user.permissionRole === 'super_admin')));
  if (!bootstrapException) await requireAdmin(user, env);
  if (url.pathname === '/api/admin/session' && req.method === 'GET') return { success: true, uid: user.uid, role: user.permissionRole || user.role, bootstrapRequired: bootstrapException };
  if (url.pathname === '/api/admin/payment-gateways' && req.method === 'GET') {
    if (!can(user, 'finance.read')) return { error: 'Finance permission required', status: 403 };
    const registry = gatewayRegistry(env);
    // Configuration is deliberately capability-only. Secrets and raw provider
    // configuration never cross the admin API boundary.
    const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'paymentGateways' }], limit: 20 } }) }) as any[] || [];
    const configured = Object.fromEntries(rows.filter((row) => row.document).map((row) => [String(row.document.name).split('/').pop(), decode(row.document)]));
    return { gateways: Object.entries(registry).map(([provider, value]) => {
      const stored: any = configured[provider] || {};
      return { provider, configured: value.configured, enabled: stored.enabled === true, adapterAvailable: value.adapterAvailable,
        environment: value.environment, health: value.configured && value.adapterAvailable ? 'available' : value.configured ? 'unavailable' : 'unconfigured',
        priority: Number(stored.priority || 0), methods: ['card'], supportsSplit: value.supportsSplit,
        capabilities: { refunds: false, savedCards: false, split: value.supportsSplit } };
    }) };
  }
  if (url.pathname === '/api/admin/staff' && req.method === 'GET') {
    if (!can(user, 'audit.read')) return { error: 'Permission required', status: 403 };
    const result = await listCollection(env, 'staffMembers', {}, Math.min(50, Number(url.searchParams.get('limit') || 30)), url.searchParams.get('cursor'));
    return { success: true, staff: result.items, nextCursor: result.nextCursor };
  }
  if (url.pathname === '/api/admin/staff/invite' && req.method === 'POST') {
    if (!can(user, 'staff.manage')) return { error: 'Permission required', status: 403 };
    const body: any = await req.json().catch(() => null), email = String(body?.email || '').trim().toLowerCase(), role = String(body?.role || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !['admin', 'finance', 'operations', 'support', 'verification', 'marketing', 'auditor'].includes(role)) return { error: 'Invalid invitation', status: 400 };
    const existingRows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'emailLower' }, op: 'EQUAL', value: { stringValue: email } } }, limit: 1 } }) }) as any[] || [];
    const existingUser = existingRows.find((row) => row.document)?.document;
    if (existingUser) {
      const existingUid = String(existingUser.name).split('/').pop() || '', now = new Date().toISOString();
      const existingStaff = await rawDoc(env, 'staffMembers', existingUid), roleVersion = Number(existingStaff?.data?.roleVersion || 0) + 1;
      await commit(env, [{ update: { name: fullName(env, `staffMembers/${encodeURIComponent(existingUid)}`), fields: { uid: jsonValue(existingUid), email: jsonValue(email), role: jsonValue(role), active: jsonValue(true), roleVersion: { integerValue: String(roleVersion) }, joinedAt: { timestampValue: now } } }, currentDocument: existingStaff?.updateTime ? { updateTime: existingStaff.updateTime } : { exists: false } }, claimSyncWrite(env, existingUid, role as StaffRole, true, roleVersion), await auditWrite(env, user, 'staff_assign', 'staff', existingUid, crypto.randomUUID(), 'existing user staff assignment')]);
      env.__executionCtx?.waitUntil(processStaffClaimSync(env));
      return { success: true, assigned: true, role };
    }
    if (!env.RESEND_API_KEY) return { error: 'Invitation delivery unavailable', status: 503 };
    const token = crypto.randomUUID(), tokenHash = b64u(await crypto.subtle.digest('SHA-256', enc.encode(token))), id = `invite:${tokenHash}`;
    await commit(env, [{ update: { name: fullName(env, `staffInvitations/${encodeURIComponent(id)}`), fields: { email: jsonValue(email), role: jsonValue(role), invitedBy: jsonValue(user.uid), status: jsonValue('pending'), expiresAt: { timestampValue: invitationExpiry() }, createdAt: { timestampValue: new Date().toISOString() } } }, currentDocument: { exists: false } }, await auditWrite(env, user, 'staff_invite', 'staffInvitation', id, crypto.randomUUID(), 'staff invitation')]);
    const sent = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Heavyar <noreply@heavyar.app>', to: [email], subject: 'Heavyar staff invitation', html: `<p>Use this one-time invitation code in Heavyar:</p><strong>${token}</strong>` }) });
    if (!sent.ok) return { error: 'Invitation delivery unavailable', status: 503 };
    return { success: true, invitationId: id, expiresAt: invitationExpiry() };
  }
  if (url.pathname === '/api/admin/owner-transfer' && req.method === 'POST') {
    if (!can(user, 'owner.transfer')) return { error: 'Permission required', status: 403 };
    const body: any = await req.json().catch(() => null), targetUid = String(body?.targetUid || ''), config = await rawDoc(env, 'heavyarConfig', 'owner');
    const currentOwner = String(config?.data?.ownerUid || '');
    if (!currentOwner || currentOwner !== user.uid) return { error: 'Current owner required', status: 403 };
    if (!ownerTransferAllowed(currentOwner, targetUid, Number(user.authTime || 0))) return { error: 'Recent authentication and a different owner are required', status: 409 };
    const target = await rawDoc(env, 'users', targetUid);
    if (!target?.data || target.data.accountStatus === 'restricted' || target.data.accountStatus === 'deletion_requested') return { error: 'Target is not eligible', status: 409 };
    const targetStaff = await rawDoc(env, 'staffMembers', targetUid), formerStaff = await rawDoc(env, 'staffMembers', currentOwner);
    const targetVersion = Number(targetStaff?.data?.roleVersion || 0) + 1, formerVersion = Number(formerStaff?.data?.roleVersion || 0) + 1;
    const now = new Date().toISOString();
    // Firestore is authoritative. Promotion, config pointer, old-owner
    // demotion, and the audit record must become visible atomically before
    // touching eventually-consistent identity claims.
    try { await commit(env, [
      { update: { name: fullName(env, `staffMembers/${encodeURIComponent(targetUid)}`), fields: { uid: jsonValue(targetUid), role: jsonValue('owner'), active: jsonValue(true), roleVersion: { integerValue: String(targetVersion) }, grantedAt: { timestampValue: now } } }, currentDocument: targetStaff?.updateTime ? { updateTime: targetStaff.updateTime } : { exists: false } },
      { update: { name: fullName(env, `staffMembers/${encodeURIComponent(currentOwner)}`), fields: { role: jsonValue('super_admin'), active: jsonValue(true), roleVersion: { integerValue: String(formerVersion) }, demotedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['role', 'active', 'roleVersion', 'demotedAt'] }, currentDocument: formerStaff?.updateTime ? { updateTime: formerStaff.updateTime } : { exists: false } },
      claimSyncWrite(env, targetUid, 'owner', true, targetVersion),
      claimSyncWrite(env, currentOwner, 'super_admin', true, formerVersion),
      { update: { name: fullName(env, 'heavyarConfig/owner'), fields: { ownerUid: jsonValue(targetUid), previousOwnerUid: jsonValue(currentOwner), updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['ownerUid', 'previousOwnerUid', 'updatedAt'] }, currentDocument: { updateTime: config?.updateTime } },
      await auditWrite(env, user, 'owner_transfer', 'staff', targetUid, crypto.randomUUID(), 'owner transfer', { ownerUid: currentOwner }, { ownerUid: targetUid }),
    ]); } catch (error) {
      throw error;
    }
    try {
      env.__executionCtx?.waitUntil(processStaffClaimSync(env));
    } catch (error) {
      try { await commit(env, [await auditWrite(env, user, 'claim_sync_pending', 'staff', targetUid, crypto.randomUUID(), 'Firestore owner transfer committed; identity claim synchronization must retry', { ownerUid: currentOwner }, { ownerUid: targetUid })]); } catch { /* durable Firestore state remains authoritative */ }
    }
    return { success: true, ownerUid: targetUid };
  }
  if (url.pathname === '/api/admin/owner-bootstrap' && req.method === 'POST') {
    if (user.role !== 'super_admin' || !user.authTime || Date.now() - user.authTime > 5 * 60 * 1000) return { error: 'Recent super-admin authentication required', status: 409 };
    const existing = await rawDoc(env, 'heavyarConfig', 'owner');
    if (existing?.data?.ownerUid) return { error: 'Owner already exists', status: 409 };
    const now = new Date().toISOString();
    const ownerStaff = await rawDoc(env, 'staffMembers', user.uid), ownerVersion = Number(ownerStaff?.data?.roleVersion || 0) + 1;
    await commit(env, [
      { update: { name: fullName(env, 'heavyarConfig/owner'), fields: { ownerUid: jsonValue(user.uid), version: { integerValue: '1' }, createdAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, currentDocument: { exists: false } },
      { update: { name: fullName(env, `staffMembers/${encodeURIComponent(user.uid)}`), fields: { uid: jsonValue(user.uid), role: jsonValue('owner'), active: jsonValue(true), roleVersion: { integerValue: String(ownerVersion) }, grantedAt: { timestampValue: now } } }, currentDocument: ownerStaff?.updateTime ? { updateTime: ownerStaff.updateTime } : { exists: false } },
      claimSyncWrite(env, user.uid, 'owner', true, ownerVersion),
      await auditWrite(env, user, 'owner_bootstrap', 'staff', user.uid, crypto.randomUUID(), 'one-time owner bootstrap'),
    ]);
    env.__executionCtx?.waitUntil(processStaffClaimSync(env));
    return { success: true, ownerUid: user.uid };
  }
  if (url.pathname === '/api/admin/campaigns/estimate' && req.method === 'POST') return campaignEstimate(req, env, user);
  if (url.pathname === '/api/admin/campaigns' && req.method === 'POST') return campaignCreate(req, env, user);
  if (url.pathname === '/api/admin/verification-cleanup' && req.method === 'POST') return cleanupVerificationRetention(req, env, user);
  if ((url.pathname === '/api/admin/notification-health' || url.pathname === '/api/admin/notifications/health') && req.method === 'GET') {
    const result = await notificationHealth(env);
    return { success: true, summary: {
      sent: result.health.deliveries.success,
      failed: (result.health.deliveries.permanent || 0) + (result.health.deliveries.retryable || 0),
      pending: result.health.pending,
      deactivatedTokens: result.health.deactivatedTokens,
    }, failures: result.recent || [] };
  }
  if (url.pathname === '/api/admin/notifications/delivery-cleanup' && req.method === 'POST') return cleanupNotificationDeliveries(req, env);
  if (url.pathname === '/api/admin/notification-retry' && req.method === 'POST') return retryNotificationDeliveries(req, env);
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
    '/api/admin/verification': 'verificationCases', '/api/admin/verification-profiles': 'verificationProfiles', '/api/admin/verification-attempts': 'verificationAttempts', '/api/admin/verification-events': 'verificationEvents', '/api/admin/provider-configs': 'providerConfigs', '/api/admin/config': 'heavyarConfig', '/api/admin/audit': 'adminAudit', '/api/admin/deletion-requests': 'deletionRequests',
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
    const sensitive = ['payment', 'payments', 'invoices', 'refunds', 'provider-configs', 'providerConfigs'];
    if (sensitive.includes(detailMatch[1]) ? !can(user, 'finance.read') : !can(user, 'audit.read')) return { error: 'Permission required', status: 403 };
    const collection = detailMatch[1] === 'request' ? 'equipmentRequests' : detailMatch[1];
    if (!FILTERS[collection]) return { error: 'Not found', status: 404 };
    const raw = await rawDoc(env, collection, decodeURIComponent(detailMatch[2]));
    if (!raw?.data) return { error: 'Not found', status: 404 };
    return { success: true, item: { id: decodeURIComponent(detailMatch[2]), ...redact(raw.data) } };
  }
  const collection = pathMap[url.pathname];
  if (!collection) return { error: 'Not found', status: 404 };
  if (['payments', 'invoices', 'refunds', 'providerConfigs'].includes(collection) ? !can(user, 'finance.read') : !can(user, 'audit.read')) return { error: 'Permission required', status: 403 };
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
