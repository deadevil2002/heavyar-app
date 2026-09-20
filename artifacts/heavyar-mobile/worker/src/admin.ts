import { listFirebaseAuthIdentities, type Env } from './index';
import { evaluateCanonicalCompleteness, SECURITY_SUSPENSION_STATUSES, STORE_REVIEW_PURPOSE, isOperationallyBlocked, isStoreReviewAccount } from './integrity';
import { canTransitionManualReview, deriveProviderTrust, isProviderComponentName, normalizeRequiredProviderComponents, providerComponentNames, providerVerificationFor, verificationStatuses } from './verification';
import { defaultVerificationPolicy, normalizeVerificationPolicy } from './verification';
import { notificationWrite } from './notifications';
import { gatewayRegistry, campaignRecipients, invitationExpiry, normalizeStaffRole, hasPermission, identityIntegrationMayEnable, identityIntegrationRegistry, type StaffRole, type Permission } from './completion';
import { invitationRole, isFreshReauthentication, normalizeAuthorityEmail, pendingAndUnexpired } from './authority';
import { createAdminExportService, createInvoicePdfService, type DocumentBinaryResponse, type DocumentActor, type ExportEntity, type ExportFilters, type InvoiceBusinessSettings, type TrustedInvoiceSource } from './admin-documents';
import { ensurePublicIdentifier, formatPublicIdentifier, isPublicIdentifier, PUBLIC_IDENTIFIER_COUNTER_IDS, PUBLIC_IDENTIFIER_FIELDS, type PublicIdentifierKind } from './public-identifiers';
import { legacyProviderReady } from './moderation';
import { handleCommercialAdmin, CommercialPersistenceError } from './commercial-admin';
import { handleSeoAdmin, SeoPersistenceError, type SeoStore } from './seo-admin';
import { handleSeoPublic } from './seo-public';
import { minorToMajor, type CommercialSnapshot } from './commercial';
import { quotaFetch, isQuotaError } from './quota-policy';
import { sendResend } from './index';
import { handleEarlyAccessAdmin } from './early-access-admin';
import { handleEarlyAccessPublic } from './early-access-public';
import { EarlyAccessError, subscriberFacets, type EarlyAccessStore } from './early-access-model';
import { dailyEarlyAccessRetention } from './early-access-retention';
import { earlyAccessDeliveryProof } from './early-access-delivery';
import { processEarlyAccessCampaigns } from './early-access-campaign-delivery';

export type AdminRole = 'super_admin' | 'admin';
export type AdminUser = { uid: string; admin: boolean; role?: AdminRole; permissionRole?: string; email?: string; emailVerified?: boolean; displayName?: string; authTime?: number; testInjected?: true };
export type LegacyListingEvaluation = { eligible: boolean; needsMigration: boolean; reasons: string[]; migrationAudit: boolean };

export function evaluateLegacyEquipment(
  listing: Record<string, any>,
  owner: Record<string, any> | null,
  country: Record<string, any> | null,
  auditRows: Array<Record<string, any>> = [],
): LegacyListingEvaluation {
  const countryCode = String(listing.countryCode || owner?.countryCode || 'SA').toUpperCase();
  const countryData = country || {};
  const defaultCountryEnabled = countryCode === 'SA';
  const countryEnabled = (countryData.enabled === undefined ? defaultCountryEnabled : countryData.enabled === true)
    && (countryData.marketplaceAvailable === undefined ? defaultCountryEnabled : countryData.marketplaceAvailable === true)
    && (countryData.providerOnboardingAvailable === undefined ? defaultCountryEnabled : countryData.providerOnboardingAvailable === true);
  const migrationAudit = auditRows.some(row => row.action === 'legacy_migration_publish' && row.automated === true);
  const moderationActions = ['approve_listing', 'reject_listing', 'suspend_listing', 'hide_listing', 'hide_equipment', 'show_listing', 'unhide_equipment', 'rereview_listing', 'flag_equipment', 'suspend_equipment'];
  const adminEvidence = auditRows.some(row => moderationActions.includes(String(row.action)) && row.automated !== true);
  const onboarding = legacyProviderReady(owner) || owner?.providerOnboardingCompleted === true || owner?.providerOnboardingComplete === true
    || owner?.onboardingCompleted === true || owner?.providerOnboardingStatus === 'completed'
    || owner?.onboardingStatus === 'completed';
  const reasons: string[] = [];
  if (!owner) reasons.push('owner_missing');
  if (owner?.role !== 'provider') reasons.push('owner_not_provider');
  if (listing.countryCode && owner?.countryCode && String(listing.countryCode).toUpperCase() !== String(owner.countryCode).toUpperCase()) reasons.push('country_mismatch');
  if (isOperationallyBlocked(owner)) reasons.push('owner_restricted');
  if (!onboarding) reasons.push('provider_onboarding_incomplete');
  if (!countryEnabled) reasons.push('country_unavailable');
  if (!['titleEn', 'titleAr', 'pricePerDay'].every(field => listing[field] !== undefined && listing[field] !== null && String(listing[field]).trim() !== '')
    || !Number.isFinite(Number(listing.pricePerDay))) reasons.push('required_listing_fields_missing');
  if (['rejected', 'suspended'].includes(String(listing.moderationStatus))
    || listing.moderationStatus === 'pending_review'
    || listing.visibility !== undefined && listing.visibility !== null
    || listing.isActive !== undefined && listing.isActive !== null
    || listing.adminHidden === true || listing.restricted === true || listing.visibility === 'archived'
    || Boolean(listing.reviewedBy || listing.moderatedBy || listing.rejectionReason || listing.suspensionReason)
    || adminEvidence) reasons.push('moderation_restriction');
  if (migrationAudit && listing.moderationStatus === 'approved') reasons.push('already_migrated');
  const legacyState = (listing.moderationStatus === undefined || listing.moderationStatus === null)
    && (listing.visibility === undefined || listing.visibility === null);
  const needsMigration = legacyState && !migrationAudit;
  if (!needsMigration && !migrationAudit && reasons.length === 0) reasons.push('not_pre_schema');
  return { eligible: reasons.length === 0 && needsMigration, needsMigration, reasons, migrationAudit };
}

type RawDoc = { data: any; updateTime?: string; name?: string };
let firestoreOverride: ((collection: string, id: string) => any) | undefined;
let commitOverride: unknown[][] | undefined;
let identityOverride: ((uid: string, role: StaffRole | null) => Promise<{ role: StaffRole | null; previousRole: unknown }>) | undefined;
let verifiedEmailOverride: ((uid: string) => Promise<string | null>) | undefined;
let queryOverride: ((collection: string, before: string, limit: number, query?: any) => RawDoc[]) | undefined;
export const __adminTest = {
  setFirestore(fn?: (collection: string, id: string) => any) { firestoreOverride = fn; },
  captureCommits(target?: unknown[][]) { commitOverride = target; },
  setIdentity(fn?: (uid: string, role: StaffRole | null) => Promise<{ role: StaffRole | null; previousRole: unknown }>) { identityOverride = fn; },
  setVerifiedEmail(fn?: (uid: string) => Promise<string | null>) { verifiedEmailOverride = fn; },
  setQuery(fn?: (collection: string, before: string, limit: number, query?: any) => RawDoc[]) { queryOverride = fn; },
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

class FirestoreConflictError extends Error {}

async function fs(env: Env, path: string, init: RequestInit = {}) {
  const response = await quotaFetch(firestoreUrl(env, path), { ...init, headers: { Authorization: `Bearer ${await googleToken(env)}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (response.status === 404 && path !== ':commit') return null;
  if (response.status === 403) throw new Error('Firestore permission denied');
  if (response.status === 409 || response.status === 412) throw new FirestoreConflictError('Concurrent update');
  if (response.status === 400) {
    const error = await response.json().catch(() => null) as any;
    if (error?.error?.status === 'FAILED_PRECONDITION' || error?.error?.status === 'ABORTED') throw new FirestoreConflictError('Concurrent update');
  }
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

async function priorResendEvent(env: Env, providerMessageId: string, retainSubscriberSuppression = false) {
  if (!providerMessageId) return null;
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'resendWebhookEvents' }],
    where: { fieldFilter: { field: { fieldPath: 'providerMessageId' }, op: 'EQUAL', value: jsonValue(providerMessageId) } },
    limit: 20,
  } }) }) as any[] || [];
  const allowed = new Set(['accepted', 'delivered', 'bounced', 'complained', 'failed']);
  return rows.flatMap(row => row.document ? [decode(row.document)] : [])
    .filter(event => event.providerMessageId === providerMessageId && allowed.has(String(event.status)))
    .sort((a, b) => {
      if (retainSubscriberSuppression) {
        const rank = (status: string) => status === 'complained' ? 2 : status === 'bounced' ? 1 : 0;
        const terminal = rank(b.status) - rank(a.status);
        if (terminal) return terminal;
      }
      return Date.parse(String(b.eventAt || b.processedAt || '')) - Date.parse(String(a.eventAt || a.processedAt || ''));
    })[0] || null;
}

async function reconcileResendProjection(env: Env, collection: 'emailVerificationRateLimits' | 'staffInvitations' | 'earlyAccessDeliveries', id: string, providerMessageId: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const event = await priorResendEvent(env, providerMessageId, collection === 'earlyAccessDeliveries');
    if (!event) return null;
    const record = await rawDoc(env, collection, id);
    if (!record?.updateTime || record.data.providerMessageId !== providerMessageId) return null;
    const eventTime = Date.parse(String(event.eventAt || event.processedAt || ''));
    const projectedTime = Date.parse(String(record.data.deliveryEventAt || ''));
    const projectedFinal = ['delivered', 'bounced', 'failed', 'complained'].includes(String(record.data.deliveryStatus));
    const terminalSubscriberEvent = collection === 'earlyAccessDeliveries' && record.data.subscriberId && ['bounced', 'complained'].includes(event.status);
    if (!Number.isFinite(eventTime) || !terminalSubscriberEvent && (Number.isFinite(projectedTime) && (eventTime < projectedTime || eventTime === projectedTime && event.status === record.data.deliveryStatus) ||
        event.status === 'accepted' && projectedFinal)) return record.data.deliveryStatus || null;
    const fields = { deliveryStatus: jsonValue(event.status), deliveryEventAt: { timestampValue: new Date(eventTime).toISOString() }, deliveryUpdatedAt: { timestampValue: new Date().toISOString() },
      ...(collection === 'earlyAccessDeliveries' ? earlyAccessDeliveryProof(record.data, event.status) : {}) };
    try {
      await commit(env, [{ update: { name: fullName(env, `${collection}/${id}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: record.updateTime } }]);
      return event.status;
    } catch (error) {
      if (!(error instanceof FirestoreConflictError)) throw error;
    }
  }
  return null;
}

async function commit(env: Env, writes: unknown[]) {
  secondaryStats.clear();
  if (commitOverride) { commitOverride.push(writes); return; }
  const safeWrites = (writes as any[]).map(write => String(write?.update?.name || '').includes('/notificationOutbox/')
    ? { ...write, currentDocument: undefined } : write);
  await fs(env, ':commit', { method: 'POST', body: JSON.stringify({ writes: safeWrites }) });
}

type AdminCursor = { name: string; sortValue?: string | number | boolean | null; timestamp?: boolean };
function cursorValue(env: Env, collection: string, cursor: string | null, sort?: string) {
  if (!cursor) return undefined;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
    const parsed = decoded.startsWith('{') ? JSON.parse(decoded) as AdminCursor : { name: decoded };
    const name = parsed.name;
    if (sort && name.startsWith(fullName(env, `${collection}/`)) && Object.prototype.hasOwnProperty.call(parsed, 'sortValue')) {
      return { before: false, values: [parsed.timestamp ? { timestampValue: parsed.sortValue } : jsonValue(parsed.sortValue), { referenceValue: name }] };
    }
    if (!sort && name.startsWith(fullName(env, `${collection}/`))) return { before: false, values: [{ referenceValue: name }] };
  } catch { /* malformed cursors are treated as absent */ }
  throw new Error('Invalid cursor');
}

function nextCursor(name?: string, sortValue?: string | number | boolean | null, timestamp = false) {
  return name ? b64u(enc.encode(sortValue === undefined ? name : JSON.stringify({ name, sortValue, timestamp }))) : undefined;
}

const FILTERS: Record<string, string[]> = {
  users: ['role', 'accountPurpose', 'accountStatus', 'suspensionStatus', 'emailLower', 'email', 'emailVerified', 'countryCode'],
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
  listingAudit: ['listingId', 'action', 'automated'],
  notificationDeliveries: ['status', 'uid'],
  notifications: ['uid', 'category', 'read'],
  deviceTokens: ['uid', 'active', 'platform'],
  deletionRequests: ['uid', 'status', 'refreshTokenRevocationStatus'],
  deletionJobs: ['status', 'actorUid'],
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
    limit: safeLimit + 1,
  };
  const booleanFields = new Set(['isActive', 'active', 'enabled', 'read', 'automated']);
  const filters = FILTERS[collection]
    .filter(field => query[field] !== undefined && !(collection === 'users' && field === 'emailVerified'))
    .map(field => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: jsonValue(booleanFields.has(field) ? query[field] === 'true' : query[field]) } }));
  if (filters.length) structuredQuery.where = filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
  const startAt = cursorValue(env, collection, cursor, sort);
  if (startAt) structuredQuery.startAt = startAt;
  const response = queryOverride
    ? queryOverride(collection, String(startAt?.values?.[startAt.values.length - 1]?.referenceValue || ''), structuredQuery.limit, structuredQuery).map((item) => ({ document: {
      name: item.name || fullName(env, `${collection}/${crypto.randomUUID()}`), updateTime: item.updateTime,
      fields: Object.fromEntries(Object.entries(item.data || {}).map(([key, value]) => [key, jsonValue(value)])),
    } }))
    : await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) }) as any[] || [];
  const rows = response.filter(item => item.document);
  const valueAt = (record: any, path: string): any => path.split('.').reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, record);
  // emailVerified is authoritative in Firebase Auth; never discard rows using
  // the stale Firestore projection before Auth enrichment.
  const activeFilters = FILTERS[collection].filter(field => query[field] !== undefined && !(collection === 'users' && field === 'emailVerified')).map(field => [field, query[field]] as const);
  const search = query.q?.trim().toLowerCase();
  if (search !== undefined && (!search || search.length > 200)) throw new Error('Invalid search query');
  const searchFields: Record<string, string[]> = {
    users: ['emailLower', 'email', 'displayName', 'name', 'nameEn', 'accountPurpose'],
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
  // Search and Auth verification have no trustworthy indexed representation in
  // the current schema. Consume one bounded candidate page, never refill it by
  // scanning. A continuation can therefore accompany an empty result page.
  const candidates = rows.slice(0, safeLimit);
  const matching = candidates.filter(item => matches(decode(item.document), String(item.document.name)));
  const docs = matching.slice(0, safeLimit);
  const cursorDocument = candidates[candidates.length - 1]?.document;
  const cursorSortValue = sort && cursorDocument ? (decode(cursorDocument)[sort] ?? null) : undefined;
  // The physical identity must not be shadowed by a historical data.id field.
  const baseItems = docs.map(item => ({ ...redact(decode(item.document)), id: String(item.document.name).split('/').pop() }));
  const projection = (collection === 'users' || collection === 'providerProfiles' || collection === 'driverProfiles') && !queryOverride
    ? await authoritativeAccountProjection(env, baseItems)
    : baseItems;
  const verifiedFilter = collection === 'users' && query.emailVerified !== undefined ? query.emailVerified === 'true' : undefined;
  const filteredProjection = verifiedFilter === undefined ? projection : queryOverride
    ? matching.filter(item => decode(item.document).emailVerified === verifiedFilter).slice(0, safeLimit).map(item => ({ id: String(item.document.name).split('/').pop(), ...redact(decode(item.document)) }))
    : projection.filter(item => item.emailVerified === verifiedFilter);
  return {
    items: filteredProjection,
    ...(collection === 'users' ? { maxSelectable: 5000 } : {}),
    ...(search || verifiedFilter !== undefined ? { boundedCandidatePage: true, candidatesExamined: candidates.length } : {}),
    nextCursor: rows.length > safeLimit
      ? nextCursor(cursorDocument?.name, cursorSortValue, !!(sort && cursorDocument?.fields?.[sort]?.timestampValue)) : undefined,
  };
}

