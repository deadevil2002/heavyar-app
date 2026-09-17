import type { Env } from './index';
import { canTransitionManualReview, deriveProviderTrust, isProviderComponentName, normalizeRequiredProviderComponents, providerComponentNames, providerVerificationFor, verificationStatuses } from './verification';
import { defaultVerificationPolicy, normalizeVerificationPolicy } from './verification';
import { notificationWrite } from './notifications';
import { gatewayRegistry, campaignRecipients, invitationExpiry, normalizeStaffRole, hasPermission, identityIntegrationMayEnable, identityIntegrationRegistry, type StaffRole, type Permission } from './completion';
import { invitationRole, isFreshReauthentication, normalizeAuthorityEmail, pendingAndUnexpired } from './authority';
import { createAdminExportService, createInvoicePdfService, type DocumentBinaryResponse, type DocumentActor, type ExportEntity, type ExportFilters, type InvoiceBusinessSettings, type TrustedInvoiceSource } from './admin-documents';
import { ensurePublicIdentifier, formatPublicIdentifier, isPublicIdentifier, PUBLIC_IDENTIFIER_COUNTER_IDS, PUBLIC_IDENTIFIER_FIELDS, type PublicIdentifierKind } from './public-identifiers';

export type AdminRole = 'super_admin' | 'admin';
export type AdminUser = { uid: string; admin: boolean; role?: AdminRole; permissionRole?: string; email?: string; authTime?: number; testInjected?: true };

type RawDoc = { data: any; updateTime?: string; name?: string };
let firestoreOverride: ((collection: string, id: string) => any) | undefined;
let commitOverride: unknown[][] | undefined;
let identityOverride: ((uid: string, role: StaffRole | null) => Promise<{ role: StaffRole | null; previousRole: unknown }>) | undefined;
let verifiedEmailOverride: ((uid: string) => Promise<string | null>) | undefined;
let queryOverride: ((collection: string, before: string, limit: number) => RawDoc[]) | undefined;
export const __adminTest = {
  setFirestore(fn?: (collection: string, id: string) => any) { firestoreOverride = fn; },
  captureCommits(target?: unknown[][]) { commitOverride = target; },
  setIdentity(fn?: (uid: string, role: StaffRole | null) => Promise<{ role: StaffRole | null; previousRole: unknown }>) { identityOverride = fn; },
  setVerifiedEmail(fn?: (uid: string) => Promise<string | null>) { verifiedEmailOverride = fn; },
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
  if (response.status === 403) throw new Error('Firestore permission denied');
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

type AdminCursor = { name: string; sortValue?: string | number | boolean | null };
function cursorValue(env: Env, collection: string, cursor: string | null, sort?: string) {
  if (!cursor) return undefined;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
    const parsed = decoded.startsWith('{') ? JSON.parse(decoded) as AdminCursor : { name: decoded };
    const name = parsed.name;
    if (sort && name.startsWith(fullName(env, `${collection}/`)) && Object.prototype.hasOwnProperty.call(parsed, 'sortValue')) {
      return { values: [jsonValue(parsed.sortValue), { referenceValue: name }] };
    }
    if (!sort && name.startsWith(fullName(env, `${collection}/`))) return { values: [{ referenceValue: name }] };
  } catch { /* malformed cursors are treated as absent */ }
  throw new Error('Invalid cursor');
}

function nextCursor(name?: string, sortValue?: string | number | boolean | null) {
  return name ? b64u(enc.encode(sortValue === undefined ? name : JSON.stringify({ name, sortValue }))) : undefined;
}

const FILTERS: Record<string, string[]> = {
  users: ['role', 'accountStatus', 'suspensionStatus', 'emailLower', 'email'],
  equipment: ['ownerUid', 'isActive', 'visibility', 'moderationStatus', 'city', 'slug'],
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
  driverProfiles: ['active', 'availabilityStatus', 'region', 'city', 'moderationStatus', 'trustStatus'],
  driverRequests: ['driverUid', 'requesterUid', 'status'],
  campaigns: ['status', 'createdBy'],
  staffMembers: ['role', 'active'],
  staffInvitations: ['status', 'email'],
  paymentGateways: ['enabled'],
  identityIntegrations: ['enabled'],
};