/** One bounded Auth lookup per page; Firebase remains the verification source. */
async function authoritativeAccountProjection(env: Env, items: any[]) {
  if (!items.length) return items;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) throw new Error('Account verification temporarily unavailable');
  const projectId = env.FIREBASE_PROJECT_ID;
  const chunks: any[][] = [];
  for (let i = 0; i < items.length; i += 100) chunks.push(items.slice(i, i + 100));
  try {
    const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
    const responses = await Promise.all(chunks.map(chunk => fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:lookup`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: chunk.map(item => String(item.uid || item.id)).filter(Boolean) }),
    })));
    if (responses.some(response => !response.ok)) throw new Error('Account verification temporarily unavailable');
    const records = (await Promise.all(responses.map(response => response.json() as Promise<any>))).flatMap(body => body.users || []);
    const verified = new Map(records.map((record: any) => [String(record.localId), record.emailVerified === true]));
    return items.map(item => ({ ...item, emailVerified: verified.get(String(item.uid || item.id)) === true }));
  } catch { throw new Error('Account verification temporarily unavailable'); }
}

type AggregateFilter = { field: string; value: unknown };
async function countCollection(env: Env, collection: string, filter?: AggregateFilter | AggregateFilter[]) {
  return aggregateCollection(env, collection, filter);
}
async function countOperationalUsers(env: Env, filter?: AggregateFilter) {
  const reviewFilter = filter ? [filter, { field: 'accountPurpose', value: STORE_REVIEW_PURPOSE }] : { field: 'accountPurpose', value: STORE_REVIEW_PURPOSE };
  const [total, review] = await Promise.all([
    countCollection(env, 'users', filter),
    countCollection(env, 'users', reviewFilter),
  ]);
  if (total === null) return null;
  return Math.max(0, total - Number(review || 0));
}
async function countOperationalEquipment(env: Env) {
  const [total, review] = await Promise.all([
    countCollection(env, 'equipment', { field: 'isActive', value: true }),
    countCollection(env, 'equipment', [{ field: 'isActive', value: true }, { field: 'accountPurpose', value: STORE_REVIEW_PURPOSE }]),
  ]);
  return total === null ? null : Math.max(0, total - Number(review || 0));
}

const secondaryStats = new Map<string, { expires: number; value: Promise<number | null> }>();
async function aggregateCollection(env: Env, collection: string, filter?: AggregateFilter | AggregateFilter[], sumField?: string) {
  const key = JSON.stringify([env.FIREBASE_PROJECT_ID, collection, filter, sumField]);
  const cached = secondaryStats.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = loadAggregateCollection(env, collection, filter, sumField);
  const entry = { expires: Date.now() + 60_000, value };
  secondaryStats.set(key, entry);
  if (secondaryStats.size > 128) secondaryStats.delete(secondaryStats.keys().next().value!);
  void value.then(result => {
    if (result === null && secondaryStats.get(key) === entry) secondaryStats.delete(key);
  });
  return value;
}

async function loadAggregateCollection(env: Env, collection: string, filter?: AggregateFilter | AggregateFilter[], sumField?: string) {
  try {
    const structuredQuery: any = { from: [{ collectionId: collection }] };
    if (filter) {
      const filters = Array.isArray(filter) ? filter : [filter];
      structuredQuery.where = filters.length === 1
        ? { fieldFilter: { field: { fieldPath: filters[0].field }, op: 'EQUAL', value: jsonValue(filters[0].value) } }
        : { compositeFilter: { op: 'AND', filters: filters.map(item => ({ fieldFilter: { field: { fieldPath: item.field }, op: 'EQUAL', value: jsonValue(item.value) } })) } };
    }
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
/**
 * Converts only unambiguous, unrestricted legacy listings.  This is
 * deliberately POST-only: a read of the admin list must never publish data.
 */
async function migrateLegacyEquipment(req: Request, env: Env, user: AdminUser) {
  const body: any = await req.json().catch(() => ({}));
  const apply = body.apply === true;
  const limit = Math.min(50, Math.max(1, Number(body.limit || 25)));
  const page = await listCollection(env, 'equipment', {}, limit, typeof body.cursor === 'string' ? body.cursor : null);
  const results: any[] = [];
  const writes: any[] = [];
  for (const item of page.items) {
    const id = String(item.id), raw = await rawDoc(env, 'equipment', id), listing = raw?.data || item;
    let history: { items: any[] };
    try {
      history = await listCollection(env, 'listingAudit', { listingId: id }, 50, null);
    } catch {
      results.push({ id, eligible: false, action: 'skipped', reasons: ['moderation_history_unavailable'] });
      continue;
    }
    const ownerUid = String(listing.ownerUid || listing.providerUid || '');
    const owner = ownerUid ? await rawDoc(env, 'users', ownerUid) : null;
    const countryCode = String(listing.countryCode || owner?.data?.countryCode || 'SA').toUpperCase();
    const country = await rawDoc(env, 'countryConfigs', countryCode);
    const evaluation = evaluateLegacyEquipment(listing, owner?.data || null, country?.data || null, history.items || []);
    const reviewOwned = isStoreReviewAccount(listing) || isStoreReviewAccount(owner?.data);
    const { eligible, needsMigration, reasons: evaluatedReasons } = evaluation;
    const reasons = reviewOwned ? [...evaluatedReasons, 'store_review_non_public'] : evaluatedReasons;
    const publishEligible = eligible && !reviewOwned;
    const reviewNeedsCorrection = reviewOwned && (listing.isActive !== false || listing.visibility !== 'hidden' || listing.accountPurpose !== STORE_REVIEW_PURPOSE);
    results.push({
      id,
      eligible: publishEligible,
      action: reviewNeedsCorrection
        ? apply && raw?.updateTime ? 'pending_hide' : 'would_hide'
        : publishEligible && apply && raw?.updateTime ? 'pending_publish' : publishEligible ? 'would_publish' : 'skipped',
      reasons,
    });
    if (reviewNeedsCorrection && apply && raw?.updateTime) {
      writes.push({
        update: {
          name: fullName(env, `equipment/${encodeURIComponent(id)}`),
          fields: {
            accountPurpose: jsonValue(STORE_REVIEW_PURPOSE),
            isActive: { booleanValue: false },
            visibility: jsonValue('hidden'),
            updatedAt: { timestampValue: new Date().toISOString() },
          },
        },
        updateMask: { fieldPaths: ['accountPurpose', 'isActive', 'visibility', 'updatedAt'] },
        currentDocument: { updateTime: raw.updateTime },
      });
    } else if (publishEligible && needsMigration && apply && raw?.updateTime) {
      const now = new Date().toISOString(), reason = 'legacy_migration_post_moderation_eligible';
      writes.push({ update: { name: fullName(env, `equipment/${encodeURIComponent(id)}`), fields: { isActive: { booleanValue: true }, visibility: { stringValue: 'visible' }, moderationStatus: { stringValue: 'approved' }, moderationReason: { stringValue: reason }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['isActive', 'visibility', 'moderationStatus', 'moderationReason', 'updatedAt'] }, currentDocument: { updateTime: raw.updateTime } });
      writes.push({ update: { name: fullName(env, `listingAudit/${encodeURIComponent(`${id}:legacy-migration`)}`), fields: { listingId: { stringValue: id }, ownerUid: { stringValue: ownerUid }, action: { stringValue: 'legacy_migration_publish' }, reason: { stringValue: reason }, automated: { booleanValue: true }, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } });
    }
  }
  let published = 0;
  if (apply && writes.length) {
    await commit(env, [...writes, await auditWrite(env, user, 'legacy_equipment_migration', 'equipment', 'batch', crypto.randomUUID(), 'legacy equipment migration apply', undefined, { published: writes.filter(write => String(write.update?.name).includes('/equipment/')).length })]);
    published = writes.filter(write => String(write.update?.name).includes('/equipment/')).length;
    for (const result of results) if (result.action === 'pending_publish') result.action = 'published';
  }
  return { success: true, dryRun: !apply, items: results, nextCursor: page.nextCursor, published };
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
  // Actor identity is enriched from server-side records.  Browser supplied
  // email/name is only a fallback for test-injected actors and is never used
  // to authorize or identify a different UID.
  // Unit/integration callers may inject an authenticated actor with no
  // Firestore bindings. Production requests always carry project bindings;
  // preserving the injected actor here keeps audit-required operations
  // testable without turning a missing test backend into a false audit loss.
  const canResolveActor = !u.testInjected && Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
  const staff = canResolveActor && u.uid && u.uid !== 'system' ? await rawDoc(env, 'staffMembers', u.uid) : null;
  const person = canResolveActor && u.uid && u.uid !== 'system' ? await rawDoc(env, 'users', u.uid) : null;
  const actorEmail = normalizeAuthorityEmail(staff?.data?.email) || normalizeAuthorityEmail(person?.data?.email) || normalizeAuthorityEmail(u.email) || (u.uid === 'system' ? 'system' : 'unknown');
  const actorName = String(staff?.data?.displayName || person?.data?.displayName || person?.data?.nameEn || person?.data?.nameAr || u.displayName || (u.uid === 'system' ? 'System' : 'Unknown actor'));
  const actorRole = normalizeStaffRole(staff?.data?.role) || u.permissionRole || u.role || (u.uid === 'system' ? 'system' : 'admin');
  return { update: { name: fullName(env, `adminAudit/${encodeURIComponent(auditId(correlationId))}`), fields: {
    actorUid: jsonValue(u.uid), initiatingActorUid: jsonValue(u.uid), actorEmail: jsonValue(actorEmail), actorName: jsonValue(actorName), actorRole: jsonValue(actorRole), action: jsonValue(action), targetType: jsonValue(targetType), targetId: jsonValue(targetId),
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
function emailVerificationTemplate(url: string, name: string, support: string, language: 'ar' | 'en') {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
  const action = escape(url), greeting = escape(name || (language === 'ar' ? 'مستخدم Heavyar' : 'Heavyar user')), safeSupport = escape(support);
  const ar = `<div dir="rtl" lang="ar"><p>مرحباً ${greeting}،</p><p>وثّق بريدك الإلكتروني لتأكيد حسابك والاستفادة من خدمات Heavyar.</p><p><a href="${action}" style="background:#0b6b61;color:#fff;padding:12px 20px;border-radius:7px;text-decoration:none;display:inline-block;font-weight:700">توثيق البريد الإلكتروني</a></p><p>استخدم الرابط قريباً؛ تتحكم Firebase في صلاحيته ومدة انتهائه. إذا لم تطلب التسجيل، تجاهل الرسالة.</p></div>`;
  const en = `<div dir="ltr" lang="en"><p>Hello ${greeting},</p><p>Verify your email to confirm your account and use Heavyar services.</p><p><a href="${action}" style="background:#0b6b61;color:#fff;padding:12px 20px;border-radius:7px;text-decoration:none;display:inline-block;font-weight:700">Verify email</a></p><p>Use the link promptly; Firebase controls its validity and expiry. If you did not register, ignore this email.</p></div>`;
  const primary = language === 'ar' ? ar : en, secondary = language === 'ar' ? en : ar;
  return `<div style="background:#f3f6f5;padding:24px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:580px;margin:auto;background:#fff;border:1px solid #dfe8e5;border-radius:12px;overflow:hidden"><div style="background:#073f3a;color:#fff;padding:22px 28px"><div style="font-size:28px;font-weight:800">HEAVYAR</div></div><div style="padding:28px">${primary}<hr style="border:0;border-top:1px solid #e8eeec;margin:24px 0">${secondary}<p style="color:#65736f;font-size:13px">الدعم / Support: <a href="mailto:${safeSupport}">${safeSupport}</a></p></div></div></div>`;
}
async function emailVerificationReminder(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'support.manage') && !can(user, 'config.manage')) return { error: 'Support permission required', status: 403 };
  const body: any = await req.json().catch(() => ({})), uid = String(body?.uid || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return { error: 'Invalid user', status: 400 };
  const person = await rawDoc(env, 'users', uid);
  const email = String(person?.data?.email || person?.data?.emailLower || '').trim().toLowerCase();
  if (!person?.data || !email) return { error: 'User not found', status: 404 };
  const rate = await rawDoc(env, 'emailVerificationRateLimits', uid), policy = await rawDoc(env, 'emailVerificationPolicies', 'default'), cooldownSeconds = Math.min(604800, Math.max(300, Number(policy?.data?.reminderCooldownSeconds) || 86400)), now = Date.now();
  const eligibility = reminderEligibility(person.data, rate?.data, policy?.data, now);
  if (eligibility === 'alreadyVerified') return { success: true, alreadyVerified: true };
  if (eligibility === 'restricted') return { error: 'User is restricted', status: 409 };
  if (eligibility === 'disabled') return { error: 'Verification reminders disabled', status: 409 };
  if (eligibility === 'cooldown') return { error: 'Verification email cooldown active', status: 429 };
  const reservationToken = crypto.randomUUID(), reservationUntil = new Date(now + 120000).toISOString();
  try {
    await commit(env, [{ update: { name: fullName(env, `emailVerificationRateLimits/${encodeURIComponent(uid)}`), fields: { uid: jsonValue(uid), reservationToken: jsonValue(reservationToken), reservationUntil: { timestampValue: reservationUntil } } }, currentDocument: rate?.updateTime ? { updateTime: rate.updateTime } : { exists: false } }]);
  } catch {
    return { error: 'Verification email cooldown active', status: 429, errorCode: 'cooldown_reservation_lost' };
  }
  const reservedRate = await rawDoc(env, 'emailVerificationRateLimits', uid);
  let delivered = false, providerAccepted = false, providerMessageId = '', deliveryOutcome: 'accepted' | 'firebase_accepted' | 'auth_failed' | 'sender_rejected' | 'rate_limited' | 'provider_error' | 'not_configured' = env.RESEND_API_KEY ? 'provider_error' : 'not_configured';
  const resendFrom = env.RESEND_FROM_EMAIL || 'Heavyar <noreply@mail.heavyar.com>';
  const resendSenderValid = /@mail\.heavyar\.com>?\s*$/i.test(resendFrom);
  if (env.RESEND_API_KEY && !resendSenderValid) deliveryOutcome = 'sender_rejected';
  if (env.RESEND_API_KEY && resendSenderValid && env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    try {
      const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/accounts:sendOobCode`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'VERIFY_EMAIL', email, returnOobLink: true }) });
      const result: any = await response.json().catch(() => ({}));
      if (response.ok && typeof result.oobLink === 'string') {
        const language: 'ar' | 'en' = person.data.language === 'en' || person.data.preferredLanguage === 'en' ? 'en' : 'ar';
        const sent = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: resendFrom, to: [email], subject: language === 'ar' ? 'وثّق بريدك الإلكتروني في Heavyar / Verify your Heavyar email' : 'Verify your Heavyar email / وثّق بريدك الإلكتروني في Heavyar', html: emailVerificationTemplate(result.oobLink, String(person.data.nameEn || person.data.nameAr || ''), env.RESEND_SUPPORT_EMAIL || 'support@mail.heavyar.com', language) }) });
         providerAccepted = sent.ok;
         if (sent.ok) providerMessageId = String((await sent.json().catch(() => ({})) as any)?.id || '');
         delivered = false; // provider acceptance is not delivery
        deliveryOutcome = sent.ok ? 'accepted' : sent.status === 401 || sent.status === 403 ? 'auth_failed' : sent.status === 429 ? 'rate_limited' : sent.status === 400 ? 'sender_rejected' : 'provider_error';
      }
    } catch { delivered = false; }
  }
  if (!providerAccepted && env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    try {
      const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/accounts:sendOobCode`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'VERIFY_EMAIL', email }) });
      delivered = response.ok;
      if (delivered) deliveryOutcome = 'firebase_accepted';
    } catch { delivered = false; }
  }
  const nowIso = new Date(now).toISOString();
  const reconciled = providerAccepted ? await priorResendEvent(env, providerMessageId) : null;
  const communicationStatus = reconciled?.status || (providerAccepted ? 'accepted' : delivered ? 'accepted' : 'failed');
  const writes: any[] = [await auditWrite(env, user, 'email_verification_reminder', 'user', uid, crypto.randomUUID(), providerAccepted || delivered ? 'verification reminder requested' : 'verification reminder delivery unavailable', undefined, { status: communicationStatus, delivered, deliveryOutcome, ...(providerMessageId ? { providerMessageId } : {}) })];
  writes.unshift({ update: { name: fullName(env, `emailVerificationRateLimits/${encodeURIComponent(uid)}`), fields: delivered || providerAccepted
     ? { uid: jsonValue(uid), lastSentAt: { timestampValue: nowIso }, nextAllowedAt: { timestampValue: new Date(now + cooldownSeconds * 1000).toISOString() }, count: { integerValue: String(Number(rate?.data?.count || 0) + 1) }, deliveryStatus: jsonValue(communicationStatus), providerMessageId: jsonValue(providerMessageId || null), deliveryEventAt: reconciled?.eventAt ? { timestampValue: reconciled.eventAt } : { nullValue: null }, reservationToken: { nullValue: null }, reservationUntil: { nullValue: null } }
     : { reservationToken: { nullValue: null }, reservationUntil: { nullValue: null } } }, updateMask: { fieldPaths: delivered || providerAccepted ? ['uid', 'lastSentAt', 'nextAllowedAt', 'count', 'deliveryStatus', 'providerMessageId', 'deliveryEventAt', 'reservationToken', 'reservationUntil'] : ['reservationToken', 'reservationUntil'] }, currentDocument: reservedRate?.updateTime ? { updateTime: reservedRate.updateTime } : undefined });
  await commit(env, writes);
  if (providerAccepted) await reconcileResendProjection(env, 'emailVerificationRateLimits', uid, providerMessageId);
   if (!providerAccepted && !delivered) return { error: 'Verification email delivery failed', status: 502, deliveryOutcome };
   return { success: true, sent: true, requested: true, accepted: providerAccepted || delivered, delivered: false, deliveryStatus: communicationStatus, deliveryOutcome, ...(providerMessageId ? { providerMessageId } : {}) };
}

/**
 * Resolve one targeting mode only:
 * {scope|resource: 'user'|'provider'|'driver', uids: [...]}
 * or {scope|resource: 'user'|'provider'|'driver', filters: {...}}.
 */
async function reminderTargets(env: Env, body: any) {
  const ids = new Set<string>();
  const scope = body?.scope ?? body?.resource ?? 'user';
  if (!['user', 'provider', 'driver'].includes(scope)) throw new Error('Invalid account scope');
  if (Array.isArray(body.uids) && body.filters !== undefined) throw new Error('Choose either explicit IDs or filters');
  const scoped = new Set<string>();
  if (scope !== 'user') {
    let cursor: string | null = null;
    do {
      const rolePage = await listCollection(env, 'users', { role: scope }, 50, cursor);
      rolePage.items.forEach(item => scoped.add(String(item.id)));
      cursor = rolePage.nextCursor || null;
    } while (cursor && scoped.size <= 5000);
    // An empty scoped role must never fall back to all users.
    if (!scoped.size && (Array.isArray(body.uids) || body.filters !== undefined)) throw new Error(`No ${scope} accounts matched the requested scope`);
  }
  if (Array.isArray(body.uids)) {
    if (body.uids.length > 5000) throw Object.assign(new Error('Too many targets; narrow the selection'), { status: 413, code: 'too_many_targets' });
    if (body.uids.some((id: any) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error('Invalid user IDs');
    body.uids.forEach((id: string) => { if (scope === 'user' || scoped.has(id)) ids.add(id); });
  }
  if (body.filters !== undefined) {
    if (!body.filters || typeof body.filters !== 'object' || Array.isArray(body.filters) ||
      Object.entries(body.filters).some(([key, value]) => {
        if (key === 'q' || key === 'accountStatus') return typeof value !== 'string' || value.length > 200;
        if (key === 'emailVerified') return typeof value !== 'boolean' && (typeof value !== 'string' || !['true', 'false'].includes(value));
        return true;
      })) throw new Error('Invalid filters');
     const filters = Object.fromEntries(Object.entries(body.filters).map(([key, value]) => [key, key === 'emailVerified' ? String(value) : String(value)]));
     if (scope !== 'user') filters.role = scope;
    let cursor: string | null = null;
    for (;;) {
      const result = await listCollection(env, 'users', filters, 50, cursor);
       result.items.forEach(item => { const id = String(item.id); if (scope === 'user' || scoped.has(id)) ids.add(id); });
      if (ids.size > 5000) throw Object.assign(new Error('Too many targets; narrow the selection'), { status: 413, code: 'too_many_targets' });
      cursor = result.nextCursor || null;
      if (!cursor) break;
    }
  }
   if (!ids.size) throw new Error(scope === 'user' ? 'At least one user ID or filter is required' : `No ${scope} accounts matched the requested scope`);
  return [...ids];
}
async function reminderSummary(env: Env, ids: string[]) {
  const summary = { targeted: ids.length, eligible: 0, alreadyVerified: 0, cooldown: 0, restricted: 0, missing: 0 };
  for (const uid of ids) {
    const person = await rawDoc(env, 'users', uid);
    const rate = await rawDoc(env, 'emailVerificationRateLimits', uid);
    const policy = await rawDoc(env, 'emailVerificationPolicies', 'default');
    const state = reminderEligibility(person?.data, rate?.data, policy?.data, Date.now());
    if (state === 'missing') summary.missing++;
    else if (state === 'alreadyVerified') summary.alreadyVerified++;
    else if (state === 'restricted') summary.restricted++;
    else if (state === 'cooldown') summary.cooldown++;
    else summary.eligible++;
  }
  return summary;
}
function reminderEligibility(person: any, rate: any, policy: any, now: number): 'eligible' | 'missing' | 'alreadyVerified' | 'restricted' | 'cooldown' | 'disabled' {
  if (!person || !String(person.email || person.emailLower || '').trim()) return 'missing';
  if (person.emailVerified === true) return 'alreadyVerified';
  if (['restricted', 'deletion_requested', 'deleted'].includes(String(person.accountStatus)) || ['temporarily_suspended', 'permanently_suspended', 'suspended'].includes(String(person.suspensionStatus))) return 'restricted';
  if (policy?.allowReminders === false) return 'disabled';
  if ((rate?.nextAllowedAt && Date.parse(String(rate.nextAllowedAt)) > now) || (rate?.reservationUntil && Date.parse(String(rate.reservationUntil)) > now)) return 'cooldown';
  return 'eligible';
}
async function emailVerificationReminderPreview(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'support.manage') && !can(user, 'config.manage')) return { error: 'Support permission required', status: 403 };
  const policy = await rawDoc(env, 'emailVerificationPolicies', 'default');
  if (policy?.data?.allowReminders === false) return { error: 'Verification reminders disabled', status: 409 };
  try { return { success: true, ...(await reminderSummary(env, await reminderTargets(env, await req.json().catch(() => ({}))))) }; }
  catch (error) { return { error: error instanceof Error ? error.message : 'Invalid request', status: (error as any)?.status || 400, ...(error as any)?.code ? { errorCode: (error as any).code } : {} }; }
}
async function bulkEmailVerificationReminder(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'support.manage') && !can(user, 'config.manage')) return { error: 'Support permission required', status: 403 };
  const policy = await rawDoc(env, 'emailVerificationPolicies', 'default');
  if (policy?.data?.allowReminders === false) return { error: 'Verification reminders disabled', status: 409 };
  const body: any = await req.json().catch(() => ({}));
  let ids: string[]; try { ids = await reminderTargets(env, body); } catch (error) { return { error: error instanceof Error ? error.message : 'Invalid request', status: (error as any)?.status || 400, ...(error as any)?.code ? { errorCode: (error as any).code } : {} }; }
  const counts = { targeted: ids.length, sent: 0, skippedVerified: 0, skippedCooldown: 0, skippedRestricted: 0, missing: 0, failed: 0 };
  const results: any[] = [];
  for (const uid of ids) {
    const person = await rawDoc(env, 'users', uid);
    const rate = await rawDoc(env, 'emailVerificationRateLimits', uid), policy = await rawDoc(env, 'emailVerificationPolicies', 'default');
    const eligibility = reminderEligibility(person?.data, rate?.data, policy?.data, Date.now());
    if (eligibility === 'missing') { counts.missing++; results.push({ uid, status: 'missing' }); continue; }
    if (eligibility === 'alreadyVerified') { counts.skippedVerified++; results.push({ uid, status: 'alreadyVerified' }); continue; }
    if (eligibility === 'restricted') {
      counts.skippedRestricted++; results.push({ uid, status: 'restricted' }); continue;
    }
    try {
      const result = await emailVerificationReminder(new Request(req.url, { method: 'POST', body: JSON.stringify({ uid }), headers: { 'Content-Type': 'application/json' } }), env, user);
       if ((result as any).delivered || (result as any).accepted) { counts.sent++; results.push({ uid, status: (result as any).delivered ? 'sent' : 'accepted' }); }
      else if ((result as any).status === 429) { counts.skippedCooldown++; results.push({ uid, status: 'cooldown' }); }
      else { counts.failed++; results.push({ uid, status: (result as any).error || 'failed' }); }
    } catch (error) {
      counts.failed++;
      results.push({ uid, status: 'failed' });
    }
  }
  await commit(env, [await auditWrite(env, user, 'email_verification_reminder_bulk', 'users', 'bulk', crypto.randomUUID(), 'bulk verification reminder', undefined, counts)]);
  return { success: true, ...counts, results };
}

const deletionCollections = ['users', 'userProfiles', 'providerProfiles', 'driverProfiles', 'deviceTokens', 'notificationTokenOwners', 'notificationInstallations', 'notifications', 'notificationPreferences', 'notificationDeliveries', 'notificationOutbox', 'emailVerificationRateLimits', 'phoneAliases', 'phoneOwners', 'recoveryCodes', 'temporaryRecovery', 'verificationIndexes', 'verificationProfiles', 'verificationAttempts', 'equipment', 'equipmentDrafts'];
function deletionProtected(user: any) {
  return user?.bootstrap === true || user?.system === true || user?.service === true || user?.isOwner === true || user?.currentOwner === true || user?.isCurrentOwner === true || user?.isSuperAdmin === true ||
    user?.role === 'owner' || user?.role === 'super_admin' || user?.activeStaff === true || user?.staffActive === true;
}
async function mayDeleteUsers(env: Env, actor: AdminUser) {
  if (!(can(actor, 'owner.transfer') || String(actor.permissionRole || actor.role) === 'super_admin')) return false;
  return !['system', 'service', 'bootstrap'].includes(actor.uid);
}
async function staffActive(env: Env, uid: string) {
  const staff = await rawDoc(env, 'staffMembers', uid);
  return staff?.data?.active === true || staff?.data?.status === 'active' || staff?.data?.staffStatus === 'active';
}
async function canonicalOwnerUid(env: Env) {
  const owner = await rawDoc(env, 'heavyarConfig', 'owner');
  return String(owner?.data?.uid || owner?.data?.ownerUid || owner?.data?.currentOwnerUid || owner?.data?.currentOwner || '');
}
async function protectedDeletionTarget(env: Env, actor: AdminUser, uid: string, data: any) {
  const ownerUid = await canonicalOwnerUid(env);
  return uid === actor.uid || uid === ownerUid || deletionProtected(data) || await staffActive(env, uid) ||
    ['system', 'service', 'bootstrap'].includes(uid);
}
async function deletionTargets(env: Env, body: any) {
  return reminderTargets(env, body);
}
async function deletionPreview(req: Request, env: Env, actor: AdminUser) {
  if (!(await mayDeleteUsers(env, actor))) return { error: 'Owner or super-admin governance permission required', status: 403 };
  const body: any = await req.json().catch(() => ({}));
  let uids: string[]; try { uids = await deletionTargets(env, body); } catch (error) { return { error: error instanceof Error ? error.message : 'Invalid request', status: (error as any)?.status || 400, ...(error as any)?.code ? { errorCode: (error as any).code } : {} }; }
  const MAX_PREVIEW_TARGETS = 20;
  if (uids.length > MAX_PREVIEW_TARGETS) return { error: 'Deletion preview is limited to 20 exact targets; narrow the selection', status: 413, errorCode: 'preview_too_large', maxSelectable: MAX_PREVIEW_TARGETS };
  const targetSet = new Set(uids), batches = Math.ceil(uids.length / 30);
  // One users read, one owner read, one staff read, and one set query per
  // impact/retention field. This keeps a normal preview below the Worker
  // subrequest budget and rejects broad destructive previews before I/O.
  const plannedRequests = 2 + batches + 20;
  if (plannedRequests >= 50) return { error: 'Deletion preview exceeds the safe query budget; narrow the selection', status: 413, errorCode: 'preview_too_large', maxSelectable: MAX_PREVIEW_TARGETS };
  const batchQuery = async (collection: string, fields: string[]) => {
    if (queryOverride) {
      const mocked = queryOverride(collection, '', 5000);
      if (mocked.length || !['users', 'staffMembers'].includes(collection)) return mocked.map(item => ({ document: { name: item.name || fullName(env, `${collection}/${crypto.randomUUID()}`), updateTime: item.updateTime, fields: Object.fromEntries(Object.entries(item.data || {}).map(([key, value]) => [key, jsonValue(value)])) } }));
      return (await Promise.all(uids.map(async uid => rawDoc(env, collection, uid)))).filter(Boolean).map((item: any, index) => ({ document: { name: fullName(env, `${collection}/${encodeURIComponent(uids[index])}`), updateTime: item.updateTime, fields: Object.fromEntries(Object.entries(item.data || {}).map(([key, value]) => [key, jsonValue(value)])) } }));
    }
    const values = uids.map(uid => jsonValue(uid));
    const where = fields.length === 1 && fields[0] === '__name__'
      ? { fieldFilter: { field: { fieldPath: '__name__' }, op: 'IN', value: { arrayValue: { values: uids.map(uid => ({ referenceValue: fullName(env, `${collection}/${encodeURIComponent(uid)}`) })) } } } }
      : { compositeFilter: { op: 'OR', filters: fields.map(field => ({ fieldFilter: { field: { fieldPath: field }, op: 'IN', value: { arrayValue: { values } } } })) } };
    return await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where, limit: 5000 } }) }) as any[] || [];
  };
  const users = await batchQuery('users', ['__name__']);
  const userDocs = new Map(users.filter((row: any) => row.document).map((row: any) => [String(row.document.name).split('/').pop(), { data: decode(row.document), updateTime: row.document.updateTime }]));
  const staffRows = await batchQuery('staffMembers', ['uid']);
  const activeStaff = new Set(staffRows.filter((row: any) => row.document).map((row: any) => ({ data: decode(row.document), uid: String(row.document.name).split('/').pop() })).filter(({ data }: any) => data.active === true || data.status === 'active' || data.staffStatus === 'active').map(({ data, uid }: any) => String(data.uid || uid)));
  const ownerUid = await canonicalOwnerUid(env);
  const impactFields: Record<string, string[]> = { equipment: ['ownerUid'], driverProfiles: ['uid'], phoneOwners: ['uid'], equipmentRequests: ['customerUid'], notifications: ['uid'], deviceTokens: ['uid'], complaints: ['customerUid'] };
  const retainedFields: Record<string, string[]> = { payments: ['customerUid', 'providerUid'], invoices: ['customerId', 'providerId'], refunds: ['customerUid', 'providerUid'], adminAudit: ['actorUid', 'targetId'] };
  const collectionRows = new Map<string, any[]>();
  for (const [collection, fields] of Object.entries({ ...impactFields, ...retainedFields })) collectionRows.set(collection, await batchQuery(collection, fields));
  const countByUser = (collection: string, fields: string[]) => {
    const counts = new Map<string, number>(), seen = new Set<string>();
    for (const row of collectionRows.get(collection) || []) {
      if (!row.document) continue;
      const data = decode(row.document), id = String(row.document.name);
      if (seen.has(id)) continue;
      const owners = fields.filter(field => targetSet.has(String(data[field] || '')));
      for (const ownerField of [...new Set(owners)]) {
        const owner = String(data[ownerField]), key = `${id}:${owner}`;
        if (seen.has(key)) continue;
        seen.add(key);
        counts.set(owner, (counts.get(owner) || 0) + 1);
      }
    }
    return counts;
  };
  const countMaps = new Map(Object.entries(impactFields).map(([collection, fields]) => [collection, countByUser(collection, fields)]));
  const retainedMaps = new Map(Object.entries(retainedFields).map(([collection, fields]) => [collection, countByUser(collection, fields)]));
  const equipmentRows = collectionRows.get('equipment') || [], mediaByUser = new Map<string, number>();
  for (const row of equipmentRows.filter((item: any) => item.document)) {
    const data = decode(row.document), uid = String(data.ownerUid || '');
    if (!targetSet.has(uid)) continue;
    mediaByUser.set(uid, (mediaByUser.get(uid) || 0) + (Array.isArray(data.images) ? data.images.filter((image: any) => typeof image?.publicId === 'string').length : 0));
  }
  const items: any[] = [], aggregate: any = { equipment: 0, driverProfile: 0, phoneAlias: 0, requests: 0, notifications: 0, deviceTokens: 0, complaints: 0, media: 0, protected: 0, skipped: 0 };
  for (const uid of uids) {
    const doc = userDocs.get(uid), protectedAccount = !doc || uid === actor.uid || uid === ownerUid || activeStaff.has(uid) || deletionProtected(doc.data) || ['system', 'service', 'bootstrap'].includes(uid);
    if (!doc) { aggregate.skipped++; items.push({ uid, exists: false, protected: false }); continue; }
    if (protectedAccount) { aggregate.protected++; aggregate.skipped++; }
    const counts = { equipment: countMaps.get('equipment')?.get(uid) || 0, driverProfile: countMaps.get('driverProfiles')?.get(uid) || 0, phoneAlias: countMaps.get('phoneOwners')?.get(uid) || 0, requests: countMaps.get('equipmentRequests')?.get(uid) || 0, notifications: countMaps.get('notifications')?.get(uid) || 0, deviceTokens: countMaps.get('deviceTokens')?.get(uid) || 0, complaints: countMaps.get('complaints')?.get(uid) || 0, media: (typeof doc.data.avatarPublicId === 'string' ? 1 : 0) + (mediaByUser.get(uid) || 0) };
    const retained = Object.fromEntries(Object.entries(retainedFields).map(([collection, fields]) => [collection === 'adminAudit' ? 'audits' : collection, retainedMaps.get(collection)?.get(uid) || 0]));
    Object.assign(aggregate, Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, aggregate[key] + value])));
    items.push({ uid, exists: true, protected: protectedAccount, role: doc.data.role || null, email: doc.data.email || doc.data.emailLower || null, counts, retained });
  }
  const previewToken = crypto.randomUUID(), expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await commit(env, [{ update: { name: fullName(env, `deletionPreviewSnapshots/${encodeURIComponent(previewToken)}`), fields: {
    previewToken: jsonValue(previewToken), uids: jsonValue(uids), counts: jsonValue(aggregate), actorUid: jsonValue(actor.uid), expiresAt: { timestampValue: expiresAt }, consumed: { booleanValue: false }, createdAt: { timestampValue: new Date().toISOString() },
  } }, currentDocument: { exists: false } }]);
  const retained = items.reduce((total: any, item: any) => {
    for (const key of ['payments', 'invoices', 'refunds', 'audits']) total[key] += Number(item.retained?.[key] || 0);
    return total;
  }, { payments: 0, invoices: 0, refunds: 0, audits: 0 });
  return { success: true, previewToken, expiresAt, targeted: uids.length, eligible: items.filter((item: any) => item.exists && !item.protected).length, protected: aggregate.protected, skipped: aggregate.skipped, items, counts: aggregate, retained, requiresConfirmation: `DELETE ${uids.length} USERS` };
}
async function enqueueDeletion(req: Request, env: Env, actor: AdminUser) {
  if (!(await mayDeleteUsers(env, actor))) return { error: 'Owner or super-admin governance permission required', status: 403 };
  const body: any = await req.json().catch(() => ({})), confirmation = body.confirmation;
  const previewToken = typeof body.previewToken === 'string' ? body.previewToken : '';
  if (!previewToken) return { error: 'previewToken is required', status: 400, errorCode: 'preview_token_required' };
  const snapshot = await rawDoc(env, 'deletionPreviewSnapshots', previewToken);
  if (!snapshot?.data || snapshot.data.actorUid !== actor.uid || snapshot.data.consumed === true || !Array.isArray(snapshot.data.uids)
    || !snapshot.data.expiresAt || Date.parse(String(snapshot.data.expiresAt)) <= Date.now()) return { error: 'Preview token expired or invalid', status: 409, errorCode: 'preview_token_invalid' };
  const uids: string[] = snapshot.data.uids.map(String);
  if (confirmation !== `DELETE ${uids.length} USERS`) return { error: 'Strong confirmation required', status: 400 };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 1000) return { error: 'Invalid deletion request', status: 400 };
  await commit(env, [{ update: { name: fullName(env, `deletionPreviewSnapshots/${encodeURIComponent(previewToken)}`), fields: { consumed: { booleanValue: true }, consumedAt: { timestampValue: new Date().toISOString() } }, }, updateMask: { fieldPaths: ['consumed', 'consumedAt'] }, currentDocument: snapshot.updateTime ? { updateTime: snapshot.updateTime } : undefined }]);
  const eligible: string[] = [];
  const jobs: string[] = [], writes: any[] = [], now = new Date().toISOString(), jobId = crypto.randomUUID();
  for (const uid of uids) {
    const target = await rawDoc(env, 'users', uid);
    if (!target?.data) continue;
    if (await protectedDeletionTarget(env, actor, uid, target.data)) continue;
    const id = `user:${uid}`, prior = await rawDoc(env, 'deletionRequests', id);
    if (prior?.data && ['queued', 'processing', 'partially_completed', 'pending'].includes(String(prior.data.status))) continue;
    if (prior?.data?.status === 'completed') continue;
    eligible.push(uid);
    jobs.push(id);
     writes.push({ update: { name: fullName(env, `deletionRequests/${encodeURIComponent(id)}`), fields: Object.fromEntries(Object.entries({ uid, parentJobId: jobId, status: 'queued', stage: 'auth', completedStages: [], errors: [], actorUid: actor.uid, initiatingActorUid: actor.uid, reason, createdAt: now, updatedAt: now }).map(([k, v]) => [k, jsonValue(v)])) }, currentDocument: prior?.updateTime ? { updateTime: prior.updateTime } : { exists: false } });
  }
   writes.push({ update: { name: fullName(env, `deletionJobs/${encodeURIComponent(jobId)}`), fields: Object.fromEntries(Object.entries({ status: eligible.length ? 'queued' : 'completed', total: eligible.length, completed: eligible.length ? 0 : 0, jobIds: jobs, actorUid: actor.uid, initiatingActorUid: actor.uid, reason, result: { completed: 0, skipped: uids.length - eligible.length }, createdAt: now, updatedAt: now }).map(([k, v]) => [k, jsonValue(v)])) }, currentDocument: { exists: false } });
  if (writes.length) {
    const targetAudits = await Promise.all(eligible.map(uid => auditWrite(env, actor, 'user_deletion_target_queued', 'user', uid, `${jobId}:${uid}`, reason, undefined, { status: 'queued' })));
    await commit(env, [...writes, ...targetAudits, await auditWrite(env, actor, 'user_deletion_queued', 'deletionJob', jobId, crypto.randomUUID(), reason, undefined, { total: eligible.length })]);
  }
  return { success: true, jobId, status: 'queued', total: eligible.length };
}
async function processDeletionJob(env: Env, row: any) {
  const job = decode(row.document), uid = String(job.uid || ''), name = row.document.name;
  if (!uid || ['completed', 'failed'].includes(String(job.status))) return;
  const now = Date.now(), leaseUntil = Date.parse(String(job.leaseUntil || ''));
  if (job.leaseOwner && Number.isFinite(leaseUntil) && leaseUntil > now) return;
  const leaseOwner = crypto.randomUUID();
  try {
    await commit(env, [{ update: { name, fields: { status: jsonValue('processing'), leaseOwner: jsonValue(leaseOwner), leaseUntil: { timestampValue: new Date(now + 120000).toISOString() }, updatedAt: { timestampValue: new Date(now).toISOString() } } }, updateMask: { fieldPaths: ['status', 'leaseOwner', 'leaseUntil', 'updatedAt'] }, currentDocument: row.document.updateTime ? { updateTime: row.document.updateTime } : undefined }]);
  } catch { return; }
  const errors: string[] = Array.isArray(job.errors) ? job.errors : [], completed = new Set<string>(Array.isArray(job.completedStages) ? job.completedStages : []);
  const stages = ['auth', 'media', 'historical', 'records'];
  for (const stage of stages) {
    if (completed.has(stage)) continue;
    let stageMore = false;
    let mediaCursorNext: string | undefined;
    await commit(env, [{ update: { name, fields: { leaseOwner: jsonValue(leaseOwner), leaseUntil: { timestampValue: new Date(Date.now() + 120000).toISOString() } }, updateMask: { fieldPaths: ['leaseOwner', 'leaseUntil'] } } }]);
    try {
      if (stage === 'auth') {
        const currentTarget = await rawDoc(env, 'users', uid);
        if (!currentTarget?.data || await protectedDeletionTarget(env, { uid: String(job.actorUid || ''), admin: true, role: 'super_admin', permissionRole: 'owner' }, uid, currentTarget.data)) {
          const summary = { status: 'skipped_protected', stage: 'auth', deleted: 0, anonymized: 0, retained: 0, media: 0 };
           await commit(env, [{ update: { name, fields: { status: jsonValue('skipped_protected'), result: jsonValue(summary), leaseOwner: jsonValue(null), leaseUntil: jsonValue(null), initiatingActorUid: jsonValue(job.initiatingActorUid || job.actorUid || null), updatedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'result', 'leaseOwner', 'leaseUntil', 'initiatingActorUid', 'updatedAt'] } }, await auditWrite(env, { uid: 'system', admin: true, role: 'super_admin' }, 'user_deletion_target_terminal', 'user', uid, `deletion-skipped-protected:${uid}`, 'deletion target became protected', { initiatingActorUid: job.initiatingActorUid || job.actorUid }, summary)]);
          return;
        }
        if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) throw new Error('auth_config_missing');
        const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/accounts:delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }) });
        const result: any = await response.json().catch(() => ({}));
        const code = String(result?.error?.message || result?.error?.status || '');
        if (!response.ok && !['EMAIL_NOT_FOUND', 'USER_NOT_FOUND'].includes(code)) throw new Error('auth_delete_failed');
      }
      if (stage === 'media') {
        const ids: string[] = [], person = await rawDoc(env, 'users', uid);
        if (typeof person?.data?.avatarPublicId === 'string') ids.push(person.data.avatarPublicId);
        const equipmentQuery: any = { from: [{ collectionId: 'equipment' }], where: { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: jsonValue(uid) } }, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 100 };
        if (job.mediaCursor) equipmentQuery.startAt = { values: [{ referenceValue: String(job.mediaCursor) }] };
        const listed = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: equipmentQuery }) }) as any[] || [];
        if (listed.length >= 100) stageMore = true;
        mediaCursorNext = listed[listed.length - 1]?.document?.name;
        const page = job.mediaCursor && listed[0]?.document?.name === job.mediaCursor ? listed.slice(1) : listed;
        for (const item of page.filter((x: any) => x.document)) {
          const listing = decode(item.document);
          for (const image of Array.isArray(listing.images) ? listing.images : []) if (typeof image?.publicId === 'string') ids.push(image.publicId);
        }
        const ownedIds = [...new Set(ids)].filter(id => id.startsWith(`${env.CLOUDINARY_FOLDER || 'heavyar'}/${uid}/`));
        if (!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)) {
          if (ownedIds.length) throw new Error('cloudinary_config_missing');
        } else for (const publicId of ownedIds) {
          const timestamp = String(Math.floor(Date.now() / 1000));
          const digest = await crypto.subtle.digest('SHA-1', enc.encode(`public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`));
          const signature = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
          const form = new FormData(); form.append('public_id', publicId); form.append('timestamp', timestamp); form.append('api_key', env.CLOUDINARY_API_KEY); form.append('signature', signature);
           const response = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: 'POST', body: form });
           const result: any = await response.json().catch(() => ({}));
           if (!response.ok || !['ok', 'not found'].includes(String(result.result || '').toLowerCase())) throw new Error(`media:${publicId}`);
        }
      }
      if (stage === 'historical') {
        const writes: any[] = [];
        const historicalCursor: Record<string, string> = job.historicalCursor && typeof job.historicalCursor === 'object' ? job.historicalCursor : {};
        const nextHistoricalCursor: Record<string, string> = { ...historicalCursor };
        for (const collection of ['equipmentRequests', 'complaints', 'driverRequests']) {
          const historicalQuery: any = { from: [{ collectionId: collection }], where: { compositeFilter: { op: 'OR', filters: ['customerUid', 'providerUid', 'requesterUid', 'driverUid'].map(field => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: jsonValue(uid) } })) } }, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 100 };
          if (historicalCursor[collection]) historicalQuery.startAt = { values: [{ referenceValue: historicalCursor[collection] }] };
          const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: historicalQuery }) }) as any[] || [];
          const page = historicalCursor[collection] && rows[0]?.document?.name === historicalCursor[collection] ? rows.slice(1) : rows;
          if (rows.length >= 100) stageMore = true;
          if (rows.length) nextHistoricalCursor[collection] = rows[rows.length - 1]?.document?.name;
          for (const item of page.filter((x: any) => x.document)) {
            const data = decode(item.document), fields: Record<string, any> = {};
            const roles = [
              ['customerUid', ['customer', 'customerPublic', 'customerSnapshot', 'customerProfile']],
              ['providerUid', ['provider', 'providerPublic', 'providerSnapshot', 'providerProfile']],
              ['requesterUid', ['requester', 'requesterPublic', 'requesterSnapshot', 'requesterProfile']],
              ['driverUid', ['driver', 'driverPublic', 'driverSnapshot', 'driverProfile']],
            ] as const;
            for (const [uidField, snapshots] of roles) {
              if (data[uidField] !== uid) continue;
              fields[uidField] = jsonValue('deleted-user');
              for (const snapshot of snapshots) if (data[snapshot] !== undefined) fields[snapshot] = jsonValue({ deletedUser: true });
            }
            writes.push({ update: { name: item.document.name, fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: item.document.updateTime ? { updateTime: item.document.updateTime } : undefined });
          }
        }
        const verificationQuery: any = { from: [{ collectionId: 'verificationEvents' },], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: jsonValue(uid) } }, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 100 };
        if (historicalCursor.verificationEvents) verificationQuery.startAt = { values: [{ referenceValue: historicalCursor.verificationEvents }] };
        const verificationEvents = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: verificationQuery }) }) as any[] || [];
        const verificationPage = historicalCursor.verificationEvents && verificationEvents[0]?.document?.name === historicalCursor.verificationEvents ? verificationEvents.slice(1) : verificationEvents;
        stageMore = stageMore || verificationEvents.length >= 100;
        if (verificationEvents.length) nextHistoricalCursor.verificationEvents = verificationEvents[verificationEvents.length - 1]?.document?.name;
        for (const item of verificationPage.filter((x: any) => x.document)) writes.push({ update: { name: item.document.name, fields: { uid: jsonValue('deleted-user'), subjectUid: jsonValue('deleted-user') } }, updateMask: { fieldPaths: ['uid', 'subjectUid'] }, currentDocument: item.document.updateTime ? { updateTime: item.document.updateTime } : undefined });
        if (writes.length) await commit(env, writes.slice(0, 450));
        if (stageMore) {
          await commit(env, [{ update: { name, fields: { historicalCursor: jsonValue(nextHistoricalCursor) } }, updateMask: { fieldPaths: ['historicalCursor'] } }]);
        }
      }
      if (stage === 'records') {
        const writes: any[] = [];
        const ownedFields: Record<string, string[]> = {
          userProfiles: ['uid', 'userUid'], providerProfiles: ['uid', 'userUid'], driverProfiles: ['uid', 'userUid'],
          deviceTokens: ['uid', 'userUid'], notifications: ['uid', 'userUid'], notificationPreferences: ['uid', 'userUid'],
          notificationTokenOwners: ['uid', 'userUid'], notificationInstallations: ['uid', 'userUid'],
          notificationDeliveries: ['uid', 'userUid'], notificationOutbox: ['uid', 'userUid'], emailVerificationRateLimits: ['uid'],
          phoneAliases: ['uid', 'userUid'], phoneOwners: ['uid', 'userUid'], recoveryCodes: ['uid', 'userUid'],
          temporaryRecovery: ['uid', 'userUid'], verificationIndexes: ['uid', 'userUid'], equipment: ['ownerUid', 'uid'],
          verificationProfiles: ['uid', 'userUid'], verificationAttempts: ['uid', 'userUid'],
          equipmentDrafts: ['ownerUid', 'uid'], driverRequests: ['driverUid', 'requesterUid'],
        };
        for (const collection of deletionCollections) {
          const fields = collection === 'users' ? ['__name__'] : (ownedFields[collection] || ['uid']);
          for (const ownerField of fields) {
            const raw = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: ownerField }, op: 'EQUAL', value: ownerField === '__name__' ? { referenceValue: fullName(env, `${collection}/${uid}`) } : jsonValue(uid) } }, limit: 100 } }) }) as any[] || [];
            for (const item of raw.filter((x: any) => x.document)) writes.push({ delete: item.document.name, currentDocument: item.document.updateTime ? { updateTime: item.document.updateTime } : undefined });
            stageMore = stageMore || raw.length >= 100;
          }
        }
        if (writes.length) await commit(env, writes.slice(0, 450));
        stageMore = stageMore || writes.length >= 100;
      }
      if (stageMore) {
        const cursor = stage === 'media' ? mediaCursorNext : undefined;
        await commit(env, [{ update: { name, fields: { status: jsonValue('partially_completed'), stage: jsonValue(stage), ...(cursor ? { mediaCursor: jsonValue(cursor) } : {}), errors: jsonValue(errors), leaseOwner: jsonValue(null), leaseUntil: jsonValue(null), updatedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'stage', ...(cursor ? ['mediaCursor'] : []), 'errors', 'leaseOwner', 'leaseUntil', 'updatedAt'] } }]);
        return;
      }
      completed.add(stage);
      const stageResult = stage === 'records' ? { deleted: 1, anonymized: 0, retained: 0, media: 0, errors: [] } : stage === 'historical' ? { deleted: 0, anonymized: 1, retained: 0, media: 0, errors: [] } : stage === 'media' ? { deleted: 0, anonymized: 0, retained: 0, media: 1, errors: [] } : { deleted: 0, anonymized: 0, retained: 0, media: 0, errors: [] };
      await commit(env, [{ update: { name, fields: { status: jsonValue(stage === 'records' ? 'completed' : 'processing'), stage: jsonValue(stage), completedStages: jsonValue([...completed]), errors: jsonValue(errors), result: jsonValue(stageResult), ...(stage === 'records' ? { leaseOwner: jsonValue(null), leaseUntil: jsonValue(null) } : {}), updatedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'stage', 'completedStages', 'errors', 'result', ...(stage === 'records' ? ['leaseOwner', 'leaseUntil'] : []), 'updatedAt'] } }]);
    } catch (error) {
      errors.push(`${stage}:${error instanceof Error ? error.message : 'failed'}`);
      const attempts = Number(job.attempts || 0) + 1;
      const status = attempts >= 5 ? 'failed' : 'partially_completed';
       await commit(env, [{ update: { name, fields: { status: jsonValue(status), attempts: { integerValue: String(attempts) }, errors: jsonValue(errors), leaseOwner: jsonValue(null), leaseUntil: jsonValue(null), initiatingActorUid: jsonValue(job.initiatingActorUid || job.actorUid || null), updatedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'attempts', 'errors', 'leaseOwner', 'leaseUntil', 'initiatingActorUid', 'updatedAt'] } }, await auditWrite(env, { uid: 'system', admin: true, role: 'super_admin' }, 'user_deletion_target_terminal', 'user', uid, crypto.randomUUID(), 'deletion stage failed', { initiatingActorUid: job.initiatingActorUid || job.actorUid }, { status, stage, errors: errors.slice(-1) })]);
      return;
    }
  }
}
export async function processDeletionJobs(env: Env) {
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'deletionRequests' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: ['pending', 'queued', 'processing', 'partially_completed'].map(jsonValue) } } } }, limit: 10 } }) }) as any[] || [];
  for (const row of rows.filter((x: any) => x.document)) await processDeletionJob(env, row);
  const parents = new Set<string>();
  for (const row of rows.filter((x: any) => x.document)) { const parent = decode(row.document).parentJobId; if (parent) parents.add(String(parent)); }
  for (const parent of parents) {
    const job = await rawDoc(env, 'deletionJobs', parent);
    if (!job?.data) continue;
    const children = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'deletionRequests' }], where: { fieldFilter: { field: { fieldPath: 'parentJobId' }, op: 'EQUAL', value: jsonValue(parent) } }, limit: 100 } }) }) as any[] || [];
    const decoded = children.filter((x: any) => x.document).map((x: any) => decode(x.document)), total = Number(job.data.total || decoded.length), completed = decoded.filter((x: any) => ['completed', 'skipped_protected'].includes(x.status)).length, failed = decoded.filter((x: any) => x.status === 'failed').length;
    const status = completed === total ? 'completed' : failed ? 'partially_completed' : 'processing';
    const summaries = decoded.map((x: any) => x.result || {});
    const result = { completed, failed, total, deleted: summaries.reduce((n: number, x: any) => n + Number(x.deleted || 0), 0), anonymized: summaries.reduce((n: number, x: any) => n + Number(x.anonymized || 0), 0), retained: summaries.reduce((n: number, x: any) => n + Number(x.retained || 0), 0), media: summaries.reduce((n: number, x: any) => n + Number(x.media || 0), 0), errors: summaries.flatMap((x: any) => x.errors || []) };
    const writes: any[] = [{ update: { name: fullName(env, `deletionJobs/${encodeURIComponent(parent)}`), fields: { status: jsonValue(status), completed: { integerValue: String(completed) }, result: jsonValue(result), updatedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['status', 'completed', 'result', 'updatedAt'] } }];
     if (job.data.status !== status && ['completed', 'partially_completed'].includes(status)) writes.push(await auditWrite(env, { uid: 'system', admin: true, role: 'super_admin' }, 'user_deletion_job_terminal', 'deletionJob', parent, `deletion-terminal:${parent}:${status}`, 'deletion job terminal result', { initiatingActorUid: job.data.initiatingActorUid || job.data.actorUid }, { status, initiatingActorUid: job.data.initiatingActorUid || job.data.actorUid, ...result }));
    await commit(env, writes);
  }
}
const COUNTRY_CONTRACTS: Record<string, { nameEn: string; nameAr: string; dialCode: string; nativeCurrency: string; enabled: boolean }> = {
  SA: { nameEn: 'Saudi Arabia', nameAr: 'المملكة العربية السعودية', dialCode: '+966', nativeCurrency: 'SAR', enabled: true },
  AE: { nameEn: 'United Arab Emirates', nameAr: 'الإمارات العربية المتحدة', dialCode: '+971', nativeCurrency: 'AED', enabled: false },
  KW: { nameEn: 'Kuwait', nameAr: 'الكويت', dialCode: '+965', nativeCurrency: 'KWD', enabled: false },
  QA: { nameEn: 'Qatar', nameAr: 'قطر', dialCode: '+974', nativeCurrency: 'QAR', enabled: false },
  BH: { nameEn: 'Bahrain', nameAr: 'البحرين', dialCode: '+973', nativeCurrency: 'BHD', enabled: false },
  OM: { nameEn: 'Oman', nameAr: 'عُمان', dialCode: '+968', nativeCurrency: 'OMR', enabled: false },
};
function countryContractRows(stored: Array<RawDoc | null>) {
  return Object.entries(COUNTRY_CONTRACTS).map(([code, base], index) => {
    const data = stored[index]?.data || {};
    const enabled = data.enabled === undefined ? base.enabled : data.enabled === true;
    return { code, ...base, ...data, enabled, marketplaceAvailable: enabled && (data.marketplaceAvailable === undefined ? base.enabled : data.marketplaceAvailable === true), providerOnboardingAvailable: enabled && (data.providerOnboardingAvailable === undefined ? base.enabled : data.providerOnboardingAvailable === true), crossBorderAvailable: enabled && data.crossBorderAvailable === true, version: Number(data.version || 1) };
  });
}
async function adminCountries(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
  const stored = await Promise.all(Object.keys(COUNTRY_CONTRACTS).map(code => rawDoc(env, 'countryConfigs', code)));
  if (req.method === 'GET') return { success: true, version: Math.max(1, ...stored.map(item => Number(item?.data?.version || 1))), countries: countryContractRows(stored) };
  const body: any = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.countries) || Object.keys(body).some(key => !['countries', 'expectedVersion', 'version'].includes(key))) return { error: 'Invalid countries contract', status: 400 };
  const currentVersion = Math.max(1, ...stored.map(item => Number(item?.data?.version || 1))), expected = Number(body.expectedVersion ?? body.version);
  if (!Number.isInteger(expected) || expected !== currentVersion) return { error: 'Country configuration precondition failed', errorCode: 'VERSION_PRECONDITION_FAILED', status: 412, version: currentVersion };
  if (body.countries.length !== 6 || new Set(body.countries.map((row: any) => row?.code)).size !== 6 || Object.keys(COUNTRY_CONTRACTS).some(code => !body.countries.some((row: any) => row.code === code))) return { error: 'Country set must be exactly SA, AE, KW, QA, BH, OM', status: 400 };
  const rows = body.countries.map((row: any) => {
    const base = COUNTRY_CONTRACTS[row.code];
    if (!base || row.nameEn !== undefined && row.nameEn !== base.nameEn || row.nameAr !== undefined && row.nameAr !== base.nameAr || row.dialCode !== undefined && row.dialCode !== base.dialCode || row.nativeCurrency !== undefined && row.nativeCurrency !== base.nativeCurrency) throw new Error('IMMUTABLE_COUNTRY_MAPPING');
    for (const key of ['enabled', 'marketplaceAvailable', 'providerOnboardingAvailable', 'crossBorderAvailable']) if (row[key] !== undefined && typeof row[key] !== 'boolean') throw new Error('INVALID_COUNTRY_FLAG');
    const enabled = row.enabled === undefined ? base.enabled : row.enabled;
    return { ...base, code: row.code, enabled, marketplaceAvailable: enabled && row.marketplaceAvailable === true, providerOnboardingAvailable: enabled && row.providerOnboardingAvailable === true, crossBorderAvailable: enabled && row.crossBorderAvailable === true };
  });
  try {
    const nextVersion = currentVersion + 1, now = new Date().toISOString();
    const writes = rows.map((row: any) => { const prior = stored[Object.keys(COUNTRY_CONTRACTS).indexOf(row.code)]; return { update: { name: fullName(env, `countryConfigs/${row.code}`), fields: Object.fromEntries(Object.entries({ ...row, version: nextVersion, updatedAt: now, updatedBy: user.uid }).map(([key, value]) => [key, jsonValue(value)])) }, currentDocument: prior?.updateTime ? { updateTime: prior.updateTime } : { exists: false } }; });
    writes.push(await auditWrite(env, user, 'countries_updated', 'configuration', 'countryConfigs', crypto.randomUUID(), 'GCC country configuration updated', { version: currentVersion }, { version: nextVersion, countries: rows.map((row: any) => ({ code: row.code, enabled: row.enabled, marketplaceAvailable: row.marketplaceAvailable, providerOnboardingAvailable: row.providerOnboardingAvailable, crossBorderAvailable: row.crossBorderAvailable })) }));
    await commit(env, writes);
    return { success: true, version: nextVersion, countries: rows.map((row: any) => ({ ...row, version: nextVersion, updatedAt: now })) };
  } catch (error) {
    if (error instanceof Error && error.message === 'IMMUTABLE_COUNTRY_MAPPING') return { error: 'Country code, dial code, names, and native currency are immutable', status: 400 };
    if (error instanceof Error && error.message === 'INVALID_COUNTRY_FLAG') return { error: 'Invalid country availability flag', status: 400 };
    throw error;
  }
}
async function adminFxProvider(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
  const prior = await rawDoc(env, 'fxProviders', 'default'), data = prior?.data || {}, defaults = { provider: 'none', enabled: false, refreshIntervalSeconds: 3600, cacheTtlSeconds: 86400, status: 'disabled', lastSuccessfulAt: null, lastSuccessfulVersion: null, version: 1 };
  if (req.method === 'GET') return { success: true, fx: { ...defaults, ...data, provider: 'none', enabled: false, status: 'disabled' } };
  const body: any = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['expectedVersion', 'version', 'refreshIntervalSeconds', 'cacheTtlSeconds'].includes(key))) return { error: 'Invalid FX provider contract', status: 400 };
  const currentVersion = Number(data.version || 1), expected = Number(body.expectedVersion ?? body.version);
  if (!Number.isInteger(expected) || expected !== currentVersion) return { error: 'FX provider precondition failed', errorCode: 'VERSION_PRECONDITION_FAILED', status: 412, version: currentVersion };
  const refresh = Number(body.refreshIntervalSeconds ?? data.refreshIntervalSeconds ?? defaults.refreshIntervalSeconds), ttl = Number(body.cacheTtlSeconds ?? data.cacheTtlSeconds ?? defaults.cacheTtlSeconds);
  if (!Number.isInteger(refresh) || refresh < 60 || !Number.isInteger(ttl) || ttl < refresh) return { error: 'Invalid FX refresh/cache interval', status: 400 };
  const nextVersion = currentVersion + 1, now = new Date().toISOString(), fields = Object.fromEntries(Object.entries({ provider: 'none', enabled: false, refreshIntervalSeconds: refresh, cacheTtlSeconds: ttl, status: 'disabled', lastSuccessfulAt: data.lastSuccessfulAt || null, lastSuccessfulVersion: data.lastSuccessfulVersion || null, version: nextVersion, updatedAt: now, updatedBy: user.uid }).map(([key, value]) => [key, jsonValue(value)]));
  await commit(env, [{ update: { name: fullName(env, 'fxProviders/default'), fields }, currentDocument: prior?.updateTime ? { updateTime: prior.updateTime } : { exists: false } }, await auditWrite(env, user, 'fx_provider_updated', 'configuration', 'fxProviders/default', crypto.randomUUID(), 'FX provider remains disabled; no rates or settlement enabled', data, { version: nextVersion, refreshIntervalSeconds: refresh, cacheTtlSeconds: ttl })]);
  return { success: true, fx: { ...defaults, ...data, provider: 'none', enabled: false, status: 'disabled', refreshIntervalSeconds: refresh, cacheTtlSeconds: ttl, version: nextVersion, updatedAt: now } };
}
function defaultAuthConfig() {
  return { requested: { requirePhoneOnSignup: false, requireMobileDuringSignup: false, allowEmailLogin: true, allowPhoneLogin: false, requirePhoneVerification: false, phoneIndexReady: false }, effective: { requirePhoneOnSignup: false, requireMobileDuringSignup: false, allowEmailLogin: true, allowPhoneLogin: false, requirePhoneVerification: false, phoneIndexReady: false }, status: { firebaseReset: 'blocked', resend: 'sender_unverified', phoneProvider: 'not_required_for_alias', phonePasswordLogin: 'blocked', phoneIndexReady: false }, version: 1 };
}
function authConfigProjection(env: Env, raw: any) {
  const requested = { requirePhoneOnSignup: raw?.requirePhoneOnSignup === true, requireMobileDuringSignup: raw?.requirePhoneOnSignup === true, allowEmailLogin: raw?.allowEmailLogin !== false, allowPhoneLogin: raw?.allowPhoneLogin === true, requirePhoneVerification: raw?.requirePhoneVerification === true, phoneIndexReady: raw?.phoneIndexReady === true };
  const passwordEndpointReady = !!env.FIREBASE_PROJECT_ID && !!env.FIREBASE_WEB_API_KEY && !!env.FIREBASE_CLIENT_EMAIL && !!env.FIREBASE_PRIVATE_KEY;
  const effective = { ...requested, requirePhoneOnSignup: requested.phoneIndexReady && requested.requirePhoneOnSignup, requireMobileDuringSignup: requested.phoneIndexReady && requested.requirePhoneOnSignup, allowEmailLogin: requested.allowEmailLogin, allowPhoneLogin: requested.phoneIndexReady && passwordEndpointReady && requested.allowPhoneLogin === true, requirePhoneVerification: false };
  const firebaseReset = env.FIREBASE_WEB_API_KEY || env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY ? 'configured' : 'blocked';
  const resendFrom = env.RESEND_FROM_EMAIL || 'Heavyar <noreply@mail.heavyar.com>';
  const senderDomainVerified = env.RESEND_SENDER_DOMAIN_VERIFIED === 'true' && /@mail\.heavyar\.com>?\s*$/i.test(resendFrom);
  const blocked = { allowEmailLogin: requested.allowEmailLogin !== effective.allowEmailLogin, allowPhoneLogin: requested.allowPhoneLogin !== effective.allowPhoneLogin, requirePhoneVerification: requested.requirePhoneVerification !== effective.requirePhoneVerification, requirePhoneOnSignup: requested.requirePhoneOnSignup !== effective.requirePhoneOnSignup };
  return { requested, effective, blocked, status: { firebaseReset, resend: senderDomainVerified ? 'configured' : env.RESEND_API_KEY ? 'sender_unverified' : 'not_configured', phoneProvider: 'not_required_for_alias', phonePasswordLogin: effective.allowPhoneLogin ? 'configured' : 'blocked', phoneIndexReady: requested.phoneIndexReady, senderDomainVerified }, accountRecovery: { firebaseReset, resend: { bound: !!env.RESEND_API_KEY, delivery: senderDomainVerified, senderDomainVerified }, phoneRecovery: requested.phoneIndexReady ? 'configured' : 'disabled' }, mismatch: { email: blocked.allowEmailLogin, phone: blocked.allowPhoneLogin, verification: blocked.requirePhoneVerification, phoneRequirement: blocked.requirePhoneOnSignup }, version: Number(raw?.version || 1) };
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
    for (const key of ['ownerUid', 'customerUid', 'providerUid', 'uid', ...(collection === 'users' || collection === 'providerProfiles' || collection === 'driverProfiles' ? ['id'] : []), 'customerId', 'providerId']) {
      if (typeof item[key] === 'string' && item[key]) needed.add(item[key]);
    }
  }
  const people = new Map<string, any>();
  const reminders = new Map<string, any>();
  if (collection === 'users') for (const item of items) people.set(String(item.id), item);
  const accounts = ['users', 'providerProfiles', 'driverProfiles'].includes(collection);
  const equipment = new Map<string, any>();
  const equipmentIds = [...new Set(items.map((item) => item.equipmentId).filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, 50);
  const reads = [
    ...[...needed].filter(uid => !people.has(uid)).map(id => ({ collection: 'users', id, target: people })),
    ...(accounts ? items.map(item => ({ collection: 'emailVerificationRateLimits', id: String(item.uid || item.id), target: reminders })) : []),
    ...equipmentIds.map(id => ({ collection: 'equipment', id, target: equipment })),
  ];
  for (let offset = 0; offset < reads.length; offset += 100) {
    const chunk = reads.slice(offset, offset + 100);
    if (firestoreOverride) {
      for (const read of chunk) {
        const doc = await rawDoc(env, read.collection, read.id);
        if (doc) read.target.set(read.id, redact(doc.data));
      }
    } else if (chunk.length) {
      const byName = new Map(chunk.map(read => [fullName(env, `${read.collection}/${read.id}`), read]));
      const result = await fs(env, ':batchGet', { method: 'POST', body: JSON.stringify({ documents: [...byName.keys()] }) }) as any[] || [];
      for (const row of result) {
        const read = byName.get(row.found?.name);
        if (read) read.target.set(read.id, redact(decode(row.found)));
      }
    }
  }
  return items.map((item) => {
    const record = { ...item };
    const accountUid = String(record.uid || record.id || '');
    const reminder = reminders.get(accountUid);
    if (reminder) {
      record.verificationReminder = { lastSentAt: reminder.lastSentAt, count: Number(reminder.count || 0), nextAllowedAt: reminder.nextAllowedAt, deliveryStatus: reminder.deliveryStatus, providerMessageId: reminder.providerMessageId };
      record.lastVerificationReminderAt = reminder.lastSentAt;
      record.verificationReminderCount = Number(reminder.count || 0);
      record.verificationReminderNextAllowedAt = reminder.nextAllowedAt;
      record.verificationReminderDeliveryStatus = reminder.deliveryStatus;
      record.verificationReminderProviderMessageId = reminder.providerMessageId;
    }
    if (collection === 'users') record.displayName = displayName(record);
    if (collection === 'driverProfiles') {
      const person = people.get(record.uid || record.id);
      record.displayName = displayName(record, displayName(person));
      if (person?.email) record.email = person.email;
      // Do not overwrite the authoritative Auth value with the profile mirror.
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
  const providerAmount = invoiceData.providerAmount === undefined || invoiceData.providerAmount === null ? undefined : Number(invoiceData.providerAmount);
  const paymentAmount = Number(paymentData.amount), rentalSubtotal = Number(requestData.finalAmount ?? requestData.amount);
  const paymentReference = typeof paymentData.providerReference === 'string' ? paymentData.providerReference : '';
  const verifyCommercial = (value: any): CommercialSnapshot | null => {
    if (!value || typeof value !== 'object' || value.currency !== invoiceData.currency) return null;
    const fields = ['baseAmountMinor', 'platformFeeMinor', 'customerFeeMinor', 'providerFeeMinor', 'providerReceivableMinor', 'customerPayableMinor'];
    if (fields.some(field => !Number.isSafeInteger(value[field]) || value[field] < 0) ||
        value.taxAmountMinor !== null && (!Number.isSafeInteger(value.taxAmountMinor) || value.taxAmountMinor < 0) ||
        value.taxRateBps !== undefined && value.taxRateBps !== null && (!Number.isSafeInteger(value.taxRateBps) || value.taxRateBps < 0 || value.taxRateBps >= 10_000) ||
        value.gatewayFeeMinor !== null && (!Number.isSafeInteger(value.gatewayFeeMinor) || value.gatewayFeeMinor < 0) ||
        value.customerFeeMinor + value.providerFeeMinor !== value.platformFeeMinor ||
        value.providerReceivableMinor !== value.baseAmountMinor - value.providerFeeMinor ||
        value.customerPayableMinor !== value.baseAmountMinor + value.customerFeeMinor + (value.taxAmountMinor ?? 0)) return null;
    return value as CommercialSnapshot;
  };
  const commercial = verifyCommercial(invoiceData.commercialSnapshot);
  const sameCommercial = (other: any) => {
    if (!commercial || !other || typeof other !== 'object') return false;
    const fields = ['ruleVersion', 'ruleStatus', 'mode', 'percentageBps', 'fixedAmountMinor', 'minimumFeeMinor', 'maximumFeeMinor', 'payer', 'customerShareBps', 'baseAmountMinor', 'platformFeeMinor', 'customerFeeMinor', 'providerFeeMinor', 'providerReceivableMinor', 'customerPayableMinor', 'taxAmountMinor', 'taxRateBps', 'gatewayFeeMinor', 'currency', 'countryCode', 'categoryId', 'providerUid', 'calculatedAt', 'taxReference', 'ruleEffectiveFrom', 'ruleEffectiveTo', 'ruleCreatedAt', 'ruleCreatedBy', 'ruleUpdatedAt', 'ruleUpdatedBy', 'ruleNotes'];
    return fields.every(field => commercial[field as keyof CommercialSnapshot] === other[field]) &&
      commercial.scope?.countryCode === other.scope?.countryCode &&
      commercial.scope?.categoryId === other.scope?.categoryId &&
      commercial.scope?.providerUid === other.scope?.providerUid;
  };
  const customerFee = commercial ? Number(minorToMajor(commercial.customerFeeMinor, commercial.currency)) : 0;
  const commercialRecordsAgree = !invoiceData.commercialSnapshot || !!commercial &&
    sameCommercial(paymentData.commercialSnapshot) && sameCommercial(requestData.paidCommercialSnapshot) &&
    equivalentAmount(subtotal, Number(minorToMajor(commercial.baseAmountMinor, commercial.currency))) &&
    platformFee !== undefined && equivalentAmount(platformFee, Number(minorToMajor(commercial.platformFeeMinor, commercial.currency))) &&
    providerAmount !== undefined && equivalentAmount(providerAmount, Number(minorToMajor(commercial.providerReceivableMinor, commercial.currency))) &&
    equivalentAmount(vatAmount, Number(minorToMajor(commercial.taxAmountMinor ?? 0, commercial.currency))) &&
    equivalentAmount(total, Number(minorToMajor(commercial.customerPayableMinor, commercial.currency)));
  if (!customerUid || !providerUid || !equipmentId ||
      invoiceNumber !== invoiceId || !settledState(invoiceData.status) ||
      requestData.customerUid !== invoiceData.customerId || requestData.providerUid !== invoiceData.providerId ||
      equipmentId !== invoiceData.equipmentId || requestData.paymentStatus !== 'paid' || requestData.paymentState !== 'paid' ||
      requestData.invoiceId !== invoiceId || requestData.currency !== 'SAR' ||
      paymentData.requestId !== requestId || !settledState(paymentData.state) || paymentData.invoiceId !== invoiceId ||
      paymentData.customerUid !== customerUid || invoiceData.currency !== 'SAR' || paymentData.currency !== 'SAR' ||
      !paymentReference || invoiceData.paymentReference !== paymentReference || requestData.paymentId !== paymentReference ||
      ![subtotal, vatAmount, customerFee, total, paymentAmount, rentalSubtotal].every(Number.isFinite) ||
      subtotal < 0 || vatAmount < 0 || total <= 0 || (platformFee !== undefined && (!Number.isFinite(platformFee) || platformFee < 0)) ||
      !equivalentAmount(subtotal + customerFee + vatAmount, total) || !equivalentAmount(paymentAmount, total) || !equivalentAmount(rentalSubtotal, subtotal) ||
      !commercialRecordsAgree ||
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
    customerFee: commercial ? customerFee : undefined,
    providerReceivable: commercial ? Number(minorToMajor(commercial.providerReceivableMinor, commercial.currency)) : undefined,
    gatewayFee: commercial?.gatewayFeeMinor === null || !commercial ? undefined : Number(minorToMajor(commercial.gatewayFeeMinor, commercial.currency)),
    commissionConfigVersion: commercial?.ruleVersion,
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
async function firebaseEmailVerified(env: Env, uid: string, profile: any, actor: AdminUser): Promise<boolean> {
  if (actor.testInjected) return profile?.emailVerified === true;
  try {
    const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID || '')}/accounts:lookup`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid] }) });
    if (!response.ok) return false;
    return (await response.json() as any).users?.[0]?.emailVerified === true;
  } catch { return false; }
}
async function emailVerificationRequiredForSensitiveAction(env: Env, uid: string, profile: any, actor: AdminUser, action: 'driver' | 'listing') {
  const policy = (await rawDoc(env, 'emailVerificationPolicies', 'default'))?.data || {};
  const required = action === 'driver' ? policy.requireBeforeDriverActivation !== false : policy.requireBeforeListingSubmission !== false;
  return policy.enabled !== false && required && !(await firebaseEmailVerified(env, uid, profile, actor));
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
   let collection = TARGET_COLLECTIONS[rawTargetType];
   // Provider actions are account lifecycle operations, not configuration
   // toggles. The provider page supplies the canonical Firebase UID.
   const providerLifecycleActions = ['approve_provider', 'reject_provider', 'suspend_provider', 'restore_provider', 'reactivate_provider'];
   if ((rawTargetType === 'provider' || rawTargetType === 'providerConfig' || rawTargetType === 'provider-config' || rawTargetType === 'provider-configs') && providerLifecycleActions.includes(actionName)) collection = 'users';
  const normalizedType = collection === 'users' ? 'user' : collection === 'payments' ? 'payment' : collection === 'complaints' ? 'complaint' : collection === 'equipmentRequests' ? 'request' : collection === 'providerConfigs' ? 'providerConfig' : collection === 'heavyarConfig' ? 'config' : collection === 'verificationCases' ? 'verification' : collection;
  const reason = String(payload.reason || payload.note || '').trim();
  const correlationId = String(req.headers.get('X-Correlation-ID') || crypto.randomUUID());
   if (!validCorrelationId(correlationId)) return { error: 'Invalid correlation ID', status: 400 };
   const reasonRequired = ['reject_listing', 'suspend_listing', 'reject_driver', 'suspend_driver', 'reject_provider', 'suspend_provider', 'suspend_user', 'permanent_remove_user', 'permanent_remove_provider', 'permanent_remove_driver', 'delete_account', 'permanent_policy_removal'].includes(actionName);
   if (!actionName || !rawTargetType || !collection || !targetId || reason.length > 1000 || reasonRequired && reason.length < 1) return { error: 'Invalid action target or reason', status: 400 };
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
   if (normalizedType === 'user' && providerLifecycleActions.includes(actionName)) {
     if (!can(u, 'moderation.manage') && !can(u, 'operations.manage')) return { error: 'Provider operations permission required', status: 403 };
     const uid = targetId;
     const profile = await rawDoc(env, 'providerProfiles', uid);
     if (!profile?.data && current.role !== 'provider') return { error: 'Provider account not found', status: 404 };
     if (actionName === 'approve_provider' && await emailVerificationRequiredForSensitiveAction(env, uid, current, u, 'driver')) return { error: 'EMAIL_VERIFICATION_REQUIRED', errorCode: 'EMAIL_VERIFICATION_REQUIRED', status: 403 };
     const approved = actionName === 'approve_provider' || actionName === 'restore_provider' || actionName === 'reactivate_provider';
     fields = {
       accountStatus: jsonValue(approved ? 'active' : actionName === 'reject_provider' ? 'rejected' : 'suspended'),
       suspensionStatus: jsonValue(approved ? 'active' : 'temporarily_suspended'),
       providerStatus: jsonValue(approved ? 'approved' : actionName === 'reject_provider' ? 'rejected' : 'suspended'),
       moderationReason: jsonValue(reason), moderatedBy: jsonValue(u.uid), moderatedAt: { timestampValue: new Date().toISOString() },
     };
   } else if (normalizedType === 'equipment' && ['archive_listing', 'delete_listing', 'hide_listing', 'show_listing'].includes(actionName)) {
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
   } else if (normalizedType === 'driverProfile' && ['approve_driver', 'reject_driver', 'suspend_driver', 'restore_driver', 'reactivate_driver'].includes(actionName)) {
    if (!can(u, 'moderation.manage') && !can(u, 'operations.manage')) return { error: 'Driver operations permission required', status: 403 };
     if ((actionName === 'approve_driver' || actionName === 'restore_driver' || actionName === 'reactivate_driver') && await emailVerificationRequiredForSensitiveAction(env, String(current.uid || targetId), await rawDoc(env, 'users', String(current.uid || targetId)).then(item => item?.data), u, 'driver')) return { error: 'EMAIL_VERIFICATION_REQUIRED', errorCode: 'EMAIL_VERIFICATION_REQUIRED', status: 403 };
     const driverActive = ['approve_driver', 'restore_driver', 'reactivate_driver'].includes(actionName);
     fields = { active: jsonValue(driverActive), moderationStatus: jsonValue(driverActive ? 'approved' : actionName === 'reject_driver' ? 'rejected' : 'suspended'), moderationReason: jsonValue(reason), moderatedBy: jsonValue(u.uid), moderatedAt: { timestampValue: new Date().toISOString() } };
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
      // This is a staff moderation decision, not the owner's submission.
      // The owner publishing gate remains on /api/listings, never here.
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
  } else if (!Object.keys(fields).length) return { error: 'Unsupported action', status: 400 };
  if (normalizedType === 'equipment' && isStoreReviewAccount(current)) {
    fields = {
      ...fields,
      accountPurpose: jsonValue(STORE_REVIEW_PURPOSE),
      isActive: { booleanValue: false },
      visibility: jsonValue('hidden'),
    };
  }
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
  return authorizeResolvedAdmin(u, env && !u.testInjected ? await rawDoc(env, 'staffMembers', u.uid) : undefined);
}

// Private, request-local context: never accept a browser-supplied authorization
// marker or cache staff privileges across requests.
function authorizeResolvedAdmin(u: AdminUser, staff: RawDoc | null | undefined) {
  if (staff !== undefined && !u.testInjected) {
    if (!staff?.data || staff.data.active === false || staff.data.status === 'suspended') throw new Error('ADMIN_REQUIRED');
    const authoritative = normalizeStaffRole(staff.data.role);
    if (!authoritative || (staff.data.roleVersion !== undefined && Number(staff.data.roleVersion) < 1)) throw new Error('ADMIN_REQUIRED');
    u.permissionRole = authoritative;
    if (authoritative === 'admin' || authoritative === 'super_admin' || authoritative === 'owner') u.role = authoritative === 'owner' ? 'super_admin' : authoritative;
  }
  if (!normalizeStaffRole(u.permissionRole || u.role) && u.role !== 'admin' && u.role !== 'super_admin') throw new Error('ADMIN_REQUIRED');
  requireVerifiedAdmin(u);
  return u;
}

function requireVerifiedAdmin(user: AdminUser) {
  // Production identities always have a verified, signed Firebase claim.
  // Older unit fixtures may omit it, but explicit false must never bypass it.
  if (user.emailVerified !== true && !(user.testInjected && user.emailVerified === undefined)) throw new Error('EMAIL_VERIFICATION_REQUIRED');
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
  const expiry = new Date(expiresAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || 'Heavyar <noreply@mail.heavyar.com>',
      to: [email],
      subject,
       html: `<div dir="rtl" lang="ar"><h1>HEAVYAR</h1><h2>دعوة للانضمام إلى فريق Heavyar</h2><p>${escapeHtml(label)}</p><p>تنتهي الدعوة في <strong>${escapeHtml(expiry)} UTC</strong>.</p><p><a href="${acceptanceUrl}">قبول الدعوة</a></p><p>هذه الدعوة مخصصة للمستلم فقط وتتطلب حساباً موثق البريد.</p><hr dir="ltr"><div dir="ltr"><h2>Heavyar team invitation</h2><p>This invitation expires <strong>${escapeHtml(expiry)} UTC</strong>.</p><p><a href="${acceptanceUrl}">Accept invitation</a></p><p>For the intended recipient only. Sign in with the invited, email-verified account.</p></div></div>`,
    }),
  });
  if (!sent.ok) throw new Error('Invitation delivery unavailable');
  const result: any = await sent.json().catch(() => ({}));
  return typeof result?.id === 'string' ? result.id : undefined;
}