async function listCollection(env: Env, collection: string, query: Record<string, string>, limit = 30, cursor: string | null = null) {
  if (!FILTERS[collection]) throw new Error('Unsupported collection');
  // Empty controls are not active filters (including q= and direction=).
  query = Object.fromEntries(Object.entries(query).filter(([, value]) => value.trim() !== ''));
  const safeLimit = Math.min(50, Math.max(1, Number.isFinite(limit) ? limit : 30));
  const sort = query.sort;
  const sortDirection = query.direction || 'asc';
  if (sort && !['createdAt', 'updatedAt', 'timestamp', 'status', 'amount'].includes(sort)) throw new Error('Invalid sort field');
  if (!['asc', 'desc'].includes(sortDirection)) throw new Error('Invalid sort direction');
  const structuredQuery: any = {
    from: [{ collectionId: collection }],
    orderBy: sort
      ? [{ field: { fieldPath: sort }, direction: sortDirection === 'desc' ? 'DESCENDING' : 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: sortDirection === 'desc' ? 'DESCENDING' : 'ASCENDING' }]
      : [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    // Filter locally after a bounded server scan.  This supports intersecting
    // operational filters without silently dropping all but the first one or
    // requiring a combinatorial set of Firestore composite indexes.
    limit: Math.min(250, safeLimit * 5 + 1),
  };
  const startAt = cursorValue(env, collection, cursor, sort);
  if (startAt) structuredQuery.startAt = startAt;
  const response = queryOverride
    ? queryOverride(collection, String(startAt?.values?.[startAt.values.length - 1]?.referenceValue || ''), structuredQuery.limit).map((item) => ({ document: {
      name: item.name || fullName(env, `${collection}/${crypto.randomUUID()}`), updateTime: item.updateTime,
      fields: Object.fromEntries(Object.entries(item.data || {}).map(([key, value]) => [key, jsonValue(value)])),
    } }))
    : await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) }) as any[] || [];
  const rows = response.filter(item => item.document);
  const valueAt = (record: any, path: string): any => path.split('.').reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, record);
  const activeFilters = FILTERS[collection].filter(field => query[field] !== undefined).map(field => [field, query[field]] as const);
  const search = query.q?.trim().toLowerCase();
  if (search !== undefined && (!search || search.length > 200)) throw new Error('Invalid search query');
  const searchFields: Record<string, string[]> = {
    users: ['emailLower', 'email', 'displayName', 'name', 'nameEn'],
    equipment: ['slug', 'title', 'name', 'publicEquipmentNumber', 'equipmentNumber'],
    equipmentRequests: ['requestId', 'publicRequestNumber', 'requestNumber'],
    payments: ['requestId', 'paymentId', 'providerReference'],
    invoices: ['requestId', 'invoiceNumber'],
    refunds: ['requestId', 'refundId', 'publicRequestNumber', 'requestNumber'],
    complaints: ['requestId'],
    driverProfiles: ['uid', 'displayName', 'name'],
  };
  const matches = (record: any, name: string) => activeFilters.every(([field, rawValue]) => {
    const actual = valueAt(record, field);
    if (typeof actual === 'boolean') return actual === (rawValue === 'true');
    if (typeof actual === 'number') return actual === Number(rawValue);
    return String(actual ?? '') === rawValue;
  }) && (!search || [name.split('/').pop(), ...(searchFields[collection] || []).map(field => valueAt(record, field))]
    .some(value => String(value || '').toLowerCase().includes(search)));
  const matching = rows.filter(item => matches(decode(item.document), String(item.document.name)));
  const docs = matching.slice(0, safeLimit);
  const scanLast = rows[rows.length - 1]?.document?.name;
  const lastReturned = docs[docs.length - 1]?.document;
  const cursorDocument = lastReturned || (rows.length >= structuredQuery.limit ? rows[rows.length - 1]?.document : undefined);
  const cursorSortValue = sort && cursorDocument ? (decode(cursorDocument)[sort] ?? null) : undefined;
  return {
    items: docs.map(item => ({ id: String(item.document.name).split('/').pop(), ...redact(decode(item.document)) })),
    // If a page filled, continue after the last delivered row—not after the
    // scan window—so sparse filters cannot drop matching documents. If no page
    // filled, advancing after the scan is safe because every matching row in it
    // was delivered.
    nextCursor: docs.length === safeLimit || rows.length >= structuredQuery.limit
      ? nextCursor(cursorDocument?.name || scanLast, cursorSortValue) : undefined,
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
async function cleanupNotificationDeliveries(req: Request, env: Env, user: AdminUser) {
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const limit = Number(body.limit || 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { error: 'Invalid cleanup limit', status: 400 };
  const before = new Date(Date.now() - 30 * 86400000).toISOString();
  const response = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notificationDeliveries' }], where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'LESS_THAN', value: { timestampValue: before } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }], limit } }) }) as any[] || [];
  const writes = response.filter(x => x.document).map(x => ({ delete: x.document.name, currentDocument: { updateTime: x.document.updateTime } }));
  if (writes.length) await commit(env, [...writes, await auditWrite(env, user, 'notification_delivery_cleanup', 'notificationDelivery', `before:${before}`, crypto.randomUUID(), 'notification retention cleanup', undefined, { deleted: writes.length })]);
  return { success: true, deleted: writes.length, hasMore: response.length >= limit };
}
async function retryNotificationDeliveries(req: Request, env: Env, user: AdminUser) {
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const limit = Number(body.limit || 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { error: 'Invalid retry limit', status: 400 };
  const response = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notificationDeliveries' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'retryable' } } }, limit } }) }) as any[] || [];
  const now = new Date().toISOString();
  const writes = response.filter(x => x.document).map(x => {
    const d = decode(x.document), attempts = Number(d.attempts || 0);
    return { update: { name: x.document.name, fields: { attempts: { integerValue: String(Math.min(5, attempts + 1)) }, nextAttemptAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['attempts', 'nextAttemptAt'] }, currentDocument: { updateTime: x.document.updateTime } };
  }).filter((x: any, index: number) => Number(decode(response[index]?.document).attempts || 0) < 5);
  if (writes.length) await commit(env, [...writes, await auditWrite(env, user, 'notification_delivery_retry', 'notificationDelivery', 'retryable', crypto.randomUUID(), 'retryable notification delivery retry', undefined, { queued: writes.length })]);
  return { success: true, queued: writes.length, hasMore: response.length >= limit };
}

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
  const sensitiveWords = /secret|private|token|password|credential|api[_-]?key|correlation|raw|payload|document|national|identitynumber|iban/i;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitiveWords.test(key))
    .map(([key, item]) => [key, item && typeof item === 'object' ? redact(item) : item]));
}
function defaultAuthConfig() {
  return { requested: { requirePhoneOnSignup: false, requireMobileDuringSignup: false, allowEmailLogin: true, allowPhoneLogin: false, requirePhoneVerification: false, phoneIndexReady: false }, effective: { requirePhoneOnSignup: false, requireMobileDuringSignup: false, allowEmailLogin: true, allowPhoneLogin: false, requirePhoneVerification: false, phoneIndexReady: false }, status: { firebaseReset: 'blocked', resend: 'sender_unverified', phoneProvider: 'not_required_for_alias', phonePasswordLogin: 'blocked', phoneIndexReady: false }, version: 1 };
}
function authConfigProjection(env: Env, raw: any) {
  const requested = { requirePhoneOnSignup: raw?.requirePhoneOnSignup === true, requireMobileDuringSignup: raw?.requirePhoneOnSignup === true, allowEmailLogin: raw?.allowEmailLogin !== false, allowPhoneLogin: raw?.allowPhoneLogin === true, requirePhoneVerification: raw?.requirePhoneVerification === true, phoneIndexReady: raw?.phoneIndexReady === true };
  const passwordEndpointReady = !!env.FIREBASE_PROJECT_ID && !!env.FIREBASE_WEB_API_KEY && !!env.FIREBASE_CLIENT_EMAIL && !!env.FIREBASE_PRIVATE_KEY;
  const effective = { ...requested, requirePhoneOnSignup: requested.phoneIndexReady && requested.requirePhoneOnSignup, requireMobileDuringSignup: requested.phoneIndexReady && requested.requirePhoneOnSignup, allowEmailLogin: requested.allowEmailLogin, allowPhoneLogin: requested.phoneIndexReady && passwordEndpointReady && requested.allowPhoneLogin === true, requirePhoneVerification: false };
  const firebaseReset = env.FIREBASE_WEB_API_KEY || env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY ? 'configured' : 'blocked';
  const blocked = { allowEmailLogin: requested.allowEmailLogin !== effective.allowEmailLogin, allowPhoneLogin: requested.allowPhoneLogin !== effective.allowPhoneLogin, requirePhoneVerification: requested.requirePhoneVerification !== effective.requirePhoneVerification, requirePhoneOnSignup: requested.requirePhoneOnSignup !== effective.requirePhoneOnSignup };
  return { requested, effective, blocked, status: { firebaseReset, resend: env.RESEND_API_KEY ? 'sender_unverified' : 'not_configured', phoneProvider: 'not_required_for_alias', phonePasswordLogin: effective.allowPhoneLogin ? 'configured' : 'blocked', phoneIndexReady: requested.phoneIndexReady, senderDomainVerified: false }, accountRecovery: { firebaseReset, resend: { bound: !!env.RESEND_API_KEY, delivery: false, senderDomainVerified: false }, phoneRecovery: requested.phoneIndexReady ? 'configured' : 'disabled' }, mismatch: { email: blocked.allowEmailLogin, phone: blocked.allowPhoneLogin, verification: blocked.requirePhoneVerification, phoneRequirement: blocked.requirePhoneOnSignup }, version: Number(raw?.version || 1) };
}

function validCorrelationId(value: string) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function displayName(value: Record<string, any> | undefined, fallback = 'Unknown') {
  if (!value) return fallback;
  return String(value.displayName || value.name || value.nameEn || value.fullName || value.nameAr || fallback);
}

function publicIdentifier(kind: 'request' | 'equipment', id: string, value: Record<string, any>) {
  const explicit = value[PUBLIC_IDENTIFIER_FIELDS[kind]]
    || value.requestNumber || value.publicNumber || value.equipmentNumber || value.listingNumber;
  return typeof explicit === 'string' && explicit.trim() ? explicit : `${kind === 'request' ? 'HV-REQ' : 'HV-EQP'}-${id}`;
}

async function enrichAdminItems(env: Env, collection: string, items: any[]) {
  if (!items.length) return items;
  const needed = new Set<string>();
  for (const item of items) {
    for (const key of ['ownerUid', 'customerUid', 'providerUid', 'uid', 'customerId', 'providerId']) {
      if (typeof item[key] === 'string' && item[key]) needed.add(item[key]);
    }
  }
  const people = new Map<string, any>();
  await Promise.all([...needed].slice(0, 50).map(async (uid) => {
    const user = await rawDoc(env, 'users', uid);
    if (user?.data) people.set(uid, redact(user.data));
  }));
  const equipment = new Map<string, any>();
  const equipmentIds = [...new Set(items.map((item) => item.equipmentId).filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, 50);
  await Promise.all(equipmentIds.map(async (id) => {
    const listing = await rawDoc(env, 'equipment', id);
    if (listing?.data) equipment.set(id, redact(listing.data));
  }));
  return items.map((item) => {
    const record = { ...item };
    if (collection === 'users') record.displayName = displayName(record);
    if (collection === 'driverProfiles') {
      const person = people.get(record.uid || record.id);
      record.displayName = displayName(record, displayName(person));
      if (person?.email) record.email = person.email;
    }
    if (collection === 'equipment') {
      const owner = people.get(record.ownerUid);
      record.equipmentNumber = publicIdentifier('equipment', record.id, record);
      record.owner = owner ? { name: displayName(owner), email: owner.email } : undefined;
    }
    if (collection === 'equipmentRequests') {
      const customer = people.get(record.customerUid), provider = people.get(record.providerUid), listing = equipment.get(record.equipmentId);
      record.requestNumber = publicIdentifier('request', record.id, record);
      record.customer = customer ? { name: displayName(customer), email: customer.email } : undefined;
      record.provider = provider ? { name: displayName(provider), email: provider.email } : undefined;
      record.equipment = listing ? { title: listing.title || listing.name, number: publicIdentifier('equipment', record.equipmentId, listing) } : undefined;
    }
    if (collection === 'payments' || collection === 'invoices') {
      const customer = people.get(record.customerUid || record.customerId), provider = people.get(record.providerUid || record.providerId);
      if (customer) record.customer = { name: displayName(customer) };
      if (provider) record.provider = { name: displayName(provider) };
    }
    return redact(record);
  });
}

function canReadCollection(user: AdminUser, collection: string) {
  const role = normalizeStaffRole(user.permissionRole || user.role);
  const broadOperationalRead = role === 'owner' || role === 'super_admin' || role === 'admin' || role === 'auditor';
  if (collection === 'staffMembers' || collection === 'staffInvitations') return can(user, 'staff.manage');
  // Payouts is a settlement-operation role, not a ledger/invoice role. There
  // is no generic payout ledger in this deployment, so financial source
  // documents remain finance-scoped until a dedicated payout source exists.
  if (['payments', 'invoices', 'refunds'].includes(collection)) return can(user, 'finance.read');
  if (collection === 'paymentGateways') return can(user, 'finance.read') || can(user, 'payouts.read');
  if (['verificationCases', 'verificationProfiles', 'verificationAttempts', 'verificationEvents', 'verificationPolicies', 'identityIntegrations'].includes(collection)) return can(user, 'verification.manage') || (broadOperationalRead && role !== 'auditor');
  if (['users', 'complaints', 'deletionRequests'].includes(collection)) return can(user, 'support.manage') || broadOperationalRead;
  if (['equipment', 'equipmentRequests', 'driverProfiles', 'driverRequests'].includes(collection)) return can(user, 'operations.manage') || can(user, 'moderation.manage') || broadOperationalRead;
  if (['providerConfigs', 'heavyarConfig'].includes(collection)) return can(user, 'config.manage');
  if (collection === 'campaigns') return can(user, 'marketing.campaign');
  return broadOperationalRead;
}

const EXPORT_COLLECTIONS: Record<ExportEntity, string> = {
  users: 'users', providers: 'users', drivers: 'driverProfiles', equipment: 'equipment',
  requests: 'equipmentRequests', payments: 'payments', invoices: 'invoices', refunds: 'refunds',
  complaints: 'complaints', staff: 'staffMembers', verification_cases: 'verificationCases',
};

function actorForDocuments(user: AdminUser): DocumentActor {
  return { uid: user.uid, permissionRole: normalizeStaffRole(user.permissionRole || user.role) || undefined };
}

async function trustedInvoiceSource(env: Env, invoiceId: string): Promise<TrustedInvoiceSource | null> {
  const invoice = await rawDoc(env, 'invoices', invoiceId);
  if (!invoice?.data) return null;
  const invoiceData = invoice.data, requestId = String(invoiceData.requestId || '');
  if (!requestId) return null;
  // The payment document is canonicalized under requestId by settlement. Do
  // not follow request.paymentId/provider references: those are external
  // charge identifiers and accepting them here could join unrelated records.
  const [request, payment] = await Promise.all([
    rawDoc(env, 'equipmentRequests', requestId),
    rawDoc(env, 'payments', requestId),
  ]);
  if (!request?.data || !payment?.data) return null;
  const requestData = request.data, paymentData = payment.data;
  const customerUid = String(requestData.customerUid || ''), providerUid = String(requestData.providerUid || '');
  const equipmentId = String(requestData.equipmentId || '');
  // An immutable invoice remains printable after a completed/partial refund.
  // The request stays paid; the canonical payment records its later state.
  const settledState = (value: unknown) => ['paid', 'refunded', 'partially_refunded'].includes(String(value));
  const equivalentAmount = (left: number, right: number) => Math.abs(left - right) < 0.005;
  const invoiceNumber = typeof invoiceData.invoiceNumber === 'string' ? invoiceData.invoiceNumber.trim() : '';
  const buyerName = typeof invoiceData.buyerName === 'string' ? invoiceData.buyerName.trim() : '';
  const sellerName = typeof invoiceData.sellerName === 'string' ? invoiceData.sellerName.trim() : '';
  const total = Number(invoiceData.totalAmount), subtotal = Number(invoiceData.subtotal), vatAmount = Number(invoiceData.vatAmount);
  const platformFee = invoiceData.platformFee === undefined || invoiceData.platformFee === null ? undefined : Number(invoiceData.platformFee);
  const paymentAmount = Number(paymentData.amount), rentalSubtotal = Number(requestData.finalAmount ?? requestData.amount);
  const paymentReference = typeof paymentData.providerReference === 'string' ? paymentData.providerReference : '';
  if (!customerUid || !providerUid || !equipmentId ||
      invoiceNumber !== invoiceId || !settledState(invoiceData.status) ||
      requestData.customerUid !== invoiceData.customerId || requestData.providerUid !== invoiceData.providerId ||
      equipmentId !== invoiceData.equipmentId || requestData.paymentStatus !== 'paid' || requestData.paymentState !== 'paid' ||
      requestData.invoiceId !== invoiceId || requestData.currency !== 'SAR' ||
      paymentData.requestId !== requestId || !settledState(paymentData.state) || paymentData.invoiceId !== invoiceId ||
      paymentData.customerUid !== customerUid || invoiceData.currency !== 'SAR' || paymentData.currency !== 'SAR' ||
      !paymentReference || invoiceData.paymentReference !== paymentReference || requestData.paymentId !== paymentReference ||
      ![subtotal, vatAmount, total, paymentAmount, rentalSubtotal].every(Number.isFinite) ||
      subtotal < 0 || vatAmount < 0 || total <= 0 || (platformFee !== undefined && (!Number.isFinite(platformFee) || platformFee < 0)) ||
      !equivalentAmount(subtotal + vatAmount, total) || !equivalentAmount(paymentAmount, total) || !equivalentAmount(rentalSubtotal, subtotal) ||
      !buyerName || !sellerName ||
      !/^HV-REQ-[0-9]{6,12}$/.test(String(requestData.publicRequestNumber || '')) ||
      !Number.isFinite(Date.parse(String(invoiceData.createdAt || invoiceData.paidAt || '')))) return null;
  const equipment = await rawDoc(env, 'equipment', equipmentId);
  const equipmentName = String(equipment?.data?.titleEn || equipment?.data?.titleAr || equipment?.data?.title || equipment?.data?.name || '').trim();
  if (!equipmentName) return null;
  return {
    invoiceNumber,
    requestNumber: String(requestData.publicRequestNumber || ''),
    issueDate: String(invoiceData.createdAt || invoiceData.paidAt),
    paymentStatus: String(paymentData.state),
    paymentProvider: typeof paymentData.provider === 'string' ? paymentData.provider : undefined,
    paymentReference: paymentData.providerReference,
    customer: { uid: customerUid, name: buyerName },
    provider: { uid: providerUid, name: sellerName },
    equipmentName,
    rentalStart: typeof requestData.startDate === 'string' ? requestData.startDate : requestData.rentalStart,
    rentalEnd: typeof requestData.endDate === 'string' ? requestData.endDate : requestData.rentalEnd,
    subtotal,
    platformFee,
    vatAmount,
    total,
    currency: 'SAR',
  };
}

/**
 * Binary document callback for index.ts. Index must return this body's bytes
 * directly (rather than pass it through the JSON response helper).
 */
export async function handleAdminDocument(req: Request, env: Env, user: AdminUser): Promise<DocumentBinaryResponse | null> {
  const url = new URL(req.url);
  const exportMatch = url.pathname.match(/^\/api\/admin\/exports\/([a-z_]+)\.xlsx$/);
  const invoiceMatch = url.pathname.match(/^\/api\/admin\/invoices\/([^/]+)\.pdf$/);
  if (!exportMatch && !invoiceMatch) return null;
  await requireAdmin(user, env);
  if (exportMatch) {
    const entity = exportMatch[1] as ExportEntity;
    if (!EXPORT_COLLECTIONS[entity]) throw new Error('Unsupported export entity');
    const collection = EXPORT_COLLECTIONS[entity];
    const filters: ExportFilters = Object.fromEntries([...url.searchParams.entries()]
      .filter(([key]) => !['scope', 'cursor', 'limit'].includes(key))) as ExportFilters;
    const authorizeExport = async (actor: DocumentActor, target: ExportEntity) => {
      if (actor.uid !== user.uid || target !== entity || !canReadCollection(user, EXPORT_COLLECTIONS[target])) throw new Error('ADMIN_REQUIRED');
    };
    const listPage = async ({ entity: target, filters: pageFilters, cursor, limit }: { entity: ExportEntity; filters: ExportFilters; cursor?: string; limit: number }) => {
      const page = await listCollection(env, EXPORT_COLLECTIONS[target], Object.fromEntries(Object.entries(pageFilters).map(([key, value]) => [key, String(value)])), limit, cursor || null);
      return { items: page.items, nextCursor: page.nextCursor };
    };
    const service = createAdminExportService({
      authorizeExport,
      listPage,
      enrich: (target, rows) => enrichAdminItems(env, EXPORT_COLLECTIONS[target], rows as any[]),
    });
    const scope = url.searchParams.get('scope') === 'current_page' ? 'current_page' : 'all_filtered';
    const page = scope === 'current_page' ? await listPage({ entity, filters, cursor: url.searchParams.get('cursor') || undefined, limit: Math.min(50, Number(url.searchParams.get('limit') || 30)) }) : undefined;
    const document = await service.exportXlsx({ actor: actorForDocuments(user), entity, scope, filters, page });
    await recordDocumentDownload(env, user, 'admin_export_downloaded', 'export', entity, `export scope: ${scope}`);
    return document;
  }
  const invoiceId = decodeURIComponent(invoiceMatch![1]);
  const service = createInvoicePdfService({
    authorizeInvoice: async (actor, id) => {
      if (actor.uid !== user.uid || id !== invoiceId || !can(user, 'finance.read')) throw new Error('ADMIN_REQUIRED');
    },
    readInvoice: (id) => trustedInvoiceSource(env, id),
    readBusinessSettings: async (): Promise<InvoiceBusinessSettings | null> => {
      const config = await rawDoc(env, 'heavyarConfig', 'business');
      if (!config?.data) return null;
      return {
        legalNameEnglish: config.data.legalBusinessNameEn,
        legalNameArabic: config.data.legalBusinessNameAr,
        commercialRegistrationNumber: config.data.commercialRegistrationNumber,
        vatRegistrationNumber: config.data.vatRegistrationNumber,
        supportEmail: config.data.supportEmail,
        supportPhone: config.data.supportPhone,
        businessAddress: config.data.businessAddress,
      };
    },
  });
  const document = await service.downloadInvoice({ actor: actorForDocuments(user), invoiceId });
  await recordDocumentDownload(env, user, 'admin_invoice_pdf_downloaded', 'invoice', invoiceId, 'invoice PDF downloaded');
  return document;
}

/** Index must preserve this explicit safe status/message instead of generic 500. */
export class AdminDocumentUnavailableError extends Error {
  readonly status = 503;
  readonly code = 'ADMIN_DOCUMENT_AUDIT_UNAVAILABLE';
  constructor() {
    super('Document download unavailable: audit recording failed. Contact the administrator.');
    this.name = 'AdminDocumentUnavailableError';
  }
}

async function recordDocumentDownload(env: Env, user: AdminUser, action: string, targetType: string, targetId: string, reason: string) {
  try {
    await commit(env, [await auditWrite(env, user, action, targetType, targetId, crypto.randomUUID(), reason)]);
  } catch {
    // Never send unaudited financial/user exports, nor silently swallow storage
    // permission failures. No document bytes or sensitive source data escape.
    throw new AdminDocumentUnavailableError();
  }
}

async function backfillPublicIdentifiers(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
  const body: any = await req.json().catch(() => null);
  const kind = body?.entity as PublicIdentifierKind;
  const reason = String(body?.reason || '').trim(), limit = Number(body?.limit || 25), cursor = typeof body?.cursor === 'string' ? body.cursor : null;
  if (!['request', 'equipment'].includes(kind) || reason.length < 3 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { error: 'Invalid backfill request', status: 400 };
  }
  const collection = kind === 'request' ? 'equipmentRequests' : 'equipment';
  const page = await listCollection(env, collection, {}, limit, cursor);
  const field = PUBLIC_IDENTIFIER_FIELDS[kind], counterId = PUBLIC_IDENTIFIER_COUNTER_IDS[kind];
  const candidates = page.items.filter(item => !isPublicIdentifier(kind, item[field]));
  const assigned: string[] = [];
  for (const item of candidates) {
    const result = await ensurePublicIdentifier(kind, {
      readTarget: async () => (await rawDoc(env, collection, String(item.id)))?.data || null,
      readIdentifier: target => target[field],
      assignAtomically: async () => {
        const [target, counter] = await Promise.all([rawDoc(env, collection, String(item.id)), rawDoc(env, 'publicIdentifierCounters', counterId)]);
        if (!target?.data || !target.updateTime) throw new Error('Backfill target not found');
        const existing = target.data[field];
        if (isPublicIdentifier(kind, existing)) return existing;
        const next = Number(counter?.data?.nextSequence || 1);
        const identifier = formatPublicIdentifier(kind, next);
        await commit(env, [
          { update: { name: fullName(env, `${collection}/${encodeURIComponent(String(item.id))}`), fields: { [field]: jsonValue(identifier), publicIdentifierAssignedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: [field, 'publicIdentifierAssignedAt'] }, currentDocument: { updateTime: target.updateTime } },
          { update: { name: fullName(env, `publicIdentifierCounters/${counterId}`), fields: { nextSequence: { integerValue: String(next + 1) }, updatedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['nextSequence', 'updatedAt'] }, currentDocument: counter?.updateTime ? { updateTime: counter.updateTime } : { exists: false } },
          await auditWrite(env, user, 'public_identifier_backfilled', kind, String(item.id), crypto.randomUUID(), reason, undefined, { [field]: identifier }),
        ]);
        return identifier;
      },
    });
    if (result.assigned) assigned.push(result.identifier);
  }
  return { success: true, entity: kind, scanned: page.items.length, assigned: assigned.length, identifiers: assigned, nextCursor: page.nextCursor };
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
  if (!can(user, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
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

/**
 * Invitation acceptance never trusts an email supplied in a request body, or
 * merely the decoded token's optional email field.  The Firebase Identity
 * record is the source for both identity binding and verified-email status.
 */
async function verifiedIdentityEmail(env: Env, user: AdminUser): Promise<string | null> {
  if (verifiedEmailOverride) return normalizeAuthorityEmail(await verifiedEmailOverride(user.uid));
  if (user.testInjected) return normalizeAuthorityEmail(user.email);
  const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
  const endpoint = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID || '')}/accounts:lookup`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [user.uid] }),
  });
  if (!response.ok) throw new Error('Identity service unavailable');
  const record = (await response.json() as any).users?.[0];
  return record?.emailVerified === true ? normalizeAuthorityEmail(record.email) : null;
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
  config: 'heavyarConfig', heavyarConfig: 'heavyarConfig', authConfig: 'heavyarConfig', verification: 'verificationCases', verificationCase: 'verificationCases', verificationCases: 'verificationCases', 'verification-case': 'verificationCases', 'verification-cases': 'verificationCases',
  verificationPolicy: 'verificationPolicies', verificationPolicies: 'verificationPolicies',
  verificationProfile: 'verificationProfiles', verificationProfiles: 'verificationProfiles',
  verificationAttempt: 'verificationAttempts', verificationAttempts: 'verificationAttempts',
  equipment: 'equipment', listing: 'equipment', listings: 'equipment', refund: 'refunds', refunds: 'refunds',
  driverProfile: 'driverProfiles', driverProfiles: 'driverProfiles',
  paymentGateway: 'paymentGateways', paymentGateways: 'paymentGateways',
  identityIntegration: 'identityIntegrations', identityIntegrations: 'identityIntegrations',
};

async function action(req: Request, env: Env, u: AdminUser, suppliedBody?: any) {
  let body: any;
  try { body = (suppliedBody || await req.json()) as { action?: string; targetType?: string; targetId?: string; reason?: string; note?: string; amount?: number; role?: AdminRole; enabled?: boolean; priority?: number; status?: string; config?: Record<string, unknown>; payload?: Record<string, unknown>; }; } catch { return { error: 'Invalid JSON body', status: 400 }; }
  const payload = body.payload && typeof body.payload === 'object' ? { ...body, ...body.payload } : body;
  const actionName = String(payload.action || ''), targetType = String(payload.targetType || '');
  let targetId = String(payload.targetId || '');
  const rawTargetType = String(payload.targetType || targetType);
  const authConfigTarget = rawTargetType === 'authConfig' && targetId === 'default';
  if (authConfigTarget) targetId = 'auth';
  const collection = TARGET_COLLECTIONS[rawTargetType];
  const normalizedType = collection === 'users' ? 'user' : collection === 'payments' ? 'payment' : collection === 'complaints' ? 'complaint' : collection === 'equipmentRequests' ? 'request' : collection === 'providerConfigs' ? 'providerConfig' : collection === 'heavyarConfig' ? 'config' : collection === 'verificationCases' ? 'verification' : collection;
  const reason = String(payload.reason || payload.note || '').trim();
  const correlationId = String(req.headers.get('X-Correlation-ID') || crypto.randomUUID());
  if (!validCorrelationId(correlationId)) return { error: 'Invalid correlation ID', status: 400 };
  if (!actionName || !rawTargetType || !collection || !targetId || reason.length < 3 || reason.length > 1000) return { error: 'Invalid action target or reason', status: 400 };
  if (actionName === 'grant_role' || actionName === 'revoke_role') {
    // Staff authority is intentionally never granted by a generic user action.
    // An invitation must be accepted by the verified Firebase identity instead.
    return { error: 'Staff roles may only be assigned through invitation acceptance', status: 403 };
  }
  let targetCollection = collection;
  let auditTarget = normalizedType;
  const raw = await rawDoc(env, collection, targetId);
  const isDefaultVerificationPolicy = targetCollection === 'verificationPolicies' && targetId === 'default' && actionName === 'update_verification_policy';
  if ((!raw?.data || !raw.updateTime) && !isDefaultVerificationPolicy && !(normalizedType === 'paymentGateway' && targetId === String(targetId)) && !(normalizedType === 'identityIntegrations' && targetId === 'nafath_rabet') && !(normalizedType === 'config' && (can(u, 'staff.manage') || can(u, 'config.manage')))) return { error: 'Target not found', status: 404 };
  const current = raw?.data || {};
  let fields: Record<string, any> = {};
  if (normalizedType === 'equipment' && ['archive_listing', 'delete_listing', 'hide_listing', 'show_listing'].includes(actionName)) {
    if (!can(u, 'moderation.manage') && !can(u, 'operations.manage')) return { error: 'Listing operations permission required', status: 403 };
    if (await listingRentalState(env, targetId)) return { error: 'Listing has an active rental', status: 409 };
    if (actionName === 'delete_listing') {
      if (current.ownerUid && current.ownerUid !== u.uid && u.role !== 'super_admin' && u.role !== 'admin') return { error: 'Admin required', status: 403 };
      await commit(env, [{ delete: fullName(env, `equipment/${encodeURIComponent(targetId)}`), currentDocument: { updateTime: raw!.updateTime } }, await auditWrite(env, u, actionName, auditTarget, targetId, correlationId, reason, current, null)]);
      return { success: true, correlationId, action: actionName, targetId };
    }
    fields = actionName === 'archive_listing'
      ? { isActive: jsonValue(false), visibility: jsonValue('archived'), archivedAt: { timestampValue: new Date().toISOString() }, archivedBy: jsonValue(u.uid) }
      : { isActive: jsonValue(actionName === 'show_listing' && current.moderationStatus === 'approved'), visibility: jsonValue(actionName === 'show_listing' ? 'visible' : 'hidden'), visibilityUpdatedBy: jsonValue(u.uid), visibilityUpdatedAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'driverProfile' && ['approve_driver', 'reject_driver', 'suspend_driver'].includes(actionName)) {
    if (!can(u, 'moderation.manage') && !can(u, 'operations.manage')) return { error: 'Driver operations permission required', status: 403 };
    fields = { active: jsonValue(actionName === 'approve_driver'), moderationStatus: jsonValue(actionName === 'approve_driver' ? 'approved' : actionName === 'reject_driver' ? 'rejected' : 'suspended'), moderationReason: jsonValue(reason), moderatedBy: jsonValue(u.uid), moderatedAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'paymentGateway' && actionName === 'update_gateway') {
    if (!can(u, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
    const registry = gatewayRegistry(env), gateway = String(targetId) as keyof typeof registry;
    if (!registry[gateway] || payload.enabled !== true && payload.enabled !== false) return { error: 'Invalid gateway', status: 400 };
    if (payload.enabled && (!registry[gateway].configured || !registry[gateway].adapterAvailable)) return { error: 'Gateway unavailable', status: 409 };
    fields = { enabled: jsonValue(payload.enabled), updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
    targetCollection = 'paymentGateways';
  } else if (normalizedType === 'identityIntegrations' && actionName === 'update_identity_integration') {
    if (!can(u, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
    const registry = identityIntegrationRegistry(env as any), integration = registry.nafath_rabet;
    if (targetId !== 'nafath_rabet' || payload.enabled !== true && payload.enabled !== false) return { error: 'Invalid identity integration', status: 400 };
    if (payload.enabled && !identityIntegrationMayEnable(integration)) return { error: 'Identity integration is not officially ready', status: 409 };
    fields = { enabled: jsonValue(payload.enabled), updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
    targetCollection = 'identityIntegrations';
  }
  if (!Object.keys(fields).length && normalizedType === 'user' && ['suspend_user', 'unsuspend_user', 'add_user_note'].includes(actionName)) {
    if (!can(u, 'support.manage')) return { error: 'Support permission required', status: 403 };
    fields = actionName === 'add_user_note' ? { adminNote: jsonValue(reason), adminNoteAt: { timestampValue: new Date().toISOString() }, adminNoteBy: jsonValue(u.uid) } : { suspensionStatus: jsonValue(actionName === 'suspend_user' ? 'temporarily_suspended' : 'active'), suspensionReason: jsonValue(reason), suspensionActor: jsonValue(u.uid), suspensionAt: { timestampValue: new Date().toISOString() } };
  } else if (!Object.keys(fields).length && normalizedType === 'equipment' && ['approve_listing', 'reject_listing', 'suspend_listing', 'rereview_listing', 'hide_equipment', 'unhide_equipment', 'flag_equipment', 'suspend_equipment'].includes(actionName)) {
    if (!can(u, 'moderation.manage')) return { error: 'Moderation permission required', status: 403 };
    const now = new Date().toISOString();
    if (actionName === 'approve_listing') {
      // Approval is the only place legacy listings receive a visibility value.
      // Explicit operator hiding/archiving always wins over moderation approval.
      const visibility = current.visibility === 'hidden' || current.visibility === 'archived' ? current.visibility : 'visible';
      fields = { moderationStatus: jsonValue('approved'), moderationReason: jsonValue(reason), reviewedBy: jsonValue(u.uid), reviewedAt: { timestampValue: now }, visibility: jsonValue(visibility), isActive: { booleanValue: visibility === 'visible' } };
    }
    else if (actionName === 'reject_listing') fields = { moderationStatus: jsonValue('rejected'), rejectionReason: jsonValue(reason), reviewedBy: jsonValue(u.uid), reviewedAt: { timestampValue: now }, isActive: { booleanValue: false } };
    else if (actionName === 'rereview_listing' || actionName === 'flag_equipment') fields = { moderationStatus: jsonValue('pending_review'), moderationReason: jsonValue(reason), reviewedBy: jsonValue(u.uid), reviewedAt: { timestampValue: now }, isActive: { booleanValue: false } };
    else if (actionName === 'hide_equipment') fields = { isActive: { booleanValue: false }, visibility: jsonValue('hidden'), visibilityUpdatedBy: jsonValue(u.uid), visibilityUpdatedAt: { timestampValue: now } };
    else if (actionName === 'unhide_equipment') fields = { isActive: { booleanValue: current.moderationStatus === 'approved' }, visibility: jsonValue('visible'), visibilityUpdatedBy: jsonValue(u.uid), visibilityUpdatedAt: { timestampValue: now } };
    else fields = { isActive: { booleanValue: false }, moderationStatus: jsonValue('suspended'), moderationReason: jsonValue(reason), reviewedBy: jsonValue(u.uid), reviewedAt: { timestampValue: now } };
  } else if (normalizedType === 'request') {
    if (!can(u, 'operations.manage')) return { error: 'Operations permission required', status: 403 };
    if (actionName === 'cancel_request' && !['pending', 'requested', 'accepted', 'draft'].includes(String(current.status))) return { error: 'Request cannot be cancelled in its current state', status: 409 };
    if (['freeze_request', 'escalate_request', 'investigate_request'].includes(actionName) && !['pending', 'requested', 'accepted', 'in_progress', 'completion_requested'].includes(String(current.status))) return { error: 'Request cannot be changed in its current state', status: 409 };
    const statuses: Record<string, string> = { cancel_request: 'cancelled' };
    if (statuses[actionName]) fields = { status: jsonValue(statuses[actionName]), adminIntervention: jsonValue(actionName), adminInterventionReason: jsonValue(reason), adminInterventionBy: jsonValue(u.uid), adminInterventionAt: { timestampValue: new Date().toISOString() } };
    else if (['freeze_request', 'escalate_request', 'investigate_request'].includes(actionName)) fields = { operationsState: jsonValue(actionName === 'freeze_request' ? 'frozen' : actionName === 'escalate_request' ? 'escalated' : 'under_investigation'), adminIntervention: jsonValue(actionName), adminInterventionReason: jsonValue(reason), adminInterventionBy: jsonValue(u.uid), adminInterventionAt: { timestampValue: new Date().toISOString() } };
    else if (actionName === 'add_request_note') fields = { adminNote: jsonValue(reason), adminNoteAt: { timestampValue: new Date().toISOString() }, adminNoteBy: jsonValue(u.uid) };
    else return { error: 'Unsupported request action', status: 400 };
  } else if (normalizedType === 'complaint' && ['resolve_complaint', 'close_complaint', 'review_complaint', 'add_complaint_note'].includes(actionName)) {
    if (!can(u, 'support.manage')) return { error: 'Support permission required', status: 403 };
    const statuses: Record<string, string> = { review_complaint: 'under_review', resolve_complaint: 'resolved', close_complaint: 'closed' };
    fields = statuses[actionName] ? { status: jsonValue(statuses[actionName]), resolvedBy: jsonValue(u.uid), resolvedAt: { timestampValue: new Date().toISOString() } } : { adminNote: jsonValue(reason), adminNoteBy: jsonValue(u.uid), adminNoteAt: { timestampValue: new Date().toISOString() } };
  } else if ((normalizedType === 'refunds' || normalizedType === 'payment') && actionName === 'request_refund') {
    if (!can(u, 'finance.mutate')) return { error: 'Finance permission required', status: 403 };
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
    if (!can(u, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
    if (typeof payload.enabled !== 'boolean' || !Number.isInteger(payload.priority) || Number(payload.priority) < 1 || Number(payload.priority) > 100) return { error: 'Invalid provider configuration', status: 400 };
    fields = { enabled: { booleanValue: payload.enabled }, priority: { integerValue: String(payload.priority) }, updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
  } else if (targetCollection === 'verificationPolicies' && actionName === 'update_verification_policy') {
    if (!can(u, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
    const policy = normalizeVerificationPolicy(payload.policy);
    if (!policy) return { error: 'Invalid verification policy', status: 400 };
    fields = { ...Object.fromEntries(Object.entries(policy).map(([key, value]) => [key, jsonValue(value)])), version: { integerValue: String(Number(current.version || 0) + 1) }, updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
  } else if (normalizedType === 'config' && (actionName === 'update_config' || actionName === 'update_auth_config')) {
    if (!can(u, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
    if (authConfigTarget || actionName === 'update_auth_config') {
      const expectedVersion = Number(payload.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || (raw?.data && Number(raw.data.version || 1) !== expectedVersion)) return { error: 'Configuration version conflict', status: 409 };
      const keys = ['requirePhoneOnSignup', 'allowEmailLogin', 'allowPhoneLogin', 'requirePhoneVerification'];
      if (payload.config?.phoneIndexReady !== undefined) return { error: 'Phone index readiness is server managed', status: 400 };
      const input = payload.config && typeof payload.config === 'object' ? { ...payload.config } : {};
      if (input.requireMobileDuringSignup !== undefined && input.requirePhoneOnSignup === undefined) input.requirePhoneOnSignup = input.requireMobileDuringSignup;
      delete input.requireMobileDuringSignup;
      fields = { ...Object.fromEntries(keys.filter(key => input[key] !== undefined).map(key => [key, jsonValue(input[key])])),
        version: { integerValue: String(expectedVersion + 1) }, updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
      if (!Object.keys(fields).length) return { error: 'Invalid auth configuration', status: 400 };
    } else {
    const allowedBusinessFields = new Set(['legalBusinessNameAr', 'legalBusinessNameEn', 'commercialRegistrationNumber', 'vatRegistrationNumber', 'supportEmail', 'supportPhone', 'invoiceLogoAssetRef', 'businessAddress']);
    if (!payload.config || typeof payload.config !== 'object' || Object.keys(payload.config).some(key => !allowedBusinessFields.has(key) || /secret|private|token|password|credential|key/i.test(key)) ||
      Object.values(payload.config).some(value => typeof value !== 'string' || value.length > 500)) return { error: 'Only structured non-secret business configuration is allowed', status: 400 };
    fields = { ...Object.fromEntries(Object.entries(payload.config).map(([key, value]) => [key, jsonValue(value)])), version: { integerValue: String(Number(current.version || 0) + 1) }, updatedBy: jsonValue(u.uid), updatedAt: { timestampValue: new Date().toISOString() } };
    }
  } else if (targetCollection === 'verificationProfiles' && ['start_manual_review', 'complete_manual_review', 'reject_manual_review', 'add_verification_note', 'set_provider_component', 'set_provider_requirements'].includes(actionName)) {
    if (!can(u, 'verification.manage')) return { error: 'Verification permission required', status: 403 };
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
      if (!can(u, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
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
    ...(targetCollection === 'heavyarConfig' && ['update_config', 'update_auth_config'].includes(actionName) ? [{ update: { name: fullName(env, `configVersions/${encodeURIComponent(`${targetId}:${Number(current.version || 0) + 1}`)}`), fields: { ...fields, configKey: jsonValue(targetId), immutable: jsonValue(true) } }, currentDocument: { exists: false } }] : []),
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

const AUTHORITY_INVITATION_ORIGIN = 'https://heavyar-app.web.app';
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));

async function sendAuthorityInvitation(
  env: Env, email: string, token: string, type: 'staff' | 'ownership', expiresAt: string, subject: string, label: string,
) {
  if (!env.RESEND_API_KEY) throw new Error('Invitation delivery unavailable');
  // The route is fixed to the trusted production admin UI. Request Host and
  // forwarded headers must never influence a bearer-style invitation link.
  const acceptanceUrl = `${AUTHORITY_INVITATION_ORIGIN}/accept-invite?type=${type}&token=${encodeURIComponent(token)}`;
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Heavyar <noreply@heavyar.app>',
      to: [email],
      subject,
      html: `<p>${escapeHtml(label)}</p><p>This ${type === 'ownership' ? 'ownership transfer' : 'staff access'} invitation expires at <strong>${escapeHtml(expiresAt)}</strong>.</p><p><a href="${acceptanceUrl}">Accept ${type === 'ownership' ? 'ownership transfer' : 'staff invitation'}</a></p><p>Accepting this link requires signing in with the invited, email-verified account.</p>`,
    }),
  });
  if (!sent.ok) throw new Error('Invitation delivery unavailable');
}

async function invitationToken(token: string) {
  if (!token || token.length > 200) return null;
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(token)));
}

async function createStaffInvitation(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'staff.manage')) return { error: 'Staff management permission required', status: 403 };
  const body: any = await req.json().catch(() => null);
  const email = normalizeAuthorityEmail(body?.email), role = invitationRole(body?.role);
  if (!email || !role) return { error: 'Invalid invitation', status: 400 };
  if (!env.RESEND_API_KEY) return { error: 'Invitation delivery unavailable', status: 503 };
  const token = crypto.randomUUID(), tokenHash = await invitationToken(token);
  if (!tokenHash) return { error: 'Invalid invitation', status: 400 };
  const id = `invite:${tokenHash}`, now = new Date().toISOString(), expiresAt = invitationExpiry();
  await commit(env, [
    { update: { name: fullName(env, `staffInvitations/${encodeURIComponent(id)}`), fields: {
      email: jsonValue(email), role: jsonValue(role), invitedBy: jsonValue(user.uid), status: jsonValue('pending'),
      expiresAt: { timestampValue: expiresAt }, createdAt: { timestampValue: now },
    } }, currentDocument: { exists: false } },
    await auditWrite(env, user, 'staff_invite_created', 'staffInvitation', id, crypto.randomUUID(), 'staff invitation created'),
  ]);
  try {
    await sendAuthorityInvitation(env, email, token, 'staff', expiresAt, 'Heavyar staff invitation', 'You have been invited to Heavyar staff access.');
  } catch {
    // The invitation cannot become an untracked delivery.  It remains pending
    // only for the documented expiry period and administrators can revoke it.
    await commit(env, [await auditWrite(env, user, 'staff_invite_delivery_failed', 'staffInvitation', id, crypto.randomUUID(), 'invitation delivery failed')]);
    return { error: 'Invitation delivery unavailable', status: 503 };
  }
  return { success: true, invitationId: id, expiresAt, status: 'pending' };
}

async function revokeStaffAuthority(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'staff.manage')) return { error: 'Staff management permission required', status: 403 };
  const body: any = await req.json().catch(() => null), uid = String(body?.uid || body?.targetUid || ''), reason = String(body?.reason || '').trim();
  if (!uid || uid.length > 128 || reason.length < 3 || uid === user.uid) return { error: 'Invalid staff revocation', status: 400 };
  const owner = await rawDoc(env, 'heavyarConfig', 'owner');
  if (owner?.data?.ownerUid === uid) return { error: 'Canonical owner must use ownership transfer', status: 409 };
  const staff = await rawDoc(env, 'staffMembers', uid);
  if (!staff?.data || staff.data.active !== true) return { error: 'Active staff member not found', status: 404 };
  const roleVersion = Number(staff.data.roleVersion || 0) + 1, now = new Date().toISOString();
  await commit(env, [
    { update: { name: fullName(env, `staffMembers/${encodeURIComponent(uid)}`), fields: {
      active: { booleanValue: false }, status: jsonValue('revoked'), revokedBy: jsonValue(user.uid), revokedAt: { timestampValue: now }, roleVersion: { integerValue: String(roleVersion) },
    } }, updateMask: { fieldPaths: ['active', 'status', 'revokedBy', 'revokedAt', 'roleVersion'] }, currentDocument: { updateTime: staff.updateTime } },
    claimSyncWrite(env, uid, null, false, roleVersion),
    await auditWrite(env, user, 'staff_revoked', 'staff', uid, crypto.randomUUID(), reason),
  ]);
  env.__executionCtx?.waitUntil(processStaffClaimSync(env));
  return { success: true, uid, status: 'revoked' };
}

async function cancelStaffInvitation(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'staff.manage')) return { error: 'Staff management permission required', status: 403 };
  const body: any = await req.json().catch(() => null), id = String(body?.id || body?.invitationId || ''), reason = String(body?.reason || '').trim();
  if (!/^invite:[A-Za-z0-9_-]{20,}$/.test(id) || reason.length < 3) return { error: 'Invalid invitation cancellation', status: 400 };
  const invitation = await rawDoc(env, 'staffInvitations', id);
  if (!invitation?.data || invitation.data.status !== 'pending') return { error: 'Pending invitation not found', status: 404 };
  await commit(env, [
    { update: { name: fullName(env, `staffInvitations/${encodeURIComponent(id)}`), fields: { status: jsonValue('revoked'), revokedBy: jsonValue(user.uid), revokedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'revokedBy', 'revokedAt'] }, currentDocument: { updateTime: invitation.updateTime } },
    await auditWrite(env, user, 'staff_invitation_revoked', 'staffInvitation', id, crypto.randomUUID(), reason),
  ]);
  return { success: true, invitationId: id, status: 'revoked' };
}

/** Exported for the non-admin route dispatcher: acceptance is deliberately public-to-authenticated. */
export async function acceptStaffInvitation(req: Request, env: Env, user: AdminUser) {
  const body: any = await req.json().catch(() => null), hash = await invitationToken(String(body?.token || ''));
  if (!hash) return { error: 'Invalid invitation', status: 400 };
  const raw = await rawDoc(env, 'staffInvitations', `invite:${hash}`);
  const email = await verifiedIdentityEmail(env, user);
  if (!email || !pendingAndUnexpired(raw?.data) || raw!.data.email !== email) return { error: 'Invitation is invalid or expired', status: 403 };
  const role = invitationRole(raw!.data.role);
  if (!role) return { error: 'Invitation is invalid', status: 403 };
  const current = await rawDoc(env, 'staffMembers', user.uid), roleVersion = Number(current?.data?.roleVersion || 0) + 1, now = new Date().toISOString();
  try {
    await commit(env, [
      { update: { name: fullName(env, `staffMembers/${encodeURIComponent(user.uid)}`), fields: {
        uid: jsonValue(user.uid), email: jsonValue(email), role: jsonValue(role), active: { booleanValue: true },
        roleVersion: { integerValue: String(roleVersion) }, invitationId: jsonValue(`invite:${hash}`), joinedAt: { timestampValue: now },
      } }, currentDocument: current?.updateTime ? { updateTime: current.updateTime } : { exists: false } },
      claimSyncWrite(env, user.uid, role, true, roleVersion),
      { update: { name: fullName(env, `staffInvitations/${encodeURIComponent(`invite:${hash}`)}`), fields: {
        status: jsonValue('accepted'), acceptedBy: jsonValue(user.uid), acceptedAt: { timestampValue: now },
      } }, updateMask: { fieldPaths: ['status', 'acceptedBy', 'acceptedAt'] }, currentDocument: { updateTime: raw!.updateTime } },
      await auditWrite(env, user, 'staff_invitation_accepted', 'staffInvitation', `invite:${hash}`, crypto.randomUUID(), 'invitation accepted'),
    ]);
  } catch { return { error: 'Invitation has already been accepted', status: 409 }; }
  env.__executionCtx?.waitUntil(processStaffClaimSync(env));
  return { success: true, role, status: 'accepted' };
}

async function ownership(req: Request, env: Env, user: AdminUser, operation: 'initiate' | 'accept' | 'cancel' | 'read') {
  if (operation === 'read') {
    if (!can(user, 'staff.manage')) return { error: 'Staff management permission required', status: 403 };
    const owner = await rawDoc(env, 'heavyarConfig', 'owner');
    const pending = await rawDoc(env, 'ownershipTransfers', 'pending');
    const ownerUid = typeof owner?.data?.ownerUid === 'string' ? owner.data.ownerUid : '';
    const person = ownerUid ? await rawDoc(env, 'users', ownerUid) : null;
    const member = ownerUid ? await rawDoc(env, 'staffMembers', ownerUid) : null;
    const email = normalizeAuthorityEmail(person?.data?.email) || normalizeAuthorityEmail(member?.data?.email) ||
      (ownerUid === user.uid ? normalizeAuthorityEmail(user.email) : null);
    const currentOwner = { ...redact(owner?.data || {}), name: displayName(person?.data || member?.data, ''), email };
    return { success: true, owner: currentOwner, pendingTransfer: pending?.data && pendingAndUnexpired(pending.data) ? redact(pending.data) : null };
  }
  if (operation === 'accept') {
    const body: any = await req.json().catch(() => null), hash = await invitationToken(String(body?.token || ''));
    if (!hash) return { error: 'Invalid ownership invitation', status: 400 };
    const transfer = await rawDoc(env, 'ownershipTransfers', 'pending'), email = await verifiedIdentityEmail(env, user);
    if (!email || !pendingAndUnexpired(transfer?.data) || transfer!.data.tokenHash !== hash || transfer!.data.targetEmail !== email) {
      return { error: 'Ownership invitation is invalid or expired', status: 403 };
    }
    const ownerConfig = await rawDoc(env, 'heavyarConfig', 'owner');
    const formerUid = String(ownerConfig?.data?.ownerUid || '');
    if (!formerUid || formerUid !== transfer!.data.currentOwnerUid) return { error: 'Ownership transfer is no longer valid', status: 409 };
    const prior = await rawDoc(env, 'staffMembers', formerUid), target = await rawDoc(env, 'staffMembers', user.uid);
    const targetVersion = Number(target?.data?.roleVersion || 0) + 1, formerVersion = Number(prior?.data?.roleVersion || 0) + 1, now = new Date().toISOString();
    await commit(env, [
      { update: { name: fullName(env, `staffMembers/${encodeURIComponent(user.uid)}`), fields: {
        uid: jsonValue(user.uid), email: jsonValue(email), role: jsonValue('owner'), active: { booleanValue: true },
        roleVersion: { integerValue: String(targetVersion) }, ownershipTransferId: jsonValue('pending'), grantedAt: { timestampValue: now },
      } }, currentDocument: target?.updateTime ? { updateTime: target.updateTime } : { exists: false } },
      { update: { name: fullName(env, `staffMembers/${encodeURIComponent(formerUid)}`), fields: {
        role: jsonValue('super_admin'), active: { booleanValue: true }, roleVersion: { integerValue: String(formerVersion) }, demotedAt: { timestampValue: now },
      } }, updateMask: { fieldPaths: ['role', 'active', 'roleVersion', 'demotedAt'] }, currentDocument: prior?.updateTime ? { updateTime: prior.updateTime } : { exists: false } },
      { update: { name: fullName(env, 'heavyarConfig/owner'), fields: {
        ownerUid: jsonValue(user.uid), previousOwnerUid: jsonValue(formerUid), version: { integerValue: String(Number(ownerConfig?.data?.version || 0) + 1) }, updatedAt: { timestampValue: now },
      } }, updateMask: { fieldPaths: ['ownerUid', 'previousOwnerUid', 'version', 'updatedAt'] }, currentDocument: { updateTime: ownerConfig!.updateTime } },
      { update: { name: fullName(env, 'ownershipTransfers/pending'), fields: {
        status: jsonValue('accepted'), acceptedBy: jsonValue(user.uid), acceptedAt: { timestampValue: now },
      } }, updateMask: { fieldPaths: ['status', 'acceptedBy', 'acceptedAt'] }, currentDocument: { updateTime: transfer!.updateTime } },
      claimSyncWrite(env, user.uid, 'owner', true, targetVersion),
      claimSyncWrite(env, formerUid, 'super_admin', true, formerVersion),
      await auditWrite(env, user, 'ownership_transfer_accepted', 'ownershipTransfer', 'pending', crypto.randomUUID(), 'ownership transfer accepted', { ownerUid: formerUid }, { ownerUid: user.uid }),
    ]);
    env.__executionCtx?.waitUntil(processStaffClaimSync(env));
    return { success: true, ownerUid: user.uid };
  }
  if (!can(user, 'owner.transfer')) return { error: 'Owner permission required', status: 403 };
  const ownerConfig = await rawDoc(env, 'heavyarConfig', 'owner');
  if (String(ownerConfig?.data?.ownerUid || '') !== user.uid) return { error: 'Current owner required', status: 403 };
  const pending = await rawDoc(env, 'ownershipTransfers', 'pending');
  if (operation === 'cancel') {
    const body: any = await req.json().catch(() => null), reason = String(body?.reason || '').trim();
    if (reason.length < 3 || !pending?.data || !pendingAndUnexpired(pending.data)) return { error: 'No cancellable ownership transfer', status: 409 };
    await commit(env, [
      { update: { name: fullName(env, 'ownershipTransfers/pending'), fields: { status: jsonValue('cancelled'), cancelledBy: jsonValue(user.uid), cancelledAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'cancelledBy', 'cancelledAt'] }, currentDocument: { updateTime: pending.updateTime } },
      await auditWrite(env, user, 'ownership_transfer_cancelled', 'ownershipTransfer', 'pending', crypto.randomUUID(), reason),
    ]);
    return { success: true, status: 'cancelled' };
  }
  const body: any = await req.json().catch(() => null), targetEmail = normalizeAuthorityEmail(body?.email), reason = String(body?.reason || '').trim();
  if (!targetEmail || reason.length < 3 || !isFreshReauthentication(user.authTime) || targetEmail === normalizeAuthorityEmail(user.email)) return { error: 'Recent reauthentication, a different valid email, and a reason are required', status: 409 };
  if (pending?.data && pendingAndUnexpired(pending.data)) return { error: 'An ownership transfer is already pending', status: 409 };
  if (!env.RESEND_API_KEY) return { error: 'Invitation delivery unavailable', status: 503 };
  const token = crypto.randomUUID(), tokenHash = await invitationToken(token), now = new Date().toISOString(), expiresAt = invitationExpiry();
  await commit(env, [
    { update: { name: fullName(env, 'ownershipTransfers/pending'), fields: {
      tokenHash: jsonValue(tokenHash), targetEmail: jsonValue(targetEmail), currentOwnerUid: jsonValue(user.uid), status: jsonValue('pending'),
      expiresAt: { timestampValue: expiresAt }, initiatedBy: jsonValue(user.uid), createdAt: { timestampValue: now },
    } }, currentDocument: pending?.updateTime ? { updateTime: pending.updateTime } : { exists: false } },
    await auditWrite(env, user, 'ownership_transfer_initiated', 'ownershipTransfer', 'pending', crypto.randomUUID(), reason, { ownerUid: user.uid }, { targetEmail }),
  ]);
  try { await sendAuthorityInvitation(env, targetEmail, token, 'ownership', expiresAt, 'Heavyar ownership transfer', 'You have been invited to accept a Heavyar ownership transfer.'); }
  catch { await commit(env, [await auditWrite(env, user, 'ownership_transfer_delivery_failed', 'ownershipTransfer', 'pending', crypto.randomUUID(), 'ownership invitation delivery failed')]); return { error: 'Invitation delivery unavailable', status: 503 }; }
  return { success: true, status: 'pending', expiresAt };
}

export async function handleAdmin(req: Request, env: Env, user: AdminUser) {
  const url = new URL(req.url);
  // This route is intentionally before requireAdmin: an invited customer or a
  // newly created Firebase user is not staff until this atomic acceptance.
  if ((url.pathname === '/api/admin/staff/invitations/accept' || url.pathname === '/api/staff/invitations/accept') && req.method === 'POST') {
    return acceptStaffInvitation(req, env, user);
  }
  if ((url.pathname === '/api/admin/ownership/accept' || url.pathname === '/api/ownership/accept') && req.method === 'POST') {
    return ownership(req, env, user, 'accept');
  }
  const bootstrapConfig = user.testInjected ? null : await rawDoc(env, 'heavyarConfig', 'owner');
  const staff = user.testInjected ? null : await rawDoc(env, 'staffMembers', user.uid);
  const bootstrapException = (!bootstrapConfig?.data?.ownerUid && !staff?.data) &&
    ((url.pathname === '/api/admin/session' && (user.role === 'super_admin' || user.permissionRole === 'super_admin')) ||
      (url.pathname === '/api/admin/owner-bootstrap' && (user.role === 'super_admin' || user.permissionRole === 'super_admin')));
  if (!bootstrapException) await requireAdmin(user, env);
  if (url.pathname === '/api/admin/session' && req.method === 'GET') return { success: true, uid: user.uid, role: user.permissionRole || user.role, bootstrapRequired: bootstrapException };
  if (url.pathname === '/api/admin/overview' && !can(user, 'audit.read')) return { error: 'Operational read permission required', status: 403 };
  if (url.pathname === '/api/admin/payment-gateways' && req.method === 'GET') {
    if (!can(user, 'finance.read') && !can(user, 'payouts.read')) return { error: 'Finance or payouts permission required', status: 403 };
    const registry = gatewayRegistry(env);
    // Configuration is deliberately capability-only. Secrets and raw provider
    // configuration never cross the admin API boundary.
    const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'paymentGateways' }], limit: 20 } }) }) as any[] || [];
    const configured = Object.fromEntries(rows.filter((row) => row.document).map((row) => [String(row.document.name).split('/').pop(), decode(row.document)]));
    const gateways = Object.entries(registry).map(([provider, value]) => {
      const stored: any = configured[provider] || {};
      return { provider, configured: value.configured, enabled: stored.enabled === true, adapterAvailable: value.adapterAvailable,
        environment: value.environment, health: value.configured && value.adapterAvailable ? 'available' : value.configured ? 'unavailable' : 'unconfigured',
        priority: Number(stored.priority || 0), methods: ['card'], supportsSplit: value.supportsSplit,
        capabilities: { refunds: false, savedCards: false, split: value.supportsSplit } };
    });
    return { success: true, gateways, items: gateways };
  }
  if (url.pathname === '/api/admin/identity-integrations' && req.method === 'GET') {
    if (!can(user, 'config.manage') && !can(user, 'verification.manage')) return { error: 'Identity integration permission required', status: 403 };
    const registry = identityIntegrationRegistry(env as any);
    const stored = await rawDoc(env, 'identityIntegrations', 'nafath_rabet');
    const integration = registry.nafath_rabet;
    const integrations = [{
      ...integration,
      // A stored request cannot override the technical readiness boundary.
      enabled: stored?.data?.enabled === true && identityIntegrationMayEnable(integration),
      status: stored?.data?.enabled === true && identityIntegrationMayEnable(integration) ? 'enabled' : integration.status,
    }];
    return { success: true, integrations, items: integrations };
  }
  if (url.pathname === '/api/admin/staff' && req.method === 'GET') {
    if (!can(user, 'staff.manage')) return { error: 'Staff management permission required', status: 403 };
    const result = await listCollection(env, 'staffMembers', {}, Math.min(50, Number(url.searchParams.get('limit') || 30)), url.searchParams.get('cursor'));
    return { success: true, staff: result.items, items: result.items, nextCursor: result.nextCursor };
  }
  if (url.pathname === '/api/admin/staff/invitations' && req.method === 'GET') {
    if (!can(user, 'staff.manage')) return { error: 'Staff management permission required', status: 403 };
    const result = await listCollection(env, 'staffInvitations', Object.fromEntries(url.searchParams.entries()), Math.min(50, Number(url.searchParams.get('limit') || 30)), url.searchParams.get('cursor'));
    return { success: true, invitations: result.items, items: result.items, nextCursor: result.nextCursor };
  }
  if ((url.pathname === '/api/admin/staff/invitations' || url.pathname === '/api/admin/staff/invite') && req.method === 'POST') return createStaffInvitation(req, env, user);
  if (url.pathname === '/api/admin/staff/revoke' && req.method === 'POST') return revokeStaffAuthority(req, env, user);
  if (url.pathname === '/api/admin/staff/invitations/cancel' && req.method === 'POST') return cancelStaffInvitation(req, env, user);
  if (url.pathname === '/api/admin/ownership' && req.method === 'GET') return ownership(req, env, user, 'read');
  if (url.pathname === '/api/admin/ownership' && req.method === 'POST') return ownership(req, env, user, 'initiate');
  if (url.pathname === '/api/admin/ownership/cancel' && req.method === 'POST') return ownership(req, env, user, 'cancel');
  if (url.pathname === '/api/admin/owner-transfer' && req.method === 'POST') return { error: 'Use the accepted ownership invitation flow', status: 410 };
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
    if (!can(user, 'audit.read')) return { error: 'Operational read permission required', status: 403 };
    const result = await notificationHealth(env);
    return { success: true, summary: {
      sent: result.health.deliveries.success,
      failed: (result.health.deliveries.permanent || 0) + (result.health.deliveries.retryable || 0),
      pending: result.health.pending,
      deactivatedTokens: result.health.deactivatedTokens,
    }, failures: result.recent || [] };
  }
  if (url.pathname === '/api/admin/notifications/delivery-cleanup' && req.method === 'POST') {
    if (!can(user, 'support.manage')) return { error: 'Support permission required', status: 403 };
    return cleanupNotificationDeliveries(req, env, user);
  }
  if (url.pathname === '/api/admin/notification-retry' && req.method === 'POST') {
    if (!can(user, 'support.manage')) return { error: 'Support permission required', status: 403 };
    return retryNotificationDeliveries(req, env, user);
  }
  if (url.pathname === '/api/admin/public-identifiers/backfill' && req.method === 'POST') return backfillPublicIdentifiers(req, env, user);
  if (url.pathname === '/api/admin/action' && req.method === 'POST') return action(req, env, user);
  if (url.pathname === '/api/admin/roles' && req.method === 'POST') return { error: 'Staff roles may only be assigned through invitation acceptance', status: 403 };
  if (req.method !== 'GET') return { error: 'Method not allowed', status: 405 };
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 30)));
  const cursor = url.searchParams.get('cursor');
  const pathMap: Record<string, string> = {
    '/api/admin/users': 'users', '/api/admin/providers': 'users', '/api/admin/equipment': 'equipment', '/api/admin/requests': 'equipmentRequests',
    '/api/admin/payments': 'payments', '/api/admin/invoices': 'invoices', '/api/admin/refunds': 'refunds', '/api/admin/complaints': 'complaints',
    '/api/admin/verification': 'verificationCases', '/api/admin/verification-profiles': 'verificationProfiles', '/api/admin/verification-attempts': 'verificationAttempts', '/api/admin/verification-events': 'verificationEvents', '/api/admin/provider-configs': 'providerConfigs', '/api/admin/config': 'heavyarConfig', '/api/admin/audit': 'adminAudit', '/api/admin/deletion-requests': 'deletionRequests', '/api/admin/drivers': 'driverProfiles', '/api/admin/campaigns': 'campaigns',
  };
  if (url.pathname === '/api/admin/overview') {
    const requestStatuses = ['pending', 'requested', 'accepted', 'in_progress', 'completion_requested', 'under_investigation', 'escalated'];
    const paymentStates = ['created', 'pending', 'requires_action', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refund_pending', 'refunded', 'partially_refunded'];
    const financeVisible = can(user, 'finance.read') || can(user, 'payouts.read');
    const [users, providers, equipment, requests, payments, invoices, complaints, suspended, paidVolume, pendingVolume, failedPayments, recent] = await Promise.all([
      countCollection(env, 'users'),
      countCollection(env, 'users', { field: 'role', value: 'provider' }),
      countCollection(env, 'equipment', { field: 'isActive', value: true }),
      Promise.all(requestStatuses.map(status => countCollection(env, 'equipmentRequests', { field: 'status', value: status }))),
      financeVisible ? countCollection(env, 'payments') : Promise.resolve(null),
      financeVisible ? countCollection(env, 'invoices') : Promise.resolve(null),
      countCollection(env, 'complaints', { field: 'status', value: 'open' }),
      Promise.all(['temporarily_suspended', 'permanently_suspended'].map(status => countCollection(env, 'users', { field: 'suspensionStatus', value: status }))),
      financeVisible ? aggregateCollection(env, 'payments', { field: 'state', value: 'paid' }, 'amount') : Promise.resolve(null),
      financeVisible ? aggregateCollection(env, 'payments', { field: 'state', value: 'pending' }, 'amount') : Promise.resolve(null),
      financeVisible ? countCollection(env, 'payments', { field: 'state', value: 'failed' }) : Promise.resolve(null),
      recentAudit(env),
    ]);
    const requestsByStatus = Object.fromEntries(requestStatuses.map((status, index) => [status, (requests as any[])[index]]));
    const paymentCounts = financeVisible ? await Promise.all(paymentStates.map(status => countCollection(env, 'payments', { field: 'state', value: status }))) : [];
    const paymentsByState = Object.fromEntries(paymentStates.map((status, index) => [status, paymentCounts[index]]));
    return { success: true, metrics: {
      totalUsers: users, activeProviders: providers, listings: equipment, equipmentListings: equipment,
      activeRequests: (requests as any[]).reduce((sum, value) => sum + (Number(value) || 0), 0),
      requestsByStatus, openComplaints: complaints, suspendedAccounts: suspended,
      recentAuditEvents: recent,
      ...(financeVisible ? { payments, paymentsByState, paidSarVolume: paidVolume, pendingSarVolume: pendingVolume, failedPayments, invoices } : {}),
    } };
  }
  const detailMatch = url.pathname.match(/^\/api\/admin\/detail\/([^/]+)\/([^/]+)$/);
  if (detailMatch) {
    const aliases: Record<string, string> = { request: 'equipmentRequests', provider: 'users', driver: 'driverProfiles', listing: 'equipment', authConfig: 'heavyarConfig' };
    const collection = aliases[detailMatch[1]] || detailMatch[1];
    const requestedId = decodeURIComponent(detailMatch[2]);
    const lookupId = detailMatch[1] === 'authConfig' && requestedId === 'default' ? 'auth' : requestedId;
    if (!FILTERS[collection]) return { error: 'Not found', status: 404 };
    if (!canReadCollection(user, collection)) return { error: 'Permission required', status: 403 };
    const raw = await rawDoc(env, collection, lookupId);
    if (!raw?.data) {
      const id = requestedId;
      if (collection === 'heavyarConfig' && id === 'business') {
        return { success: true, item: { id, missing: true, legalBusinessNameAr: '', legalBusinessNameEn: '',
          commercialRegistrationNumber: '', vatRegistrationNumber: '', supportEmail: '', supportPhone: '',
          invoiceLogoAssetRef: '', businessAddress: '' } };
      }
      if (collection === 'heavyarConfig' && id === 'default') return { success: true, item: { id, missing: true, ...defaultAuthConfig() } };
      if (collection === 'verificationPolicies' && id === 'default') {
        return { success: true, item: { id, missing: true, ...defaultVerificationPolicy() } };
      }
      return { error: 'Not found', status: 404 };
    }
    if (collection === 'heavyarConfig' && lookupId === 'auth') return { success: true, item: { id: requestedId, ...authConfigProjection(env, raw.data) } };
    const [item] = await enrichAdminItems(env, collection, [{ id: requestedId, ...redact(raw.data) }]);
    return { success: true, item: { ...item, technicalIds: { firestoreDocumentId: requestedId } } };
  }
  const collection = pathMap[url.pathname];
  if (!collection) return { error: 'Not found', status: 404 };
  if (!canReadCollection(user, collection)) return { error: 'Permission required', status: 403 };
  const query = Object.fromEntries([...url.searchParams.entries()].filter(([, value]) => value.trim() !== ''));
  if (query.sort && !['createdAt', 'updatedAt', 'timestamp', 'status', 'amount'].includes(query.sort)) return { error: 'Invalid sort field', status: 400 };
  if (query.direction && !['asc', 'desc'].includes(query.direction)) return { error: 'Invalid sort direction', status: 400 };
  if (url.pathname === '/api/admin/providers') query.role = 'provider';
  if (url.pathname === '/api/admin/drivers') {
    if (query.status) { query.availabilityStatus = query.status; delete query.status; }
    if (query.moderation) { query.moderationStatus = query.moderation; delete query.moderation; }
    if (query.verification) { query.trustStatus = query.verification; delete query.verification; }
  }
  if (query.q) {
    const q = query.q.trim();
    if (!q || q.length > 200) return { error: 'Invalid search query', status: 400 };
    if (!['users', 'equipment', 'equipmentRequests', 'payments', 'invoices', 'refunds', 'complaints', 'driverProfiles'].includes(collection)) {
      return { error: 'Search is not supported for this resource', status: 400 };
    }
    query.q = q;
  }
  try {
    const result = await listCollection(env, collection, query, limit, cursor);
    return { success: true, ...result, items: await enrichAdminItems(env, collection, result.items) };
  } catch (error) {
    if (error instanceof Error && ['Invalid cursor', 'Invalid sort field', 'Invalid sort direction', 'Invalid search query'].includes(error.message)) {
      return { error: error.message, status: 400 };
    }
    throw error;
  }
}