async function invitationToken(token: string) {
  if (!token || token.length > 200) return null;
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(token)));
}

const invitationError = (errorCode: string, status: number) => ({ success: false, error: errorCode, errorCode, status });
function validInvitationId(id: unknown): id is string {
  // Management receives an opaque physical Firestore ID, not a bearer token
  // or a particular generation's naming scheme. Preserve it byte-for-byte.
  return typeof id === 'string' && id.trim().length > 0 && enc.encode(id).length <= 1500
    && id !== '.' && id !== '..' && !/^__.*__$/.test(id)
    && !/[/\\\u0000-\u001f\u007f]/.test(id);
}

/**
 * Firestore resource names in JSON are NOT URL paths. Older creation code
 * persisted a literal "%3A" in the document ID. Preserve that identity rather
 * than decoding list IDs into a different document or migrating live records.
 */
async function staffInvitation(env: Env, id: string, allowLegacyTokenId = false) {
  let actualId = id, raw = await rawDoc(env, 'staffInvitations', actualId);
  // Only a token-derived lookup may try the historical encoded hash shape.
  // Management must never silently resolve a different physical document.
  if (!raw && allowLegacyTokenId && id.startsWith('invite:')) {
    actualId = id.replace(':', '%3A');
    raw = await rawDoc(env, 'staffInvitations', actualId);
  }
  return raw ? { ...raw, id: actualId, name: fullName(env, `staffInvitations/${actualId}`) } : null;
}

function invitationStateError(data: any, status = 409) {
  if (!data) return invitationError('INVITATION_INVALID', 404);
  if (data.status === 'accepted') return invitationError('INVITATION_ALREADY_ACCEPTED', status);
  if (data.status === 'cancelled' || data.status === 'revoked') return invitationError('INVITATION_ALREADY_CANCELLED', status);
  if (data.status === 'expired' || data.status === 'pending' && !pendingAndUnexpired(data)) return invitationError('INVITATION_EXPIRED', status);
  if (data.status !== 'pending') return invitationError('INVITATION_INVALID', status);
  return null;
}

async function createStaffInvitation(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'staff.manage')) return invitationError('PERMISSION_DENIED', 403);
  const body: any = await req.json().catch(() => null);
  const email = normalizeAuthorityEmail(body?.email), role = invitationRole(body?.role);
  if (!email || !role) return invitationError('INVITATION_INVALID', 400);
  if (!env.RESEND_API_KEY) return invitationError('INVITATION_DELIVERY_UNAVAILABLE', 503);
  const token = crypto.randomUUID(), tokenHash = await invitationToken(token);
  if (!tokenHash) return invitationError('INVITATION_INVALID', 400);
  const id = `invite:${tokenHash}`, now = new Date().toISOString(), expiresAt = invitationExpiry();
  await commit(env, [
    { update: { name: fullName(env, `staffInvitations/${id}`), fields: {
      email: jsonValue(email), role: jsonValue(role), invitedBy: jsonValue(user.uid), status: jsonValue('pending'),
       expiresAt: { timestampValue: expiresAt }, createdAt: { timestampValue: now },
       deliveryStatus: jsonValue('requested'), deliveryRequestedAt: { timestampValue: now },
    } }, currentDocument: { exists: false } },
    await auditWrite(env, user, 'staff_invite_created', 'staffInvitation', id, crypto.randomUUID(), 'staff invitation created'),
  ]);
  try {
    const providerMessageId = await sendAuthorityInvitation(env, email, token, 'staff', expiresAt, 'دعوة للانضمام إلى فريق Heavyar / Heavyar staff invitation', 'دعوة للانضمام إلى فريق Heavyar. You have been invited to Heavyar staff access.');
    const reconciled = await priorResendEvent(env, providerMessageId);
    const fields = { deliveryStatus: jsonValue(reconciled?.status || 'accepted'), providerMessageId: jsonValue(providerMessageId || null), deliveryAcceptedAt: { timestampValue: new Date().toISOString() }, deliveryEventAt: reconciled?.eventAt ? { timestampValue: reconciled.eventAt } : { nullValue: null } };
    await commit(env, [{ update: { name: fullName(env, `staffInvitations/${id}`), fields }, updateMask: { fieldPaths: Object.keys(fields) } }]);
    await reconcileResendProjection(env, 'staffInvitations', id, providerMessageId);
  } catch {
    // The invitation cannot become an untracked delivery.  It remains pending
    // only for the documented expiry period and administrators can revoke it.
     await commit(env, [{ update: { name: fullName(env, `staffInvitations/${id}`), fields: { deliveryStatus: jsonValue('failed'), deliveryFailedAt: { timestampValue: new Date().toISOString() } } }, updateMask: { fieldPaths: ['deliveryStatus', 'deliveryFailedAt'] } }, await auditWrite(env, user, 'staff_invite_delivery_failed', 'staffInvitation', id, crypto.randomUUID(), 'invitation delivery failed')]);
    return invitationError('INVITATION_DELIVERY_UNAVAILABLE', 503);
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
  if (!can(user, 'staff.manage')) return invitationError('PERMISSION_DENIED', 403);
  const body: any = await req.json().catch(() => null), id = body?.id ?? body?.invitationId;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!validInvitationId(id) || body?.id && body?.invitationId && body.id !== body.invitationId) return invitationError('INVITATION_INVALID', 400);
  if (reason.length < 3 || reason.length > 1000) return invitationError('INVITATION_REASON_REQUIRED', 400);
  // A delivery webhook may change updateTime while leaving business state
  // pending. Retry boundedly against a fresh snapshot, never drop the CAS.
  for (let attempt = 0; attempt < 3; attempt++) {
    const invitation = await staffInvitation(env, id);
    if (invitation?.data.status === 'cancelled') return { success: true, invitationId: invitation.id, status: 'cancelled', idempotent: true, code: 'INVITATION_ALREADY_CANCELLED' };
    const stateError = invitationStateError(invitation?.data);
    if (stateError) return stateError;
    if (!invitation?.updateTime) return invitationError('INVITATION_CONFLICT', 409);
    const fields = { status: jsonValue('cancelled'), cancelledBy: jsonValue(user.uid), cancelledAt: { timestampValue: new Date().toISOString() }, cancellationReason: jsonValue(reason) };
    try {
      await commit(env, [
        { update: { name: invitation.name, fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: invitation.updateTime } },
        await auditWrite(env, user, 'staff_invitation_revoked', 'staffInvitation', invitation.id, crypto.randomUUID(), reason, { status: 'pending' }, { status: 'cancelled', cancelledBy: user.uid, cancellationReason: reason }),
      ]);
      return { success: true, invitationId: invitation.id, status: 'cancelled' };
    } catch (error) {
      if (!(error instanceof FirestoreConflictError)) throw error;
    }
  }
  return invitationError('INVITATION_CONFLICT', 409);
}

async function resendStaffInvitation(req: Request, env: Env, user: AdminUser) {
  if (!can(user, 'staff.manage')) return invitationError('PERMISSION_DENIED', 403);
  const body: any = await req.json().catch(() => null), id = body?.id ?? body?.invitationId;
  if (!validInvitationId(id)) return invitationError('INVITATION_INVALID', 400);
  const invitation = await staffInvitation(env, id);
  const stateError = invitationStateError(invitation?.data);
  if (stateError) return stateError;
  if (!invitation?.updateTime) return invitationError('INVITATION_CONFLICT', 409);
  const last = Date.parse(String(invitation.data.lastResentAt || invitation.data.createdAt || 0));
  if (Number.isFinite(last) && Date.now() - last < 300000) return invitationError('INVITATION_RESEND_COOLDOWN', 429);
  const token = crypto.randomUUID(), hash = await invitationToken(token);
  if (!hash) return invitationError('INVITATION_CONFLICT', 409);
  const nextId = `invite:${hash}`;
  const now = new Date().toISOString();
  try {
    const providerMessageId = await sendAuthorityInvitation(env, String(invitation.data.email), token, 'staff', String(invitation.data.expiresAt), 'دعوة للانضمام إلى فريق Heavyar / Heavyar staff invitation', 'دعوة للانضمام إلى فريق Heavyar. You have been invited to Heavyar staff access.');
    const reconciled = await priorResendEvent(env, providerMessageId);
    await commit(env, [
      { update: { name: invitation.name, fields: { status: jsonValue('cancelled'), supersededBy: jsonValue(nextId), cancelledAt: { timestampValue: now }, cancelledBy: jsonValue(user.uid), cancellationReason: jsonValue('Superseded by a new invitation') } }, updateMask: { fieldPaths: ['status', 'supersededBy', 'cancelledAt', 'cancelledBy', 'cancellationReason'] }, currentDocument: { updateTime: invitation.updateTime } },
      { update: { name: fullName(env, `staffInvitations/${nextId}`), fields: {
        email: jsonValue(invitation.data.email), role: jsonValue(invitation.data.role), invitedBy: jsonValue(user.uid),
        expiresAt: { timestampValue: invitation.data.expiresAt }, status: jsonValue('pending'), createdAt: { timestampValue: now },
        deliveryStatus: jsonValue(reconciled?.status || 'accepted'), deliveryAcceptedAt: { timestampValue: now }, providerMessageId: jsonValue(providerMessageId || null),
        deliveryEventAt: reconciled?.eventAt ? { timestampValue: reconciled.eventAt } : { nullValue: null },
        resendCount: { integerValue: String(Number(invitation.data.resendCount || 0) + 1) },
      } }, currentDocument: { exists: false } },
      await auditWrite(env, user, 'staff_invite_resent', 'staffInvitation', nextId, crypto.randomUUID(), 'staff invitation resent',
        { invitationId: invitation.id, status: 'pending' }, { invitationId: nextId, status: 'pending', supersedes: invitation.id }),
    ]);
    await reconcileResendProjection(env, 'staffInvitations', nextId, providerMessageId);
    return { success: true, invitationId: nextId, deliveryStatus: 'accepted' };
  } catch (error) {
    if (error instanceof FirestoreConflictError) return invitationError('INVITATION_CONFLICT', 409);
    await commit(env, [await auditWrite(env, user, 'staff_invite_delivery_failed', 'staffInvitation', id, crypto.randomUUID(), 'invitation resend failed')]);
    return invitationError('INVITATION_DELIVERY_UNAVAILABLE', 503);
  }
}

/** Exported for the non-admin route dispatcher: acceptance is deliberately public-to-authenticated. */
export async function acceptStaffInvitation(req: Request, env: Env, user: AdminUser) {
  const body: any = await req.json().catch(() => null), hash = await invitationToken(String(body?.token || ''));
  if (!hash) return invitationError('INVITATION_INVALID', 400);
  const raw = await staffInvitation(env, `invite:${hash}`, true);
  const email = await verifiedIdentityEmail(env, user);
  if (!email) return invitationError('EMAIL_VERIFICATION_REQUIRED', 403);
  if (!raw?.data || raw.data.email !== email) return invitationError('INVITATION_INVALID', 403);
  if (raw?.data?.status === 'accepted' && raw.data.acceptedBy === user.uid) return { success: true, role: invitationRole(raw.data.role), status: 'accepted', idempotent: true, claimsStatus: 'synchronized' };
  const stateError = invitationStateError(raw.data, 403);
  if (stateError) return stateError;
  const role = invitationRole(raw!.data.role);
  if (!role) return invitationError('INVITATION_INVALID', 403);
  if (!raw.updateTime) return invitationError('INVITATION_CONFLICT', 409);
  const current = await rawDoc(env, 'staffMembers', user.uid), roleVersion = Number(current?.data?.roleVersion || 0) + 1, now = new Date().toISOString();
  try {
    await commit(env, [
      { update: { name: fullName(env, `staffMembers/${encodeURIComponent(user.uid)}`), fields: {
        uid: jsonValue(user.uid), email: jsonValue(email), role: jsonValue(role), active: { booleanValue: true },
        roleVersion: { integerValue: String(roleVersion) }, invitationId: jsonValue(raw.id), joinedAt: { timestampValue: now },
      } }, currentDocument: current?.updateTime ? { updateTime: current.updateTime } : { exists: false } },
      claimSyncWrite(env, user.uid, role, true, roleVersion),
      { update: { name: raw.name, fields: {
        status: jsonValue('accepted'), acceptedBy: jsonValue(user.uid), acceptedAt: { timestampValue: now },
      } }, updateMask: { fieldPaths: ['status', 'acceptedBy', 'acceptedAt'] }, currentDocument: { updateTime: raw!.updateTime } },
      await auditWrite(env, user, 'staff_invitation_accepted', 'staffInvitation', raw.id, crypto.randomUUID(), 'invitation accepted'),
    ]);
  } catch (error) {
    if (!(error instanceof FirestoreConflictError)) throw error;
    const latest = await staffInvitation(env, raw.id);
    return invitationStateError(latest?.data) || invitationError('INVITATION_CONFLICT', 409);
  }
   try {
     await setRole(env, user, user.uid, role);
     return { success: true, role, status: 'accepted', claimsStatus: 'synchronized' };
   } catch {
     env.__executionCtx?.waitUntil(processStaffClaimSync(env));
     return { success: true, role, status: 'accepted', claimsStatus: 'pending', claimsPoll: `/api/staff/invitations/details?token=${encodeURIComponent(String(body?.token || ''))}` };
   }
}

/** Safe pre-auth invitation inspection; never returns the bearer token. */
export async function staffInvitationDetails(req: Request, env: Env) {
  const url = new URL(req.url), token = String(url.searchParams.get('token') || '');
  const hash = await invitationToken(token), invitation = hash ? await staffInvitation(env, `invite:${hash}`, true) : null;
  if (!hash || !invitation?.data) return invitationError('INVITATION_INVALID', 404);
  const data = invitation.data, status = data.status === 'pending' && !pendingAndUnexpired(data) ? 'expired' : String(data.status || 'unknown');
  const email = normalizeAuthorityEmail(data.email) || '';
  return { success: true, invitation: { id: invitation.id, status, email: email.replace(/^(.{2}).*(@.*)$/, '$1•••$2'), role: invitationRole(data.role), createdAt: data.createdAt, expiresAt: data.expiresAt, invitedBy: data.invitedBy, deliveryStatus: data.deliveryStatus || 'requested', acceptedAt: data.acceptedAt, acceptedBy: data.acceptedBy, cancelledAt: data.cancelledAt, claimsStatus: status === 'accepted' ? 'synchronized' : 'not_ready' } };
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

function seoStore(env: Env, user?: AdminUser): SeoStore {
  const projection = env.SEO_PUBLIC_KV;
  return {
    cacheKey: String(env.FIREBASE_PROJECT_ID),
    projection: projection ? {
      read: () => projection.get('published:v1', 'json'),
      write: value => projection.put('published:v1', JSON.stringify(value)),
    } : undefined,
    read: async (collection, id) => {
      try { return await rawDoc(env, collection, id); }
      catch (error) { if (isQuotaError(error)) throw error; throw new SeoPersistenceError('SEO storage is temporarily unavailable.'); }
    },
    save: async (prior, versions, change) => {
      if (!user) throw new SeoPersistenceError('Read-only SEO storage.');
      try {
        if (prior && !prior.updateTime) throw new SeoPersistenceError('SEO version precondition unavailable.');
        const writes: any[] = [{
          update: { name: fullName(env, 'seoSettings/state'), fields: Object.fromEntries(Object.entries(change.state).map(([key, value]) => [key, jsonValue(value)])) },
          currentDocument: prior ? { updateTime: prior.updateTime } : { exists: false },
        }];
        for (const version of change.writes) {
          const previous = versions.get(version.id);
          if (previous && !previous.updateTime) throw new SeoPersistenceError('SEO version precondition unavailable.');
          writes.push({
            update: { name: fullName(env, `seoVersions/${version.id}`), fields: Object.fromEntries(Object.entries(version).map(([key, value]) => [key, jsonValue(value)])) },
            currentDocument: previous ? { updateTime: previous.updateTime } : { exists: false },
          });
        }
        writes.push(await auditWrite(env, user, change.audit.action, 'seoSettings', change.audit.versionId, crypto.randomUUID(), change.audit.reason,
          { state: change.audit.before, scopes: change.audit.changes.map(item => ({ scope: item.scope, value: item.before })) },
          { state: change.audit.after, scopes: change.audit.changes.map(item => ({ scope: item.scope, value: item.after })) }));
        await commit(env, writes);
      } catch (error) {
        if (isQuotaError(error)) throw error;
        if (error instanceof FirestoreConflictError) throw new SeoPersistenceError('SEO configuration changed. Reload before confirming.', 409);
        throw new SeoPersistenceError('SEO configuration could not be saved. No changes were committed.');
      }
    },
  };
}
export async function handlePublishedSeo(req: Request, env: Env): Promise<Response> {
  return handleSeoPublic(req, seoStore(env));
}

export function earlyAccessStore(env: Env, user: AdminUser = { uid: 'system', admin: false }): EarlyAccessStore {
  return {
    read: (collection, id) => rawDoc(env, collection, id),
    readMany: async references => {
      if (references.length > 200) throw new EarlyAccessError('INVALID_SELECTION');
      if (firestoreOverride) return Promise.all(references.map(ref => rawDoc(env, ref.collection, ref.id)));
      const documents = references.map(ref => fullName(env, `${ref.collection}/${ref.id}`));
      const rows = await fs(env, ':batchGet', { method: 'POST', body: JSON.stringify({ documents }) }) as any[] || [];
      const found = new Map<string, RawDoc>(rows.flatMap(row => row.found ? [[row.found.name, { data: decode(row.found), updateTime: row.found.updateTime, name: row.found.name }] as [string, RawDoc]] : []));
      return documents.map(name => found.get(name) || null);
    },
    ownEmail: () => verifiedIdentityEmail(env, user),
    send: (to, subject, html, key) => sendResend(env, to, subject, html, key),
    query: async (collection, structuredQuery) => {
      const cursorReference = structuredQuery.startAt?.values?.find((value: any) => value.referenceValue)?.referenceValue;
      if (cursorReference && !cursorReference.startsWith(fullName(env, `${collection}/`))) throw new EarlyAccessError('INVALID_CURSOR');
      if (queryOverride) return queryOverride(collection, '', structuredQuery.limit, structuredQuery);
      const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) }) as any[] || [];
      return rows.flatMap(row => row.document ? [{ data: decode(row.document), name: row.document.name, updateTime: row.document.updateTime }] : []);
    },
    save: async (changes, action, target, reason) => {
      const writes: any[] = changes.map(change => ({
        update: { name: fullName(env, `${change.collection}/${change.id}`), fields: Object.fromEntries(Object.entries({
          ...change.data,
          ...(change.collection === 'earlyAccessSubscribers' ? {
            filterFacets: subscriberFacets(change.data),
            retentionAt: change.data.status === 'anonymized' ? null : new Date(Date.parse(change.data.updatedAt) + 365 * 86400000).toISOString(),
          } : {}),
          ...(change.collection === 'earlyAccessDeliveries' ? { expiresAt: change.data.expiresAt || new Date(Date.now() + (change.data.subscriberId ? 366 : 90) * 86400000).toISOString() } : {}),
        }).map(([key, value]) => [key, ['expiresAt', 'retentionAt'].includes(key) && typeof value === 'string' ? { timestampValue: value } : jsonValue(value)]).concat(Object.entries(change.collection === 'earlyAccessDeliveries' ? earlyAccessDeliveryProof(change.data, change.data.deliveryStatus) : {}))) },
        currentDocument: change.prior ? { updateTime: change.prior.updateTime } : { exists: false },
      }));
      // A missing version must never become an unconditional overwrite.
      if (changes.some(change => change.prior && !change.prior.updateTime)) throw new EarlyAccessError('STORAGE_UNAVAILABLE', 503);
      if (action) writes.push(await auditWrite(env, user, action, 'earlyAccess', target, crypto.randomUUID(), reason || action));
      try {
        await commit(env, writes);
        if (action === 'early_access_email_accepted') {
          for (const change of changes) if (change.collection === 'earlyAccessDeliveries' && change.data.providerMessageId) {
            await reconcileResendProjection(env, 'earlyAccessDeliveries', change.id, change.data.providerMessageId);
          }
        }
      }
      catch (error) { if (error instanceof FirestoreConflictError) throw new EarlyAccessError('CONCURRENT_UPDATE', 409); throw error; }
    },
  };
}
export async function handlePublicEarlyAccess(req: Request, env: Env) {
  try { return await handleEarlyAccessPublic(req, earlyAccessStore(env)); }
  catch (error) {
    if (isQuotaError(error)) throw error;
    if (error instanceof EarlyAccessError) return { error: error.code, status: error.status };
    return { error: 'EARLY_ACCESS_UNAVAILABLE', status: 503 };
  }
}
export async function processEarlyAccessRetention(env: Env) {
  return dailyEarlyAccessRetention(earlyAccessStore(env));
}
export async function processScheduledEarlyAccessCampaigns(env: Env) {
  return processEarlyAccessCampaigns(earlyAccessStore(env), (to, subject, html, key) => sendResend(env, to, subject, html, key));
}

type StoreReviewRole = 'customer' | 'provider' | 'driver';
export const STORE_REVIEW_ALIASES: Readonly<Record<string, StoreReviewRole>> = Object.freeze({
  'heavyar.official+review.customer@gmail.com': 'customer',
  'heavyar.official+review.provider@gmail.com': 'provider',
  'heavyar.official+review.driver@gmail.com': 'driver',
});

function storeReviewProfileFields(uid: string, email: string, role: StoreReviewRole, body: any, now: string) {
  const common: Record<string, unknown> = {
    uid, email, emailLower: email, emailVerified: true, accountPurpose: STORE_REVIEW_PURPOSE,
    role, nameEn: String(body.nameEn).trim(), nameAr: String(body.nameAr || body.nameEn).trim(),
    countryCode: String(body.countryCode).toUpperCase(), region: String(body.region).trim(), city: String(body.city).trim(),
    customCity: String(body.customCity || '').trim(), accountStatus: 'active', suspensionStatus: 'active',
    isActive: true, termsAccepted: true, emailVerifiedAt: now, createdAt: now, updatedAt: now,
  };
  if (role === 'provider') Object.assign(common, {
    providerType: body.providerType === 'company' ? 'company' : 'individual',
    providerOnboardingCompleted: true,
    crVerified: false,
  });
  return common;
}

async function createStoreReviewIdentity(env: Env, email: string, password: string): Promise<string> {
  if (!env.FIREBASE_WEB_API_KEY) throw new Error('STORE_REVIEW_IDENTITY_UNAVAILABLE');
  const created = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  const createdValue: any = await created.json().catch(() => ({}));
  if (!created.ok) {
    if (/EMAIL_EXISTS/i.test(String(createdValue.error?.message || ''))) throw new Error('STORE_REVIEW_EMAIL_EXISTS');
    throw new Error('STORE_REVIEW_IDENTITY_UNAVAILABLE');
  }
  const uid = String(createdValue.localId || '');
  if (!uid) {
    try { await deleteStoreReviewIdentityByEmail(env, email); }
    catch { throw new Error('STORE_REVIEW_CLEANUP_REQUIRED'); }
    throw new Error('STORE_REVIEW_IDENTITY_UNAVAILABLE');
  }
  try {
    const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(String(env.FIREBASE_PROJECT_ID))}/accounts:update`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uid, emailVerified: true, disableUser: false }),
    });
    if (!response.ok) throw new Error('STORE_REVIEW_IDENTITY_UNAVAILABLE');
  } catch {
    try { await deleteStoreReviewIdentity(env, uid); }
    catch { throw new Error('STORE_REVIEW_CLEANUP_REQUIRED'); }
    throw new Error('STORE_REVIEW_IDENTITY_UNAVAILABLE');
  }
  return uid;
}

async function deleteStoreReviewIdentity(env: Env, uid: string) {
  const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(String(env.FIREBASE_PROJECT_ID))}/accounts:delete`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: uid }),
  });
  if (!response.ok) throw new Error('STORE_REVIEW_CLEANUP_REQUIRED');
}

async function deleteStoreReviewIdentityByEmail(env: Env, email: string) {
  const token = await googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit');
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(String(env.FIREBASE_PROJECT_ID))}/accounts:lookup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: [email] }),
  });
  const value: any = await lookup.json().catch(() => ({}));
  const uid = String(value.users?.[0]?.localId || '');
  if (!lookup.ok || !uid) throw new Error('STORE_REVIEW_CLEANUP_REQUIRED');
  await deleteStoreReviewIdentity(env, uid);
}

async function provisionStoreReviewAccount(req: Request, env: Env, user: AdminUser) {
  const ownerUid = await canonicalOwnerUid(env);
  if (!ownerUid || user.uid !== ownerUid) return { error: 'Canonical owner provisioning permission required', status: 403 };
  if (!user.authTime || Date.now() - user.authTime > 5 * 60 * 1000) return { error: 'Recent administrator authentication required', errorCode: 'RECENT_AUTH_REQUIRED', status: 409 };
  const body: any = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['alias', 'password', 'nameEn', 'nameAr', 'countryCode', 'region', 'city', 'customCity', 'providerType'].includes(key))) return { error: 'Invalid Store Review account request', status: 400 };
  const email = String(body.alias || '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const fixedRole = STORE_REVIEW_ALIASES[email];
  if (!fixedRole || password.length < 12 || password.length > 128 || !String(body.nameEn || '').trim() || !String(body.countryCode || '').trim() || !String(body.region || '').trim() || !String(body.city || '').trim()) return { error: 'A prescribed alias, password, name, country, region, and city are required', status: 400 };
  const now = new Date().toISOString();
  let uid = '';
  try {
    uid = await createStoreReviewIdentity(env, email, password);
    const common = storeReviewProfileFields(uid, email, fixedRole, body, now);
    const writes: any[] = [
      { update: { name: fullName(env, `users/${uid}`), fields: Object.fromEntries(Object.entries(common).map(([key, value]) => [key, jsonValue(value)])) }, currentDocument: { exists: false } },
      await auditWrite(env, user, 'store_review_account_provisioned', 'users', uid, crypto.randomUUID(), 'server-provisioned Store Review account', undefined, { accountPurpose: STORE_REVIEW_PURPOSE, role: fixedRole, alias: email }),
    ];
    if (fixedRole === 'provider') writes.push({ update: { name: fullName(env, `providerProfiles/${uid}`), fields: Object.fromEntries(Object.entries({ uid, accountPurpose: STORE_REVIEW_PURPOSE, providerType: common.providerType, onboardingStatus: 'completed', verificationStatus: 'unverified', crVerified: false, createdAt: now, updatedAt: now }).map(([key, value]) => [key, jsonValue(value)])) }, currentDocument: { exists: false } });
    if (fixedRole === 'driver') writes.push({ update: { name: fullName(env, `driverProfiles/${uid}`), fields: Object.fromEntries(Object.entries({ uid, accountPurpose: STORE_REVIEW_PURPOSE, countryCode: common.countryCode, region: common.region, city: common.city, nameEn: common.nameEn, nameAr: common.nameAr, active: true, moderationStatus: 'approved', trustStatus: 'unverified', availabilityStatus: 'available', createdAt: now, updatedAt: now }).map(([key, value]) => [key, jsonValue(value)])) }, currentDocument: { exists: false } });
    await commit(env, writes);
    return { success: true, uid, email, role: fixedRole, accountPurpose: STORE_REVIEW_PURPOSE, emailVerified: true, phoneLogin: false, passwordSetupRequired: false };
  } catch (error) {
    if (uid) {
      try { await deleteStoreReviewIdentity(env, uid); }
      catch { return { error: 'Store Review identity cleanup required', errorCode: 'STORE_REVIEW_CLEANUP_REQUIRED', status: 503 }; }
    }
    if (error instanceof Error && error.message === 'STORE_REVIEW_EMAIL_EXISTS') return { error: 'Store Review email already exists', errorCode: 'STORE_REVIEW_EMAIL_EXISTS', status: 409 };
    if (error instanceof Error && error.message === 'STORE_REVIEW_CLEANUP_REQUIRED') return { error: 'Store Review identity cleanup required', errorCode: 'STORE_REVIEW_CLEANUP_REQUIRED', status: 503 };
    if (error instanceof Error && error.message === 'STORE_REVIEW_IDENTITY_UNAVAILABLE') return { error: 'Identity service unavailable', status: 503 };
    throw error;
  }
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
  const staff = user.testInjected ? null : await rawDoc(env, 'staffMembers', user.uid);
  const bootstrapCandidate = !staff?.data
    && ['/api/admin/session', '/api/admin/owner-bootstrap'].includes(url.pathname)
    && (user.role === 'super_admin' || user.permissionRole === 'super_admin');
  const bootstrapConfig = !user.testInjected && bootstrapCandidate ? await rawDoc(env, 'heavyarConfig', 'owner') : null;
  const bootstrapException = bootstrapCandidate && !bootstrapConfig?.data?.ownerUid;
  if (!bootstrapException) authorizeResolvedAdmin(user, user.testInjected ? undefined : staff);
  else requireVerifiedAdmin(user);
  if (url.pathname === '/api/admin/account-integrity' && req.method === 'GET') {
    const role = normalizeStaffRole(user.permissionRole || user.role);
    if (role !== 'owner' && role !== 'super_admin') return { error: 'Owner or super-admin integrity permission required', status: 403 };
    const rawLimit = Number(url.searchParams.get('limit') || 20);
    const limit = Math.min(20, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 20));
    const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const registrationState = String(url.searchParams.get('registrationState') || '');
    let directory;
    try { directory = await listFirebaseAuthIdentities(env, limit, url.searchParams.get('pageToken') || undefined); }
    catch { return { error: 'Account integrity directory unavailable', errorCode: 'AUTH_DIRECTORY_UNAVAILABLE', status: 503 }; }
    const items = [];
    for (const identity of directory.identities) {
      const profile = await rawDoc(env, 'users', identity.uid);
      const [driverProfile, providerProfile] = await Promise.all([
        rawDoc(env, 'driverProfiles', identity.uid),
        rawDoc(env, 'providerProfiles', identity.uid),
      ]);
      const roleProfile = profile?.data?.role === 'driver' ? driverProfile : null;
      const completeness = evaluateCanonicalCompleteness(identity, profile?.data || null, roleProfile?.data || null);
      const state = completeness.state === 'authenticated_complete' ? 'complete' : 'incomplete';
      if (registrationState && registrationState !== state) continue;
      const displayName = String(profile?.data?.nameEn || profile?.data?.nameAr || '');
      if (query && !String(identity.email || '').toLowerCase().includes(query) && !identity.uid.toLowerCase().includes(query) && !displayName.toLowerCase().includes(query)) continue;
      items.push({
        id: identity.uid,
        email: identity.email,
        displayName,
        emailVerified: identity.emailVerified,
        registrationState: state,
        role: completeness.role,
        missingFields: completeness.missingFields,
        accountStatus: profile?.data?.accountStatus,
        phonePresent: typeof profile?.data?.phone === 'string' && profile.data.phone.length > 0,
        hasUserProfile: completeness.profilePresent,
        hasProviderProfile: !!providerProfile?.data,
        hasDriverProfile: !!driverProfile?.data,
        createdAt: identity.createdAt || profile?.data?.createdAt,
        updatedAt: profile?.data?.updatedAt,
      });
    }
    return { success: true, bounded: true, limit, maxLimit: 20, items, nextCursor: directory.nextPageToken };
  }
  if (url.pathname.startsWith('/api/admin/early-access/')) {
    try { return await handleEarlyAccessAdmin(req, earlyAccessStore(env, user), { uid: user.uid, role: user.permissionRole || user.role }); }
    catch (error) {
      if (isQuotaError(error)) throw error;
      if (error instanceof EarlyAccessError) return { error: error.code, status: error.status };
      return { error: 'EARLY_ACCESS_UNAVAILABLE', status: 503 };
    }
  }
  if (url.pathname === '/api/admin/seo' || url.pathname.startsWith('/api/admin/seo/')) {
    return handleSeoAdmin(req, seoStore(env, user), {
      uid: user.uid, canRead: can(user, 'seo.read'), canEdit: can(user, 'seo.edit'), canPublish: can(user, 'seo.publish'),
    });
  }
  if (url.pathname === '/api/admin/commercial' || url.pathname === '/api/admin/commercial/preview') {
    return handleCommercialAdmin(req, {
      read: async (collection, id) => {
        try { return await rawDoc(env, collection, id); }
        catch (error) { if (isQuotaError(error)) throw error; throw new CommercialPersistenceError('Commercial configuration is temporarily unavailable.', 503); }
      },
      save: async (prior, change, before) => {
        try {
          if (prior && !prior.updateTime) throw new CommercialPersistenceError('Commercial version precondition is unavailable.', 503);
          await commit(env, [{
            update: { name: fullName(env, 'commercialSettings/catalog'), fields: Object.fromEntries(Object.entries(change.catalog).map(([key, value]) => [key, jsonValue(value)])) },
            currentDocument: prior ? { updateTime: prior.updateTime } : { exists: false },
          }, await auditWrite(env, user, `commission_${change.audit.action}`, 'commercialSettings', change.audit.version,
            crypto.randomUUID(), change.audit.reason, before, change.catalog)]);
        } catch (error) {
          if (isQuotaError(error)) throw error;
          if (error instanceof FirestoreConflictError) throw new CommercialPersistenceError('Commercial configuration changed. Reload before confirming.', 409);
          throw new CommercialPersistenceError('Commercial configuration could not be saved. No changes were committed.', 503);
        }
      },
    }, { uid: user.uid, canRead: can(user, 'fees.read'), canManage: can(user, 'fees.manage') }, env);
  }
  if (url.pathname === '/api/admin/session' && req.method === 'GET') return { success: true, uid: user.uid, role: user.permissionRole || user.role, bootstrapRequired: bootstrapException };
  if (url.pathname === '/api/admin/store-review/accounts/provision' && req.method === 'POST') return provisionStoreReviewAccount(req, env, user);
  if (url.pathname === '/api/admin/email-verification/reminder' && req.method === 'POST') return emailVerificationReminder(req, env, user);
  if (url.pathname === '/api/admin/email-verification/reminders/preview' && req.method === 'POST') return emailVerificationReminderPreview(req, env, user);
  if (url.pathname === '/api/admin/email-verification/reminders/bulk' && req.method === 'POST') return bulkEmailVerificationReminder(req, env, user);
  if ((url.pathname === '/api/admin/users/deletion-preview' || url.pathname === '/api/admin/deletion/preview') && req.method === 'POST') return deletionPreview(req, env, user);
  if (url.pathname === '/api/admin/users/deletion-jobs' && req.method === 'POST') return enqueueDeletion(req, env, user);
  if (url.pathname === '/api/admin/users/deletion-jobs' && req.method === 'GET') {
    if (!(await mayDeleteUsers(env, user))) return { error: 'Owner or super-admin governance permission required', status: 403 };
    const page = await listCollection(env, 'deletionJobs', Object.fromEntries(url.searchParams.entries()), Number(url.searchParams.get('limit') || 20), url.searchParams.get('cursor'));
    return { success: true, nextCursor: page.nextCursor, items: page.items.map(job => ({
      id: job.id, status: job.status, progress: Number(job.completed || 0), total: Number(job.total || 0),
      result: redact(job.result || null), createdAt: job.createdAt, updatedAt: job.updatedAt,
    })) };
  }
  const deletionStatus = url.pathname.match(/^\/api\/admin\/users\/deletion-jobs\/([^/]+)$/);
  if (deletionStatus && req.method === 'GET') {
    if (!(await mayDeleteUsers(env, user))) return { error: 'Owner or super-admin governance permission required', status: 403 };
    const id = decodeURIComponent(deletionStatus[1]), job = await rawDoc(env, 'deletionJobs', id);
    return job?.data ? { id, status: job.data.status, progress: Number(job.data.completed || 0), total: Number(job.data.total || 0), result: redact(job.data.result || null) } : { error: 'Deletion job not found', status: 404 };
  }
  if (url.pathname === '/api/admin/email-verification-policy' && req.method === 'GET') {
    const policy = await rawDoc(env, 'emailVerificationPolicies', 'default');
    return { success: true, policy: policy?.data || { enabled: true, requireBeforeRentalRequest: true, requireBeforeListingSubmission: true, requireBeforeDriverActivation: true, allowReminders: true, reminderCooldownSeconds: 86400, version: 1 } };
  }
  if (url.pathname === '/api/admin/email-verification-policy' && req.method === 'PUT') {
    if (!can(user, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
    const body: any = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid policy', status: 400 };
    const prior = await rawDoc(env, 'emailVerificationPolicies', 'default'), currentVersion = Number(prior?.data?.version || 1), now = new Date().toISOString();
    const allowed = ['enabled', 'requireBeforeRentalRequest', 'requireBeforeListingSubmission', 'requireBeforeDriverActivation', 'allowReminders', 'reminderCooldownSeconds'];
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) return { error: 'Email policy precondition failed', errorCode: 'VERSION_PRECONDITION_FAILED', status: 412, version: currentVersion };
    if (Object.keys(body).some(key => !allowed.includes(key) && key !== 'expectedVersion')) return { error: 'Invalid policy field', status: 400 };
    for (const key of allowed.filter(key => key !== 'reminderCooldownSeconds')) if (body[key] !== undefined && typeof body[key] !== 'boolean') return { error: 'Policy booleans must be boolean', status: 400 };
    if (body.reminderCooldownSeconds !== undefined && (!Number.isInteger(body.reminderCooldownSeconds) || body.reminderCooldownSeconds < 300 || body.reminderCooldownSeconds > 604800)) return { error: 'Invalid reminder cooldown', status: 400 };
    const version = currentVersion + 1;
    const fields = Object.fromEntries([...allowed.filter(key => body[key] !== undefined).map(key => [key, jsonValue(body[key])]), ['version', jsonValue(version)], ['updatedAt', { timestampValue: now }], ['updatedBy', jsonValue(user.uid)]]);
    await commit(env, [{ update: { name: fullName(env, 'emailVerificationPolicies/default'), fields }, currentDocument: prior?.updateTime ? { updateTime: prior.updateTime } : { exists: false } }, await auditWrite(env, user, 'email_verification_policy_updated', 'configuration', 'emailVerificationPolicies/default', crypto.randomUUID(), 'email verification policy updated', prior?.data, body)]);
    return { success: true, policy: { ...(prior?.data || {}), ...body, version, updatedAt: now } };
  }
  if (url.pathname === '/api/admin/phone-verification' && req.method === 'GET') {
    const stored = await rawDoc(env, 'phoneVerificationPolicies', 'default');
    return { success: true, policy: { requireAfterSignup: false, requireBeforeRentalRequest: false, requireBeforeProviderActivation: false, requireBeforeDriverActivation: false, requireBeforeSensitiveActions: false, resendCooldownSeconds: 86400, maxAttempts: 5, expirySeconds: 600, version: 1, ...(stored?.data || {}), enabled: false, provider: null } };
  }
  if (url.pathname === '/api/admin/phone-verification' && req.method === 'PUT') {
    if (!can(user, 'config.manage')) return { error: 'Configuration permission required', status: 403 };
    const body: any = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid phone verification policy', status: 400 };
    const prior = await rawDoc(env, 'phoneVerificationPolicies', 'default'), currentVersion = Number(prior?.data?.version || 1), now = new Date().toISOString();
    const allowed = ['requireAfterSignup', 'requireBeforeRentalRequest', 'requireBeforeProviderActivation', 'requireBeforeDriverActivation', 'requireBeforeSensitiveActions', 'resendCooldownSeconds', 'maxAttempts', 'expirySeconds'];
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) return { error: 'Phone policy precondition failed', errorCode: 'VERSION_PRECONDITION_FAILED', status: 412, version: currentVersion };
    if (Object.keys(body).some(key => !allowed.includes(key) && key !== 'expectedVersion')) return { error: 'Invalid phone verification field', status: 400 };
    for (const key of allowed.filter(key => !['resendCooldownSeconds', 'maxAttempts', 'expirySeconds'].includes(key))) if (body[key] !== undefined && typeof body[key] !== 'boolean') return { error: 'Policy booleans must be boolean', status: 400 };
    for (const [key, min, max] of [['resendCooldownSeconds', 300, 604800], ['maxAttempts', 1, 10], ['expirySeconds', 60, 3600]] as const) if (body[key] !== undefined && (!Number.isInteger(body[key]) || body[key] < min || body[key] > max)) return { error: `Invalid ${key}`, status: 400 };
    const version = currentVersion + 1;
    const fields = Object.fromEntries([...allowed.filter(key => body[key] !== undefined).map(key => [key, jsonValue(body[key])]), ['enabled', jsonValue(false)], ['provider', { nullValue: null }], ['version', jsonValue(version)], ['updatedAt', { timestampValue: now }], ['updatedBy', jsonValue(user.uid)]]);
    await commit(env, [{ update: { name: fullName(env, 'phoneVerificationPolicies/default'), fields }, currentDocument: prior?.updateTime ? { updateTime: prior.updateTime } : { exists: false } }, await auditWrite(env, user, 'phone_verification_policy_updated', 'configuration', 'phoneVerificationPolicies/default', crypto.randomUUID(), 'phone verification remains disabled; future-only configuration')]);
    return { success: true, policy: { ...(prior?.data || {}), ...body, enabled: false, provider: null, version, updatedAt: now } };
  }
  if (url.pathname === '/api/admin/countries' && (req.method === 'GET' || req.method === 'PUT')) return adminCountries(req, env, user);
  if (url.pathname === '/api/admin/fx-provider' && (req.method === 'GET' || req.method === 'PUT')) return adminFxProvider(req, env, user);
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
    const invitations = result.items.map(item => ({ ...item, status: item.status === 'pending' && !pendingAndUnexpired(item) ? 'expired' : item.status }));
    return { success: true, invitations, items: invitations, nextCursor: result.nextCursor };
  }
  if ((url.pathname === '/api/admin/staff/invitations' || url.pathname === '/api/admin/staff/invite') && req.method === 'POST') return createStaffInvitation(req, env, user);
  if (url.pathname === '/api/admin/staff/revoke' && req.method === 'POST') return revokeStaffAuthority(req, env, user);
  if (url.pathname === '/api/admin/staff/invitations/cancel' && req.method === 'POST') return cancelStaffInvitation(req, env, user);
  if (url.pathname === '/api/admin/staff/invitations/resend' && req.method === 'POST') return resendStaffInvitation(req, env, user);
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
  if (url.pathname === '/api/admin/equipment/legacy-migration' && req.method === 'POST') {
    if (!can(user, 'moderation.manage')) return { error: 'Moderation permission required', status: 403 };
    return migrateLegacyEquipment(req, env, user);
  }
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
      countOperationalUsers(env),
      countOperationalUsers(env, { field: 'role', value: 'provider' }),
      countOperationalEquipment(env),
      Promise.all(requestStatuses.map(status => countCollection(env, 'equipmentRequests', { field: 'status', value: status }))),
      financeVisible ? countCollection(env, 'payments') : Promise.resolve(null),
      financeVisible ? countCollection(env, 'invoices') : Promise.resolve(null),
      countCollection(env, 'complaints', { field: 'status', value: 'open' }),
      Promise.all([...SECURITY_SUSPENSION_STATUSES].map(status => countOperationalUsers(env, { field: 'suspensionStatus', value: status }))),
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
    const aliases: Record<string, string> = { request: 'equipmentRequests', provider: 'users', providers: 'users', providerProfile: 'users', providerProfiles: 'users', driver: 'driverProfiles', drivers: 'driverProfiles', listing: 'equipment', authConfig: 'heavyarConfig' };
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
    const base = [{ ...redact(raw.data), id: requestedId }];
    const verified = ['users', 'providerProfiles', 'driverProfiles'].includes(collection) && !user.testInjected
      ? await authoritativeAccountProjection(env, base) : base;
    const [item] = await enrichAdminItems(env, collection, verified);
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
