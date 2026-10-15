import { quoteForRequest, quoteFromCommercial, paymentIdForRequest, idempotencyKeyForPayment, invoiceNumberForPayment, TapPaymentProvider, canTransition, PAYMENT_STATES, stateForProvider, pricingConfig, normalizeTapEnvironment, tapCredentials, tapCustomerFromAccount, type PaymentQuote, type PaymentState, type TapEnvironment } from './payment';
import { calculateCommercial, majorToMinor, minorToMajor, resolveRule, type CommercialCatalog, type CommercialSnapshot, type CommissionRule } from './commercial';
import { acceptStaffInvitation, staffInvitationDetails, AdminDocumentUnavailableError, handleAdmin, handleAdminDocument, handlePublishedSeo, handlePublicEarlyAccess, processEarlyAccessRetention, processScheduledEarlyAccessCampaigns, processScheduledCampaigns, processStaffClaimSync, processDeletionJobs, processEmailVerificationReminderJobs, requireAdmin, type AdminRole } from './admin';
import { canApplyProviderResult, defaultVerificationPolicy, defaultVerificationProfile, deriveProviderTrust, evaluateRisk, normalizeVerificationPolicy, providerComponentNames, providerVerificationFor, type IdentityVerificationProvider, type ProviderComponents, type VerificationPolicy } from './verification';
import { allowedNotificationEvent, defaultNotificationPreferences, notificationFields, notificationWrite, type NotificationEvent, type NotificationCategory, NOTIFICATION_CATEGORIES, isCriticalCategory } from './notifications';
import { notificationInboxItem, notificationInboxOrder, notificationUnreadOrder } from './notification-inbox';
import { availabilityAllows, hasActiveRental, publicDriverProfile, transitionDriverRequest, validateDateRange, gatewayRegistry, hasPermission, normalizeStaffRole } from './completion';
import { driverEligibility } from './driver-eligibility';
import { PUBLIC_IDENTIFIER_COUNTER_IDS, PUBLIC_IDENTIFIER_FIELDS, formatPublicIdentifier, type PublicIdentifierKind } from './public-identifiers';
import { isPublicRentableListing, legacyProviderReady, listingVisibilityForOwnerActive, requiresListingRereview } from './moderation';
import { createInvoicePdfService, type InvoiceBusinessSettings, type TrustedInvoiceSource } from './admin-documents';
import { quotaFetch, isQuotaError, quotaResponse, quotaBlocked } from './quota-policy';
import { earlyAccessDeliveryProof, earlyAccessStateTimestamps } from './early-access-delivery';
import { hash } from './early-access-model';
import { evaluateCanonicalCompleteness, isOperationallyBlocked, isSecuritySuspended, isStoreReviewAccount } from './integrity';
import { reviewEquipmentProjection, searchPublicEquipment, type FirestoreQuery, type EquipmentSearchRow } from './equipment-search';
import { activeInterval, assertListingAvailableForInterval, buildFinalPaymentHandoff, calculateRental, estimateRental, intervalsOverlap, legacyMarketProjection, legacyPricingProjection, marketForCountry, parseV2RequestInput, rateFor, validateListingAvailabilityPolicy, validateListingPricing, validateServerStart, v2TransitionAllowed, type V2RequestInput } from './rental-v2';
import { mutationDiagnosticEvent, mutationRoute, responseErrorCode, type MutationDiagnostics, type MutationStage } from './observability';
import { reserveCloudinaryUploadQuota as reserveCloudinaryUploadQuotaAttempt, type CloudinaryQuotaRecord } from './cloudinary-upload-quota';
import { evaluateCapabilities, isSaudiTruckRentalWithoutDriver, validateRegulatoryDocumentSubmission, type RegulatoryDocument } from './regulatory';
import { CURRENT_POLICY_ACCEPTANCE_MODE, INCIDENT_TYPES, LEGACY_POLICY_ACCEPTANCE_COMPAT_ENABLED, LEGACY_POLICY_ACCEPTANCE_MODE, PRIVACY_REQUEST_TYPES, acceptanceIsCurrent, complaintServiceTargets, policyAcceptanceState, regulatoryDecision, requiredPolicyVersions, safeUserExport, validatePolicyAcceptance } from './compliance';
import { googleServiceAccountToken as googleToken } from './google-auth';
import { assertActivePrivilegedSession, PrivilegedAuthUnavailableError, PrivilegedSessionRevokedError } from './privileged-session';
import { parsePreciseLocation } from './location';
import { quoteRentalExtension } from './rental-extension';
import { rentalExpiryReminderSchedule } from './rental-expiry';
import {
  ORGANIZATION_INVITATION_TTL_MS,
  ORGANIZATION_PAGE_SIZE,
  isCompanyProvider,
  isOrganizationAccountEligible,
  maskOrganizationEmail,
  normalizeOrganizationCapabilities,
  normalizeOrganizationEmail,
  organizationAccountPurpose,
  organizationDisplayName,
  organizationInvitationIsAcceptable,
  organizationMemberCan,
  organizationTokenParts,
  safeOrganizationId,
  safeOrganizationInvitationId,
  safeOrganizationMemberId,
  type OrganizationCapability,
} from './organization';
import {
  isEligibleIndividualServiceAccount,
  parseServiceProfileDraft,
  serviceProfileCollection,
  serviceProfileProjection,
  type ServiceProfileDraft,
  type ServiceProfileKind,
} from './service-profile';
import {
  OPERATOR_DISCOVERY_ACTIVATION,
  operatorCursor,
  operatorDiscoveryQuery,
  parseOperatorRequestInput,
  parseOperatorSearch,
  prepareOperatorRequest,
  publicOperatorProjection,
} from './operator-marketplace';
import {
  TRANSPORTER_DISCOVERY_ACTIVATION,
  parseTransportRequestInput,
  parseTransporterSearch,
  prepareTransportRequest,
  publicTransporterProjection,
  matchTransportLoad,
  transporterCursorFromRow,
  transporterDiscoveryQuery,
} from './transporter-marketplace';
import {
  SERVICE_RFQ_PRODUCTION_ACTIVATION,
  ServiceRfqError,
  cancelTestOnlyRfq,
  createTestOnlyRfq,
  expireTestOnlyRfq,
  openTestOnlyRfq,
  pageSyntheticQuoteSummaries,
  provisionallySelectTestOnlyQuote,
  reviseTestOnlyQuote,
  submitTestOnlyQuote,
  withdrawTestOnlyQuote,
  type ActiveCustomerAuthority,
  type FutureProviderAuthority,
  type ProviderPrincipal,
  type ServiceKind,
  type ServiceRfqAggregate,
} from './service-rfq';
import {
  SERVICE_MESSAGE_LIMITS,
  ServiceCommunicationError,
  createServiceMessageRecord,
  isServiceMessageRecord,
  normalizeServiceMessageInput,
  serviceMessageProjection,
  type ServiceMessageRecord,
} from './service-communication';
import {
  SERVICE_EXECUTION_PRODUCTION_ACTIVATION,
  ServiceExecutionError,
  createConfirmedExecution,
  executionBindingMatches,
  isServiceExecutionAggregate,
  transitionServiceExecution,
  type ConfirmedExecutionBinding,
  type ServiceExecutionAction,
  type ServiceExecutionAggregate,
} from './service-execution';
import {
  PRIVATE_EVIDENCE_MEDIA_LIMITS,
  PRIVATE_EVIDENCE_MEDIA_PRODUCTION_ACTIVATION,
  PrivateEvidenceMediaError,
  abandonPrivateEvidenceIntent,
  attachPrivateEvidenceToEvent,
  claimPrivateEvidenceCleanup,
  completePrivateEvidenceCleanup,
  createPrivateEvidenceUploadIntent,
  isPrivateEvidenceUploadIntent,
  issuePrivateEvidenceAccessGrant,
  recordVerifiedPrivateEvidenceUpload,
  retryPrivateEvidenceCleanup,
  type PrivateEvidenceMediaCapability,
  type PrivateEvidenceUploadIntent,
} from './private-evidence-media';
import {
  consumeScheduledSubrequest,
  createScheduledGlobalBudget,
  createScheduledProcessorBudget,
  isScheduledBudgetDeferred,
  rotatedScheduledProcessors,
  scheduledExternalFetch,
  type ScheduledBudgetView,
  type ScheduledProcessorName,
} from './scheduled-budget';

interface KVNamespace { get(key: string, type?: 'json'): Promise<any>; put(key: string, value: string, options?: { expirationTtl: number }): Promise<void>; delete(key: string): Promise<void>; }
export interface Env {
  CLOUDINARY_CLOUD_NAME?: string; CLOUDINARY_API_KEY?: string; CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_FOLDER?: string; TAP_SECRET_KEY_TEST?: string; TAP_SECRET_KEY_LIVE?: string; TAP_MERCHANT_ID?: string; MOYASAR_SECRET_KEY?: string; MYFATOORAH_API_KEY?: string; RESEND_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string; FIREBASE_CLIENT_EMAIL?: string; FIREBASE_PRIVATE_KEY?: string; FIREBASE_WEB_API_KEY?: string;
  RESEND_FROM_EMAIL?: string; RESEND_SUPPORT_EMAIL?: string; RESEND_SENDER_DOMAIN_VERIFIED?: string; RESEND_WEBHOOK_SECRET?: string;
  CORS_ORIGINS?: string; PAYMENT_PLATFORM_FEE_RATE?: string; PAYMENT_VAT_RATE?: string; OTP_KV?: KVNamespace;
  IDENTITY_PROVIDER_MODE?: 'official';
  AUTH_RATE_LIMIT_KV?: KVNamespace;
  SEO_PUBLIC_KV?: KVNamespace;
  VERIFICATION_RETENTION_DAYS?: string;
  FIREBASE_MESSAGING_SENDER_ID?: string;
  RELEASE_VERSION?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string };
  __executionCtx?: { waitUntil(promise: Promise<unknown>): void };
  __diagnostics?: MutationDiagnostics;
  __scheduledBudget?: ScheduledBudgetView;
}
type User = { uid: string; admin: boolean; role?: AdminRole; permissionRole?: string; email?: string; emailVerified?: boolean; authTime?: number; testInjected?: true; accountProfile?: any; accountProfileRaw?: { data: any; updateTime?: string } | null; roleProfileRaw?: { data: any; updateTime?: string } | null };
type TestUser = Omit<User, 'testInjected'> & { testInjected?: boolean };
type AuthenticatedMutationScope = 'listing_create' | 'driver_profile_save' | 'service_profile_save' | 'organization_provision' | 'organization_invite' | 'organization_membership' | 'organization_equipment' | 'organization_booking' | 'organization_service' | 'operator_request_prepare' | 'transport_request_prepare' | 'service_rfq_create' | 'service_rfq_quote' | 'service_rfq_select' | 'service_rfq_cancel' | 'service_message_send' | 'service_execution_create' | 'service_execution_transition' | 'service_evidence_intent' | 'service_evidence_upload';
type AuthenticatedMutationRateLimitDecision =
  | { status: 'allowed' }
  | { status: 'limited'; retryAfterSeconds: number }
  | { status: 'unavailable' };
let authOverride: TestUser | undefined;
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
type PublicDiscoveryRateLimitScope = 'search' | 'detail' | 'operator_search' | 'transporter_search';
let publicDriverLimiterOverride: ((scope: PublicDiscoveryRateLimitScope, ipHash: string) => Promise<boolean | null>) | undefined;
let capturedDriverQueries: any[] | undefined;
let capturedOperatorQueries: any[] | undefined;
let operatorDiscoveryActivationOverride: boolean | undefined;
let capturedTransporterQueries: any[] | undefined;
let transporterDiscoveryActivationOverride: boolean | undefined;
let serviceRfqActivationOverride: boolean | undefined;
let serviceExecutionActivationOverride: boolean | undefined;
let serviceExecutionBindingOverride: ((sourceKind: ConfirmedExecutionBinding['sourceKind'], sourceId: string) => ConfirmedExecutionBinding | null | Promise<ConfirmedExecutionBinding | null>) | undefined;
let serviceMessageQueryOverride: any[] | undefined;
let publicEquipmentLimiterOverride: ((ipHash: string) => Promise<boolean | null>) | undefined;
let authenticatedMutationLimiterOverride: ((uid: string, scope: AuthenticatedMutationScope) => Promise<AuthenticatedMutationRateLimitDecision>) | undefined;
let capturedEquipmentQueries: any[] | undefined;
let identityQueryOverride: ((collection: string, uid: string) => any[]) | undefined;
const paymentCreateInflight = new Map<string, Promise<Response>>();
  export const __test = { setAuth(user?: TestUser) { authOverride = user ? { email: 'customer@example.test', accountProfile: { nameEn: 'Test Customer', email: 'customer@example.test', countryCode: 'SA' }, ...user } : undefined; }, setFirestore(fn?: (collection: string, id: string) => any) { firestoreOverride = fn; }, setAssetOwned(value?: boolean) { assetOwnedOverride = value; }, captureWrites(target?: Array<{ path: string; fields: Record<string, unknown> }>) { firestoreWrites = target; }, captureCommits(target?: unknown[]) { capturedCommits = target; }, captureDriverQueries(target?: any[]) { capturedDriverQueries = target; }, captureOperatorQueries(target?: any[]) { capturedOperatorQueries = target; }, setOperatorDiscoveryActivation(value?: boolean) { operatorDiscoveryActivationOverride = value; }, captureTransporterQueries(target?: any[]) { capturedTransporterQueries = target; }, setTransporterDiscoveryActivation(value?: boolean) { transporterDiscoveryActivationOverride = value; }, setServiceRfqActivation(value?: boolean) { serviceRfqActivationOverride = value; }, setServiceExecutionActivation(value?: boolean) { serviceExecutionActivationOverride = value; }, setServiceExecutionBinding(resolver?: (sourceKind: ConfirmedExecutionBinding['sourceKind'], sourceId: string) => ConfirmedExecutionBinding | null | Promise<ConfirmedExecutionBinding | null>) { serviceExecutionBindingOverride = resolver; }, setServiceMessageRows(rows?: any[]) { serviceMessageQueryOverride = rows; }, captureEquipmentQueries(target?: any[]) { capturedEquipmentQueries = target; }, setIdentityQuery(fn?: (collection: string, uid: string) => any[]) { identityQueryOverride = fn; }, setReservationConflict(value: boolean) { reservationConflict = value; }, setVerificationProvider(provider?: IdentityVerificationProvider) { verificationProviderOverride = provider; }, setDeliveryQuery(value?: any[]) { notificationDeliveryQueryOverride = value; }, setDeletionDevices(value?: any[]) { deletionDeviceQueryOverride = value; }, setRefreshTokenRevoke(fn?: (env: Env, uid: string) => Promise<void>) { refreshTokenRevokeOverride = fn; }, setPasswordVerifier(fn?: (email: string, password: string) => Promise<{ localId?: string }>) { passwordVerifierOverride = fn; }, setCustomToken(fn?: (uid: string) => Promise<string>) { customTokenOverride = fn; }, setPhoneLoginLimiter(fn?: (phoneHash: string, ipHash: string) => Promise<boolean | null>) { phoneLoginLimiterOverride = fn; }, setPublicDriverLimiter(fn?: (scope: PublicDiscoveryRateLimitScope, ipHash: string) => Promise<boolean | null>) { publicDriverLimiterOverride = fn; }, setPublicEquipmentLimiter(fn?: (ipHash: string) => Promise<boolean | null>) { publicEquipmentLimiterOverride = fn; }, setAuthenticatedMutationLimiter(fn?: (uid: string, scope: AuthenticatedMutationScope) => Promise<AuthenticatedMutationRateLimitDecision>) { authenticatedMutationLimiterOverride = fn; }, resetMutationLimits() { authenticatedMutationLimiterOverride = undefined; }, allowAuthenticatedMutation: (env: Env, uid: string, scope: AuthenticatedMutationScope, nowMs?: number) => allowAuthenticatedMutation(env, uid, scope, nowMs), mintFirebaseCustomToken, firestoreUrl(env: Env, path: string) { return firestoreUrl(env, path); }, verifyToken: auth, quoteForRequest, canTransition, paymentStates: PAYMENT_STATES, hashId: hashedId, normalizeSaudiPhone, normalizeGccPhone, effectiveAuthConfig, normalizeEmailVerificationPolicy, resendFrom, resendSenderDomainValid, runRetryDelivery: retryDueNotificationDeliveries, authoritativeCommercialSnapshot, recalculateLockedCommercial, legacyRecordCommercialSnapshot, quoteFromDoc, trustedInvoiceSource, availabilityQueriesForEquipment };
const TAP = 'https://api.tap.company/v2';
const enc = new TextEncoder();
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64u = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cors = (env: Env, origin: string | null) => {
  const allow = ['https://heavyar.com', ...(env.CORS_ORIGINS || 'https://heavyar.app,https://www.heavyar.app,https://heavyar-app.web.app,https://heavyar-app.firebaseapp.com').split(',').map(x => x.trim())];
  const trustedExpoPreview = /^https:\/\/[a-z0-9-]+(?:\.expo)?\.sisko\.replit\.dev$/i.test(origin || '');
  return { 'Access-Control-Allow-Origin': allow.includes(origin || '') || trustedExpoPreview ? origin! : 'null', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-ID', 'Access-Control-Expose-Headers': 'X-Request-ID', Vary: 'Origin' };
};
function importantMutation(req: Request): boolean {
  return mutationRoute(req) !== undefined;
}
function diagnosticOperation(req: Request): boolean {
  return importantMutation(req) || (req.method === 'GET' && new URL(req.url).pathname === '/api/equipment/search');
}
function out(env: Env, req: Request, value: unknown, status = 200) {
  const diagnostics = env.__diagnostics;
  let body = value;
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  if (diagnostics && importantMutation(req) && status >= 400 && value && typeof value === 'object' && !Array.isArray(value)) {
    const code = responseErrorCode(source?.errorCode ?? source?.code ?? source?.error, status);
    body = { ...source, errorCode: code, requestId: diagnostics.requestId, supportCode: diagnostics.requestId, stage: diagnostics.stage };
  }
  const response = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(env, req.headers.get('Origin')) } });
  if (diagnostics) response.headers.set('X-Request-ID', diagnostics.requestId);
  if (diagnostics && diagnosticOperation(req)) {
    const event = mutationDiagnosticEvent(req, diagnostics, status, source?.errorCode ?? source?.code ?? source?.error, env.RELEASE_VERSION || env.CF_VERSION_METADATA?.tag || env.CF_VERSION_METADATA?.id);
    if (event) console.log(JSON.stringify(event));
    else console.log(JSON.stringify({
      event: 'public_equipment_search',
      requestId: diagnostics.requestId,
      route: '/api/equipment/search',
      method: req.method,
      status,
      durationMs: Date.now() - diagnostics.startedAt,
      firestoreRequestCount: diagnostics.firestoreRequests,
      firestoreReadCount: diagnostics.firestoreReads,
      firestoreDurationMs: diagnostics.firestoreDurationMs,
    }));
  }
  return response;
}
const LISTING_JSON_LIMIT_BYTES = 256 * 1024;
const DRIVER_PROFILE_JSON_LIMIT_BYTES = 64 * 1024;
function declaredJsonPayloadTooLarge(req: Request, maxBytes: number) {
  const value = req.headers.get('Content-Length');
  return value !== null && /^\d+$/.test(value) && Number(value) > maxBytes;
}
async function readBoundedJson(req: Request, maxBytes: number): Promise<{ status: 'ok'; value: unknown } | { status: 'invalid' | 'too_large' }> {
  if (declaredJsonPayloadTooLarge(req, maxBytes)) return { status: 'too_large' };
  if (!req.body) return { status: 'invalid' };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { status: 'invalid' };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { status: 'ok', value: JSON.parse(new TextDecoder().decode(bytes)) }; }
  catch { return { status: 'invalid' }; }
}
function payloadTooLargeResponse(req: Request, env: Env) {
  return out(env, req, { success: false, error: 'Request payload too large', errorCode: 'PAYLOAD_TOO_LARGE' }, 413);
}
function authenticatedMutationRateLimitResponse(req: Request, env: Env, decision: AuthenticatedMutationRateLimitDecision, message: string) {
  if (decision.status === 'unavailable') return out(env, req, { success: false, error: 'Rate limit service unavailable', errorCode: 'RATE_LIMIT_UNAVAILABLE' }, 503);
  if (decision.status !== 'limited') return undefined;
  const response = out(env, req, { success: false, error: message, errorCode: 'RATE_LIMITED' }, 429);
  response.headers.set('Retry-After', String(decision.retryAfterSeconds));
  const exposed = new Set((response.headers.get('Access-Control-Expose-Headers') || '').split(',').map(value => value.trim()).filter(Boolean));
  exposed.add('Retry-After');
  response.headers.set('Access-Control-Expose-Headers', [...exposed].join(', '));
  return response;
}
function mutationStage(env: Env, stage: MutationStage) {
  if (env.__diagnostics) env.__diagnostics.stage = stage;
}
const err = (message: string): never => { throw new Error(message); };
const authErr = (): never => { throw new Error('AUTH_REQUIRED'); };
export class FirestorePreconditionError extends Error {
  constructor() {
    super('precondition failed');
    this.name = 'FirestorePreconditionError';
  }
}

type FirebaseJwk = JsonWebKey & { kid?: string };
let firebaseKeys: Record<string, FirebaseJwk> = {};
async function refreshFirebaseKeys() {
  const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!response.ok) err('Authentication unavailable');
  const { keys = [] } = await response.json() as { keys?: FirebaseJwk[] };
  firebaseKeys = Object.fromEntries(keys.filter(key => key.kid).map(key => [key.kid!, key]));
}
async function auth(req: Request, env: Env): Promise<User> {
  if (authOverride && req.headers.has('Authorization')) return { ...authOverride, authTime: authOverride.authTime || Date.now(), permissionRole: authOverride.permissionRole || authOverride.role, testInjected: authOverride.testInjected === false ? undefined : true };
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
  if (user.admin) {
    // Custom claims are only a routing hint. Staff authority is resolved live
    // for every privileged request, then Firebase Auth state is checked with a
    // short bounded cache for disabled/revoked sessions.
    await requireAdmin(user, env);
    await assertActivePrivilegedSession(env, user);
    // Outside /api/admin, the legacy `admin` flag means a marketplace
    // operational bypass. Keep it only for authoritative roles that actually
    // carry that permission; other active staff continue without a bypass.
    user.admin = hasPermission(normalizeStaffRole(user.permissionRole || user.role), 'operations.manage');
    return user;
  }
  if (allowAccountManagement) return user;
  // Test authentication is intentionally injectable; preserve unit tests that
  // exercise downstream validation without a Firestore fixture.
  if (authOverride && !firestoreOverride) return user;
  const profileRaw = await getRawDoc(env, 'users', user.uid);
  const profile = profileRaw?.data || null;
  user.accountProfile = profile || user.accountProfile;
  user.accountProfileRaw = profileRaw;
  if (!user.testInjected) {
    if (!profile) err('ACCOUNT_PROVISIONING_INCOMPLETE');
    const roleProfileRaw = profile.role === 'driver' ? await getRawDoc(env, 'driverProfiles', user.uid) : null;
    const roleProfile = roleProfileRaw?.data || null;
    user.roleProfileRaw = roleProfileRaw;
    if (evaluateCanonicalCompleteness(user, profile, roleProfile).state !== 'authenticated_complete') err('ACCOUNT_PROVISIONING_INCOMPLETE');
  }
  if (isOperationallyBlocked(profile)) {
    err(profile.accountStatus === 'deletion_requested' ? 'ACCOUNT_DELETION_REQUESTED' : 'ACCOUNT_SUSPENDED');
  }
  return user;
}
async function activeFirebaseUser(req: Request, env: Env): Promise<User> {
  const user = await auth(req, env);
  await assertActivePrivilegedSession(env, user);
  return user;
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
function firestoreInteger(value: unknown): number {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new Error('Invalid Firestore integerValue');
  const integer = BigInt(value);
  if (integer < BigInt(Number.MIN_SAFE_INTEGER) || integer > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Firestore integerValue exceeds safe integer range');
  return Number(integer);
}
const val = (v: any): any => v && Object.hasOwn(v, 'nullValue') ? null
  : v && Object.hasOwn(v, 'integerValue') ? firestoreInteger(v.integerValue)
    : v?.stringValue ?? v?.doubleValue ?? v?.booleanValue ?? v?.timestampValue ?? (v?.arrayValue ? (v.arrayValue.values || []).map(val) : v?.mapValue ? decode(v.mapValue) : undefined);
const decode = (d: any) => Object.fromEntries(Object.entries(d?.fields || {}).map(([k, v]) => [k, val(v)]));
function fullName(env: Env, path: string) { return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`; }
function firestoreUrl(env: Env, path: string) {
  const suffix = path.startsWith(':') ? `documents${path}` : `documents/${path}`;
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/${suffix}`;
}
async function commitWrites(env: Env, writes: unknown[], transaction?: string) {
  if (capturedCommits) { capturedCommits.push(writes); return; }
  const sourceWrites = writes as any[];
  const outboxWrites = sourceWrites.filter(write => String(write?.update?.name || '').includes('/notificationOutbox/'));
  const businessWrites = sourceWrites.filter(write => !String(write?.update?.name || '').includes('/notificationOutbox/'));
  let r: any = true;
  let committedOutboxWrites = outboxWrites;
  try {
    r = sourceWrites.length ? await fs(env, ':commit', { method: 'POST', body: JSON.stringify({ writes: sourceWrites, ...(transaction ? { transaction } : {}) }) }) : true;
  } catch (error) {
    if (!(error instanceof FirestorePreconditionError) || !outboxWrites.length) {
      if (businessWrites.length) throw error;
      return;
    }
    const references = outboxWrites.map(write => ({
      collection: 'notificationOutbox',
      id: decodeURIComponent(String(write.update.name).split('/').pop() || ''),
    }));
    const existing = await batchGetRawDocs(env, references);
    const missing: any[] = [];
    for (const write of outboxWrites) {
      const id = decodeURIComponent(String(write.update.name).split('/').pop() || '');
      const prior = existing.get(`notificationOutbox/${id}`)?.data;
      const fields = write.update?.fields || {};
      const matches = prior
        && prior.notificationId === fields.notificationId?.stringValue
        && prior.occurrenceKey === fields.occurrenceKey?.stringValue
        && prior.uid === fields.uid?.stringValue
        && prior.event === fields.event?.stringValue;
      if (!prior) missing.push(write);
      else if (!matches) throw error;
    }
    const retryWrites = [...businessWrites, ...missing];
    r = retryWrites.length ? await fs(env, ':commit', { method: 'POST', body: JSON.stringify({ writes: retryWrites, ...(transaction ? { transaction } : {}) }) }) : true;
    committedOutboxWrites = missing;
  }
  if (!r) err('Firestore commit failed');
  // Outbox processing is request-scoped and never changes the source result.
  // Scheduled work leaves pending occurrences to the bounded outbox processor.
  for (const write of env.__scheduledBudget ? [] : committedOutboxWrites) {
    const fields = write?.update?.fields, name = String(write?.update?.name || '');
    if (fields?.notificationId?.stringValue && name.includes('/notificationOutbox/')) {
      env.__executionCtx?.waitUntil(processNotificationOutbox(env, fields));
    }
  }
}
async function fs(env: Env, path: string, init?: RequestInit): Promise<any> {
  const diagnostics = env.__diagnostics;
  const method = String(init?.method || 'GET').toUpperCase();
  const operation = path.startsWith(':') ? path.slice(1) : `${method} document`;
  const startedAt = Date.now();
  diagnostics && (diagnostics.firestoreRequests += 1);
  diagnostics && (diagnostics.firestoreLastOperation = operation);
  if (diagnostics) {
    if (path === ':commit') {
      try { diagnostics.firestoreWriteAttempts += (JSON.parse(String(init?.body || '{}')).writes || []).length; } catch { /* malformed calls remain visible through the request count */ }
    } else if (method === 'PATCH' || method === 'DELETE') diagnostics.firestoreWriteAttempts += 1;
  }
  if (diagnostics) {
    diagnostics.quota.checked = true;
    diagnostics.quota.blocked ||= quotaBlocked();
  }
  let r: Response;
  try {
    const token = await googleToken(env);
    consumeScheduledSubrequest(env.__scheduledBudget, 'firestore');
    r = await quotaFetch(firestoreUrl(env, path), { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  } catch (error) {
    if (diagnostics && isQuotaError(error)) diagnostics.quota.exhausted = true;
    if (diagnostics && !diagnostics.firestoreFailure) diagnostics.firestoreFailure = { operation, status: 0 };
    throw error;
  } finally {
    if (diagnostics) diagnostics.firestoreDurationMs += Date.now() - startedAt;
  }
  if (r.status === 404) {
    if (diagnostics && method === 'GET') diagnostics.firestoreReads += 1;
    return null;
  }
  const result = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    const code = typeof (result as any)?.error?.status === 'string' ? (result as any).error.status : undefined;
    if (diagnostics) diagnostics.firestoreFailure = { operation, status: r.status, ...(code ? { code } : {}) };
     if (code === 'FAILED_PRECONDITION' || r.status === 409) throw new FirestorePreconditionError();
    err('Firestore unavailable');
  }
  if (diagnostics) {
    if (method === 'GET') diagnostics.firestoreReads += 1;
    else if (path === ':runQuery') diagnostics.firestoreReads += (Array.isArray(result) ? result.filter((row: any) => row?.document).length : 0);
    else if (path === ':batchGet') {
      try { diagnostics.firestoreReads += (JSON.parse(String(init?.body || '{}')).documents || []).length; }
      catch { diagnostics.firestoreReads += (Array.isArray(result) ? result.length : 0); }
    }
    else if (path === ':commit') {
      try { diagnostics.firestoreWrites += (JSON.parse(String(init?.body || '{}')).writes || []).length; } catch { /* diagnostic count remains zero */ }
    } else if (method === 'PATCH' || method === 'DELETE') diagnostics.firestoreWrites += 1;
  }
  return result;
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
  const suppressionWrites = new Map<string, any>();
  for (const collection of ['emailVerificationRateLimits', 'staffInvitations', 'earlyAccessDeliveries']) {
    const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: 'providerMessageId' }, op: 'EQUAL', value: { stringValue: providerMessageId } } }, limit: 20 } }) }) as any[] || [];
    for (const row of rows.filter((item: any) => item.document && decode(item.document).providerMessageId === providerMessageId)) {
      const prior = decode(row.document), priorStatus = String(prior.deliveryStatus || ''), priorEventTime = Date.parse(String(prior.deliveryEventAt || ''));
      const priorIsFinal = ['delivered', 'bounced', 'failed', 'complained'].includes(priorStatus);
      const terminalSubscriberEvent = collection === 'earlyAccessDeliveries' && prior.subscriberId && ['bounced', 'complained'].includes(status);
      if (collection === 'earlyAccessDeliveries' && ['bounced', 'complained'].includes(status)) {
        const suppressionId = prior.subscriberId || await hash(`early-access-email:${String(prior.normalizedEmail || prior.email || '').trim().toLowerCase()}`);
        if (suppressionId && !suppressionWrites.has(suppressionId)) {
          const existing = await fs(env, `earlyAccessSuppression/${suppressionId}`);
          suppressionWrites.set(suppressionId, {
            update: { name: fullName(env, `earlyAccessSuppression/${suppressionId}`), fields: {
              suppressed: { booleanValue: true }, updatedAt: { timestampValue: new Date().toISOString() }, reason: { stringValue: status },
            } },
            currentDocument: existing?.updateTime ? { updateTime: existing.updateTime } : { exists: false },
          });
        }
      }
      if (!terminalSubscriberEvent && (status === 'accepted' && priorIsFinal || Number.isFinite(priorEventTime) && parsedEventTime < priorEventTime)) continue;
      const fields = { deliveryStatus: { stringValue: status }, deliveryUpdatedAt: { timestampValue: new Date().toISOString() }, deliveryEventAt: { timestampValue: eventAt },
        ...(collection === 'earlyAccessDeliveries' ? Object.fromEntries(Object.entries(earlyAccessStateTimestamps(prior, status, eventAt)).map(([field, timestamp]) => [field, { timestampValue: timestamp }])) : {}),
        ...(collection === 'earlyAccessDeliveries' && status === 'failed' ? {
          retryEligible: { booleanValue: prior.source !== 'owner_qa' && Number(prior.attempts || 0) < 3 },
          nextAttemptAt: prior.source !== 'owner_qa' && Number(prior.attempts || 0) < 3 ? { timestampValue: new Date().toISOString() } : { nullValue: null },
        } : {}),
        ...(collection === 'earlyAccessDeliveries' ? earlyAccessDeliveryProof(prior, status) : {}) };
      writes.push({ update: { name: row.document.name, fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: row.document.updateTime ? { updateTime: row.document.updateTime } : undefined });
    }
  }
  writes.push(...suppressionWrites.values());
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

async function publicDriverRateLimit(req: Request, env: Env, scope: PublicDiscoveryRateLimitScope): Promise<boolean | null> {
  const address = (req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0] || 'unknown').trim().slice(0, 128);
  const bucket = Math.floor(Date.now() / 60000), ipHash = await hashedId(`public-driver-ip:${address}`);
  if (publicDriverLimiterOverride) return publicDriverLimiterOverride(scope, ipHash);
  if (firestoreOverride) return true;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;
  const key = await hashedId(`${scope}:${ipHash}:${bucket}`), name = fullName(env, `publicDriverRateLimits/${key}`), limit = scope === 'detail' ? 120 : 60;
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
async function publicEquipmentRateLimit(req: Request, env: Env): Promise<boolean | null> {
  const address = (req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0] || 'unknown').trim().slice(0, 128);
  const bucket = Math.floor(Date.now() / 60000), ipHash = await hashedId(`public-equipment-ip:${address}`);
  if (publicEquipmentLimiterOverride) return publicEquipmentLimiterOverride(ipHash);
  if (firestoreOverride) return true;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;
  const key = await hashedId(`search:${ipHash}:${bucket}`), name = fullName(env, `publicEquipmentRateLimits/${key}`);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) return null;
      const result = await fs(env, ':batchGet', { method: 'POST', body: JSON.stringify({ documents: [name], transaction }) });
      const found = (result || []).find((row: any) => row.found)?.found;
      const count = Number(found ? decode(found).count : 0);
      if (count >= 60) return false;
      const write = { update: { name, fields: {
        scope: { stringValue: 'search' }, bucket: { integerValue: String(bucket) }, count: { integerValue: String(count + 1) },
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

async function allowAuthenticatedMutation(env: Env, uid: string, scope: AuthenticatedMutationScope, nowMs = Date.now()): Promise<AuthenticatedMutationRateLimitDecision> {
  if (authenticatedMutationLimiterOverride) return authenticatedMutationLimiterOverride(uid, scope);
  // Existing unit-test storage adapters do not model REST transactions. They
  // remain explicitly test-only; Production always uses the transaction below.
  if (firestoreOverride || firestoreWrites || capturedCommits) return { status: 'allowed' };
  if (!Number.isFinite(nowMs) || !env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return { status: 'unavailable' };
  const policy: Record<AuthenticatedMutationScope, { windowMs: number; limit: number }> = {
    listing_create: { windowMs: 10 * 60_000, limit: 10 },
    driver_profile_save: { windowMs: 60_000, limit: 30 },
    service_profile_save: { windowMs: 60_000, limit: 20 },
    organization_provision: { windowMs: 60 * 60_000, limit: 3 },
    organization_invite: { windowMs: 10 * 60_000, limit: 10 },
    organization_membership: { windowMs: 10 * 60_000, limit: 20 },
    organization_equipment: { windowMs: 60_000, limit: 30 },
    organization_booking: { windowMs: 60_000, limit: 30 },
    organization_service: { windowMs: 60_000, limit: 20 },
    operator_request_prepare: { windowMs: 60_000, limit: 20 },
    transport_request_prepare: { windowMs: 60_000, limit: 20 },
    service_rfq_create: { windowMs: 10 * 60_000, limit: 10 },
    service_rfq_quote: { windowMs: 60_000, limit: 30 },
    service_rfq_select: { windowMs: 60_000, limit: 20 },
    service_rfq_cancel: { windowMs: 60_000, limit: 20 },
    service_message_send: { windowMs: 60_000, limit: 30 },
    service_execution_create: { windowMs: 10 * 60_000, limit: 10 },
    service_execution_transition: { windowMs: 60_000, limit: 30 },
    service_evidence_intent: { windowMs: 10 * 60_000, limit: 10 },
    service_evidence_upload: { windowMs: 10 * 60_000, limit: 30 },
  };
  const { windowMs, limit } = policy[scope];
  const id = await hashedId(`authenticated-mutation:${scope}:${uid}`);
  // Reuse the existing temporary rate-limit collection so its bounded expiry
  // cleanup continues without a new collection, index, binding, or Cron path.
  const path = `authRecoveryRateLimits/${id}`;
  const name = fullName(env, path);

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) return { status: 'unavailable' };
      const prior = await transactionDocument(env, path, transaction);
      const count = Number(prior?.data?.count ?? 0);
      const startedAt = prior ? Date.parse(String(prior.data.startedAt || '')) : nowMs;
      const expiresAt = prior ? Date.parse(String(prior.data.expiresAt || '')) : nowMs + windowMs;
      const validPrior = !prior || prior.data.kind === 'authenticated_mutation'
        && prior.data.scope === scope
        && Number.isSafeInteger(count) && count >= 0
        && Number.isFinite(startedAt) && Number.isFinite(expiresAt)
        && expiresAt - startedAt === windowMs;
      if (!validPrior) {
        await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
        return { status: 'unavailable' };
      }
      if (prior && nowMs < expiresAt && count >= limit) {
        await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
        return { status: 'limited', retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - nowMs) / 1000)) };
      }
      const reset = !prior || nowMs >= expiresAt;
      const nextStartedAt = reset ? nowMs : startedAt;
      const nextExpiresAt = reset ? nowMs + windowMs : expiresAt;
      const fields = {
        kind: { stringValue: 'authenticated_mutation' },
        scope: { stringValue: scope },
        count: { integerValue: String(reset ? 1 : count + 1) },
        startedAt: { timestampValue: new Date(nextStartedAt).toISOString() },
        expiresAt: { timestampValue: new Date(nextExpiresAt).toISOString() },
        updatedAt: { timestampValue: new Date(nowMs).toISOString() },
      };
      const write = {
        update: { name, fields },
        ...(prior ? { updateMask: { fieldPaths: Object.keys(fields) } } : {}),
        currentDocument: prior?.updateTime ? { updateTime: prior.updateTime } : { exists: false },
      };
      try {
        await commitWrites(env, [write], transaction);
        return { status: 'allowed' };
      } catch (error) {
        if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
      }
    }
  } catch {
    return { status: 'unavailable' };
  }
  return { status: 'unavailable' };
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
  return resolvedCountrySettings(base, stored);
}
function resolvedCountrySettings(base: (typeof GCC_COUNTRIES)[GccCountryCode], stored: any) {
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
async function batchGetRawDocs(
  env: Env,
  references: Array<{ collection: string; id: string }>,
): Promise<Map<string, { data: any; updateTime?: string }>> {
  const unique = [...new Map(references
    .filter(reference => reference.collection && reference.id)
    .map(reference => [`${reference.collection}/${reference.id}`, reference])).values()];
  if (!unique.length) return new Map();
  if (firestoreOverride) {
    return new Map(unique.flatMap(reference => {
      const data = firestoreOverride!(reference.collection, reference.id);
      return data ? [[`${reference.collection}/${reference.id}`, { data, updateTime: 'test-update-time' }] as const] : [];
    }));
  }
  const documents = unique.map(reference => fullName(env, `${reference.collection}/${reference.id}`));
  const rows: any[] = [];
  for (let offset = 0; offset < documents.length; offset += 100) {
    const batch = await fs(env, ':batchGet', {
      method: 'POST',
      body: JSON.stringify({ documents: documents.slice(offset, offset + 100) }),
    });
    rows.push(...(batch || []));
  }
  return new Map(rows.filter(row => row.found).map(row => {
    const document = row.found;
    const path = String(document.name || '').split('/documents/')[1] || '';
    return [path, { data: decode(document), updateTime: document.updateTime }];
  }));
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
async function accountProfileStatus(req: Request, env: Env, u: User) {
  const profile = await getDoc(env, 'users', u.uid);
  const roleProfile = profile?.role === 'driver' ? await getDoc(env, 'driverProfiles', u.uid) : null;
  const result = evaluateCanonicalCompleteness(u, profile, roleProfile);
  const role = ['customer', 'provider', 'driver'].includes(String(profile?.role || ''))
    ? String(profile?.role) as 'customer' | 'provider' | 'driver'
    : null;
  const accountStatus = profile?.accountStatus || null;
  const deletionRequest = await getDoc(env, 'deletionRequests', u.uid);
  const deletionPending = profile?.deletionRequested === true
    || accountStatus === 'deletion_requested'
    || (deletionRequest && !['cancelled', 'completed'].includes(String(deletionRequest.status || '')));
  const securityRestricted = accountStatus === 'restricted' || isSecuritySuspended(profile);
  const reviewAccess = isStoreReviewAccount(profile)
    && result.state === 'authenticated_complete'
    && u.emailVerified === true
    && !securityRestricted
    && !deletionPending;
  return out(env, req, {
    success: true,
    ...result,
    accountStatus,
    accountPurpose: isStoreReviewAccount(profile) ? 'store_review' : null,
    reviewAccess,
    policyAcceptanceState: role ? policyAcceptanceState(profile, role) : null,
    policyAcceptanceCompatEnabled: LEGACY_POLICY_ACCEPTANCE_COMPAT_ENABLED,
  });
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
  const targets: Array<[string, string[]]> = [['phoneOwners', ['uid']], ['driverProfiles', ['uid']], ['providerProfiles', ['uid']], ['equipment', ['ownerUid']], ['notifications', ['uid']], ['deviceTokens', ['uid']], ['notificationTokenOwners', ['uid']], ['notificationInstallations', ['uid']], ['verificationProfiles', ['uid']], ['verificationAttempts', ['uid']], ['verificationEvents', ['uid']], ['regulatoryDocuments', ['ownerUid']]];
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
  if (reservationConflict) { if (env.__diagnostics) env.__diagnostics.cas = 'conflict'; throw new Error('precondition failed'); }
  if (firestoreWrites) { firestoreWrites.push({ path, fields }); if (env.__diagnostics) env.__diagnostics.cas = 'succeeded'; return null; }
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&') + `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
  try {
    const result = await fs(env, `${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
    if (env.__diagnostics) env.__diagnostics.cas = 'succeeded';
    return result;
  } catch (error) {
    if (env.__diagnostics) env.__diagnostics.cas = env.__diagnostics.firestoreFailure?.status === 409 ? 'conflict' : 'failed';
    throw error;
  }
}
function safeNotificationId(id: string) { return /^[A-Za-z0-9:_-]{3,180}$/.test(id); }
function notificationCursor(value: string | null) {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(b64(value)));
    if (typeof decoded?.id !== 'string' || !safeNotificationId(decoded.id)) return undefined;
    // v1 timestamp cursors remain accepted. v2 retains the original Firestore
    // value type so legacy string/null dates paginate without skips or loops.
    const orderValue = decoded.orderValue || (decoded.createdAt ? { timestampValue: String(decoded.createdAt) } : undefined);
    return orderValue && typeof orderValue === 'object' ? { orderValue, id: decoded.id } : undefined;
  } catch { return undefined; }
}
function nextNotificationCursor(orderValue: unknown, id: string) {
  return b64u(enc.encode(JSON.stringify({ orderValue, id })));
}
async function notificationDevices(env: Env, uid: string, limit = 100) {
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'deviceTokens' }], where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
    limit,
  } }) });
  const candidates = await Promise.all((result || []).map(async (x: any) => {
    const value: any = { name: x.document?.name, ...decode(x.document || x) };
    if (value.active !== true || typeof value.token !== 'string') return null;
    const tokenHash = await hashedId(value.token);
    const installationKey = value.installationId ? await hashedId(String(value.installationId)) : '';
    return { value, tokenHash, installationKey };
  }));
  const eligible = candidates.filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate?.installationKey);
  const documents = await batchGetRawDocs(env, eligible.flatMap(candidate => [
    { collection: 'notificationTokenOwners', id: candidate.tokenHash },
    { collection: 'notificationInstallations', id: candidate.installationKey },
  ]));
  return eligible.flatMap(candidate => {
    const owner = documents.get(`notificationTokenOwners/${candidate.tokenHash}`)?.data;
    const installation = documents.get(`notificationInstallations/${candidate.installationKey}`)?.data;
    return owner?.uid === uid && owner?.active === true && owner?.tokenHash === candidate.tokenHash &&
      installation?.uid === uid && installation?.tokenId === candidate.tokenHash
      ? [{ ...candidate.value, tokenHash: candidate.tokenHash }]
      : [];
  });
}
async function deletionDeviceRows(env: Env, uid: string) {
  if (deletionDeviceQueryOverride) return deletionDeviceQueryOverride;
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'deviceTokens' }],
    where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
    limit: 101,
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
  if (rows.length > 100) return out(env, req, { success: false, error: 'Deletion request requires review' }, 409);
  const deviceCandidates = (await Promise.all(rows.map(async (row: any) => {
    const data = decode(row.document || row);
    if (!data.token) return null;
    const tokenHash = await hashedId(String(data.token));
    const installationId = String(data.installationId || '');
    return { row, data, tokenHash, installationKey: installationId ? await hashedId(installationId) : '' };
  }))).filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate);
  const canonicalDevices = await batchGetRawDocs(env, deviceCandidates.flatMap(candidate => [
    { collection: 'notificationTokenOwners', id: candidate.tokenHash },
    ...(candidate.installationKey ? [{ collection: 'notificationInstallations', id: candidate.installationKey }] : []),
  ]));
  for (const candidate of deviceCandidates) {
    const { row, tokenHash, installationKey } = candidate;
    if (seen.has(tokenHash)) continue;
    seen.add(tokenHash);
    const deviceName = String(row.document?.name || '').split('/documents/')[1] || `deviceTokens/${tokenHash}`;
    writes.push({ update: { name: fullName(env, deviceName), fields: { active: { booleanValue: false }, revokedAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['active', 'revokedAt', 'updatedAt'] }, currentDocument: row.document?.updateTime ? { updateTime: row.document.updateTime } : { exists: true } });
    const owner = canonicalDevices.get(`notificationTokenOwners/${tokenHash}`);
    if (owner?.data?.uid === u.uid && owner.data.active === true && owner.updateTime) writes.push({ update: { name: fullName(env, `notificationTokenOwners/${tokenHash}`), fields: { active: { booleanValue: false }, revokedAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['active', 'revokedAt', 'updatedAt'] }, currentDocument: { updateTime: owner.updateTime } });
    if (installationKey) {
      const installation = canonicalDevices.get(`notificationInstallations/${installationKey}`);
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
  const structuredQuery: any = { from: [{ collectionId: 'notifications' }], where, orderBy: notificationInboxOrder, limit: limit + 1 };
  if (cursor) structuredQuery.startAt = { before: false, values: [cursor.orderValue, { referenceValue: fullName(env, `notifications/${cursor.id}`) }] };
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) });
  const rows = (result || []).filter((x: any) => x.document && decode(x.document).uid === u.uid);
  const page = rows.slice(0, limit);
  const items = page.map((x: any) => notificationInboxItem(decode(x.document), x.document.name.split('/').pop(), x.document.createTime));
  const last = page[page.length - 1];
  let unreadCount: number;
  try {
    unreadCount = await notificationUnreadCount(env, u.uid);
  } catch { return out(env, req, { success: false, errorCode: 'NOTIFICATION_COUNT_UNAVAILABLE' }, 503); }
  return out(env, req, { success: true, notifications: items, unreadCount, hasMore: rows.length > limit, nextPageToken: rows.length > limit && last ? nextNotificationCursor(last.document.fields.createdAt, items[items.length - 1].id) : null });
}
async function notificationUnreadCount(env: Env, uid: string): Promise<number> {
  const aggregate = await fs(env, ':runAggregationQuery', { method: 'POST', body: JSON.stringify({ structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: 'notifications' }], where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
        { fieldFilter: { field: { fieldPath: 'read' }, op: 'EQUAL', value: { booleanValue: false } } },
      ] } }, orderBy: notificationUnreadOrder }, aggregations: [{ alias: 'unread', count: {} }],
    } }) });
  const raw = aggregate?.[0]?.result?.aggregateFields?.unread?.integerValue;
  if (raw === undefined || !/^\d+$/.test(String(raw)) || !Number.isSafeInteger(Number(raw))) throw new Error('Invalid unread aggregate');
  return Number(raw);
}
async function notificationCount(req: Request, env: Env, u: User) {
  try { return out(env, req, { success: true, unreadCount: await notificationUnreadCount(env, u.uid) }); }
  catch { return out(env, req, { success: false, errorCode: 'NOTIFICATION_COUNT_UNAVAILABLE' }, 503); }
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
  const expiresAt = new Date(Date.now() + (revoke ? 30 : 180) * 86400000).toISOString();
  const ownershipWrites: any[] = [];
  const canonicalInstallation = await getRawDoc(env, 'notificationInstallations', installationKey);
  const canonicalOwner = await getRawDoc(env, 'notificationTokenOwners', tokenId);
  if (!revoke) {
    const prior = firestoreOverride ? [] : await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'deviceTokens' }], where: { compositeFilter: { op: 'OR', filters: [
      { fieldFilter: { field: { fieldPath: 'token' }, op: 'EQUAL', value: { stringValue: token } } },
      { fieldFilter: { field: { fieldPath: 'installationId' }, op: 'EQUAL', value: { stringValue: installationId } } },
    ] } }, limit: 20 } }) });
    const transfers = (prior || []).filter((x: any) => decode(x.document || x).uid !== u.uid && decode(x.document || x).active === true);
    for (const item of transfers) {
      ownershipWrites.push({ update: { name: item.document?.name, fields: { active: { booleanValue: false }, revokedAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['active', 'revokedAt', 'updatedAt'] }, currentDocument: { updateTime: item.document?.updateTime } });
    }
  }
  const current = await getRawDoc(env, 'deviceTokens', tokenId);
  const fields: Record<string, any> = { uid: { stringValue: u.uid }, token: { stringValue: token }, installationId: { stringValue: installationId }, platform: { stringValue: platform }, active: { booleanValue: !revoke }, updatedAt: { timestampValue: now }, lastSeenAt: { timestampValue: now }, expiresAt: { timestampValue: expiresAt } };
  if (revoke) fields.revokedAt = { timestampValue: now };
  ownershipWrites.push(current
    ? { update: { name: fullName(env, path), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { exists: true } }
    : { update: { name: fullName(env, path), fields: { ...fields, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } });
  const installationFields = { installationId: { stringValue: installationId }, uid: { stringValue: u.uid }, tokenId: { stringValue: tokenId }, active: { booleanValue: !revoke }, updatedAt: { timestampValue: now }, expiresAt: { timestampValue: expiresAt } };
  const ownerFields = { tokenHash: { stringValue: tokenId }, uid: { stringValue: u.uid }, installationId: { stringValue: installationId }, active: { booleanValue: !revoke }, updatedAt: { timestampValue: now }, expiresAt: { timestampValue: expiresAt } };
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
async function enqueueServiceNotifications(
  env: Env,
  recipients: readonly (string | undefined)[],
  event: NotificationEvent,
  subjectId: string,
  now: string,
  occurrenceId: string,
) {
  const uniqueRecipients = [...new Set(recipients.filter((uid): uid is string => typeof uid === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(uid)))];
  return (await Promise.all(uniqueRecipients.map(uid => enqueueNotifications(env, path => fullName(env, path), uid, event, subjectId, now, occurrenceId)))).flat();
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
    const devices = (await notificationDevices(env, uid, env.__scheduledBudget ? 2 : 100)).filter((device: any) => !onlyTokenHash || device.tokenHash === onlyTokenHash);
    const batches = [];
    for (let i = 0; i < devices.length; i += 100) batches.push(devices.slice(i, i + 100));
    for (const batch of batches.slice(0, 2)) {
      const response = await scheduledExternalFetch(env, 'push_provider', 'https://exp.host/--/api/v2/push/send', {
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
          attempts: { integerValue: '1' }, nextAttemptAt: { timestampValue: new Date(Date.now() + 60000).toISOString() }, errorCode: { stringValue: String(ticket.details?.error || '').slice(0, 80) }, createdAt: { timestampValue: new Date().toISOString() }, expiresAt: { timestampValue: new Date(Date.now() + 30 * 86400000).toISOString() },
        });
      }
    }
    return true;
  } catch { return false; /* push delivery never changes the source transaction */ }
}
async function processPendingNotificationOutbox(env: Env) {
  try {
    const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notificationOutbox' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } }, orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }], limit: 1 } }) }) as any[] || [];
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
      ] } }, limit: 1,
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
      const push = await scheduledExternalFetch(env, 'push_provider', 'https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ to: tokenDoc.data.token, title: String(inbox.data.titleEn || ''), body: String(inbox.data.bodyEn || ''), data: { notificationId: delivery.notificationId, action: String(action.type || 'profile'), subjectId: String(action.subjectId || '') } }]) });
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
      limit: 10,
    } }) }) as any[] || [];
    const ids = rows.map(row => decode(row.document || row).ticketId).filter((id: string) => id);
    if (!ids.length) return;
    const response = await scheduledExternalFetch(env, 'push_provider', 'https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
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
      if (error === 'DeviceNotRegistered' && value.tokenHash) await patchDoc(env, `deviceTokens/${value.tokenHash}`, { active: { booleanValue: false }, revokedAt: { timestampValue: new Date().toISOString() }, expiresAt: { timestampValue: new Date(Date.now() + 30 * 86400000).toISOString() } });
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
  if (r?.pricingModelVersion === 2) {
    const snapshot = v2FinalPaymentSnapshot(r, requestId);
    return quoteFromCommercial(snapshot, requestId);
  }
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
  // New rentals must never inherit an accidental environment/default rate.
  // Historical V1 records continue through their stored commercial values.
  if (stored === null || stored === undefined) err('Commercial configuration unavailable');
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
async function authoritativeCommercialSnapshotMinor(env: Env, r: any, e: any, baseAmountMinor: number, calculatedAt = new Date().toISOString()): Promise<CommercialSnapshot> {
  if (!Number.isSafeInteger(baseAmountMinor) || baseAmountMinor < 0) err('Invalid base amount');
  const context = commercialContext(r, e);
  const catalog = await commercialCatalog(env);
  const rule = resolveRule(catalog, { ...context, at: calculatedAt });
  const tax = context.currency === 'SAR'
    ? { amount: Number((BigInt(baseAmountMinor) * BigInt(configuredVatRateBps(env)) + 5_000n) / 10_000n), reference: 'legacy-sar-vat-policy' }
    : {};
  const snapshot = calculateCommercial(rule, {
    ...context, baseAmountMinor, calculatedAt,
    ...(tax.amount === undefined ? {} : { taxAmountMinor: tax.amount, taxReference: tax.reference }),
  });
  return Object.assign(snapshot, {
    taxRateBps: tax.amount === undefined ? null : configuredVatRateBps(env),
    ruleEffectiveFrom: rule.effectiveFrom, ruleEffectiveTo: rule.effectiveTo,
    ruleCreatedAt: rule.createdAt, ruleCreatedBy: rule.createdBy,
    ruleUpdatedAt: rule.updatedAt, ruleUpdatedBy: rule.updatedBy, ruleNotes: rule.notes,
  });
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
function recalculateLockedCommercialMinor(snapshot: CommercialSnapshot, baseAmountMinor: number, calculatedAt: string): CommercialSnapshot {
  if (!Number.isSafeInteger(baseAmountMinor) || baseAmountMinor < 0) err('Invalid base amount');
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
    ruleEffectiveFrom: locked.ruleEffectiveFrom, ruleEffectiveTo: locked.ruleEffectiveTo,
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
  const currency = String(r?.finalCommercialSnapshot?.currency || r?.paidCommercialSnapshot?.currency || r?.nativeCurrency || r?.currency || e?.nativeCurrency || e?.currency || 'SAR').toUpperCase();
  if (currency !== 'SAR') err('FOREIGN_SETTLEMENT_DISABLED');
}
function owned(u: User, r: any) { return !!r && (u.admin || r.customerUid === u.uid || r.renterUid === u.uid); }
async function enforceOperationalAccess(env: Env, u: User, equipment?: any) {
  if (!u.admin) {
    // authenticatedUser already resolves and validates the canonical account.
    // Reuse it so every rental mutation has one authoritative account read.
    const profile = u.accountProfile || await getDoc(env, 'users', u.uid);
    if (profile?.accountStatus === 'deletion_requested') err('ACCOUNT_DELETION_REQUESTED');
    if (isSecuritySuspended(profile)) err('ACCOUNT_SUSPENDED');
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
async function regulatoryDocumentsForOwner(env: Env, ownerUid: string): Promise<RegulatoryDocument[]> {
  if (firestoreOverride) {
    const injected = firestoreOverride('__queries', 'regulatoryDocuments');
    return Array.isArray(injected)
      ? injected.filter(document => document?.ownerUid === ownerUid).slice(0, 50) as RegulatoryDocument[]
      : [];
  }
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'regulatoryDocuments' }],
    where: { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: { stringValue: ownerUid } } },
    limit: 50,
  } }) }) as any[] || [];
  return rows.filter(row => row?.document?.name && row?.document?.fields).map(row => ({
    id: String(row.document.name).split('/').pop(), ...decode(row.document),
  })) as RegulatoryDocument[];
}
function safeRegulatoryDocument(document: RegulatoryDocument) {
  const { documentNumber, ...safe } = document;
  return { ...safe, documentNumberMasked: documentNumber.length <= 4 ? '****' : `***${documentNumber.slice(-4)}` };
}
async function regulatoryDocumentList(req: Request, env: Env, u: User) {
  const documents = await regulatoryDocumentsForOwner(env, u.uid);
  return out(env, req, { success: true, items: documents.map(safeRegulatoryDocument) });
}
async function submitRegulatoryDocument(req: Request, env: Env, u: User) {
  let body: unknown; try { body = await req.json(); } catch { return out(env, req, { success: false, error: 'Invalid document submission', errorCode: 'VALIDATION_FAILED' }, 400); }
  const valid = validateRegulatoryDocumentSubmission(body);
  if (!valid) return out(env, req, { success: false, error: 'Invalid document submission', errorCode: 'VALIDATION_FAILED' }, 400);
  const id = `rd_${crypto.randomUUID().replace(/-/g, '')}`, now = new Date().toISOString();
  const document: RegulatoryDocument = { id, ownerUid: u.uid, ...valid, submittedAt: now, reviewStatus: 'PENDING', updatedAt: now };
  const writes: any[] = [{ update: { name: fullName(env, `regulatoryDocuments/${id}`), fields: Object.fromEntries(Object.entries(document).filter(([, value]) => value !== undefined).map(([key, value]) => [key, firestoreValue(value)])) }, currentDocument: { exists: false } }];
  if (valid.expiryDate) writes.push({ update: { name: fullName(env, `regulatoryExpiryQueue/${id}`), fields: { documentId: { stringValue: id }, ownerUid: { stringValue: u.uid }, expiresAt: { timestampValue: `${valid.expiryDate}T00:00:00.000Z` }, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } });
  await commitWrites(env, writes);
  return out(env, req, { success: true, document: safeRegulatoryDocument(document) }, 201);
}
export async function processRegulatoryExpiry(env: Env) {
  const now = new Date().toISOString();
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'regulatoryExpiryQueue' }], where: { fieldFilter: { field: { fieldPath: 'expiresAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: now } } },
    orderBy: [{ field: { fieldPath: 'expiresAt' }, direction: 'ASCENDING' }], limit: 3,
  } }) }) as any[] || [];
  const queued = rows.filter(item => item?.document?.name && item?.document?.fields).map(row => ({ row, queueId: String(row.document.name).split('/').pop()!, queue: decode(row.document) }));
  const documents = await batchGetRawDocs(env, queued.map(item => ({ collection: 'regulatoryDocuments', id: String(item.queue.documentId || item.queueId) })));
  for (const { row, queueId, queue } of queued) {
    const documentId = String(queue.documentId || queueId), raw = documents.get(`regulatoryDocuments/${documentId}`);
    const writes: any[] = [{ delete: fullName(env, `regulatoryExpiryQueue/${queueId}`), currentDocument: row.document.updateTime ? { updateTime: row.document.updateTime } : undefined }];
    if (raw && !['EXPIRED', 'REVOKED', 'REJECTED'].includes(String(raw.data.reviewStatus || ''))) {
      writes.unshift({ update: { name: fullName(env, `regulatoryDocuments/${encodeURIComponent(String(queue.documentId || queueId))}`), fields: { reviewStatus: { stringValue: 'EXPIRED' }, expiredAt: { timestampValue: now }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['reviewStatus', 'expiredAt', 'updatedAt'] }, currentDocument: { updateTime: raw.updateTime } });
      writes.push(await notificationWrite(fullName.bind(null, env), String(raw.data.ownerUid), 'verification_expired', now, String(queue.documentId || queueId), `regulatory-expired:${queueId}`));
    }
    await commitWrites(env, writes);
  }
}

export async function processRentalExpiryReminders(env: Env) {
  const now = new Date().toISOString();
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'rentalExpiryReminderJobs' }],
    where: { fieldFilter: { field: { fieldPath: 'dueAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: now } } },
    orderBy: [{ field: { fieldPath: 'dueAt' }, direction: 'ASCENDING' }],
    limit: 3,
  } }) }) as any[] || [];
  const jobs = rows
    .filter(item => item?.document?.name && item?.document?.fields)
    .map(item => {
      const row = item.document;
      return { row, job: decode(row), jobId: String(row.name).split('/').pop() || '' };
    });
  if (!jobs.length) return;
  const validJobIds = jobs
    .filter(({ job, jobId }) => /^[A-Za-z0-9_-]{1,128}$/.test(jobId) && job.requestId === jobId)
    .map(({ jobId }) => ({ collection: 'equipmentRequests', id: jobId }));
  const requests = await batchGetRawDocs(env, validJobIds);
  for (const { row, job, jobId } of jobs) {
    const deleteWrite = { delete: row.name, currentDocument: row.updateTime ? { updateTime: row.updateTime } : undefined };
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId) || job.requestId !== jobId
        || typeof job.customerUid !== 'string' || typeof job.providerUid !== 'string'
        || !Number.isFinite(Date.parse(String(job.confirmedEndAt || '')))) {
      await commitWrites(env, [deleteWrite]);
      continue;
    }
    const rental = requests.get(`equipmentRequests/${jobId}`)?.data;
    const rentalEnd = Date.parse(String(rental?.requestedEndAt || ''));
    const jobEnd = Date.parse(String(job.confirmedEndAt || ''));
    const stillCurrent = rental
      && rental.pricingModelVersion === 2
      && ['accepted', 'in_progress', 'completion_requested'].includes(String(rental.status))
      && rental.customerUid === job.customerUid
      && rental.providerUid === job.providerUid
      && Number.isFinite(rentalEnd) && Number.isFinite(jobEnd) && rentalEnd === jobEnd;
    if (!stillCurrent) {
      await commitWrites(env, [deleteWrite]);
      continue;
    }
    const occurrence = `${jobId}:expiry:${String(job.confirmedEndAt)}`;
    const writes = [
      await notificationWrite(fullName.bind(null, env), String(job.customerUid), 'rental_expiry_reminder', now, jobId, occurrence),
      await notificationWrite(fullName.bind(null, env), String(job.providerUid), 'rental_expiry_reminder', now, jobId, occurrence),
      deleteWrite,
    ];
    await commitWrites(env, writes);
  }
}

async function verificationProfile(req: Request, env: Env, u: User) {
  const [canonical, documents] = await Promise.all([
    batchGetRawDocs(env, [
      { collection: 'verificationProfiles', id: u.uid },
      { collection: 'users', id: u.uid },
    ]),
    regulatoryDocumentsForOwner(env, u.uid),
  ]);
  const profile = canonical.get(`verificationProfiles/${u.uid}`)?.data;
  const account = canonical.get(`users/${u.uid}`)?.data;
  const safe = safeProfile(profile, u.uid);
  const decision = evaluateCapabilities({ uid: u.uid, canonicalRole: String(account?.role || ''), accountType: account?.providerType === 'company' || account?.accountType === 'business' || account?.businessType === 'business' ? 'business' : 'individual', suspended: ['suspended', 'restricted', 'deletion_requested', 'deleted'].includes(String(account?.accountStatus || account?.suspensionStatus || '')), identityVerified: safe.identity.status === 'verified', documents });
  return out(env, req, { success: true, profile: { ...safe, capabilities: decision.capabilities, verificationBadges: decision.badges } });
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
  const documents = await batchGetRawDocs(env, [
    { collection: 'verificationProfiles', id: customerUid },
    { collection: 'verificationPolicies', id: 'default' },
    { collection: 'users', id: customerUid },
  ]);
  const profile = documents.get(`verificationProfiles/${customerUid}`)?.data;
  const storedPolicy = documents.get('verificationPolicies/default')?.data;
  const account = documents.get(`users/${customerUid}`)?.data;
  const policy = normalizeVerificationPolicy(storedPolicy) || defaultVerificationPolicy();
  const suspension = isSecuritySuspended(account);
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
const V2_AVAILABILITY_LIMIT = 101;
const ALL_ACTIVE_RENTAL_INTERVAL = { startAt: '1970-01-01T00:00:00.000Z', endAt: null } as const;
const V2_BLOCKING_RENTAL_STATUSES = ['accepted', 'in_progress', 'completion_requested', 'payment_pending', 'paid'];
const LEGACY_BLOCKING_RENTAL_STATUSES = ['pending', ...V2_BLOCKING_RENTAL_STATUSES];
type RentalRowsResult = { rows: Array<{ data: any; updateTime?: string; name?: string }>; exhausted: boolean };
type RentalAvailabilityFamily = 'v2' | 'legacy-fixed' | 'legacy-open';
const stringField = (fieldPath: string, op: string, stringValue: string) => ({ fieldFilter: { field: { fieldPath }, op, value: { stringValue } } });
const integerField = (fieldPath: string, op: string, integerValue: number) => ({ fieldFilter: { field: { fieldPath }, op, value: { integerValue: String(integerValue) } } });
const nullField = (fieldPath: string) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { nullValue: null } } });
const anyOf = (...filters: any[]) => ({ compositeFilter: { op: 'OR', filters } });
const allOf = (...filters: any[]) => ({ compositeFilter: { op: 'AND', filters } });
const blockingStateFilter = (statuses: string[]) => anyOf(
  { fieldFilter: { field: { fieldPath: 'status' }, op: 'IN', value: { arrayValue: { values: statuses.map(stringValue => ({ stringValue })) } } } },
  stringField('paymentState', 'EQUAL', 'paid'),
);
function availabilityQueriesForEquipment(equipmentId: string, requested: { startAt: string; endAt: string | null }): Array<{ family: RentalAvailabilityFamily; structuredQuery: any }> {
  // A null requested end means the new rental is open-ended.  The maximum
  // canonical instant keeps the same indexed query shape while including every
  // possible existing start.
  const requestedEndBound = requested.endAt || '9999-12-31T23:59:59.999Z';
  const requestedStartDay = requested.startAt.slice(0, 10);
  const base = stringField('equipmentId', 'EQUAL', equipmentId);
  return [
    {
      family: 'v2',
      structuredQuery: {
        from: [{ collectionId: 'equipmentRequests' }],
        where: allOf(
          base,
          integerField('pricingModelVersion', 'EQUAL', 2),
          blockingStateFilter(V2_BLOCKING_RENTAL_STATUSES),
          stringField('requestedStartAt', 'LESS_THAN', requestedEndBound),
          anyOf(
            stringField('requestedEndAt', 'GREATER_THAN', requested.startAt),
            nullField('requestedEndAt'),
            stringField('actualEndAt', 'GREATER_THAN', requested.startAt),
          ),
        ),
        limit: V2_AVAILABILITY_LIMIT,
      },
    },
    {
      family: 'legacy-fixed',
      structuredQuery: {
        from: [{ collectionId: 'equipmentRequests' }],
        where: allOf(
          base,
          blockingStateFilter(LEGACY_BLOCKING_RENTAL_STATUSES),
          stringField('startDate', 'LESS_THAN', requestedEndBound),
          anyOf(
            stringField('endDate', 'GREATER_THAN_OR_EQUAL', requestedStartDay),
            stringField('actualEndAt', 'GREATER_THAN', requested.startAt),
          ),
        ),
        limit: V2_AVAILABILITY_LIMIT,
      },
    },
    {
      family: 'legacy-open',
      structuredQuery: {
        from: [{ collectionId: 'equipmentRequests' }],
        where: allOf(
          base,
          blockingStateFilter(LEGACY_BLOCKING_RENTAL_STATUSES),
          anyOf(
            stringField('requestMode', 'EQUAL', 'open_ended'),
            stringField('rentalMode', 'EQUAL', 'open_ended'),
          ),
          stringField('createdAt', 'LESS_THAN', requestedEndBound),
        ),
        limit: V2_AVAILABILITY_LIMIT,
      },
    },
  ];
}
async function rentalQueryFamily(env: Env, family: RentalAvailabilityFamily, structuredQuery: any, requested: { startAt: string; endAt: string | null }, transaction?: string) {
  if (firestoreOverride) {
    const scoped = firestoreOverride('__queries', `equipmentRequests:${family}`);
    const injected = scoped === undefined ? firestoreOverride('__queries', 'equipmentRequests') : scoped;
    return (Array.isArray(injected) ? injected : []).filter((item: any) => {
      const interval = activeInterval(item.data || item);
      return interval ? intervalsOverlap(requested, interval) : false;
    }).slice(0, V2_AVAILABILITY_LIMIT).map((item: any) => ({ data: item.data || item, updateTime: item.updateTime, name: item.name || item.id }));
  }
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery, ...(transaction ? { transaction } : {}) }) }) as any[] || [];
  return result.filter(row => row.document).map(row => ({ data: decode(row.document), updateTime: row.document.updateTime, name: row.document.name }));
}
async function rentalRowsForEquipment(env: Env, equipmentId: string, requested: { startAt: string; endAt: string | null }, transaction?: string): Promise<RentalRowsResult> {
  let batches: Array<Array<{ data: any; updateTime?: string; name?: string }>>;
  try {
    batches = await Promise.all(availabilityQueriesForEquipment(equipmentId, requested).map(({ family, structuredQuery }) => rentalQueryFamily(env, family, structuredQuery, requested, transaction)));
  } catch {
    throw new Error('AVAILABILITY_UNAVAILABLE');
  }
  if (batches.some(batch => batch.length >= V2_AVAILABILITY_LIMIT)) return { rows: [], exhausted: true };
  const rows = new Map<string, { data: any; updateTime?: string; name?: string }>();
  for (const batch of batches) for (const row of batch) {
    const key = String(row.name || `${row.data?.equipmentId || ''}:${row.data?.createdAt || ''}:${rows.size}`);
    if (!rows.has(key)) rows.set(key, row);
  }
  return { rows: [...rows.values()].slice(0, V2_AVAILABILITY_LIMIT), exhausted: rows.size >= V2_AVAILABILITY_LIMIT };
}
async function assertV2Available(env: Env, equipmentId: string, requested: { startAt: string; endAt: string | null }, excludingRequestId?: string, transaction?: string) {
  const result = await rentalRowsForEquipment(env, equipmentId, requested, transaction);
  if (result.exhausted) throw new Error('AVAILABILITY_CAP_EXHAUSTED');
  const rows = result.rows;
  const conflict = rows.some(row => {
    const id = String(row.name || '').split('/').pop();
    if (excludingRequestId && id === excludingRequestId) return false;
    const interval = activeInterval(row.data);
    return interval ? intervalsOverlap(requested, interval) : false;
  });
  if (conflict) throw new Error('ACTIVE_RENTAL_OVERLAP');
}
function v2PricingForEquipment(equipment: any) {
  if (equipment?.pricingModelVersion === 2) return validateListingPricing(equipment.pricing, String(equipment.nativeCurrency || equipment.currency || ''));
  return legacyPricingProjection(equipment).pricing;
}
function v2EquipmentContext(equipment: any) {
  if (equipment?.pricingModelVersion === 2) return equipment;
  const market = legacyMarketProjection(equipment || {});
  return { ...equipment, countryCode: market.countryCode, nativeCurrency: market.nativeCurrency, currency: market.nativeCurrency };
}
function canRentEquipment(u: User, equipment: any): boolean {
  if (isPublicRentableListing(equipment)) return true;
  const account = u.accountProfile;
  return account?.role === 'customer'
    && isStoreReviewAccount(account)
    && equipment?.accountPurpose === 'store_review'
    && equipment?.moderationReason === 'store_review_qa_only'
    && equipment?.ownerUid !== u.uid;
}
function v2Failure(error: unknown): { status: number; error: string; errorCode: string } {
  const code = error instanceof Error ? error.message : '';
  if (code === 'RATE_CHANGED') return { status: 409, error: 'Listing rate changed before locking', errorCode: code };
  if (code === 'ACTIVE_RENTAL_OVERLAP') return { status: 409, error: 'Equipment is unavailable for the full selected period.', errorCode: code };
  if (code === 'LISTING_AVAILABILITY_CONFLICT' || code === 'LISTING_TEMPORARILY_UNAVAILABLE') return { status: 409, error: 'Equipment is unavailable for the full selected period.', errorCode: code };
  if (code === 'LISTING_AVAILABILITY_UNAVAILABLE') return { status: 503, error: 'Availability temporarily unavailable', errorCode: code };
  if (code === 'AVAILABILITY_CAP_EXHAUSTED') return { status: 503, error: 'Availability temporarily unavailable', errorCode: code };
  if (code === 'AVAILABILITY_UNAVAILABLE') return { status: 503, error: 'Availability temporarily unavailable', errorCode: code };
  if (code === 'Requested start is in the past') return { status: 400, error: code, errorCode: 'PAST_START_TIME' };
  if (code === 'hourly rental is unavailable' || code === 'daily rental is unavailable') return { status: 409, error: code, errorCode: 'RENTAL_UNIT_UNAVAILABLE' };
  if (['Requested end must be after start', 'Rental duration must be positive', 'Daily rentals require market-midnight boundaries', 'Daily rental duration must be from 1 to 365 days'].includes(code)) {
    return { status: 400, error: code, errorCode: 'INVALID_RENTAL_INTERVAL' };
  }
  // Stored listing/commercial failures are operational details and must never
  // expose raw Error.message values to clients.
  return { status: 503, error: 'Rental pricing temporarily unavailable', errorCode: 'RENTAL_PRICING_UNAVAILABLE' };
}
async function buildV2Estimate(env: Env, input: V2RequestInput, equipment: any, now: string) {
  const normalizedEquipment = v2EquipmentContext(equipment);
  assertListingAvailableForInterval(normalizedEquipment.availability, { startAt: input.requestedStartAt, endAt: input.requestedEndAt }, String(normalizedEquipment.countryCode || ''));
  const pricing = v2PricingForEquipment(normalizedEquipment);
  const estimate = estimateRental(input, pricing, String(normalizedEquipment.countryCode || ''), now);
  let commercial: CommercialSnapshot | null = null;
  if (estimate.baseAmountMinor !== null) commercial = await authoritativeCommercialSnapshotMinor(env, { providerUid: normalizedEquipment.ownerUid }, normalizedEquipment, estimate.baseAmountMinor, now);
  return { ...estimate, commercial };
}
async function estimateV2Request(req: Request, env: Env, u: User) {
  let input: V2RequestInput;
  try { input = parseV2RequestInput(await req.json()); }
  catch (error) {
    const code = error instanceof Error && error.message === 'FIXED_DURATION_REQUIRED' ? error.message : 'INVALID_RENTAL_REQUEST';
    return out(env, req, { success: false, error: code === 'FIXED_DURATION_REQUIRED' ? 'A fixed rental end is required' : 'Invalid request', errorCode: code }, 400);
  }
  const equipment = await getDoc(env, 'equipment', input.equipmentId);
  if (!equipment || equipment.ownerUid === u.uid || !canRentEquipment(u, equipment)) return out(env, req, { success: false, error: 'Listing unavailable', errorCode: 'LISTING_UNAVAILABLE' }, 409);
  const now = new Date().toISOString();
  try {
    const [estimate] = await Promise.all([
      buildV2Estimate(env, input, equipment, now),
      assertV2Available(env, input.equipmentId, { startAt: input.requestedStartAt, endAt: input.requestedEndAt }),
    ]);
    return out(env, req, { success: true, serverNow: now, estimate });
  } catch (error) {
    const failure = v2Failure(error);
    return out(env, req, { success: false, error: failure.error, errorCode: failure.errorCode }, failure.status);
  }
}
function requestEquipmentSnapshot(equipment: any): Record<string, unknown> {
  const images = Array.isArray(equipment.images)
    ? equipment.images.map((image: unknown) => {
      if (typeof image === 'string') return { url: image };
      if (!image || typeof image !== 'object') return null;
      const url = typeof (image as any).url === 'string' ? (image as any).url : '';
      return url ? { url } : null;
    }).filter(Boolean)
    : [];
  return {
    titleAr: typeof equipment.titleAr === 'string' ? equipment.titleAr : '',
    titleEn: typeof equipment.titleEn === 'string' ? equipment.titleEn : '',
    images,
    category: typeof equipment.category === 'string' ? equipment.category : '',
    countryCode: typeof equipment.countryCode === 'string' ? equipment.countryCode : '',
  };
}

async function createV2Request(body: any, req: Request, env: Env, u: User) {
  let input: V2RequestInput;
  try { input = parseV2RequestInput(body); }
  catch (error) {
    const code = error instanceof Error && error.message === 'FIXED_DURATION_REQUIRED' ? error.message : 'INVALID_RENTAL_REQUEST';
    return out(env, req, { success: false, error: code === 'FIXED_DURATION_REQUIRED' ? 'A fixed rental end is required' : 'Invalid request', errorCode: code }, 400);
  }
  const equipmentRaw = await getRawDoc(env, 'equipment', input.equipmentId), equipment = equipmentRaw?.data;
  if (!equipmentRaw?.updateTime || !equipment || equipment.ownerUid === u.uid || !canRentEquipment(u, equipment)) return out(env, req, { success: false, error: 'Listing unavailable', errorCode: 'LISTING_UNAVAILABLE' }, 409);
  const account = u.accountProfile || await getDoc(env, 'users', u.uid);
  if (account?.role !== 'customer') return out(env, req, { success: false, error: 'Rental requests require a customer account', errorCode: 'CUSTOMER_ACCOUNT_REQUIRED' }, 403);
  await enforceOperationalAccess(env, u, equipment);
  try { await enforceEmailVerified(env, u, 'rental'); }
  catch (error) { if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403); throw error; }
  const id = `r_${crypto.randomUUID().replace(/-/g, '')}`, now = new Date().toISOString();
  try {
    const normalizedEquipment = v2EquipmentContext(equipment);
    const [estimate] = await Promise.all([
      buildV2Estimate(env, input, normalizedEquipment, now),
      assertV2Available(env, input.equipmentId, { startAt: input.requestedStartAt, endAt: input.requestedEndAt }),
    ]);
    if (!estimate.commercial || estimate.baseAmountMinor === null) throw new Error('RENTAL_PRICING_UNAVAILABLE');
    const lockedCommercial = estimate.commercial;
    const pricingSnapshot = {
      snapshotId: `rental-v2:${id}:locked`,
      calculationVersion: 2, rateUnit: estimate.rateUnit, rateAmountMinor: estimate.rateAmountMinor,
      currency: estimate.currency, currencyDecimals: estimate.currencyDecimals, marketTimezone: estimate.marketTimezone,
      baseAmountMinor: estimate.baseAmountMinor, commercialTerms: lockedCommercial,
    };
    const equipmentSnapshot = requestEquipmentSnapshot(equipment);
    const value: any = {
      pricingModelVersion: 2, equipmentId: input.equipmentId, customerUid: u.uid, providerUid: equipment.ownerUid,
      equipmentSnapshot,
      categoryId: String(normalizedEquipment.category || ''), countryCode: String(normalizedEquipment.countryCode || ''),
      status: 'pending', rentalMode: input.rentalMode, requestMode: input.rentalMode,
      rateUnit: input.rateUnit, requestedStartAt: input.requestedStartAt, requestedEndAt: input.requestedEndAt,
      actualStartAt: null, actualEndAt: null, notes: input.notes || '',
      ...(input.workSiteLocation ? { workSiteLocation: input.workSiteLocation } : {}), pricingSnapshot,
      commercialSnapshot: lockedCommercial, commercialSnapshotStatus: 'estimated',
      currency: estimate.currency, nativeCurrency: normalizedEquipment.nativeCurrency, baseAmountMinor: estimate.baseAmountMinor,
      paymentStatus: 'unpaid', paymentState: null, paymentId: '', allowChat: false, createdAt: now, updatedAt: now,
    };
    const publicRequestNumber = await createWithPublicIdentifier(env, 'request', `equipmentRequests/${id}`, value, [
      // Verify makes listing rate/moderation edits race-safe without mutating it.
      { verify: fullName(env, `equipment/${encodeURIComponent(input.equipmentId)}`), currentDocument: { updateTime: equipmentRaw.updateTime } },
      await notificationWrite(fullName.bind(null, env), String(equipment.ownerUid), 'rental_request_created', now, id, `${id}:created`),
    ]);
    return out(env, req, { success: true, serverNow: now, request: { id, publicRequestNumber, ...value }, estimate }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'precondition failed') return out(env, req, { success: false, error: 'Listing changed; retry request', errorCode: 'LISTING_CHANGED' }, 409);
    const failure = v2Failure(error);
    return out(env, req, { success: false, error: failure.error, errorCode: failure.errorCode }, failure.status);
  }
}
async function createRequest(req: Request, env: Env, u: User) {
  const body: any = await req.json().catch(() => ({}));
  if (body?.pricingModelVersion === 2) return createV2Request(body, req, env, u);
  // A supplied public number is intentionally ignored for legacy-client
  // compatibility; the Worker transaction always allocates the real value.
  const allowedRequestFields = new Set(['equipmentId', 'requestMode', 'numberOfDays', 'startDate', 'endDate', 'publicRequestNumber']);
  if (Object.keys(body).some(key => !allowedRequestFields.has(key))) return out(env, req, { success: false, error: 'Invalid request' }, 400);
  const equipmentId = String(body.equipmentId || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(equipmentId)) return out(env, req, { success: false, error: 'Invalid request' }, 400);
  const equipment = await getDoc(env, 'equipment', equipmentId);
  if (!equipment || equipment.ownerUid === u.uid || !isPublicRentableListing(equipment)) return out(env, req, { success: false, error: 'Listing unavailable' }, 409);
  if (body.requestMode === 'open_ended') return out(env, req, { success: false, error: 'A fixed rental end is required', errorCode: 'FIXED_DURATION_REQUIRED' }, 400);
  if (equipment.pricingModelVersion === 2) {
    let pricing;
    try { pricing = validateListingPricing(equipment.pricing, String(equipment.nativeCurrency || equipment.currency || '')); }
    catch { return out(env, req, { success: false, error: 'Listing pricing unavailable' }, 409); }
    if (!pricing.daily.enabled) return out(env, req, { success: false, error: 'This listing supports hourly rental only. Update the app to create a time-based request.', errorCode: 'DAILY_RENTAL_UNAVAILABLE' }, 409);
  }
  await enforceOperationalAccess(env, u, equipment);
  try { await enforceEmailVerified(env, u, 'rental'); } catch (error) { if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403); throw error; }
  const mode = 'fixed_days';
  const dailyMajor = equipment.pricingModelVersion === 2
    ? Number(minorToMajor(rateFor(validateListingPricing(equipment.pricing, String(equipment.nativeCurrency || equipment.currency || '')), 'daily'), String(equipment.pricing.currency)))
    : Number(equipment.pricePerDay);
  const days = Number(body.numberOfDays || 0), amount = dailyMajor * days;
  const fallbackStart = new Date().toISOString().slice(0, 10), fallbackEnd = new Date(Date.now() + Math.max(0, days - 1) * 86400000).toISOString().slice(0, 10);
  const requestedRange = { from: String(body.startDate || fallbackStart), until: body.endDate === undefined ? fallbackEnd : String(body.endDate) };
  const dateCheck = validateDateRange(requestedRange);
  if (!dateCheck.ok || !requestedRange.until || Math.round((Date.parse(`${requestedRange.until}T00:00:00Z`) - Date.parse(`${requestedRange.from}T00:00:00Z`)) / 86400000) + 1 !== days) return out(env, req, { success: false, error: 'Invalid rental dates' }, 400);
  const availabilityCheckResult = availabilityAllows(equipment.availability || { from: requestedRange.from }, requestedRange);
  if (!availabilityCheckResult.ok) return out(env, req, { success: false, error: availabilityCheckResult.error }, 409);
  const legacyRequestedInterval = {
    startAt: `${requestedRange.from}T00:00:00.000Z`,
    endAt: requestedRange.until ? new Date(Date.parse(`${requestedRange.until}T00:00:00.000Z`) + 86_400_000).toISOString() : null,
  };
  try { await assertV2Available(env, equipmentId, legacyRequestedInterval); }
  catch (error) {
    const code = error instanceof Error ? error.message : 'AVAILABILITY_UNAVAILABLE';
    if (code === 'ACTIVE_RENTAL_OVERLAP') return out(env, req, { success: false, error: 'An active request or rental overlaps this period.', errorCode: code, details: { ar: 'يوجد طلب أو تأجير نشط يتعارض مع الفترة المحددة. اختر فترة أخرى.', en: 'An active request or rental overlaps this period. Choose different dates.' } }, 409);
    return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: code === 'AVAILABILITY_CAP_EXHAUSTED' ? code : 'AVAILABILITY_UNAVAILABLE' }, 503);
  }
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
  const value: any = { equipmentId, equipmentSnapshot: requestEquipmentSnapshot(equipment), customerUid: u.uid, providerUid: equipment.ownerUid, categoryId: String(equipment.category || ''), countryCode: commercialSnapshot.countryCode, status: 'pending', requestMode: mode, numberOfDays: days, startDate: requestedRange.from, endDate: requestedRange.until, availabilitySnapshot: equipment.availability || null, amount, platformFee: Number(minorToMajor(commercialSnapshot.platformFeeMinor, commercialSnapshot.currency)), providerAmount: Number(minorToMajor(commercialSnapshot.providerReceivableMinor, commercialSnapshot.currency)), paymentStatus: 'unpaid', paymentId: '', paidAt: null, currency: commercialSnapshot.currency, nativeCurrency: commercialSnapshot.currency, nativeAmount: amount, commercialSnapshot, commercialSnapshotStatus: 'finalized', allowChat: false, createdAt: now, updatedAt: now };
  const publicRequestNumber = await createWithPublicIdentifier(
    env, 'request', `equipmentRequests/${id}`, value,
    [await notificationWrite(fullName.bind(null, env), String(equipment.ownerUid), 'rental_request_created', now, id, `${id}:created`)],
  );
  return out(env, req, { success: true, request: requestDto(id, { ...value, publicRequestNumber }), quote: initialQuote, commercialSnapshot }, 201);
}
async function transitionV2Request(req: Request, env: Env, u: User, requestId: string, raw: { data: any; updateTime?: string }, body: any, delegation?: OrganizationDelegationContext) {
  const r = raw.data, action = String(body.action || '');
  const effectiveUid = delegation?.access.organization.ownerUid || u.uid;
  if (delegation && r.providerUid !== effectiveUid) return organizationError(req, env, 'BOOKING_NOT_FOUND', 404);
  if (!v2TransitionAllowed(r, action, effectiveUid, delegation ? false : u.admin)) return out(env, req, { success: false, error: 'Invalid V2 rental transition', errorCode: 'INVALID_TRANSITION' }, 409);
  if (Object.keys(body).some(key => !['action', 'reason'].includes(key))) return out(env, req, { success: false, error: 'Unsupported transition field' }, 400);
  const reason = body.reason === undefined ? '' : String(body.reason).trim();
  if (action === 'cancel' && (!reason || reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason))) return out(env, req, { success: false, error: 'A valid cancellation reason is required' }, 400);
  if (action === 'accept') {
    const transactionType = isSaudiTruckRentalWithoutDriver({ countryCode: r.countryCode, categoryId: r.categoryId, transactionType: 'rental', includesDriver: r.includesDriver }) ? 'rental_without_driver' : 'equipment_rental';
    const catalogue = regulatoryDecision(r.categoryId, transactionType);
    if (catalogue.action === 'fail_closed' && catalogue.classification === 'unknown') return out(env, req, { success: false, error: 'Regulatory category is not enabled for the current release.', errorCode: 'REGULATORY_CATEGORY_UNAVAILABLE', catalogueVersion: '2026-10-04' }, 403);
  }
  if (action === 'accept' && isSaudiTruckRentalWithoutDriver({ countryCode: r.countryCode, categoryId: r.categoryId, transactionType: 'rental', includesDriver: r.includesDriver })) {
    const [provider, documents] = await Promise.all([getDoc(env, 'users', String(r.providerUid)), regulatoryDocumentsForOwner(env, String(r.providerUid))]);
    const decision = evaluateCapabilities({
      uid: String(r.providerUid), canonicalRole: String(provider?.role || 'provider'),
      accountType: provider?.providerType === 'company' || provider?.accountType === 'business' || provider?.businessType === 'business' ? 'business' : 'individual',
      suspended: ['suspended', 'restricted', 'deletion_requested', 'deleted'].includes(String(provider?.accountStatus || provider?.suspensionStatus || '')),
      countryCode: r.countryCode, categoryId: r.categoryId, transactionType: 'rental', includesDriver: r.includesDriver,
      equipmentId: String(r.equipmentId || ''), documents,
    });
    if (!decision.capabilities.CAN_ACCEPT_REGULATED_RENTAL) return out(env, req, {
      success: false, error: 'Required regulatory verification is unavailable.', errorCode: 'REGULATORY_CAPABILITY_REQUIRED',
      requiredCapability: 'CAN_ACCEPT_REGULATED_RENTAL', reasons: decision.reasons.CAN_ACCEPT_REGULATED_RENTAL || [],
    }, 403);
  }
  const now = new Date().toISOString(), updates: Record<string, any> = { updatedAt: { timestampValue: now } };
  let next = '';
  if (action === 'accept') { next = 'accepted'; updates.allowChat = { booleanValue: true }; }
  if (action === 'reject') next = 'rejected';
  if (action === 'cancel') {
    next = 'cancelled'; updates.cancellationReason = { stringValue: reason };
    updates.cancelledBy = { stringValue: u.uid }; updates.cancelledAt = { timestampValue: now }; updates.allowChat = { booleanValue: false };
  }
  if (action === 'start') {
    try { validateServerStart(r, now); } catch (error) { return out(env, req, { success: false, error: error instanceof Error ? error.message : 'Invalid start time', errorCode: 'INVALID_START_TIME' }, 409); }
    next = 'in_progress'; updates.actualStartAt = { timestampValue: now }; updates.startedAt = { timestampValue: now };
  }
  if (action === 'request_completion') {
    next = 'completion_requested'; updates.completionRequestedBy = { stringValue: u.uid }; updates.completionRequestedAt = { timestampValue: now };
  }
  if (action === 'complete') {
    next = 'completed';
    const pricing = r.pricingSnapshot, startAt = String(r.actualStartAt || '');
    if (!pricing || !startAt || !r.commercialSnapshot) return out(env, req, { success: false, error: 'Locked rental accounting unavailable' }, 409);
    try {
      const calculation = calculateRental({ mode: r.rentalMode, unit: r.rateUnit, rateAmountMinor: Number(pricing.rateAmountMinor), startAt, endAt: now, countryCode: String(r.countryCode) });
      if (calculation.baseAmountMinor === null) throw new Error('Final amount unavailable');
      const finalCommercial = recalculateLockedCommercialMinor(r.commercialSnapshot, calculation.baseAmountMinor, now);
      const commercialSnapshotId = `rental-v2:${requestId}:final`;
      const paymentHandoff = buildFinalPaymentHandoff(commercialSnapshotId, finalCommercial);
      updates.actualEndAt = { timestampValue: now }; updates.endedAt = { timestampValue: now };
      updates.finalBaseAmountMinor = { integerValue: String(calculation.baseAmountMinor) };
      updates.finalDuration = firestoreValue(calculation.duration);
      updates.finalCommercialSnapshot = firestoreValue(finalCommercial);
      updates.finalCommercialSnapshotId = { stringValue: commercialSnapshotId };
      updates.paymentHandoff = { mapValue: { fields: {
        amountUnit: { stringValue: paymentHandoff.amountUnit },
        currency: { stringValue: paymentHandoff.currency },
        baseAmount: { integerValue: String(paymentHandoff.baseAmount) },
        platformCommission: { integerValue: String(paymentHandoff.platformCommission) },
        tax: paymentHandoff.tax === null ? { nullValue: null } : { integerValue: String(paymentHandoff.tax) },
        gatewayFee: paymentHandoff.gatewayFee === null ? { nullValue: null } : { integerValue: String(paymentHandoff.gatewayFee) },
        customerPayable: { integerValue: String(paymentHandoff.customerPayable) },
        providerReceivable: { integerValue: String(paymentHandoff.providerReceivable) },
        commercialSnapshotId: { stringValue: paymentHandoff.commercialSnapshotId },
        settlementEnabled: { booleanValue: false },
      } } };
      updates.commercialSnapshotStatus = { stringValue: 'finalized' };
      updates.finalizedAt = { timestampValue: now }; updates.allowChat = { booleanValue: false };
    } catch { return out(env, req, { success: false, error: 'Invalid request accounting' }, 409); }
  }
  if (delegation) updates.lastOrganizationOperation = firestoreValue({ actorMemberId: delegation.actorMemberId, action: `booking_${action}`, at: now });
  updates.status = { stringValue: next };
  const requestWrite = { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(requestId)}`), fields: updates }, updateMask: { fieldPaths: Object.keys(updates) }, currentDocument: { updateTime: raw.updateTime } };
  const recipient = action === 'cancel' || action === 'request_completion' || action === 'complete'
    ? (effectiveUid === r.customerUid ? String(r.providerUid) : String(r.customerUid))
    : action === 'accept' || action === 'reject' || action === 'start' ? String(r.customerUid) : String(r.providerUid);
  const notificationEvent: NotificationEvent = action === 'accept' ? 'rental_accepted'
    : action === 'reject' ? 'rental_rejected'
      : action === 'cancel' ? 'rental_cancelled'
        : action === 'request_completion' ? 'completion_requested'
          : action === 'start' ? 'rental_starting' : 'rental_completed';
  const notification = await notificationWrite(fullName.bind(null, env), recipient, notificationEvent, now, requestId, `${requestId}:v2:${action}:${r.updatedAt || r.createdAt}`);
  const reminderSchedule = action === 'accept' ? rentalExpiryReminderSchedule(requestId, r, now) : null;
  if (action === 'accept' && !reminderSchedule) return out(env, req, { success: false, error: 'Rental interval has expired', errorCode: 'RENTAL_INTERVAL_EXPIRED' }, 409);
  const reminderWrite = reminderSchedule ? {
    update: {
      name: fullName(env, `rentalExpiryReminderJobs/${encodeURIComponent(requestId)}`),
      fields: {
        requestId: { stringValue: requestId },
        equipmentId: { stringValue: String(r.equipmentId) },
        customerUid: { stringValue: String(r.customerUid) },
        providerUid: { stringValue: String(r.providerUid) },
        confirmedEndAt: { timestampValue: reminderSchedule.confirmedEndAt },
        dueAt: { timestampValue: reminderSchedule.dueAt },
        reminderKind: { stringValue: reminderSchedule.reminderKind },
        leadMinutes: { integerValue: String(reminderSchedule.leadMinutes) },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now },
      },
    },
    currentDocument: { exists: false },
  } : null;
  try {
    if (action === 'accept') {
      // Pending V2 requests are soft/nonblocking. Acceptance performs the
      // authoritative overlap read and equipment fence write in one transaction.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const transaction = await beginTransaction(env);
        try {
          await assertV2Available(env, String(r.equipmentId), { startAt: r.requestedStartAt, endAt: r.requestedEndAt }, requestId, transaction);
          if (typeof r.requestedEndAt === 'string') {
            const listing = transaction
              ? await transactionDocument(env, `equipment/${encodeURIComponent(String(r.equipmentId))}`, transaction)
              : await getRawDoc(env, 'equipment', String(r.equipmentId));
            if (!listing?.data) throw new Error('LISTING_AVAILABILITY_UNAVAILABLE');
            assertListingAvailableForInterval(
              listing.data.availability,
              { startAt: String(r.requestedStartAt), endAt: r.requestedEndAt },
              String(r.countryCode || listing.data.countryCode || ''),
            );
          }
          const fencePath = `equipmentBookingFences/${encodeURIComponent(String(r.equipmentId))}`;
          const fence = transaction ? await transactionDocument(env, fencePath, transaction) : await getRawDoc(env, 'equipmentBookingFences', String(r.equipmentId));
          const fenceWrite = { update: { name: fullName(env, fencePath), fields: { equipmentId: { stringValue: String(r.equipmentId) }, revision: { integerValue: String(Number(fence?.data?.revision || 0) + 1) }, requestId: { stringValue: requestId }, updatedAt: { timestampValue: now } } }, currentDocument: fence?.updateTime ? { updateTime: fence.updateTime } : { exists: false } };
          const delegationWrites = delegation ? [
            ...organizationAuthorizationVerifies(env, delegation.access),
            await organizationAuditWrite(env, delegation.access.membership.organizationId, delegation.actorMemberId, u.uid, effectiveUid, `booking_${action}`, requestId),
          ] : [];
          await commitWrites(env, [requestWrite, fenceWrite, notification, ...(reminderWrite ? [reminderWrite] : []), ...delegationWrites], transaction);
          break;
        } catch (error) {
          if (error instanceof Error && ['ACTIVE_RENTAL_OVERLAP', 'AVAILABILITY_CAP_EXHAUSTED', 'AVAILABILITY_UNAVAILABLE', 'LISTING_AVAILABILITY_UNAVAILABLE', 'LISTING_AVAILABILITY_CONFLICT', 'LISTING_TEMPORARILY_UNAVAILABLE'].includes(error.message)) throw error;
          if (delegation) throw error;
          if (attempt === 3) throw error;
        }
      }
    } else await commitWrites(env, [requestWrite, notification, ...(['cancel', 'complete'].includes(action)
      ? [{ delete: fullName(env, `rentalExpiryReminderJobs/${encodeURIComponent(requestId)}`) }]
      : []), ...(delegation ? [
        ...organizationAuthorizationVerifies(env, delegation.access),
        await organizationAuditWrite(env, delegation.access.membership.organizationId, delegation.actorMemberId, u.uid, effectiveUid, `booking_${action}`, requestId),
      ] : [])]);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'Request changed';
    const availabilityFailure = ['AVAILABILITY_CAP_EXHAUSTED', 'AVAILABILITY_UNAVAILABLE', 'LISTING_AVAILABILITY_UNAVAILABLE'].includes(code);
    const conflict = ['ACTIVE_RENTAL_OVERLAP', 'LISTING_AVAILABILITY_CONFLICT', 'LISTING_TEMPORARILY_UNAVAILABLE'].includes(code);
    if (delegation && !availabilityFailure && !conflict) return organizationError(req, env, 'ORGANIZATION_AUTHORIZATION_CHANGED', 409);
    const knownCode = conflict || availabilityFailure ? code : 'REQUEST_CHANGED';
    return out(env, req, { success: false, error: conflict ? 'Equipment is unavailable for the full selected period.' : availabilityFailure ? 'Availability temporarily unavailable' : 'Request changed', errorCode: knownCode }, availabilityFailure ? 503 : 409);
  }
  const responseUpdates = decode({ fields: updates });
  if (responseUpdates.finalBaseAmountMinor !== undefined) responseUpdates.finalBaseAmountMinor = Number(responseUpdates.finalBaseAmountMinor);
  if (responseUpdates.paymentHandoff) {
    for (const field of ['baseAmount', 'platformCommission', 'tax', 'gatewayFee', 'customerPayable', 'providerReceivable']) {
      if (responseUpdates.paymentHandoff[field] !== null && responseUpdates.paymentHandoff[field] !== undefined) {
        responseUpdates.paymentHandoff[field] = Number(responseUpdates.paymentHandoff[field]);
      }
    }
  }
  return out(env, req, { success: true, serverNow: now, request: { id: requestId, ...r, ...responseUpdates } });
}
async function rentalV2Summary(req: Request, env: Env, u: User, requestId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return out(env, req, { success: false, error: 'Not found' }, 404);
  const r = await getDoc(env, 'equipmentRequests', requestId);
  if (!r || r.pricingModelVersion !== 2 || (r.customerUid !== u.uid && r.providerUid !== u.uid && !u.admin)) return out(env, req, { success: false, error: 'Not found' }, 404);
  const now = new Date().toISOString();
  let duration = { elapsedMinutes: null, billableMinutes: null, billableUnits: null, unit: r.rateUnit === 'hourly' ? 'minute' : 'day' };
  let currentEstimate: any = null, final: any = null;
  try {
    if (r.actualStartAt && !r.actualEndAt && ['in_progress', 'completion_requested'].includes(String(r.status))) {
      const calculation = calculateRental({ mode: r.rentalMode, unit: r.rateUnit, rateAmountMinor: Number(r.pricingSnapshot?.rateAmountMinor), startAt: r.actualStartAt, endAt: now, countryCode: r.countryCode });
      duration = calculation.duration as any;
      currentEstimate = { asOf: now, baseAmountMinor: calculation.baseAmountMinor, commercial: recalculateLockedCommercialMinor(r.commercialSnapshot, calculation.baseAmountMinor!, now) };
    } else if (r.actualStartAt && r.actualEndAt) {
      const calculation = calculateRental({ mode: r.rentalMode, unit: r.rateUnit, rateAmountMinor: Number(r.pricingSnapshot?.rateAmountMinor), startAt: r.actualStartAt, endAt: r.actualEndAt, countryCode: r.countryCode });
      duration = (r.finalDuration || calculation.duration) as any;
      const paymentHandoff = r.paymentHandoff ? { ...r.paymentHandoff } : null;
      if (paymentHandoff) for (const field of ['baseAmount', 'platformCommission', 'tax', 'gatewayFee', 'customerPayable', 'providerReceivable']) {
        if (paymentHandoff[field] !== null && paymentHandoff[field] !== undefined) paymentHandoff[field] = Number(paymentHandoff[field]);
      }
      final = {
        finalizedAt: r.finalizedAt || r.actualEndAt,
        baseAmountMinor: Number(r.finalBaseAmountMinor ?? calculation.baseAmountMinor),
        commercialSnapshotId: r.finalCommercialSnapshotId,
        commercial: r.finalCommercialSnapshot,
        paymentHandoff,
      };
    } else if (r.requestedEndAt) {
      duration = calculateRental({ mode: r.rentalMode, unit: r.rateUnit, rateAmountMinor: Number(r.pricingSnapshot?.rateAmountMinor), startAt: r.requestedStartAt, endAt: r.requestedEndAt, countryCode: r.countryCode }).duration as any;
    }
  } catch { return out(env, req, { success: false, error: 'Rental summary unavailable', errorCode: 'INVALID_LOCKED_SNAPSHOT' }, 409); }
  return out(env, req, { success: true, serverNow: now, summary: {
    requestId, pricingModelVersion: 2, status: r.status, rentalMode: r.rentalMode,
    requestedStartAt: r.requestedStartAt, requestedEndAt: r.requestedEndAt,
    actualStartAt: r.actualStartAt || null, actualEndAt: r.actualEndAt || null,
    pricingSnapshot: r.pricingSnapshot, duration, currentEstimate, final,
  } });
}

function rentalExtensionDto(id: string, extension: any) {
  return {
    id,
    requestId: String(extension.requestId || ''),
    status: String(extension.status || ''),
    originalEndAt: String(extension.originalEndAt || ''),
    proposedEndAt: String(extension.proposedEndAt || ''),
    additionalDurationMinutes: Number(extension.additionalDurationMinutes),
    additionalBillableUnits: Number(extension.additionalBillableUnits),
    additionalBaseAmountMinor: Number(extension.additionalBaseAmountMinor),
    currency: String(extension.currency || ''),
    currencyDecimals: Number(extension.currencyDecimals),
    rateUnit: String(extension.rateUnit || ''),
    expiresAt: String(extension.expiresAt || ''),
    createdAt: String(extension.createdAt || ''),
    updatedAt: String(extension.updatedAt || ''),
    paymentActivation: 'blocked_unverified' as const,
  };
}

function rentalExtensionFailure(req: Request, env: Env, error: unknown) {
  const code = error instanceof Error ? error.message : 'EXTENSION_CHANGED';
  if (code === 'EXTENSION_INVALID_END') return out(env, req, { success: false, error: 'Invalid extension end', errorCode: code }, 400);
  if (['EXTENSION_NOT_AVAILABLE', 'EXTENSION_RENTAL_EXPIRED', 'EXTENSION_ALREADY_PENDING', 'EXTENSION_CHANGED'].includes(code)) {
    return out(env, req, { success: false, error: 'Extension is no longer available', errorCode: code }, 409);
  }
  if (code === 'EXTENSION_PRICING_UNAVAILABLE') return out(env, req, { success: false, error: 'Extension pricing temporarily unavailable', errorCode: code }, 503);
  const failure = v2Failure(error);
  return out(env, req, { success: false, error: failure.error, errorCode: failure.errorCode }, failure.status);
}

async function buildRentalExtensionEstimate(
  env: Env,
  requestId: string,
  rental: any,
  proposedEndAt: unknown,
  now: string,
  transaction?: string,
) {
  const quote = quoteRentalExtension(rental, proposedEndAt, now);
  const listing = transaction
    ? await transactionDocument(env, `equipment/${encodeURIComponent(String(rental.equipmentId))}`, transaction)
    : await getRawDoc(env, 'equipment', String(rental.equipmentId));
  if (!listing?.data) throw new Error('LISTING_AVAILABILITY_UNAVAILABLE');
  assertListingAvailableForInterval(
    listing.data.availability,
    { startAt: quote.originalEndAt, endAt: quote.proposedEndAt },
    String(rental.countryCode || listing.data.countryCode || ''),
  );
  await assertV2Available(
    env,
    String(rental.equipmentId),
    { startAt: quote.originalEndAt, endAt: quote.proposedEndAt },
    requestId,
    transaction,
  );
  if (!rental.commercialSnapshot) throw new Error('EXTENSION_PRICING_UNAVAILABLE');
  const commercial = recalculateLockedCommercialMinor(rental.commercialSnapshot, quote.additionalBaseAmountMinor, now);
  return { quote, commercial };
}

async function estimateRentalExtension(req: Request, env: Env, u: User, requestId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return out(env, req, { success: false, error: 'Not found' }, 404);
  const body: any = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => key !== 'proposedEndAt')) {
    return out(env, req, { success: false, error: 'Invalid extension request', errorCode: 'EXTENSION_INVALID_END' }, 400);
  }
  const rental = await getDoc(env, 'equipmentRequests', requestId);
  if (!rental || rental.customerUid !== u.uid) return out(env, req, { success: false, error: 'Not found' }, 404);
  const now = new Date().toISOString();
  if (rental.pendingExtensionId) {
    const pending = await getDoc(env, 'rentalExtensions', String(rental.pendingExtensionId));
    const expired = pending?.status === 'pending_provider' && Date.parse(String(pending.expiresAt || '')) <= Date.parse(now);
    if (!expired) return out(env, req, { success: false, error: 'An extension is already pending', errorCode: 'EXTENSION_ALREADY_PENDING' }, 409);
  }
  try {
    const result = await buildRentalExtensionEstimate(env, requestId, rental, body.proposedEndAt, now);
    return out(env, req, {
      success: true,
      serverNow: now,
      estimate: { ...result.quote, commercial: result.commercial, paymentActivation: 'blocked_unverified' },
    });
  } catch (error) { return rentalExtensionFailure(req, env, error); }
}

async function createRentalExtension(req: Request, env: Env, u: User, requestId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return out(env, req, { success: false, error: 'Not found' }, 404);
  const body: any = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['proposedEndAt', 'expectedAdditionalBaseAmountMinor'].includes(key))
      || !Number.isSafeInteger(body.expectedAdditionalBaseAmountMinor) || body.expectedAdditionalBaseAmountMinor <= 0) {
    return out(env, req, { success: false, error: 'Invalid extension request', errorCode: 'EXTENSION_INVALID_END' }, 400);
  }
  const now = new Date().toISOString();
  const extensionId = `ext_${crypto.randomUUID().replace(/-/g, '')}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const transaction = await beginTransaction(env);
    const requestRaw = transaction
      ? await transactionDocument(env, `equipmentRequests/${encodeURIComponent(requestId)}`, transaction)
      : await getRawDoc(env, 'equipmentRequests', requestId);
    const rental = requestRaw?.data;
    if (!requestRaw?.updateTime || !rental || rental.customerUid !== u.uid) return out(env, req, { success: false, error: 'Not found' }, 404);
    let expiredPreviousWrite: any = null;
    if (rental.pendingExtensionId && rental.pendingExtensionId !== extensionId) {
      const previousId = String(rental.pendingExtensionId);
      const previousRaw = transaction
        ? await transactionDocument(env, `rentalExtensions/${encodeURIComponent(previousId)}`, transaction)
        : await getRawDoc(env, 'rentalExtensions', previousId);
      const previous = previousRaw?.data;
      if (!previousRaw?.updateTime || !previous || previous.requestId !== requestId
          || previous.status !== 'pending_provider' || Date.parse(String(previous.expiresAt || '')) > Date.parse(now)) {
        return out(env, req, { success: false, error: 'An extension is already pending', errorCode: 'EXTENSION_ALREADY_PENDING' }, 409);
      }
      expiredPreviousWrite = {
        update: {
          name: fullName(env, `rentalExtensions/${encodeURIComponent(previousId)}`),
          fields: { status: { stringValue: 'expired' }, updatedAt: { timestampValue: now } },
        },
        updateMask: { fieldPaths: ['status', 'updatedAt'] },
        currentDocument: { updateTime: previousRaw.updateTime },
      };
    }
    try {
      const result = await buildRentalExtensionEstimate(env, requestId, rental, body.proposedEndAt, now, transaction);
      if (result.quote.additionalBaseAmountMinor !== body.expectedAdditionalBaseAmountMinor) throw new Error('EXTENSION_CHANGED');
      const value = {
        requestId,
        equipmentId: String(rental.equipmentId),
        customerUid: String(rental.customerUid),
        providerUid: String(rental.providerUid),
        status: 'pending_provider',
        ...result.quote,
        additionalCommercialSnapshot: result.commercial,
        paymentActivation: 'blocked_unverified',
        createdAt: now,
        updatedAt: now,
      };
      const extensionFields = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)]));
      for (const field of ['additionalDurationMinutes', 'additionalBillableUnits', 'additionalBaseAmountMinor', 'currencyDecimals']) {
        extensionFields[field] = { integerValue: String(value[field as keyof typeof value]) };
      }
      const writes = [
        ...(expiredPreviousWrite ? [expiredPreviousWrite] : []),
        {
          update: {
            name: fullName(env, `rentalExtensions/${encodeURIComponent(extensionId)}`),
            fields: extensionFields,
          },
          currentDocument: { exists: false },
        },
        {
          update: {
            name: fullName(env, `equipmentRequests/${encodeURIComponent(requestId)}`),
            fields: {
              pendingExtensionId: { stringValue: extensionId },
              extensionStatus: { stringValue: 'pending_provider' },
              updatedAt: { timestampValue: now },
            },
          },
          updateMask: { fieldPaths: ['pendingExtensionId', 'extensionStatus', 'updatedAt'] },
          currentDocument: { updateTime: requestRaw.updateTime },
        },
        await notificationWrite(fullName.bind(null, env), String(rental.providerUid), 'rental_extension_requested', now, requestId, `${extensionId}:requested`),
      ];
      await commitWrites(env, writes, transaction);
      return out(env, req, { success: true, serverNow: now, extension: rentalExtensionDto(extensionId, value) }, 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (['EXTENSION_NOT_AVAILABLE', 'EXTENSION_RENTAL_EXPIRED', 'EXTENSION_INVALID_END', 'EXTENSION_PRICING_UNAVAILABLE', 'EXTENSION_CHANGED', 'ACTIVE_RENTAL_OVERLAP', 'AVAILABILITY_CAP_EXHAUSTED', 'AVAILABILITY_UNAVAILABLE', 'LISTING_AVAILABILITY_UNAVAILABLE', 'LISTING_AVAILABILITY_CONFLICT', 'LISTING_TEMPORARILY_UNAVAILABLE'].includes(code)) {
        return rentalExtensionFailure(req, env, error);
      }
      if (attempt === 3) return rentalExtensionFailure(req, env, new Error('EXTENSION_CHANGED'));
    }
  }
  return rentalExtensionFailure(req, env, new Error('EXTENSION_CHANGED'));
}

async function getRentalExtension(req: Request, env: Env, u: User, requestId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return out(env, req, { success: false, error: 'Not found' }, 404);
  const rental = await getDoc(env, 'equipmentRequests', requestId);
  if (!rental || (rental.customerUid !== u.uid && rental.providerUid !== u.uid && !u.admin)) return out(env, req, { success: false, error: 'Not found' }, 404);
  const extensionId = typeof rental.pendingExtensionId === 'string' ? rental.pendingExtensionId : '';
  if (!extensionId) return out(env, req, { success: true, extension: null, paymentActivation: 'blocked_unverified' });
  const extension = await getDoc(env, 'rentalExtensions', extensionId);
  if (!extension || extension.requestId !== requestId || extension.customerUid !== rental.customerUid || extension.providerUid !== rental.providerUid) {
    return out(env, req, { success: false, error: 'Extension state unavailable', errorCode: 'EXTENSION_CHANGED' }, 409);
  }
  const effective = extension.status === 'pending_provider' && Date.parse(String(extension.expiresAt || '')) <= Date.now()
    ? { ...extension, status: 'expired' }
    : extension;
  return out(env, req, { success: true, extension: rentalExtensionDto(extensionId, effective), paymentActivation: 'blocked_unverified' });
}

async function reviewRentalExtension(req: Request, env: Env, u: User, requestId: string, extensionId: string, action: 'approve' | 'decline') {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId) || !/^ext_[A-Za-z0-9]{16,128}$/.test(extensionId)) {
    return out(env, req, { success: false, error: 'Not found' }, 404);
  }
  const body: any = await req.json().catch(() => ({}));
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) {
    return out(env, req, { success: false, error: 'Invalid extension action' }, 400);
  }
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const transaction = await beginTransaction(env);
    const requestRaw = transaction
      ? await transactionDocument(env, `equipmentRequests/${encodeURIComponent(requestId)}`, transaction)
      : await getRawDoc(env, 'equipmentRequests', requestId);
    const extensionRaw = transaction
      ? await transactionDocument(env, `rentalExtensions/${encodeURIComponent(extensionId)}`, transaction)
      : await getRawDoc(env, 'rentalExtensions', extensionId);
    const rental = requestRaw?.data;
    const extension = extensionRaw?.data;
    if (!requestRaw?.updateTime || !extensionRaw?.updateTime || !rental || !extension
        || rental.providerUid !== u.uid || extension.providerUid !== u.uid || extension.requestId !== requestId) {
      return out(env, req, { success: false, error: 'Not found' }, 404);
    }
    if (rental.pendingExtensionId !== extensionId || extension.status !== 'pending_provider') {
      return rentalExtensionFailure(req, env, new Error('EXTENSION_CHANGED'));
    }
    if (Date.parse(String(extension.expiresAt || '')) <= Date.parse(now)) {
      return rentalExtensionFailure(req, env, new Error('EXTENSION_RENTAL_EXPIRED'));
    }
    try {
      let status = 'declined';
      if (action === 'approve') {
        const result = await buildRentalExtensionEstimate(env, requestId, rental, extension.proposedEndAt, now, transaction);
        if (result.quote.additionalBaseAmountMinor !== Number(extension.additionalBaseAmountMinor)
            || result.quote.proposedEndAt !== extension.proposedEndAt) throw new Error('EXTENSION_CHANGED');
        status = 'awaiting_payment_integration';
      }
      const extensionFields = {
        status: { stringValue: status },
        reviewedAt: { timestampValue: now },
        reviewedBy: { stringValue: u.uid },
        updatedAt: { timestampValue: now },
        paymentActivation: { stringValue: 'blocked_unverified' },
      };
      const requestFields: Record<string, any> = {
        extensionStatus: { stringValue: status },
        updatedAt: { timestampValue: now },
      };
      if (action === 'decline') requestFields.pendingExtensionId = { stringValue: '' };
      const writes = [
        {
          update: { name: fullName(env, `rentalExtensions/${encodeURIComponent(extensionId)}`), fields: extensionFields },
          updateMask: { fieldPaths: Object.keys(extensionFields) },
          currentDocument: { updateTime: extensionRaw.updateTime },
        },
        {
          update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(requestId)}`), fields: requestFields },
          updateMask: { fieldPaths: Object.keys(requestFields) },
          currentDocument: { updateTime: requestRaw.updateTime },
        },
        await notificationWrite(
          fullName.bind(null, env),
          String(rental.customerUid),
          action === 'approve' ? 'rental_extension_approved' : 'rental_extension_declined',
          now,
          requestId,
          `${extensionId}:${action}`,
        ),
      ];
      await commitWrites(env, writes, transaction);
      return out(env, req, {
        success: true,
        extension: rentalExtensionDto(extensionId, { ...extension, status, updatedAt: now }),
        paymentActivation: 'blocked_unverified',
        extensionConfirmed: false,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (['EXTENSION_NOT_AVAILABLE', 'EXTENSION_RENTAL_EXPIRED', 'EXTENSION_INVALID_END', 'EXTENSION_PRICING_UNAVAILABLE', 'EXTENSION_CHANGED', 'ACTIVE_RENTAL_OVERLAP', 'AVAILABILITY_CAP_EXHAUSTED', 'AVAILABILITY_UNAVAILABLE', 'LISTING_AVAILABILITY_UNAVAILABLE', 'LISTING_AVAILABILITY_CONFLICT', 'LISTING_TEMPORARILY_UNAVAILABLE'].includes(code)) {
        return rentalExtensionFailure(req, env, error);
      }
      if (attempt === 3) return rentalExtensionFailure(req, env, new Error('EXTENSION_CHANGED'));
    }
  }
  return rentalExtensionFailure(req, env, new Error('EXTENSION_CHANGED'));
}

async function transitionRequest(req: Request, env: Env, u: User, requestId: string, bodyOverride?: any, delegation?: OrganizationDelegationContext) {
  const body: any = bodyOverride ?? await req.json().catch(() => ({})), action = body.action;
  if (!['accept', 'reject', 'cancel', 'request_completion', 'start', 'complete'].includes(action) || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return out(env, req, { success: false, error: 'Invalid transition' }, 400);
  const raw = await getRawDoc(env, 'equipmentRequests', requestId), r = raw?.data;
  if (!raw?.updateTime || !r) return out(env, req, { success: false, error: 'Not found' }, 404);
  const effectiveUid = delegation?.access.organization.ownerUid || u.uid;
  if (delegation && r.providerUid !== effectiveUid) return organizationError(req, env, 'BOOKING_NOT_FOUND', 404);
  if (r.pricingModelVersion === 2) return transitionV2Request(req, env, u, requestId, raw, body, delegation);
  await enforceOperationalAccess(env, u, await getDoc(env, 'equipment', r.equipmentId));
  const accounts = await batchGetRawDocs(env, [
    { collection: 'users', id: String(r.customerUid || '') },
    { collection: 'users', id: String(r.providerUid || '') },
  ]);
  const customerAccount = accounts.get(`users/${r.customerUid}`)?.data;
  const providerAccount = accounts.get(`users/${r.providerUid}`)?.data;
  if (isOperationallyBlocked(customerAccount) || isOperationallyBlocked(providerAccount)) return out(env, req, { success: false, error: 'ACCOUNT_SUSPENDED' }, 403);
  const provider = r.providerUid === effectiveUid || (!delegation && u.admin), customer = r.customerUid === effectiveUid;
  const allowed = action === 'cancel' ? customer : action === 'accept' || action === 'reject' || action === 'start' ? provider : action === 'request_completion' ? provider : action === 'complete' ? customer : false;
  if (!allowed) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  const transitions: Record<string, [string, string[]]> = { accept: ['accepted', ['pending']], reject: ['rejected', ['pending']], cancel: ['cancelled', ['pending', 'accepted']], request_completion: ['completion_requested', ['in_progress']], start: ['in_progress', ['accepted']], complete: ['completed', ['completion_requested']] };
  const [next, prior] = transitions[action];
  if (!prior.includes(String(r.status))) return out(env, req, { success: false, error: 'Invalid request state' }, 409);
  if (action === 'accept' || action === 'start') await enforceTrustForCustomerAction(env, String(r.customerUid), r, await getDoc(env, 'equipment', r.equipmentId));
  const now = new Date().toISOString(), updates: any = { status: { stringValue: next }, updatedAt: { timestampValue: now } };
  if (delegation) updates.lastOrganizationOperation = firestoreValue({ actorMemberId: delegation.actorMemberId, action: `booking_${action}`, at: now });
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
  if (next === 'completion_requested' && delegation) {
    updates.completionRequestedBy = { stringValue: u.uid };
    updates.completionRequestedAt = { timestampValue: now };
  }
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
  let reservationWrites: any[] = [];
  if (next === 'accepted') {
    reservationWrites = reservationDates.map((date) => ({ update: { name: fullName(env, reservationPath(String(r.equipmentId), date)), fields: { equipmentId: { stringValue: String(r.equipmentId) }, requestId: { stringValue: requestId }, date: { stringValue: date }, status: { stringValue: 'active' }, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } }));
  } else if ((action === 'cancel' || action === 'reject') && reservationDates.length) {
    const reservations = await batchGetRawDocs(env, reservationDates.map(date => ({
      collection: 'equipmentReservations', id: `${r.equipmentId}:${date}`,
    })));
    reservationWrites = reservationDates.flatMap(date => {
      const id = `${r.equipmentId}:${date}`, reservation = reservations.get(`equipmentReservations/${id}`);
      return reservation?.data?.requestId === requestId && reservation.updateTime
        ? [{ delete: fullName(env, reservationPath(String(r.equipmentId), date)), currentDocument: { updateTime: reservation.updateTime } }]
        : [];
    });
  }
  if (next === 'accepted') {
    const legacyInterval = activeInterval({ ...r, status: 'pending' });
    if (!legacyInterval) return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'LEGACY_INTERVAL_UNAVAILABLE' }, 409);
    // Read the shared fence before the overlap query. A concurrent V2 commit
    // then invalidates this precondition instead of slipping between reads.
    const fencePath = `equipmentBookingFences/${encodeURIComponent(String(r.equipmentId))}`;
    const fence = await getRawDoc(env, 'equipmentBookingFences', String(r.equipmentId));
    try { await assertV2Available(env, String(r.equipmentId), legacyInterval, requestId); }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      const availabilityFailure = code === 'AVAILABILITY_CAP_EXHAUSTED' || code === 'AVAILABILITY_UNAVAILABLE';
      return out(env, req, { success: false, error: availabilityFailure ? 'Availability temporarily unavailable' : 'Equipment is unavailable for the full selected period.', errorCode: code || 'ACTIVE_RENTAL_OVERLAP' }, availabilityFailure ? 503 : 409);
    }
    reservationWrites.push({ update: { name: fullName(env, fencePath), fields: { equipmentId: { stringValue: String(r.equipmentId) }, revision: { integerValue: String(Number(fence?.data?.revision || 0) + 1) }, requestId: { stringValue: requestId }, updatedAt: { timestampValue: now } } }, currentDocument: fence?.updateTime ? { updateTime: fence.updateTime } : { exists: false } });
  }
  try {
    await commitWrites(env, [{ update: { name: fullName(env, `equipmentRequests/${requestId}`), fields: updates }, updateMask: { fieldPaths: Object.keys(updates) }, currentDocument: { updateTime: raw.updateTime } }, ...reservationWrites, await notificationWrite(fullName.bind(null, env), String(action === 'cancel' || action === 'complete' ? r.providerUid : r.customerUid), action === 'accept' ? 'rental_accepted' : action === 'reject' ? 'rental_rejected' : action === 'cancel' ? 'rental_cancelled' : action === 'request_completion' ? 'completion_requested' : action === 'start' ? 'rental_starting' : 'rental_completed', now, requestId, `${requestId}:transition:${action}:${r.updatedAt || r.createdAt}`), ...(delegation ? [
      ...organizationAuthorizationVerifies(env, delegation.access),
      await organizationAuditWrite(env, delegation.access.membership.organizationId, delegation.actorMemberId, u.uid, effectiveUid, `booking_${action}`, requestId),
    ] : [])]);
  } catch {
    return out(env, req, { success: false, error: next === 'accepted' ? 'BOOKING_CONFLICT' : 'Request changed' }, 409);
  }
  return out(env, req, { success: true, request: requestDto(requestId, { ...r, ...Object.fromEntries(Object.entries(updates).map(([k, v]: any) => [k, v.stringValue ?? v.timestampValue ?? v.booleanValue ?? v.doubleValue ?? (v.mapValue ? decode(v.mapValue) : undefined)])) }) });
}
async function startRequest(req: Request, env: Env, u: User) {
  await enforceOperationalAccess(env, u);
  const { requestId } = await req.json() as { requestId?: string }; const raw = requestId ? await getRawDoc(env, 'equipmentRequests', requestId) : null;
  if (raw?.data?.pricingModelVersion === 2) return out(env, req, { success: false, error: 'Use the Rental V2 transition endpoint', errorCode: 'V2_GUARD_REQUIRED' }, 409);
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
  if (r?.pricingModelVersion === 2) return out(env, req, { success: false, error: 'Use the Rental V2 transition endpoint', errorCode: 'V2_GUARD_REQUIRED' }, 409);
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
    ...(d?.commercialSnapshot ? { commercialSnapshot: verifiedStoredCommercial(d.commercialSnapshot, String(d?.currency || '')) || undefined } : {}),
  };
  if (d?.commercialSnapshot && !quote.commercialSnapshot) err('Invalid payment quote');
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
async function lockedPaymentQuote(env: Env, r: any, e: any, requestId: string, stored: any): Promise<PaymentQuote> {
  const quote = stored?.quoteId ? quoteFromDoc(stored) : await paymentQuote(env, r, e, requestId);
  if (r?.pricingModelVersion === 2) {
    const finalSnapshot = v2FinalPaymentSnapshot(r, requestId);
    if (!sameStoredCommercial(finalSnapshot, quote.commercialSnapshot)) err('V2 payment quote does not match finalized pricing');
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
function v2FinalPaymentSnapshot(r: any, requestId?: string): CommercialSnapshot {
  if (r?.pricingModelVersion !== 2 || r?.status !== 'completed' || r?.commercialSnapshotStatus !== 'finalized') throw new Error('V2 payment is not finalized');
  const currency = String(r?.finalCommercialSnapshot?.currency || '');
  const snapshot = verifiedStoredCommercial(r?.finalCommercialSnapshot, currency);
  const locked = verifiedStoredCommercial(r?.commercialSnapshot, String(r?.commercialSnapshot?.currency || ''));
  const snapshotId = String(r?.finalCommercialSnapshotId || '');
  const expectedId = requestId ? `rental-v2:${requestId}:final` : snapshotId;
  const handoff = r?.paymentHandoff;
  const lockedFields = [
    'ruleVersion', 'ruleStatus', 'mode', 'percentageBps', 'fixedAmountMinor', 'minimumFeeMinor',
    'maximumFeeMinor', 'payer', 'customerShareBps', 'currency', 'countryCode', 'categoryId',
    'providerUid', 'taxReference', 'taxRateBps', 'ruleEffectiveFrom', 'ruleEffectiveTo',
    'ruleCreatedAt', 'ruleCreatedBy', 'ruleUpdatedAt', 'ruleUpdatedBy', 'ruleNotes',
  ];
  const termsAgree = !!snapshot && !!locked && lockedFields.every(field => (snapshot as any)[field] === (locked as any)[field]) &&
    snapshot.scope?.countryCode === locked.scope?.countryCode &&
    snapshot.scope?.categoryId === locked.scope?.categoryId &&
    snapshot.scope?.providerUid === locked.scope?.providerUid;
  if (!snapshot || !locked || !termsAgree || !/^rental-v2:[A-Za-z0-9_-]{1,128}:final$/.test(snapshotId) || snapshotId !== expectedId ||
      !handoff || handoff.settlementEnabled !== true || handoff.amountUnit !== 'minor' || handoff.currency !== snapshot.currency ||
      handoff.commercialSnapshotId !== snapshotId || handoff.baseAmount !== snapshot.baseAmountMinor ||
      handoff.platformCommission !== snapshot.platformFeeMinor || handoff.tax !== snapshot.taxAmountMinor ||
      handoff.gatewayFee !== snapshot.gatewayFeeMinor || handoff.customerPayable !== snapshot.customerPayableMinor ||
      handoff.providerReceivable !== snapshot.providerReceivableMinor || r.finalBaseAmountMinor !== snapshot.baseAmountMinor) {
    throw new Error('Invalid finalized V2 commercial snapshot');
  }
  return snapshot;
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
  const rentalSubtotal = rental?.pricingModelVersion === 2
    ? Number(minorToMajor(Number(rental?.finalBaseAmountMinor), String(invoice.currency)))
    : Number(rental?.finalAmount ?? rental?.amount);
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
  const paymentEnvironment = storedPaymentEnvironment(payment);
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
    paymentEnvironment: { stringValue: paymentEnvironment },
  };
  const writes: any[] = [
    { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(requestId)}`), fields: {
      paymentStatus: { stringValue: 'paid' }, paymentState: { stringValue: 'paid' },
      paymentId: { stringValue: d.id }, paidAt: { timestampValue: now }, invoiceId: { stringValue: invoice },
      paymentEnvironment: { stringValue: paymentEnvironment },
       ...(quote.commercialSnapshot ? { paidCommercialSnapshot: firestoreValue(quote.commercialSnapshot) } : {}),
    } }, updateMask: { fieldPaths: ['paymentStatus', 'paymentState', 'paymentId', 'paidAt', 'invoiceId', 'paymentEnvironment', ...(quote.commercialSnapshot ? ['paidCommercialSnapshot'] : [])] }, currentDocument: { updateTime: raw.updateTime } },
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

function storedPaymentEnvironment(payment: any): TapEnvironment {
  // Payments created before environment persistence were TEST-only.
  return normalizeTapEnvironment(payment?.environment);
}

async function tapPaymentForCharge(env: Env, chargeId: string, requestIdHint?: string): Promise<any | null> {
  if (requestIdHint) {
    const hinted = await getDoc(env, 'payments', requestIdHint);
    if (hinted?.provider === 'tap' && (!hinted.providerReference || hinted.providerReference === chargeId)) return hinted;
  }
  if (firestoreOverride) {
    const injected = await getDoc(env, 'payments', chargeId);
    return injected?.provider === 'tap' && injected.providerReference === chargeId ? injected : null;
  }
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'payments' }],
    where: { fieldFilter: { field: { fieldPath: 'providerReference' }, op: 'EQUAL', value: { stringValue: chargeId } } },
    limit: 2,
  } }) }) as any[] || [];
  const matches = rows.filter(row => row.document).map(row => decode(row.document));
  return matches.length === 1 && matches[0]?.provider === 'tap' ? matches[0] : null;
}

function tapRedirectBridge(req: Request): Response {
  const url = new URL(req.url);
  const requestId = url.searchParams.get('requestId') || '';
  const chargeId = url.searchParams.get('tap_id') || '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId) || !/^chg_[A-Za-z0-9_-]{6,196}$/.test(chargeId)) {
    return new Response('Invalid payment return', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
  }
  const deepLink = `heavyar://payment/${encodeURIComponent(requestId)}?paymentId=${encodeURIComponent(chargeId)}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Return to HEAVYAR</title><style>body{margin:0;background:#071a31;color:#fff;font-family:system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;text-align:center}.card{max-width:28rem;padding:2rem}a{display:inline-block;margin-top:1rem;padding:.8rem 1.2rem;border-radius:.75rem;background:#e8b43b;color:#071a31;text-decoration:none;font-weight:700}</style></head><body><main class="card"><h1>Return to HEAVYAR</h1><p>Your payment status will be verified securely in the app.</p><a href="${deepLink}">Open HEAVYAR</a></main><script>window.location.href=${JSON.stringify(deepLink)};</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}

async function createPaymentAttempt(body: { requestId: string; purpose?: string }, req: Request, env: Env, u: User) {
  const paymentStartedAt = Date.now();
  mutationStage(env, 'validation');
  if (env.__diagnostics) env.__diagnostics.payment = { firestoreBeforeProviderMs: 0, providerMs: 0, firestoreAfterProviderMs: 0 };
  const raw = await getRawDoc(env, 'equipmentRequests', body.requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId);
  let customerProfile: any = null;
  try {
    await enforceOperationalAccess(env, u, e);
    const customer = r?.customerUid ? await getDoc(env, 'users', String(r.customerUid)) : null;
    customerProfile = customer || u.accountProfile;
    const providerUid = String(r?.providerUid || e?.ownerUid || '');
    const provider = providerUid ? await getDoc(env, 'users', providerUid) : null;
    if (isStoreReviewAccount(customer) || isStoreReviewAccount(provider)) err('STORE_REVIEW_FINANCIAL_DISABLED');
    await enforceTrustForPayment(env, u, r, e);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const trust = message.startsWith('TRUST_');
    return out(env, req, { success: false, error: trust ? 'Identity verification required' : message === 'STORE_REVIEW_FINANCIAL_DISABLED' ? 'Store Review accounts cannot initiate financial settlement' : message === 'ACCOUNT_SUSPENDED' ? 'Account suspended' : 'Listing unavailable', code: trust ? message.replace('TRUST_', '').toLowerCase() : message === 'STORE_REVIEW_FINANCIAL_DISABLED' ? message : undefined }, 403);
  }
  if (!owned(u, r) || !r?.customerUid || r.customerUid !== u.uid) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  try { assertSarSettlement(r, e); } catch { return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409); }
  if (String(r.requestMode || '').toLowerCase() === 'open_ended' && !(Number.isFinite(Number(r.finalAmount)) && Number(r.finalAmount) > 0)) return out(env, req, { success: false, error: 'Final amount required' }, 409);
  let quote: PaymentQuote;
  const storedQuote = await getDoc(env, 'paymentQuotes', body.requestId);
  try {
    quote = await lockedPaymentQuote(env, r, e, body.requestId, storedQuote);
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
  const tapConfig = await getDoc(env, 'paymentGateways', 'tap');
  const paymentEnvironment = existingPayment ? storedPaymentEnvironment(existingPayment) : normalizeTapEnvironment(tapConfig?.environment);
  const tapGateway = gatewayRegistry(env, paymentEnvironment).tap;
  let tapRuntime: ReturnType<typeof tapCredentials>;
  try { tapRuntime = tapCredentials(env, paymentEnvironment); }
  catch { return out(env, req, { success: false, error: 'Payment gateway unavailable' }, 503); }
  if (!tapConfig || tapConfig.enabled !== true || !tapGateway.configured || !tapGateway.adapterAvailable) return out(env, req, { success: false, error: 'Payment gateway unavailable' }, 503);
  if (r.paymentStatus === 'pending_payment' && r.paymentId && !String(r.paymentId).startsWith('reservation:')) {
    const state = String(existingPayment?.state || r.paymentState || 'pending') as PaymentState;
    return out(env, req, { success: true, paymentId: r.paymentId, chargeId: r.paymentId, status: state, canonicalStatus: state, paymentState: state, checkoutUrl: String(existingPayment?.checkoutUrl || ''), paymentUrl: String(existingPayment?.checkoutUrl || ''), amount: expected, currency: quote.currency, quote, provider: 'tap' });
  }
  if (terminalRetry && Date.parse(quote.expiresAt) <= Date.now()) return out(env, req, { success: false, error: 'Payment quote expired' }, 409);
  if (!isReserved && (String(r.status).toLowerCase() !== 'completed' || !['unpaid', ''].includes(String(r.paymentStatus || '').toLowerCase()))) return out(env, req, { success: false, error: 'Invalid payment state' }, 409);
  if (!raw?.updateTime) return out(env, req, { success: false, error: 'Payment unavailable' }, 503);
  let tapCustomer;
  try { tapCustomer = tapCustomerFromAccount(customerProfile, { email: u.email }); }
  catch { return out(env, req, { success: false, error: 'Payment profile incomplete', code: 'PAYMENT_PROFILE_INCOMPLETE' }, 409); }
  if (!isReserved) {
    try {
      mutationStage(env, 'commit');
      if (reservationConflict) throw new Error('precondition failed');
      const now = new Date().toISOString();
      const writes: any[] = [
        { update: { name: fullName(env, `equipmentRequests/${encodeURIComponent(body.requestId)}`), fields: { paymentStatus: { stringValue: 'pending_payment' }, paymentState: { stringValue: 'pending' }, paymentId: { stringValue: reservation } } }, updateMask: { fieldPaths: ['paymentStatus', 'paymentState', 'paymentId'] }, currentDocument: { updateTime: raw.updateTime } },
      ];
      if (!existingPayment) {
        writes.push(
          quoteWrite(env, body.requestId, r, quote, now),
          { update: { name: fullName(env, `payments/${encodeURIComponent(body.requestId)}`), fields: { requestId: { stringValue: body.requestId }, paymentId: { stringValue: paymentIdForRequest(body.requestId) }, provider: { stringValue: 'tap' }, environment: { stringValue: paymentEnvironment }, state: { stringValue: 'created' }, quoteId: { stringValue: quote.quoteId }, amount: { doubleValue: expected }, currency: { stringValue: 'SAR' }, customerUid: { stringValue: u.uid }, idempotencyKey: { stringValue: idempotencyKey }, attempt: { integerValue: attempt }, ...(quote.commercialSnapshot ? { commercialSnapshot: firestoreValue(quote.commercialSnapshot) } : {}) } }, currentDocument: { exists: false } },
          eventWrite(env, `${body.requestId}:payment_created`, body.requestId, r, 'payment_created', 'created', now),
        );
      } else {
        writes.push(
          { update: { name: fullName(env, `payments/${encodeURIComponent(body.requestId)}`), fields: { state: { stringValue: 'created' }, environment: { stringValue: paymentEnvironment }, idempotencyKey: { stringValue: idempotencyKey }, attempt: { integerValue: attempt }, providerReference: { nullValue: null }, checkoutUrl: { nullValue: null } } }, updateMask: { fieldPaths: ['state', 'environment', 'idempotencyKey', 'attempt', 'providerReference', 'checkoutUrl'] }, currentDocument: { exists: true } },
          eventWrite(env, `${body.requestId}:payment_retry_${attempt}`, body.requestId, r, 'payment_retry', 'created', now),
        );
      }
      writes.push({ update: { name: fullName(env, `paymentIdempotency/${encodeURIComponent(idempotencyKey)}`), fields: { requestId: { stringValue: body.requestId }, customerUid: { stringValue: u.uid }, provider: { stringValue: 'tap' }, environment: { stringValue: paymentEnvironment }, key: { stringValue: idempotencyKey }, attempt: { integerValue: attempt }, state: { stringValue: 'created' } } }, currentDocument: { exists: false } });
      await commitWrites(env, writes);
    } catch {
      const current = await getDoc(env, 'equipmentRequests', body.requestId);
      if (current?.paymentStatus === 'pending_payment' && current.paymentId && !String(current.paymentId).startsWith('reservation:')) return out(env, req, { success: true, paymentId: current.paymentId, chargeId: current.paymentId, status: 'pending', canonicalStatus: 'pending', paymentState: 'pending', amount: expected, currency: 'SAR', quote });
      return out(env, req, { success: false, error: 'Payment reservation conflict' }, 409);
    }
  }
  if (env.__diagnostics?.payment) env.__diagnostics.payment.firestoreBeforeProviderMs = Date.now() - paymentStartedAt;
  const provider = new TapPaymentProvider(tapRuntime.secret, tapRuntime.merchantId);
  const tapMetadata = { requestId: body.requestId, customerUid: u.uid, amount: String(expected), currency: 'SAR', quoteId: quote.quoteId, paymentId: paymentIdForRequest(body.requestId), idempotencyKey, paymentEnvironment };
  const providerStartedAt = Date.now();
  let data; try {
    data = await provider.create({ amount: expected, currency: 'SAR', idempotencyKey, metadata: tapMetadata, requestId: body.requestId, customerUid: u.uid, customer: tapCustomer });
    if (env.__diagnostics) {
      env.__diagnostics.upstreamDurationMs += Date.now() - providerStartedAt;
      env.__diagnostics.upstream = { service: 'tap', operation: 'payment_create', status: 200, ok: true };
      if (env.__diagnostics.payment) env.__diagnostics.payment.providerMs = Date.now() - providerStartedAt;
    }
  } catch {
    if (env.__diagnostics) {
      env.__diagnostics.upstreamDurationMs += Date.now() - providerStartedAt;
      env.__diagnostics.upstream = { service: 'tap', operation: 'payment_create', status: 0, ok: false };
      if (env.__diagnostics.payment) env.__diagnostics.payment.providerMs = Date.now() - providerStartedAt;
    }
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
  if (!data.id || data.amount !== expected || data.currency !== quote.currency ||
      Object.entries(tapMetadata).some(([key, value]) => data.metadata?.[key] !== value)) {
    return out(env, req, { success: false, error: 'Invalid provider response' }, 502);
  }
  const state = stateForProvider(data.status);
  if (!canTransition('created', state)) return out(env, req, { success: false, error: 'Invalid payment transition' }, 409);
  if (['pending', 'requires_action', 'processing'].includes(state) && !data.checkoutUrl) return out(env, req, { success: false, error: 'Invalid provider response' }, 502);
  const reservedRaw = capturedCommits ? { data: { ...r, paymentId: reservation }, updateTime: 'test-reserved' } : await getRawDoc(env, 'equipmentRequests', body.requestId);
  const postProviderStartedAt = Date.now();
  if (!reservedRaw?.updateTime || reservedRaw.data.paymentId !== reservation) return out(env, req, { success: false, error: 'Payment reservation changed' }, 409);
  if (state === 'paid') {
    try {
      await settlePaid(env, body.requestId, reservedRaw, quote, data, 'create', true);
    } catch {
      if (!await fullySettled(env, body.requestId)) {
        return out(env, req, { success: false, paymentId: data.id, chargeId: data.id, status: 'processing', paymentState: 'processing', canonicalStatus: 'processing', error: 'Payment received; settlement pending', retryable: true }, 409);
      }
    }
    if (env.__diagnostics?.payment) env.__diagnostics.payment.firestoreAfterProviderMs = Date.now() - postProviderStartedAt;
    mutationStage(env, 'response');
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
  if (env.__diagnostics?.payment) env.__diagnostics.payment.firestoreAfterProviderMs = Date.now() - postProviderStartedAt;
  mutationStage(env, 'response');
  return out(env, req, { success: true, paymentId: data.id, chargeId: data.id, status: state, providerStatus: data.status, paymentState: state, canonicalStatus: state, checkoutUrl: data.checkoutUrl || '', paymentUrl: data.checkoutUrl || '', quote, amount: data.amount, currency: data.currency, quoteId: quote.quoteId, provider: 'tap' });
}

async function create(req: Request, env: Env, u: User) {
  let body: { requestId?: string; amount?: number; purpose?: string };
  try { body = await req.json() as typeof body; }
  catch { return out(env, req, { success: false, error: 'Invalid payment request' }, 400); }
  if (!body.requestId || Object.keys(body).some(key => !['requestId', 'purpose'].includes(key)) || (body.purpose && body.purpose !== 'equipment_request')) {
    return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  }
  const key = `${u.uid}:${body.requestId}`;
  const existing = paymentCreateInflight.get(key);
  if (existing) return (await existing).clone();
  const operation = createPaymentAttempt({ requestId: body.requestId, purpose: body.purpose }, req, env, u);
  paymentCreateInflight.set(key, operation);
  try { return (await operation).clone(); }
  finally { if (paymentCreateInflight.get(key) === operation) paymentCreateInflight.delete(key); }
}
async function verify(req: Request, env: Env, u: User) {
  const body = await req.json() as { chargeId?: string; paymentId?: string }, chargeId = body.paymentId || body.chargeId;
  if (Object.keys(body).some(key => !['chargeId', 'paymentId'].includes(key))) return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  if (!chargeId) return out(env, req, { success: false, error: 'Invalid payment request' }, 400);
  const persistedPayment = await tapPaymentForCharge(env, chargeId);
  if (!persistedPayment) return out(env, req, { success: false, error: 'Payment unavailable' }, 404);
  const paymentEnvironment = storedPaymentEnvironment(persistedPayment);
  let tapRuntime: ReturnType<typeof tapCredentials>;
  try { tapRuntime = tapCredentials(env, paymentEnvironment); }
  catch { return out(env, req, { success: false, error: 'Payment unavailable' }, 503); }
  let d; try { d = await new TapPaymentProvider(tapRuntime.secret, tapRuntime.merchantId).retrieve(chargeId); } catch { return out(env, req, { success: false, error: 'Payment unavailable' }, 502); }
  const m = d.metadata || {};
  const raw = await getRawDoc(env, 'equipmentRequests', m.requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId);
  let quote: PaymentQuote; const storedQuote = await getDoc(env, 'paymentQuotes', String(m.requestId));
  try { assertSarSettlement(r, e); quote = await lockedPaymentQuote(env, r, e, String(m.requestId), storedQuote); } catch (error) { if (error instanceof Error && error.message === 'FOREIGN_SETTLEMENT_DISABLED') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409); return out(env, req, { success: false, error: 'Invalid payment quote' }, 409); }
  if (quote.currency !== 'SAR') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409);
  const expected = quote.amount;
  if (!owned(u, r) || m.customerUid !== u.uid && !u.admin) return out(env, req, { success: false, error: 'Forbidden' }, 403);
  const payment = await getDoc(env, 'payments', String(m.requestId));
  const reservation = `reservation:${String(m.idempotencyKey || idempotencyKeyForPayment(String(m.customerUid), String(m.requestId)))}`;
  const metadataEnvironmentMatches = m.paymentEnvironment ? normalizeTapEnvironment(m.paymentEnvironment) === paymentEnvironment : paymentEnvironment === 'TEST';
  const valid = !!raw && persistedPayment.requestId === String(m.requestId) && storedPaymentEnvironment(persistedPayment) === paymentEnvironment && metadataEnvironmentMatches && (r?.paymentId === chargeId || r?.paymentId === reservation) && d.id === chargeId && Number(d.amount) === expected && String(m.amount) === String(expected) && m.currency === 'SAR' && d.currency === 'SAR' && m.requestId === String(r?.id || m.requestId) && m.customerUid === r?.customerUid && m.quoteId === quote.quoteId &&
    (!payment || (payment.provider === 'tap' && storedPaymentEnvironment(payment) === paymentEnvironment && (!payment.providerReference || payment.providerReference === chargeId) && Number(payment.amount) === expected && payment.currency === 'SAR' && payment.customerUid === r.customerUid && payment.quoteId === quote.quoteId));
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
  const chargeId = String(body.id || body.chargeId || body.transaction?.id || '');
  if (!chargeId) return out(env, req, { success: false, error: 'Invalid webhook' }, 400);
  const requestIdHint = typeof body?.metadata?.requestId === 'string' ? body.metadata.requestId : typeof body?.transaction?.metadata?.requestId === 'string' ? body.transaction.metadata.requestId : undefined;
  const persistedPayment = await tapPaymentForCharge(env, chargeId, requestIdHint);
  if (!persistedPayment) return out(env, req, { success: false, error: 'Invalid transaction' }, 400);
  const paymentEnvironment = storedPaymentEnvironment(persistedPayment);
  let tapRuntime: ReturnType<typeof tapCredentials>;
  try { tapRuntime = tapCredentials(env, paymentEnvironment); }
  catch { return out(env, req, { success: false, error: 'Payment unavailable' }, 503); }
  let d; try { d = await new TapPaymentProvider(tapRuntime.secret, tapRuntime.merchantId).retrieve(chargeId); } catch { return out(env, req, { success: false, error: 'Invalid transaction' }, 400); }
  const m = d.metadata || {}, requestId = String(m.requestId || '');
  if (!requestId || d.id !== chargeId) return out(env, req, { success: false, error: 'Invalid transaction' }, 400);
  const raw = await getRawDoc(env, 'equipmentRequests', requestId), r = raw?.data, e = r && await getDoc(env, 'equipment', r.equipmentId);
  const storedQuote = await getDoc(env, 'paymentQuotes', requestId);
  let quote; try { assertSarSettlement(r, e); quote = await lockedPaymentQuote(env, r, e, requestId, storedQuote); } catch (error) { if (error instanceof Error && error.message === 'FOREIGN_SETTLEMENT_DISABLED') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409); return out(env, req, { success: false, error: 'Invalid transaction' }, 400); }
  if (quote.currency !== 'SAR') return out(env, req, { success: false, error: 'FOREIGN_SETTLEMENT_DISABLED', code: 'FOREIGN_SETTLEMENT_DISABLED' }, 409);
  const payment = await getDoc(env, 'payments', requestId);
  const reservation = `reservation:${String(m.idempotencyKey || idempotencyKeyForPayment(String(m.customerUid), requestId))}`;
  const metadataEnvironmentMatches = m.paymentEnvironment ? normalizeTapEnvironment(m.paymentEnvironment) === paymentEnvironment : paymentEnvironment === 'TEST';
  const valid = !!r && persistedPayment.requestId === requestId && storedPaymentEnvironment(payment) === paymentEnvironment && metadataEnvironmentMatches && (r.paymentId === chargeId || r.paymentId === reservation) && m.requestId === String(r.id || requestId) && m.customerUid === r.customerUid && m.quoteId === quote.quoteId &&
    m.currency === 'SAR' && d.currency === 'SAR' && String(m.amount) === String(quote.amount) && Number(d.amount) === quote.amount &&
    (!payment || (payment.provider === 'tap' && (!payment.providerReference || payment.providerReference === chargeId) && Number(payment.amount) === quote.amount && payment.currency === 'SAR' && payment.quoteId === quote.quoteId));
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
  mutationStage(env, 'validation');
  const { publicId } = await req.json() as { publicId?: string }; if (!publicId || typeof publicId !== 'string' || publicId.length > 512) return out(env, req, { success: false, error: 'Invalid asset', errorCode: 'ASSET_INVALID' }, 400);
  const folder = env.CLOUDINARY_FOLDER || 'heavyar';
  if (!u.admin && !publicId.startsWith(`${folder}/${u.uid}/`)) return out(env, req, { success: false, error: 'Asset ownership could not be verified', errorCode: 'ASSET_NOT_OWNED' }, 403);
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return out(env, req, { success: false, error: 'Asset service unavailable', errorCode: 'ASSET_SERVICE_UNAVAILABLE' }, 503);
  const timestamp = String(Math.floor(Date.now() / 1000)), digest = await crypto.subtle.digest('SHA-1', enc.encode(`public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`));
  const hex = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join(''), form = new FormData();
  form.append('public_id', publicId); form.append('timestamp', timestamp); form.append('api_key', env.CLOUDINARY_API_KEY); form.append('signature', hex);
  mutationStage(env, 'upload');
  const upstreamStartedAt = Date.now();
  let r: Response;
  try {
    r = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/destroy`, { method: 'POST', body: form });
    if (env.__diagnostics) env.__diagnostics.upstream = { service: 'cloudinary', operation: 'image_delete', status: r.status, ok: r.ok };
  } catch (error) {
    if (env.__diagnostics) env.__diagnostics.upstream = { service: 'cloudinary', operation: 'image_delete', status: 0, ok: false };
    throw error;
  } finally {
    if (env.__diagnostics) env.__diagnostics.upstreamDurationMs += Date.now() - upstreamStartedAt;
  }
  if (r.ok) mutationStage(env, 'response');
  return out(env, req, { success: r.ok, ...(r.ok ? {} : { errorCode: 'CLOUDINARY_DELETE_FAILED' }) }, r.ok ? 200 : 502);
}
async function cloudinaryUpload(req: Request, env: Env, u: User) {
  mutationStage(env, 'validation');
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return out(env, req, { success: false, error: 'Asset service unavailable', errorCode: 'ASSET_SERVICE_UNAVAILABLE' }, 503);
  const declaredLength = Number(req.headers.get('Content-Length') || 0);
  if (!declaredLength || declaredLength > 10 * 1024 * 1024 + 65536) return out(env, req, { success: false, error: 'Upload too large' }, 413);
  const account = u.accountProfile || await getDoc(env, 'users', u.uid);
  if (!u.admin && isOperationallyBlocked(account)) {
    return out(env, req, { success: false, error: 'ACCOUNT_SUSPENDED' }, 403);
  }
  const roleProfile = account?.role === 'driver' ? await getDoc(env, 'driverProfiles', u.uid) : null;
  if (!u.admin && evaluateCanonicalCompleteness(u, account || null, roleProfile).state !== 'authenticated_complete') {
    return out(env, req, { success: false, error: 'Complete your account setup before uploading media.', errorCode: 'PROFILE_REQUIRED' }, 409);
  }
  const ratePath = `cloudinaryUploadRates/${encodeURIComponent(u.uid)}`;
  mutationStage(env, 'quota');
  const reservation = await reserveCloudinaryUploadQuota(env, u.uid, ratePath);
  if (reservation === 'quota_exhausted') return out(env, req, { success: false, error: 'RATE_LIMITED' }, 429);
  if (reservation !== 'quota_reserved') return out(env, req, { success: false, error: 'Upload quota temporarily unavailable', errorCode: 'SERVICE_TEMPORARILY_BUSY' }, 503);
  const now = Date.now();
  mutationStage(env, 'validation');
  const form: any = await req.formData().catch(() => null), file = form?.get('file');
  if (!(file instanceof Blob)) return out(env, req, { success: false, error: 'File required' }, 400);
  const mime = String(file.type || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime)) return out(env, req, { success: false, error: 'Unsupported image type' }, 415);
  if (file.size > 10 * 1024 * 1024) return out(env, req, { success: false, error: 'Upload too large' }, 413);
  const timestamp = String(Math.floor(now / 1000)), folder = `${env.CLOUDINARY_FOLDER || 'heavyar'}/${u.uid}`;
  const digest = await crypto.subtle.digest('SHA-1', enc.encode(`folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`));
  const signature = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
  const upload = new FormData(); upload.append('file', file); upload.append('folder', folder); upload.append('timestamp', timestamp); upload.append('api_key', env.CLOUDINARY_API_KEY); upload.append('signature', signature);
  mutationStage(env, 'upload');
  const upstreamStartedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: upload });
    if (env.__diagnostics) env.__diagnostics.upstream = { service: 'cloudinary', operation: 'image_upload', status: response.status, ok: response.ok };
  } catch (error) {
    if (env.__diagnostics) env.__diagnostics.upstream = { service: 'cloudinary', operation: 'image_upload', status: 0, ok: false };
    throw error;
  } finally {
    if (env.__diagnostics) env.__diagnostics.upstreamDurationMs += Date.now() - upstreamStartedAt;
  }
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.public_id !== 'string' || typeof result.secure_url !== 'string' || !result.public_id.startsWith(`${folder}/`)) return out(env, req, { success: false, error: 'Upload failed', errorCode: 'CLOUDINARY_UPLOAD_FAILED' }, 502);
  mutationStage(env, 'response');
  return out(env, req, { success: true, url: result.secure_url, publicId: result.public_id });
}
async function reserveCloudinaryUploadQuota(env: Env, uid: string, ratePath: string): Promise<'quota_reserved' | 'quota_exhausted' | 'cas_conflict_retry' | 'quota_infrastructure_failure'> {
  const result = await reserveCloudinaryUploadQuotaAttempt({
    uid,
    read: async currentUid => {
      const raw = await getRawDoc(env, 'cloudinaryUploadRates', currentUid);
      return raw ? { ...raw.data, version: raw.updateTime } as CloudinaryQuotaRecord : null;
    },
    write: async reservation => {
      const now = Date.now();
      const fields = {
        uid: { stringValue: uid },
        windowStart: { timestampValue: reservation.windowStart },
        count: { integerValue: String(reservation.count) },
        updatedAt: { timestampValue: new Date(now).toISOString() },
      };
      if (reservation.prior?.version) await compareAndSwap(env, ratePath, reservation.prior.version, fields);
      else await createDoc(env, ratePath, fields);
    },
    isConflict: error => error instanceof FirestorePreconditionError,
  });
  if (env.__diagnostics) {
    env.__diagnostics.quota.reservationOutcome = result.outcome;
    env.__diagnostics.quota.casConflictRetries = result.casConflictRetries || undefined;
    if (result.outcome === 'quota_exhausted') env.__diagnostics.quota.exhausted = true;
    if (result.outcome === 'quota_reserved') {
      env.__diagnostics.cas = 'succeeded';
      env.__diagnostics.firestoreFailure = undefined;
    } else if (result.casConflictRetries) {
      env.__diagnostics.cas = 'conflict';
    }
  }
  return result.outcome;
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
export async function sendResend(env: Env, to: string, subject: string, html: string, idempotencyKey?: string, text?: string): Promise<EmailDeliveryResult> {
  if (!await resendSenderReady(env)) return { delivered: false, provider: 'none', outcome: resendLastOutcome };
  const response = await scheduledExternalFetch(env, 'resend', 'https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) }, body: JSON.stringify({ from: resendFrom(env), to: [to], subject, html, ...(text ? { text } : {}) }) });
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
  const documents = await batchGetRawDocs(env, [
    { collection: 'emailVerificationRateLimits', id: u.uid },
    { collection: 'users', id: u.uid },
    { collection: 'emailVerificationPolicies', id: 'default' },
  ]);
  const rate = documents.get(`emailVerificationRateLimits/${u.uid}`), now = Date.now(), prior = rate?.data;
  if (prior?.nextAllowedAt && Date.parse(String(prior.nextAllowedAt)) > now) return out(env, req, { success: false, error: 'Verification email cooldown active' }, 429);
  const account = documents.get(`users/${u.uid}`)?.data, email = String(u.email || account?.email || account?.emailLower || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return out(env, req, { success: false, error: 'Verification unavailable' }, 503);
  const policy = normalizeEmailVerificationPolicy(documents.get('emailVerificationPolicies/default')?.data);
  const language = account?.language === 'en' || account?.preferredLanguage === 'en' ? 'en' : 'ar';
  const delivery = await deliverEmailVerification(env, email, token, String(account?.nameEn || account?.nameAr || ''), language);
  const reconciled = delivery.provider === 'resend' && delivery.messageId ? await priorResendWebhookEvent(env, delivery.messageId) : null;
  const cooldown = new Date(now + policy.reminderCooldownSeconds * 1000).toISOString();
  await commitWrites(env, [{ update: { name: fullName(env, `emailVerificationRateLimits/${encodeURIComponent(u.uid)}`), fields: { uid: { stringValue: u.uid }, lastSentAt: { timestampValue: new Date(now).toISOString() }, nextAllowedAt: { timestampValue: cooldown }, count: { integerValue: String(Number(prior?.count || 0) + 1) }, ...(delivery.messageId ? { providerMessageId: { stringValue: delivery.messageId }, deliveryStatus: { stringValue: String(reconciled?.status || 'accepted') }, deliveryEventAt: reconciled?.eventAt ? { timestampValue: reconciled.eventAt } : { nullValue: null } } : {}) } }, currentDocument: rate?.updateTime ? { updateTime: rate.updateTime } : { exists: false } }, { update: { name: fullName(env, `emailVerificationEvents/${crypto.randomUUID()}`), fields: { uid: { stringValue: u.uid }, type: { stringValue: 'self_resend' }, delivery: { booleanValue: delivery.delivered }, provider: { stringValue: delivery.provider }, deliveryOutcome: { stringValue: delivery.outcome }, ...(delivery.messageId ? { providerMessageId: { stringValue: delivery.messageId } } : {}), createdAt: { timestampValue: new Date(now).toISOString() } } }, currentDocument: { exists: false } }]);
  if (delivery.provider === 'resend' && delivery.messageId) await reconcileResendWebhookProjection(env, 'emailVerificationRateLimits', u.uid, delivery.messageId);
  return out(env, req, { success: delivery.delivered, accepted: true, deliveryStatus: delivery.delivered ? 'sent' : 'delivery_unavailable', provider: delivery.provider }, delivery.delivered ? 202 : 503);
}
async function emailVerificationStatus(req: Request, env: Env, u: User) {
  const documents = await batchGetRawDocs(env, [
    { collection: 'users', id: u.uid },
    { collection: 'emailVerificationPolicies', id: 'default' },
  ]);
  const profile = documents.get(`users/${u.uid}`)?.data;
  const verified = u.emailVerified === true;
  if (profile && profile.emailVerified !== verified) {
    await patchDoc(env, `users/${encodeURIComponent(u.uid)}`, { emailVerified: { booleanValue: verified }, ...(verified ? { emailVerifiedAt: { timestampValue: new Date().toISOString() } } : {}) }).catch(() => undefined);
  }
  return out(env, req, { success: true, emailVerified: verified, email: u.email || profile?.email || null, policy: normalizeEmailVerificationPolicy(documents.get('emailVerificationPolicies/default')?.data) });
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
  const documents = await batchGetRawDocs(env, [
    { collection: 'heavyarConfig', id: 'auth' },
    { collection: 'emailVerificationPolicies', id: 'default' },
  ]);
  const stored = documents.get('heavyarConfig/auth')?.data;
  const requested = { ...DEFAULT_AUTH_CONFIG, ...(stored || {}) };
  const effective = effectiveAuthConfig(stored, !!env.FIREBASE_WEB_API_KEY && !!env.FIREBASE_PROJECT_ID && !!env.FIREBASE_CLIENT_EMAIL && !!env.FIREBASE_PRIVATE_KEY);
  await resendSenderReady(env);
  const senderDomainVerified = env.RESEND_SENDER_DOMAIN_VERIFIED === 'true' || resendLastDeliverySucceeded;
  const emailVerification = normalizeEmailVerificationPolicy(documents.get('emailVerificationPolicies/default')?.data);
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
  const bases = Object.values(GCC_COUNTRIES);
  const documents = !env.FIREBASE_PROJECT_ID && !firestoreOverride
    ? new Map<string, { data: any; updateTime?: string }>()
    : await batchGetRawDocs(env, bases.map(country => ({ collection: 'countryConfigs', id: country.code })));
  const countries = bases.map(country => {
    const value = resolvedCountrySettings(country, documents.get(`countryConfigs/${country.code}`)?.data);
    return { ...value, nativeCurrency: value.currency, marketplaceAvailable: value.marketplaceAvailable, providerOnboardingAvailable: value.providerOnboardingAvailable };
  });
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
        !isSecuritySuspended(user) &&
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
function complianceFields(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [
    key,
    key.endsWith('At') && typeof item === 'string' && Number.isFinite(Date.parse(item))
      ? { timestampValue: item }
      : firestoreValue(item),
  ]));
}

function participantOwns(record: Record<string, unknown> | null, uid: string) {
  return !!record && ['customerUid', 'providerUid', 'driverUid', 'uid', 'ownerUid'].some(key => record[key] === uid);
}

async function policyAcceptanceApi(req: Request, env: Env, u: User) {
  const profile = u.accountProfile || await getDoc(env, 'users', u.uid);
  const role = String(profile?.role || '') as 'customer' | 'provider' | 'driver';
  if (!['customer', 'provider', 'driver'].includes(role)) return out(env, req, { success: false, errorCode: 'PROFILE_REQUIRED' }, 409);
  const required = requiredPolicyVersions(role);
  if (req.method === 'GET') {
    const rows = await queryOwnedDocuments(env, 'policyAcceptances', u.uid, ['uid']);
    const current = rows.find(row => row.data.acceptanceMode !== LEGACY_POLICY_ACCEPTANCE_MODE
      && row.data.currentPolicyAcceptance !== false
      && acceptanceIsCurrent(row.data, role));
    return out(env, req, {
      success: true,
      current: !!current,
      state: current ? 'current' : LEGACY_POLICY_ACCEPTANCE_MODE,
      legacyCompatibilityEnabled: LEGACY_POLICY_ACCEPTANCE_COMPAT_ENABLED,
      requiredVersions: required,
      latestAcceptance: current ? { id: current.id, acceptedAt: current.data.acceptedAt, appVersion: current.data.appVersion, platform: current.data.platform, locale: current.data.locale } : null,
    });
  }
  const body = await req.json().catch(() => null) as any;
  const allowed = new Set(['accepted', 'legalCapacityConfirmed', 'businessAuthorityConfirmed', 'termsVersion', 'privacyVersion', 'acceptableUseVersion', 'refundPolicyVersion', 'providerTermsVersion', 'driverTermsVersion', 'appVersion', 'platform', 'locale']);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.has(key))) return out(env, req, { success: false, errorCode: 'INVALID_POLICY_ACCEPTANCE' }, 400);
  const acceptance = validatePolicyAcceptance(body, role);
  if (!acceptance) return out(env, req, { success: false, error: 'Current policy acceptance is required', errorCode: 'POLICY_ACCEPTANCE_REQUIRED' }, 400);
  const versionKey = Object.values(required).join(':');
  const id = `${u.uid}:${role}:${versionKey}`;
  const existing = await getRawDoc(env, 'policyAcceptances', id);
  const now = new Date().toISOString();
  if (existing && !acceptanceIsCurrent(existing.data, role)) {
    return out(env, req, { success: false, errorCode: 'POLICY_ACCEPTANCE_RECORD_CONFLICT' }, 409);
  }
  const acceptedAt = existing && typeof existing.data.acceptedAt === 'string' && Number.isFinite(Date.parse(existing.data.acceptedAt))
    ? existing.data.acceptedAt
    : now;
  const profileFields = {
    currentPolicyVersions: firestoreValue(required),
    policyAcceptedAt: { timestampValue: acceptedAt },
    policyAcceptanceState: { stringValue: 'current' },
    legalCapacityConfirmed: { booleanValue: true },
    ...(role === 'provider' ? { businessAuthorityConfirmed: { booleanValue: true } } : {}),
  };
  if (existing) {
    await commitWrites(env, [{ update: { name: fullName(env, `users/${encodeURIComponent(u.uid)}`), fields: profileFields }, updateMask: { fieldPaths: Object.keys(profileFields) } }]);
    return out(env, req, { success: true, alreadyAccepted: true, acceptanceId: id, state: 'current' });
  }
  await commitWrites(env, [
    { update: { name: fullName(env, `policyAcceptances/${encodeURIComponent(id)}`), fields: complianceFields({ uid: u.uid, role, acceptanceMode: CURRENT_POLICY_ACCEPTANCE_MODE, policyVersionStatus: 'current', currentPolicyAcceptance: true, source: 'current_mobile_reacceptance', ...acceptance, acceptedAt: now }) }, currentDocument: { exists: false } },
    { update: { name: fullName(env, `users/${encodeURIComponent(u.uid)}`), fields: profileFields }, updateMask: { fieldPaths: Object.keys(profileFields) } },
  ]);
  return out(env, req, { success: true, acceptanceId: id, state: 'current' });
}

async function ownedComplianceList(req: Request, env: Env, u: User, collection: string, ownershipFields: string[]) {
  const rows = await queryOwnedDocuments(env, collection, u.uid, ownershipFields);
  return out(env, req, { success: true, items: rows.map(row => ({ id: row.id, ...row.data })) });
}

async function privacyRequestApi(req: Request, env: Env, u: User) {
  if (req.method === 'GET') return ownedComplianceList(req, env, u, 'privacyRequests', ['uid']);
  const body = await req.json().catch(() => null) as any;
  const requestType = String(body?.requestType || '');
  const details = String(body?.details || '').trim();
  if (!(PRIVACY_REQUEST_TYPES as readonly string[]).includes(requestType) || details.length > 2000) return out(env, req, { success: false, errorCode: 'INVALID_PRIVACY_REQUEST' }, 400);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await createDoc(env, `privacyRequests/${id}`, complianceFields({ uid: u.uid, requestType, details, status: 'submitted', receivedAt: now, createdAt: now, updatedAt: now, identityVerification: 'authenticated_session' }));
  return out(env, req, { success: true, requestId: id, status: 'submitted' }, 201);
}

async function complaintApi(req: Request, env: Env, u: User) {
  if (req.method === 'GET') return ownedComplianceList(req, env, u, 'complaints', ['customerUid', 'providerUid', 'driverUid', 'requesterUid']);
  const body = await req.json().catch(() => null) as any;
  const requestId = String(body?.requestId || '');
  const category = String(body?.category || 'other').slice(0, 80);
  const narrative = String(body?.narrative || '').trim();
  const rental = requestId ? await getDoc(env, 'equipmentRequests', requestId) : null;
  if (!requestId || !participantOwns(rental, u.uid) || narrative.length < 5 || narrative.length > 4000) return out(env, req, { success: false, errorCode: 'INVALID_COMPLAINT' }, 400);
  const id = crypto.randomUUID(), now = new Date().toISOString(), targets = complaintServiceTargets(now);
  await createDoc(env, `complaints/${id}`, complianceFields({ requesterUid: u.uid, customerUid: rental?.customerUid || null, providerUid: rental?.providerUid || null, driverUid: rental?.driverUid || null, requestId, category, narrative, description: narrative, status: 'submitted', receivedAt: now, createdAt: now, updatedAt: now, ...targets }));
  return out(env, req, { success: true, complaintId: id, status: 'submitted', ...targets }, 201);
}

async function refundCaseApi(req: Request, env: Env, u: User) {
  if (req.method === 'GET') return ownedComplianceList(req, env, u, 'refunds', ['requesterUid', 'customerUid', 'providerUid']);
  const body = await req.json().catch(() => null) as any;
  const paymentId = String(body?.paymentId || ''), inputRequestId = String(body?.requestId || ''), reason = String(body?.reason || '').trim(), evidenceReferences = Array.isArray(body?.evidenceReferences) ? body.evidenceReferences.filter((item: unknown) => typeof item === 'string' && item.length <= 500).slice(0, 10) : [];
  const payment = inputRequestId || paymentId ? await getDoc(env, 'payments', inputRequestId || paymentId) : null;
  if (!payment || !participantOwns(payment, u.uid) || payment.state !== 'paid' || reason.length < 5 || reason.length > 2000) return out(env, req, { success: false, errorCode: 'INVALID_REFUND_CASE' }, 400);
  const requestedAmount = Number(body?.requestedAmount);
  const paidAmount = Number(payment.amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || !Number.isFinite(paidAmount) || requestedAmount > paidAmount) return out(env, req, { success: false, errorCode: 'INVALID_REFUND_AMOUNT' }, 400);
  const requestId = String(payment.requestId || inputRequestId || ''), canonicalPaymentId = String(payment.paymentId || paymentId || ''), id = `refund:${requestId || canonicalPaymentId}`, now = new Date().toISOString();
  if (await getDoc(env, 'refunds', id)) return out(env, req, { success: false, errorCode: 'REFUND_CASE_EXISTS' }, 409);
  await commitWrites(env, [
    { update: { name: fullName(env, `refundReservations/${encodeURIComponent(requestId || canonicalPaymentId)}`), fields: complianceFields({ refundId: id, createdAt: now }) }, currentDocument: { exists: false } },
    { update: { name: fullName(env, `refunds/${encodeURIComponent(id)}`), fields: complianceFields({ requestId, paymentId: canonicalPaymentId, requesterUid: u.uid, customerUid: payment.customerUid || null, providerUid: payment.providerUid || null, reason, evidenceReferences, requestedAmount, originalPaidAmount: paidAmount, currency: payment.currency || 'SAR', eligibleAmount: null, decisionReason: null, state: 'requested', execution: 'manual_only', paymentEnvironment: normalizeTapEnvironment(payment.environment), requestedAt: now, createdAt: now, updatedAt: now }) }, currentDocument: { exists: false } },
  ]);
  return out(env, req, { success: true, refundCaseId: id, state: 'requested' }, 201);
}

async function incidentApi(req: Request, env: Env, u: User) {
  if (req.method === 'GET') return ownedComplianceList(req, env, u, 'incidents', ['reporterUid']);
  const body = await req.json().catch(() => null) as any;
  const requestId = String(body?.requestId || ''), incidentType = String(body?.incidentType || ''), narrative = String(body?.narrative || '').trim(), incidentAt = String(body?.incidentAt || '');
  const rental = requestId ? await getDoc(env, 'equipmentRequests', requestId) : null;
  if (!participantOwns(rental, u.uid) || !(INCIDENT_TYPES as readonly string[]).includes(incidentType) || narrative.length < 5 || narrative.length > 4000 || !Number.isFinite(Date.parse(incidentAt))) return out(env, req, { success: false, errorCode: 'INVALID_INCIDENT' }, 400);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const references = (key: string) => Array.isArray(body?.[key]) ? body[key].filter((item: unknown) => typeof item === 'string' && item.length <= 500).slice(0, 10) : [];
  await createDoc(env, `incidents/${id}`, complianceFields({ requestId, reporterUid: u.uid, incidentType, narrative, incidentAt, evidenceReferences: references('evidenceReferences'), involvedPartyUids: references('involvedPartyUids'), policeAuthorityReference: typeof body?.policeAuthorityReference === 'string' ? body.policeAuthorityReference.slice(0, 300) : null, insurerReference: typeof body?.insurerReference === 'string' ? body.insurerReference.slice(0, 300) : null, status: 'reported', createdAt: now, updatedAt: now }));
  return out(env, req, { success: true, incidentId: id, status: 'reported' }, 201);
}

async function userDataExportApi(req: Request, env: Env, u: User) {
  const user = u.accountProfile || await getDoc(env, 'users', u.uid);
  if (!user) return out(env, req, { success: false, errorCode: 'PROFILE_REQUIRED' }, 409);
  const [requests, complaints, policyAcceptances] = await Promise.all([
    queryOwnedDocuments(env, 'equipmentRequests', u.uid, ['customerUid', 'providerUid', 'driverUid']),
    queryOwnedDocuments(env, 'complaints', u.uid, ['customerUid', 'providerUid', 'driverUid', 'requesterUid']),
    queryOwnedDocuments(env, 'policyAcceptances', u.uid, ['uid']),
  ]);
  const response = out(env, req, { success: true, export: safeUserExport({ user: { uid: u.uid, ...user }, requests: requests.map(row => ({ id: row.id, ...row.data })), complaints: complaints.map(row => ({ id: row.id, ...row.data })), policyAcceptances: policyAcceptances.map(row => ({ id: row.id, ...row.data })) }) });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function processTemporaryComplianceCleanup(env: Env) {
  const now = new Date().toISOString();
  const temporaryCollections = ['temporaryRecovery', 'verificationRateLimits', 'authRecoveryRateLimits', 'emailVerificationRateLimits', 'emailVerificationReminderJobs', 'phoneLoginRateLimits', 'uploadReservations', 'deviceTokens', 'notificationTokenOwners', 'notificationInstallations', 'notificationDeliveries', 'notificationOutbox', 'notifications'];
  for (const collection of temporaryCollections) {
    const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: 'expiresAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: now } } }, limit: 50 } }) }) as any[] || [];
    const writes = rows.filter(row => row.document?.name && row.document?.updateTime).map(row => ({ delete: row.document.name, currentDocument: { updateTime: row.document.updateTime } }));
    if (writes.length) await commitWrites(env, writes);
  }
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
  const legacyAcceptance = LEGACY_POLICY_ACCEPTANCE_COMPAT_ENABLED
    && body.termsAccepted === true
    && body.legalCapacityConfirmed === undefined
    && body.policyAcceptance === undefined;
  const policyAcceptance = validatePolicyAcceptance(body.policyAcceptance, role as 'customer' | 'provider' | 'driver');
  if (!legacyAcceptance && (!policyAcceptance || body.legalCapacityConfirmed !== true)) return out(env, req, { success: false, error: 'Current policy acceptance is required', errorCode: 'POLICY_ACCEPTANCE_REQUIRED', safeToDeleteIdentity: true }, 400);
  const allowed = new Set(['role', 'requestedRole', 'termsAccepted', 'acceptedTerms', 'legalCapacityConfirmed', 'policyAcceptance', 'nameAr', 'nameEn', 'phone', 'countryCode', 'region', 'city', 'customCity', 'crNumber', 'providerType']);
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
   const now = new Date().toISOString(), idToken = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, ''), fields: Record<string, any> = { uid: { stringValue: u.uid }, email: { stringValue: email }, emailLower: { stringValue: email }, emailVerified: { booleanValue: u.emailVerified === true }, emailVerificationVersion: { integerValue: '1' }, nameAr: { stringValue: nameAr }, nameEn: { stringValue: nameEn }, ...(phone ? { phone: { stringValue: phone } } : {}), countryCode: { stringValue: country.code }, currency: { stringValue: country.currency }, region: { stringValue: region }, city: { stringValue: city }, customCity: { stringValue: customCity }, ...(crNumber ? { crNumber: { stringValue: crNumber } } : {}), ...(role === 'provider' ? { providerType: { stringValue: providerType! }, providerOnboardingCompleted: { booleanValue: providerOnboardingCompleted } } : {}), role: { stringValue: role }, requestedRole: { stringValue: role }, termsAccepted: { booleanValue: true }, termsAcceptedAt: { timestampValue: now }, policyAcceptanceState: { stringValue: legacyAcceptance ? LEGACY_POLICY_ACCEPTANCE_MODE : 'current' }, ...(!legacyAcceptance ? { legalCapacityConfirmed: { booleanValue: true }, ...(role === 'provider' ? { businessAuthorityConfirmed: { booleanValue: true } } : {}), currentPolicyVersions: { mapValue: { fields: Object.fromEntries(Object.entries(requiredPolicyVersions(role as 'customer' | 'provider' | 'driver')).map(([key, value]) => [key, { stringValue: value }])) } } } : {}), createdAt: { timestampValue: now } };
  const writes: any[] = [{ update: { name: fullName(env, `users/${encodeURIComponent(u.uid)}`), fields }, currentDocument: existingRaw?.updateTime ? { updateTime: existingRaw.updateTime } : { exists: false } }];
  const acceptanceVersionKey = legacyAcceptance ? LEGACY_POLICY_ACCEPTANCE_MODE : Object.values(requiredPolicyVersions(role as 'customer' | 'provider' | 'driver')).join(':');
  const acceptanceId = `${u.uid}:${role}:${acceptanceVersionKey}`;
  const acceptanceFields = legacyAcceptance
    ? complianceFields({ uid: u.uid, role, acceptanceMode: LEGACY_POLICY_ACCEPTANCE_MODE, termsAccepted: true, acceptedAt: now, source: 'legacy_mobile_registration', policyVersionStatus: 'unversioned', legalCapacityStatus: 'unknown', businessAuthorityStatus: 'unknown', currentPolicyAcceptance: false })
    : complianceFields({ uid: u.uid, role, acceptanceMode: CURRENT_POLICY_ACCEPTANCE_MODE, policyVersionStatus: 'current', currentPolicyAcceptance: true, source: 'current_mobile_registration', ...policyAcceptance!, acceptedAt: now });
  writes.push({ update: { name: fullName(env, `policyAcceptances/${encodeURIComponent(acceptanceId)}`), fields: acceptanceFields }, currentDocument: { exists: false } });
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
  const raw = await getRawDoc(env, 'equipment', id);
  const listing = raw?.data;
  if (!raw?.updateTime || !listing || (listing.ownerUid !== u.uid && !canRentEquipment(u, listing))) return out(env, req, { success: false, error: 'Listing not found' }, 404);
  const url = new URL(req.url);
  const from = url.searchParams.get('from') || '';
  const until = url.searchParams.get('until') || '';
  let availability;
  try {
    availability = validateListingAvailabilityPolicy(listing.availability);
    const requestedWindow = validateListingAvailabilityPolicy({ from, until, blocked: [], temporarilyUnavailable: false });
    const span = Math.round((Date.parse(`${requestedWindow.until}T00:00:00.000Z`) - Date.parse(`${requestedWindow.from}T00:00:00.000Z`)) / 86_400_000);
    if (!requestedWindow.until || span < 0 || span > 366) throw new Error('LISTING_AVAILABILITY_UNAVAILABLE');
  } catch {
    return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'LISTING_AVAILABILITY_UNAVAILABLE' }, 503);
  }
  const market = marketForCountry(String(listing.countryCode || ''));
  const requested = {
    startAt: new Date(Date.parse(`${from}T00:00:00.000Z`) - market.offsetMinutes * 60_000).toISOString(),
    endAt: new Date(Date.parse(`${until}T00:00:00.000Z`) - market.offsetMinutes * 60_000).toISOString(),
  };
  let rows;
  try { rows = await rentalRowsForEquipment(env, id, requested); }
  catch { return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'AVAILABILITY_UNAVAILABLE' }, 503); }
  if (rows.exhausted) return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'AVAILABILITY_CAP_EXHAUSTED' }, 503);
  const rentals = rows.rows.map(row => row.data).filter((x: any) => activeInterval(x));
  let pricingProjection;
  try { pricingProjection = listing.pricingModelVersion === 2 ? { pricingModelVersion: 2, pricing: validateListingPricing(listing.pricing, String(listing.nativeCurrency || listing.currency || '')) } : legacyPricingProjection(listing); }
  catch { pricingProjection = null; }
  return out(env, req, {
    success: true,
    listingId: id,
    revision: raw.updateTime,
    serverNow: new Date().toISOString(),
    window: { from, until },
    availability,
    pricing: pricingProjection,
    activeRentals: rentals.map((x: any) => {
      const interval = activeInterval(x)!;
      return {
        startAt: interval.startAt,
        endAt: interval.endAt,
        state: ['in_progress', 'completion_requested'].includes(String(x.status)) ? 'in_rental' : 'booked',
      };
    }),
  });
}

const OWNER_AVAILABILITY_BLOCK_LIMIT = 60;
const OWNER_AVAILABILITY_BLOCK_MAX_DAYS = 90;

function validateOwnerAvailabilityPolicy(
  value: unknown,
  today: string,
  current?: ReturnType<typeof validateListingAvailabilityPolicy>,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_AVAILABILITY_POLICY');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !['from', 'until', 'blocked', 'temporarilyUnavailable'].includes(key))) {
    throw new Error('INVALID_AVAILABILITY_POLICY');
  }
  const policy = validateListingAvailabilityPolicy(raw);
  if (policy.blocked.length > OWNER_AVAILABILITY_BLOCK_LIMIT) throw new Error('INVALID_AVAILABILITY_POLICY');
  if (!Array.isArray(raw.blocked) || raw.blocked.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry as Record<string, unknown>).some(key => !['from', 'until'].includes(key))
      || typeof (entry as Record<string, unknown>).until !== 'string')) throw new Error('INVALID_AVAILABILITY_POLICY');
  const sorted = [...policy.blocked].sort((left, right) => left.from.localeCompare(right.from));
  for (let index = 0; index < sorted.length; index += 1) {
    const range = sorted[index];
    if (range.from < today && !current?.blocked.some(existing => existing.from === range.from && existing.until === range.until)) {
      throw new Error('INVALID_AVAILABILITY_POLICY');
    }
    const until = range.until!;
    const span = Math.round((Date.parse(`${until}T00:00:00.000Z`) - Date.parse(`${range.from}T00:00:00.000Z`)) / 86_400_000) + 1;
    if (!Number.isSafeInteger(span) || span < 1 || span > OWNER_AVAILABILITY_BLOCK_MAX_DAYS) throw new Error('INVALID_AVAILABILITY_POLICY');
    if (index > 0 && (sorted[index - 1].until || '9999-12-31') >= range.from) throw new Error('INVALID_AVAILABILITY_POLICY');
  }
  return { ...policy, blocked: sorted };
}

function availabilityStructure(policy: ReturnType<typeof validateListingAvailabilityPolicy>) {
  return JSON.stringify({ from: policy.from, until: policy.until || null, blocked: policy.blocked });
}

async function listingAvailabilityUpdate(req: Request, env: Env, u: User, id: string, delegation?: OrganizationDelegationContext, bodyOverride?: any) {
  const body: any = bodyOverride ?? await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['availability', 'expectedRevision'].includes(key))
      || typeof body.expectedRevision !== 'string' || !body.expectedRevision) {
    return out(env, req, { success: false, error: 'Invalid availability update', errorCode: 'INVALID_AVAILABILITY_POLICY' }, 400);
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const transaction = await beginTransaction(env);
    const raw = transaction
      ? await transactionDocument(env, `equipment/${encodeURIComponent(id)}`, transaction)
      : await getRawDoc(env, 'equipment', id);
    const effectiveOwnerUid = delegation?.access.organization.ownerUid || u.uid;
    if (!raw?.updateTime || !raw.data || raw.data.ownerUid !== effectiveOwnerUid) return out(env, req, { success: false, error: 'Listing not found' }, 404);
    if (raw.data.visibility === 'archived') return out(env, req, { success: false, error: 'Listing is archived' }, 409);
    if (raw.updateTime !== body.expectedRevision) return out(env, req, { success: false, error: 'Availability changed; refresh and retry', errorCode: 'AVAILABILITY_UPDATE_CONFLICT' }, 409);
    let current;
    try { current = validateListingAvailabilityPolicy(raw.data.availability); }
    catch { return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'LISTING_AVAILABILITY_UNAVAILABLE' }, 503); }
    const market = marketForCountry(String(raw.data.countryCode || ''));
    const today = new Date(Date.now() + market.offsetMinutes * 60_000).toISOString().slice(0, 10);
    let requested;
    try { requested = validateOwnerAvailabilityPolicy(body.availability, today, current); }
    catch { return out(env, req, { success: false, error: 'Invalid availability update', errorCode: 'INVALID_AVAILABILITY_POLICY' }, 400); }
    if (availabilityStructure(current) !== availabilityStructure(requested)) {
      let activeRows: RentalRowsResult;
      try { activeRows = await rentalRowsForEquipment(env, id, ALL_ACTIVE_RENTAL_INTERVAL, transaction); }
      catch { return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'AVAILABILITY_UNAVAILABLE' }, 503); }
      if (activeRows.exhausted) return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'AVAILABILITY_CAP_EXHAUSTED' }, 503);
      try {
        for (const row of activeRows.rows) {
          const interval = activeInterval(row.data);
          if (!interval) continue;
          if (!interval.endAt) throw new Error('AVAILABILITY_CONFLICT');
          assertListingAvailableForInterval(
            { ...requested, temporarilyUnavailable: false },
            { startAt: interval.startAt, endAt: interval.endAt },
            String(raw.data.countryCode || ''),
          );
        }
      } catch {
        return out(env, req, { success: false, error: 'Availability conflicts with a committed rental', errorCode: 'AVAILABILITY_CONFLICT' }, 409);
      }
    }
    const now = new Date().toISOString();
    const write = {
      update: {
        name: fullName(env, `equipment/${encodeURIComponent(id)}`),
        fields: {
          availability: firestoreValue(requested), updatedAt: { timestampValue: now },
          ...(delegation ? { lastOrganizationOperation: firestoreValue({ actorMemberId: delegation.actorMemberId, action: 'equipment_availability_updated', at: now }) } : {}),
        },
      },
      updateMask: { fieldPaths: ['availability', 'updatedAt', ...(delegation ? ['lastOrganizationOperation'] : [])] },
      currentDocument: { updateTime: raw.updateTime },
    };
    const fencePath = `equipmentBookingFences/${encodeURIComponent(id)}`;
    const fence = transaction
      ? await transactionDocument(env, fencePath, transaction)
      : await getRawDoc(env, 'equipmentBookingFences', id);
    const fenceWrite = {
      update: {
        name: fullName(env, fencePath),
        fields: {
          equipmentId: { stringValue: id },
          revision: { integerValue: String(Number(fence?.data?.revision || 0) + 1) },
          operation: { stringValue: delegation ? 'delegated_availability_update' : 'owner_availability_update' },
          updatedAt: { timestampValue: now },
        },
      },
      currentDocument: fence?.updateTime ? { updateTime: fence.updateTime } : { exists: false },
    };
    try {
      const delegationWrites = delegation ? [
        ...organizationAuthorizationVerifies(env, delegation.access),
        await organizationAuditWrite(env, delegation.access.membership.organizationId, delegation.actorMemberId, u.uid, effectiveOwnerUid, 'equipment_availability_updated', id),
      ] : [];
      await commitWrites(env, [write, fenceWrite, ...delegationWrites], transaction);
      return out(env, req, { success: true, listingId: id, availability: requested, serverNow: now });
    } catch {
      if (delegation) return organizationError(req, env, 'ORGANIZATION_AUTHORIZATION_CHANGED', 409);
      if (attempt === 3) return out(env, req, { success: false, error: 'Availability changed; refresh and retry', errorCode: 'AVAILABILITY_UPDATE_CONFLICT' }, 409);
    }
  }
  return out(env, req, { success: false, error: 'Availability changed; refresh and retry', errorCode: 'AVAILABILITY_UPDATE_CONFLICT' }, 409);
}
async function equipmentSearchRows(env: Env, structuredQuery: FirestoreQuery): Promise<EquipmentSearchRow[]> {
  capturedEquipmentQueries?.push(structuredQuery);
  if (firestoreOverride) {
    const injected = firestoreOverride('__queries', 'equipment');
    let rows = (Array.isArray(injected) ? injected : []).map((item: any) => ({
      name: item.name || fullName(env, `equipment/${encodeURIComponent(String(item.id || 'test'))}`),
      data: item.data || item,
    })).sort((a: EquipmentSearchRow, b: EquipmentSearchRow) => a.name.localeCompare(b.name));
    const query: any = structuredQuery;
    const filters = query?.where?.compositeFilter?.filters || (query?.where?.fieldFilter ? [query.where] : []);
    rows = rows.filter((row: EquipmentSearchRow) => filters.every((filter: any) => {
      const rule = filter.fieldFilter, field = rule?.field?.fieldPath, expected = val(rule?.value);
      return !rule || (rule.op === 'EQUAL' && row.data[field] === expected);
    }));
    const start = query?.startAt?.values?.[0]?.referenceValue;
    if (start) rows = rows.filter((row: EquipmentSearchRow) => row.name > start);
    return rows.slice(0, Number(query?.limit || rows.length));
  }
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) });
  return (result || []).filter((item: any) => item.document).map((item: any) => ({
    name: String(item.document.name || ''),
    data: decode(item.document),
  }));
}

const ORGANIZATION_JSON_LIMIT_BYTES = 24 * 1024;

function organizationDocumentId(name: unknown): string {
  return decodeURIComponent(String(name || '').split('/').pop() || '');
}

function organizationCursor(value: string | null): string | undefined {
  if (!value || value.length > 300) return undefined;
  try {
    const decoded = new TextDecoder().decode(b64(value));
    return decoded.startsWith('projects/') && decoded.includes('/documents/') ? decoded : undefined;
  } catch { return undefined; }
}

function nextOrganizationCursor(name: string | undefined) {
  return name ? b64u(enc.encode(name)) : null;
}

async function organizationQueryRows(
  env: Env,
  collection: string,
  field: string,
  value: string,
  limit = ORGANIZATION_PAGE_SIZE + 1,
  cursor?: string,
): Promise<Array<{ name: string; data: any; updateTime?: string }>> {
  if (firestoreOverride) {
    const injected = firestoreOverride('__queries', collection);
    return (Array.isArray(injected) ? injected : [])
      .map((item: any) => ({ name: item.name || fullName(env, `${collection}/${encodeURIComponent(String(item.id || 'test'))}`), data: item.data || item, updateTime: item.updateTime || 'test-update-time' }))
      .filter((row: any) => row.data?.[field] === value && (!cursor || row.name > cursor))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }
  const structuredQuery: any = {
    from: [{ collectionId: collection }],
    where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit,
  };
  if (cursor) structuredQuery.startAt = { before: false, values: [{ referenceValue: cursor }] };
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) }) as any[] || [];
  return rows.filter(row => row.document).map(row => ({
    name: String(row.document.name || ''),
    data: decode(row.document),
    updateTime: row.document.updateTime as string | undefined,
  }));
}

async function organizationIds(ownerUid: string, memberUid?: string, normalizedEmail?: string) {
  return {
    organizationId: `org_${await hashedId(`organization-owner:${ownerUid}`)}`,
    memberId: memberUid ? `orgmem_${await hashedId(`organization-member:${ownerUid}:${memberUid}`)}` : undefined,
    invitationId: normalizedEmail ? `orginv_${await hashedId(`organization-invitation:${ownerUid}:${normalizedEmail}`)}` : undefined,
  };
}

function randomOrganizationSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function organizationError(req: Request, env: Env, errorCode: string, status: number) {
  return out(env, req, { success: false, error: 'Organization request could not be completed', errorCode }, status);
}

async function organizationBody(req: Request): Promise<Record<string, unknown> | null | 'too_large'> {
  const result = await readBoundedJson(req, ORGANIZATION_JSON_LIMIT_BYTES);
  if (result.status === 'too_large') return 'too_large';
  return result.status === 'ok' && result.value && typeof result.value === 'object' && !Array.isArray(result.value)
    ? result.value as Record<string, unknown>
    : null;
}

function organizationWrite(path: string, env: Env, value: Record<string, unknown>, updateTime?: string) {
  const fields = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)]));
  return {
    update: { name: fullName(env, path), fields },
    ...(updateTime ? { updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime } } : { currentDocument: { exists: false } }),
  };
}

type OrganizationAccessContext = {
  organization: any;
  organizationRaw: { data: any; updateTime?: string };
  membership: any;
  membershipRaw: { data: any; updateTime?: string };
  membershipId: string;
  account: any;
  accountRaw?: { data: any; updateTime?: string } | null;
};

type OrganizationDelegationContext = {
  access: OrganizationAccessContext;
  actorMemberId: string;
  capability: OrganizationCapability;
};

async function organizationAuditWrite(
  env: Env,
  organizationId: string,
  actorMemberId: string,
  actorUid: string,
  ownerUid: string,
  action: string,
  targetId?: string,
  metadata?: Record<string, string | number | boolean>,
) {
  const now = new Date().toISOString();
  const id = await hashedId(`organization-audit:${organizationId}:${action}:${targetId || ''}:${now}:${crypto.randomUUID()}`);
  return organizationWrite(`organizationAudit/orgaudit_${id}`, env, {
    organizationId, actorMemberId, actorUid, ownerUid, action, ...(targetId ? { targetId } : {}),
    ...(metadata && Object.keys(metadata).length ? { metadata } : {}), createdAt: now,
  });
}

function organizationAuthorizationVerifies(env: Env, access: OrganizationAccessContext) {
  const writes: any[] = [];
  if (access.organizationRaw.updateTime) writes.push({ verify: fullName(env, `organizations/${access.membership.organizationId}`), currentDocument: { updateTime: access.organizationRaw.updateTime } });
  if (access.membershipRaw.updateTime) writes.push({ verify: fullName(env, `organizationMemberships/${access.membershipId}`), currentDocument: { updateTime: access.membershipRaw.updateTime } });
  if (access.accountRaw?.updateTime && typeof access.membership.uid === 'string') writes.push({ verify: fullName(env, `users/${encodeURIComponent(access.membership.uid)}`), currentDocument: { updateTime: access.accountRaw.updateTime } });
  return writes;
}

async function organizationAccess(
  env: Env,
  user: User,
  organizationId: string,
  capability?: OrganizationCapability,
): Promise<OrganizationAccessContext | null> {
  if (!safeOrganizationId(organizationId)) return null;
  const organizationRaw = await getRawDoc(env, 'organizations', organizationId);
  if (!organizationRaw?.data || organizationRaw.data.status !== 'active') return null;
  const ids = await organizationIds(String(organizationRaw.data.ownerUid || ''), user.uid);
  if (!ids.memberId) return null;
  const [membershipRaw, fetchedAccountRaw] = await Promise.all([
    getRawDoc(env, 'organizationMemberships', ids.memberId),
    user.accountProfileRaw ? Promise.resolve(user.accountProfileRaw) : getRawDoc(env, 'users', user.uid),
  ]);
  const accountRaw = fetchedAccountRaw || user.accountProfileRaw || null;
  const account = accountRaw?.data || user.accountProfile;
  const membership = membershipRaw?.data;
  if (!membership || membership.organizationId !== organizationId || membership.uid !== user.uid || membership.status !== 'active' ||
      membership.accountPurpose !== organizationRaw.data.accountPurpose || organizationAccountPurpose(account) !== organizationRaw.data.accountPurpose ||
      !isOrganizationAccountEligible(account) || capability && !organizationMemberCan(membership, capability)) return null;
  return { organization: organizationRaw.data, organizationRaw, membership, membershipRaw: membershipRaw!, membershipId: ids.memberId, account, accountRaw };
}

async function organizationIndex(req: Request, env: Env, user: User) {
  const account = user.accountProfile || await getDoc(env, 'users', user.uid);
  if (!isOrganizationAccountEligible(account)) return organizationError(req, env, 'ORGANIZATION_ACCOUNT_INELIGIBLE', 403);
  if (req.method === 'POST') {
    const limit = await allowAuthenticatedMutation(env, user.uid, 'organization_provision');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many organization requests');
    if (limited) return limited;
    if (!isCompanyProvider(account)) return organizationError(req, env, 'COMPANY_PROVIDER_REQUIRED', 403);
    const ids = await organizationIds(user.uid, user.uid);
    const now = new Date().toISOString(), purpose = organizationAccountPurpose(account);
    const organizationValue = {
      ownerUid: user.uid, status: 'active', accountPurpose: purpose,
      displayName: organizationDisplayName(account, 'Company'), verificationStatus: 'unverified', legalAuthorityVerified: false,
      createdAt: now, updatedAt: now,
    };
    const ownerMembershipValue = {
      organizationId: ids.organizationId, uid: user.uid, role: 'owner', status: 'active', capabilities: [], accountPurpose: purpose,
      createdAt: now, updatedAt: now,
    };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const transaction = await beginTransaction(env);
      const organizationRaw = transaction ? await transactionDocument(env, `organizations/${ids.organizationId}`, transaction) : await getRawDoc(env, 'organizations', ids.organizationId);
      const membershipRaw = transaction ? await transactionDocument(env, `organizationMemberships/${ids.memberId}`, transaction) : await getRawDoc(env, 'organizationMemberships', ids.memberId!);
      if (organizationRaw && (organizationRaw.data.ownerUid !== user.uid || organizationRaw.data.accountPurpose !== purpose || organizationRaw.data.status !== 'active')) return organizationError(req, env, 'ORGANIZATION_CONFLICT', 409);
      if (membershipRaw && (membershipRaw.data.uid !== user.uid || membershipRaw.data.organizationId !== ids.organizationId || membershipRaw.data.role !== 'owner' || membershipRaw.data.status !== 'active')) return organizationError(req, env, 'ORGANIZATION_CONFLICT', 409);
      const writes: any[] = [];
      if (!organizationRaw) writes.push(organizationWrite(`organizations/${ids.organizationId}`, env, organizationValue));
      if (!membershipRaw) writes.push(organizationWrite(`organizationMemberships/${ids.memberId}`, env, ownerMembershipValue));
      if (!writes.length) return out(env, req, { success: true, organization: organizationProjection(ids.organizationId, organizationRaw!.data, membershipRaw!.data), alreadyProvisioned: true });
      writes.push(await organizationAuditWrite(env, ids.organizationId, ids.memberId!, user.uid, user.uid, 'organization_provisioned'));
      try {
        await commitWrites(env, writes, transaction);
        return out(env, req, { success: true, organization: organizationProjection(ids.organizationId, organizationRaw?.data || organizationValue, membershipRaw?.data || ownerMembershipValue), alreadyProvisioned: false }, 201);
      } catch (error) {
        if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
      }
    }
    return organizationError(req, env, 'ORGANIZATION_CONFLICT', 409);
  }
  const cursor = organizationCursor(new URL(req.url).searchParams.get('cursor'));
  const rows = await organizationQueryRows(env, 'organizationMemberships', 'uid', user.uid, ORGANIZATION_PAGE_SIZE + 1, cursor);
  const rawPage = rows.slice(0, ORGANIZATION_PAGE_SIZE);
  const activeRows = rawPage.filter(row => row.data.uid === user.uid && row.data.status === 'active' && row.data.accountPurpose === organizationAccountPurpose(account));
  const organizations = await batchGetRawDocs(env, activeRows.map(row => ({ collection: 'organizations', id: String(row.data.organizationId || '') })));
  const result = activeRows.flatMap(row => {
    const id = String(row.data.organizationId || ''), organization = organizations.get(`organizations/${id}`)?.data;
    return organization?.status === 'active' && organization.accountPurpose === row.data.accountPurpose
      ? [organizationProjection(id, organization, row.data)]
      : [];
  });
  return out(env, req, { success: true, organizations: result, nextCursor: rows.length > ORGANIZATION_PAGE_SIZE ? nextOrganizationCursor(rawPage.at(-1)?.name) : null });
}

function organizationProjection(id: string, organization: any, membership: any) {
  return {
    id,
    displayName: typeof organization?.displayName === 'string' ? organization.displayName : '',
    verificationStatus: organization?.verificationStatus === 'verified' ? 'verified' : 'unverified',
    legalAuthorityVerified: organization?.legalAuthorityVerified === true,
    memberRole: membership?.role === 'owner' ? 'owner' : 'employee',
    capabilities: normalizeOrganizationCapabilities(membership?.capabilities) || [],
  };
}

async function organizationMembers(req: Request, env: Env, user: User, organizationId: string) {
  const access = await organizationAccess(env, user, organizationId);
  if (!access || access.membership.role !== 'owner') return organizationError(req, env, 'ORGANIZATION_OWNER_REQUIRED', 403);
  const cursor = organizationCursor(new URL(req.url).searchParams.get('cursor'));
  const rows = await organizationQueryRows(env, 'organizationMemberships', 'organizationId', organizationId, ORGANIZATION_PAGE_SIZE + 1, cursor);
  const page = rows.slice(0, ORGANIZATION_PAGE_SIZE);
  const accounts = await batchGetRawDocs(env, page.map(row => ({ collection: 'users', id: String(row.data.uid || '') })));
  return out(env, req, { success: true, members: page.map(row => ({
    id: organizationDocumentId(row.name), role: row.data.role === 'owner' ? 'owner' : 'employee',
    status: ['active', 'revoked'].includes(row.data.status) ? row.data.status : 'revoked',
    displayName: organizationDisplayName(accounts.get(`users/${row.data.uid}`)?.data, row.data.role === 'owner' ? 'Company owner' : 'Team member'),
    capabilities: normalizeOrganizationCapabilities(row.data.capabilities) || [], revision: row.updateTime,
    createdAt: row.data.createdAt, updatedAt: row.data.updatedAt,
  })), nextCursor: rows.length > ORGANIZATION_PAGE_SIZE ? nextOrganizationCursor(page.at(-1)?.name) : null });
}

async function organizationUpdateMemberCapabilities(req: Request, env: Env, user: User, organizationId: string, memberId: string) {
  if (!safeOrganizationMemberId(memberId)) return organizationError(req, env, 'MEMBER_NOT_FOUND', 404);
  const access = await organizationAccess(env, user, organizationId);
  if (!access || access.membership.role !== 'owner') return organizationError(req, env, 'ORGANIZATION_OWNER_REQUIRED', 403);
  const rateLimit = await allowAuthenticatedMutation(env, user.uid, 'organization_membership');
  const limited = authenticatedMutationRateLimitResponse(req, env, rateLimit, 'Too many membership requests');
  if (limited) return limited;
  const body = await organizationBody(req);
  if (body === 'too_large') return payloadTooLargeResponse(req, env);
  if (!body || Object.keys(body).some(key => !['capabilities', 'expectedRevision'].includes(key)) || typeof body.expectedRevision !== 'string') {
    return organizationError(req, env, 'INVALID_MEMBERSHIP_UPDATE', 400);
  }
  const capabilities = normalizeOrganizationCapabilities(body.capabilities);
  if (!capabilities) return organizationError(req, env, 'INVALID_MEMBERSHIP_UPDATE', 400);
  const member = await getRawDoc(env, 'organizationMemberships', memberId);
  if (!member?.data || member.data.organizationId !== organizationId || member.data.role !== 'employee') return organizationError(req, env, 'MEMBER_NOT_FOUND', 404);
  if (member.data.uid === user.uid) return organizationError(req, env, 'MEMBER_SELF_MODIFICATION_DENIED', 403);
  if (member.data.status !== 'active') return organizationError(req, env, 'MEMBER_NOT_ACTIVE', 409);
  if (!member.updateTime || member.updateTime !== body.expectedRevision) return organizationError(req, env, 'MEMBERSHIP_UPDATE_CONFLICT', 409);
  const now = new Date().toISOString();
  const fields = { capabilities: firestoreValue(capabilities), updatedAt: { timestampValue: now } };
  const writes = [
    { update: { name: fullName(env, `organizationMemberships/${memberId}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: member.updateTime } },
    ...organizationAuthorizationVerifies(env, access),
    await organizationAuditWrite(env, organizationId, access.membershipId, user.uid, access.organization.ownerUid, 'member_capabilities_updated', memberId, { capabilityCount: capabilities.length }),
  ];
  try { await commitWrites(env, writes); }
  catch { return organizationError(req, env, 'MEMBERSHIP_UPDATE_CONFLICT', 409); }
  return out(env, req, { success: true, status: 'updated', serverNow: now });
}

async function organizationInvitations(req: Request, env: Env, user: User, organizationId: string) {
  const access = await organizationAccess(env, user, organizationId);
  if (!access || access.membership.role !== 'owner') return organizationError(req, env, 'ORGANIZATION_OWNER_REQUIRED', 403);
  if (req.method === 'GET') {
    const cursor = organizationCursor(new URL(req.url).searchParams.get('cursor'));
    const rows = await organizationQueryRows(env, 'organizationInvitations', 'organizationId', organizationId, ORGANIZATION_PAGE_SIZE + 1, cursor);
    const page = rows.slice(0, ORGANIZATION_PAGE_SIZE);
    return out(env, req, { success: true, invitations: page.map(row => ({
      id: organizationDocumentId(row.name), emailHint: String(row.data.emailHint || ''),
      status: row.data.status === 'pending' && !organizationInvitationIsAcceptable(row.data, Date.now()) ? 'expired' : String(row.data.status || 'cancelled'),
      capabilities: normalizeOrganizationCapabilities(row.data.capabilities) || [], expiresAt: row.data.expiresAt, createdAt: row.data.createdAt,
    })), nextCursor: rows.length > ORGANIZATION_PAGE_SIZE ? nextOrganizationCursor(page.at(-1)?.name) : null });
  }
  const rateLimit = await allowAuthenticatedMutation(env, user.uid, 'organization_invite');
  const limited = authenticatedMutationRateLimitResponse(req, env, rateLimit, 'Too many invitation requests');
  if (limited) return limited;
  const body = await organizationBody(req);
  if (body === 'too_large') return payloadTooLargeResponse(req, env);
  if (!body || Object.keys(body).some(key => !['email', 'capabilities'].includes(key))) return organizationError(req, env, 'INVALID_INVITATION', 400);
  const email = normalizeOrganizationEmail(body.email), capabilities = normalizeOrganizationCapabilities(body.capabilities);
  if (!email || !capabilities) return organizationError(req, env, 'INVALID_INVITATION', 400);
  if (user.emailVerified === true && normalizeOrganizationEmail(user.email) === email) return organizationError(req, env, 'OWNER_CANNOT_INVITE_SELF', 409);
  const emailHash = await hashedId(`organization-email:${email}`), ids = await organizationIds(access.organization.ownerUid, undefined, email);
  const invitationId = ids.invitationId!, secret = randomOrganizationSecret(), tokenHash = await hashedId(`organization-invitation-token:${secret}`);
  const nowMs = Date.now(), now = new Date(nowMs).toISOString(), expiresAt = new Date(nowMs + ORGANIZATION_INVITATION_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const transaction = await beginTransaction(env);
    const prior = transaction ? await transactionDocument(env, `organizationInvitations/${invitationId}`, transaction) : await getRawDoc(env, 'organizationInvitations', invitationId);
    if (prior && organizationInvitationIsAcceptable(prior.data, nowMs)) return organizationError(req, env, 'INVITATION_ALREADY_PENDING', 409);
    const value = {
      organizationId, emailHash, emailHint: maskOrganizationEmail(email), tokenHash, status: 'pending', capabilities,
      accountPurpose: access.organization.accountPurpose, expiresAt, createdAt: prior?.data?.createdAt || now, updatedAt: now,
    };
    const actorMemberId = `orgmem_${await hashedId(`organization-member:${access.organization.ownerUid}:${user.uid}`)}`;
    const writes = [organizationWrite(`organizationInvitations/${invitationId}`, env, value, prior?.updateTime), ...organizationAuthorizationVerifies(env, access), await organizationAuditWrite(env, organizationId, actorMemberId, user.uid, access.organization.ownerUid, 'invitation_created', invitationId)];
    try {
      await commitWrites(env, writes, transaction);
      return out(env, req, { success: true, invitation: { id: invitationId, emailHint: value.emailHint, capabilities, expiresAt }, token: `${invitationId}.${secret}` }, 201);
    } catch (error) {
      if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
    }
  }
  return organizationError(req, env, 'INVITATION_CONFLICT', 409);
}

async function organizationAcceptInvitation(req: Request, env: Env, user: User) {
  const rateLimit = await allowAuthenticatedMutation(env, user.uid, 'organization_membership');
  const limited = authenticatedMutationRateLimitResponse(req, env, rateLimit, 'Too many membership requests');
  if (limited) return limited;
  const body = await organizationBody(req);
  if (body === 'too_large') return payloadTooLargeResponse(req, env);
  if (!body || Object.keys(body).some(key => key !== 'token')) return organizationError(req, env, 'INVALID_INVITATION', 400);
  const parts = organizationTokenParts(body.token), email = normalizeOrganizationEmail(user.email);
  if (!parts || !email || user.emailVerified !== true) return organizationError(req, env, 'VERIFIED_EMAIL_REQUIRED', 403);
  const account = user.accountProfile || await getDoc(env, 'users', user.uid);
  if (!isOrganizationAccountEligible(account)) return organizationError(req, env, 'ORGANIZATION_ACCOUNT_INELIGIBLE', 403);
  const emailHash = await hashedId(`organization-email:${email}`), tokenHash = await hashedId(`organization-invitation-token:${parts.secret}`), nowMs = Date.now(), now = new Date(nowMs).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const transaction = await beginTransaction(env);
    const invitation = transaction ? await transactionDocument(env, `organizationInvitations/${parts.invitationId}`, transaction) : await getRawDoc(env, 'organizationInvitations', parts.invitationId);
    if (!invitation?.data || invitation.data.emailHash !== emailHash || invitation.data.tokenHash !== tokenHash || !organizationInvitationIsAcceptable(invitation.data, nowMs)) return organizationError(req, env, 'INVITATION_INVALID_OR_EXPIRED', 403);
    const organization = transaction ? await transactionDocument(env, `organizations/${invitation.data.organizationId}`, transaction) : await getRawDoc(env, 'organizations', invitation.data.organizationId);
    if (!organization?.data || organization.data.status !== 'active' || organization.data.accountPurpose !== invitation.data.accountPurpose || organizationAccountPurpose(account) !== invitation.data.accountPurpose) return organizationError(req, env, 'ORGANIZATION_ACCESS_DENIED', 403);
    const ids = await organizationIds(organization.data.ownerUid, user.uid);
    const priorMember = transaction ? await transactionDocument(env, `organizationMemberships/${ids.memberId}`, transaction) : await getRawDoc(env, 'organizationMemberships', ids.memberId!);
    if (priorMember?.data?.role === 'owner' || priorMember?.data?.organizationId && priorMember.data.organizationId !== invitation.data.organizationId) return organizationError(req, env, 'MEMBERSHIP_CONFLICT', 409);
    const capabilities = normalizeOrganizationCapabilities(invitation.data.capabilities);
    if (!capabilities) return organizationError(req, env, 'INVITATION_INVALID_OR_EXPIRED', 403);
    const memberValue = { organizationId: invitation.data.organizationId, uid: user.uid, role: 'employee', status: 'active', capabilities, accountPurpose: invitation.data.accountPurpose, createdAt: priorMember?.data?.createdAt || now, updatedAt: now };
    const inviteValue = { ...invitation.data, tokenHash: '', status: 'accepted', acceptedMemberId: ids.memberId, acceptedAt: now, updatedAt: now };
    const writes = [organizationWrite(`organizationMemberships/${ids.memberId}`, env, memberValue, priorMember?.updateTime), organizationWrite(`organizationInvitations/${parts.invitationId}`, env, inviteValue, invitation.updateTime), await organizationAuditWrite(env, invitation.data.organizationId, ids.memberId!, user.uid, organization.data.ownerUid, 'invitation_accepted', parts.invitationId)];
    try {
      await commitWrites(env, writes, transaction);
      return out(env, req, { success: true, organization: organizationProjection(invitation.data.organizationId, organization.data, memberValue) });
    } catch (error) {
      if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
    }
  }
  return organizationError(req, env, 'MEMBERSHIP_CONFLICT', 409);
}

async function organizationCancelInvitation(req: Request, env: Env, user: User, organizationId: string, invitationId: string) {
  if (!safeOrganizationInvitationId(invitationId)) return organizationError(req, env, 'INVITATION_NOT_FOUND', 404);
  const access = await organizationAccess(env, user, organizationId);
  if (!access || access.membership.role !== 'owner') return organizationError(req, env, 'ORGANIZATION_OWNER_REQUIRED', 403);
  const rateLimit = await allowAuthenticatedMutation(env, user.uid, 'organization_membership');
  const limited = authenticatedMutationRateLimitResponse(req, env, rateLimit, 'Too many membership requests');
  if (limited) return limited;
  const invitation = await getRawDoc(env, 'organizationInvitations', invitationId);
  if (!invitation?.data || invitation.data.organizationId !== organizationId) return organizationError(req, env, 'INVITATION_NOT_FOUND', 404);
  if (invitation.data.status === 'cancelled') return out(env, req, { success: true, status: 'cancelled' });
  if (invitation.data.status !== 'pending') return organizationError(req, env, 'INVITATION_NOT_PENDING', 409);
  const now = new Date().toISOString(), fields = { status: { stringValue: 'cancelled' }, tokenHash: { stringValue: '' }, cancelledAt: { timestampValue: now }, updatedAt: { timestampValue: now } };
  await commitWrites(env, [{ update: { name: fullName(env, `organizationInvitations/${invitationId}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: invitation.updateTime! } }, ...organizationAuthorizationVerifies(env, access), await organizationAuditWrite(env, organizationId, access.membershipId, user.uid, access.organization.ownerUid, 'invitation_cancelled', invitationId)]);
  return out(env, req, { success: true, status: 'cancelled' });
}

async function organizationRevokeMember(req: Request, env: Env, user: User, organizationId: string, memberId: string) {
  if (!safeOrganizationMemberId(memberId)) return organizationError(req, env, 'MEMBER_NOT_FOUND', 404);
  const access = await organizationAccess(env, user, organizationId);
  if (!access || access.membership.role !== 'owner') return organizationError(req, env, 'ORGANIZATION_OWNER_REQUIRED', 403);
  const rateLimit = await allowAuthenticatedMutation(env, user.uid, 'organization_membership');
  const limited = authenticatedMutationRateLimitResponse(req, env, rateLimit, 'Too many membership requests');
  if (limited) return limited;
  const member = await getRawDoc(env, 'organizationMemberships', memberId);
  if (!member?.data || member.data.organizationId !== organizationId) return organizationError(req, env, 'MEMBER_NOT_FOUND', 404);
  if (member.data.role === 'owner') return organizationError(req, env, 'SOLE_OWNER_PROTECTED', 409);
  if (member.data.status === 'revoked') return out(env, req, { success: true, status: 'revoked' });
  const now = new Date().toISOString(), fields = { status: { stringValue: 'revoked' }, capabilities: { arrayValue: { values: [] } }, revokedAt: { timestampValue: now }, updatedAt: { timestampValue: now } };
  await commitWrites(env, [{ update: { name: fullName(env, `organizationMemberships/${memberId}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: member.updateTime! } }, ...organizationAuthorizationVerifies(env, access), await organizationAuditWrite(env, organizationId, access.membershipId, user.uid, access.organization.ownerUid, 'member_revoked', memberId)]);
  return out(env, req, { success: true, status: 'revoked' });
}

async function organizationWorkspace(req: Request, env: Env, user: User, organizationId: string, kind: 'equipment' | 'bookings') {
  const capability: OrganizationCapability = kind === 'equipment' ? 'equipment.view' : 'bookings.view';
  const access = await organizationAccess(env, user, organizationId, capability);
  if (!access) return organizationError(req, env, 'ORGANIZATION_CAPABILITY_REQUIRED', 403);
  const cursor = organizationCursor(new URL(req.url).searchParams.get('cursor'));
  const collection = kind === 'equipment' ? 'equipment' : 'equipmentRequests', field = kind === 'equipment' ? 'ownerUid' : 'providerUid';
  const rows = await organizationQueryRows(env, collection, field, access.organization.ownerUid, ORGANIZATION_PAGE_SIZE + 1, cursor);
  const page = rows.slice(0, ORGANIZATION_PAGE_SIZE);
  const items = kind === 'equipment' ? page.map(row => ({
    id: organizationDocumentId(row.name), publicEquipmentNumber: row.data.publicEquipmentNumber || null,
    revision: row.updateTime || null,
    titleAr: String(row.data.titleAr || row.data.title || ''), titleEn: String(row.data.titleEn || row.data.title || ''),
    descriptionAr: String(row.data.descriptionAr || row.data.description || ''), descriptionEn: String(row.data.descriptionEn || row.data.description || ''),
    category: String(row.data.category || ''), isActive: row.data.isActive === true,
    moderationStatus: String(row.data.moderationStatus || ''), availability: row.data.availability || null,
    lastOrganizationOperation: row.data.lastOrganizationOperation || null,
  })) : page.map(row => ({
    id: organizationDocumentId(row.name), publicRequestNumber: row.data.publicRequestNumber || null, status: String(row.data.status || ''),
    pricingModelVersion: row.data.pricingModelVersion === 2 ? 2 : 1,
    equipmentTitleAr: String(row.data.equipmentSnapshot?.titleAr || row.data.equipmentNameAr || ''),
    equipmentTitleEn: String(row.data.equipmentSnapshot?.titleEn || row.data.equipmentNameEn || ''),
    requestedStartAt: row.data.requestedStartAt || row.data.startDate || null, requestedEndAt: row.data.requestedEndAt || row.data.endDate || null,
    lastOrganizationOperation: row.data.lastOrganizationOperation || null,
  }));
  return out(env, req, { success: true, items, nextCursor: rows.length > ORGANIZATION_PAGE_SIZE ? nextOrganizationCursor(page.at(-1)?.name) : null });
}

function delegatedMetadataPatch(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const allowed = ['titleAr', 'titleEn', 'descriptionAr', 'descriptionEn'];
  if (!Object.keys(raw).length || Object.keys(raw).some(key => !allowed.includes(key))) return null;
  const result: Record<string, string> = {};
  for (const [key, input] of Object.entries(raw)) {
    if (typeof input !== 'string' || /[\u0000-\u001f\u007f]/.test(input)) return null;
    const text = input.trim();
    const title = key === 'titleAr' || key === 'titleEn';
    if (title ? text.length < 2 || text.length > 120 : text.length > 1000) return null;
    result[key] = text;
  }
  return result;
}

async function organizationEquipmentMetadata(req: Request, env: Env, user: User, organizationId: string, equipmentId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(equipmentId)) return organizationError(req, env, 'EQUIPMENT_NOT_FOUND', 404);
  const access = await organizationAccess(env, user, organizationId, 'equipment.manage');
  if (!access) return organizationError(req, env, 'ORGANIZATION_CAPABILITY_REQUIRED', 403);
  const limit = await allowAuthenticatedMutation(env, user.uid, 'organization_equipment');
  const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many equipment updates');
  if (limited) return limited;
  const body = await organizationBody(req);
  if (body === 'too_large') return payloadTooLargeResponse(req, env);
  if (!body || Object.keys(body).some(key => !['expectedRevision', 'patch'].includes(key)) || typeof body.expectedRevision !== 'string') {
    return organizationError(req, env, 'INVALID_EQUIPMENT_UPDATE', 400);
  }
  const patch = delegatedMetadataPatch(body.patch);
  if (!patch) return organizationError(req, env, 'INVALID_EQUIPMENT_UPDATE', 400);
  const transaction = await beginTransaction(env);
  const raw = transaction
    ? await transactionDocument(env, `equipment/${encodeURIComponent(equipmentId)}`, transaction)
    : await getRawDoc(env, 'equipment', equipmentId);
  if (!raw?.data || !raw.updateTime || raw.data.ownerUid !== access.organization.ownerUid) return organizationError(req, env, 'EQUIPMENT_NOT_FOUND', 404);
  if (raw.data.visibility === 'archived') return organizationError(req, env, 'EQUIPMENT_ARCHIVED', 409);
  if (raw.updateTime !== body.expectedRevision) return organizationError(req, env, 'EQUIPMENT_UPDATE_CONFLICT', 409);
  let activeRows: RentalRowsResult;
  try { activeRows = await rentalRowsForEquipment(env, equipmentId, ALL_ACTIVE_RENTAL_INTERVAL, transaction); }
  catch { return organizationError(req, env, 'AVAILABILITY_UNAVAILABLE', 503); }
  if (activeRows.exhausted) return organizationError(req, env, 'AVAILABILITY_CAP_EXHAUSTED', 503);
  if (hasActiveRental(activeRows.rows.map(row => row.data))) return organizationError(req, env, 'LISTING_EDIT_LOCKED', 409);
  const now = new Date().toISOString();
  const effectivePatch: Record<string, unknown> = { ...patch };
  if (requiresListingRereview(raw.data, effectivePatch)) {
    Object.assign(effectivePatch, { moderationStatus: 'pending_review', moderationReason: '', isActive: false, visibility: 'hidden', reviewedBy: '', reviewedAt: null });
  }
  const lastOrganizationOperation = { actorMemberId: access.membershipId, action: 'equipment_metadata_updated', at: now };
  const fields = Object.fromEntries(Object.entries({ ...effectivePatch, lastOrganizationOperation, updatedAt: now }).map(([key, value]) => [key, firestoreValue(value)]));
  const writes = [
    { update: { name: fullName(env, `equipment/${encodeURIComponent(equipmentId)}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: raw.updateTime } },
    ...organizationAuthorizationVerifies(env, access),
    await organizationAuditWrite(env, organizationId, access.membershipId, user.uid, access.organization.ownerUid, 'equipment_metadata_updated', equipmentId, { fieldCount: Object.keys(patch).length }),
  ];
  try { await commitWrites(env, writes, transaction); }
  catch { return organizationError(req, env, 'EQUIPMENT_UPDATE_CONFLICT', 409); }
  return out(env, req, { success: true, listingId: equipmentId, serverNow: now });
}

async function organizationEquipmentAvailability(req: Request, env: Env, user: User, organizationId: string, equipmentId: string) {
  const access = await organizationAccess(env, user, organizationId, 'equipment.manage');
  if (!access) return organizationError(req, env, 'ORGANIZATION_CAPABILITY_REQUIRED', 403);
  const limit = await allowAuthenticatedMutation(env, user.uid, 'organization_equipment');
  const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many equipment updates');
  if (limited) return limited;
  const body = await organizationBody(req);
  if (body === 'too_large') return payloadTooLargeResponse(req, env);
  if (!body) return organizationError(req, env, 'INVALID_AVAILABILITY_POLICY', 400);
  return listingAvailabilityUpdate(req, env, user, equipmentId, { access, actorMemberId: access.membershipId, capability: 'equipment.manage' }, body);
}

async function organizationBookingTransition(req: Request, env: Env, user: User, organizationId: string, requestId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return organizationError(req, env, 'BOOKING_NOT_FOUND', 404);
  const body = await organizationBody(req);
  if (body === 'too_large') return payloadTooLargeResponse(req, env);
  if (!body || Object.keys(body).some(key => key !== 'action') || typeof body.action !== 'string') {
    return organizationError(req, env, 'INVALID_BOOKING_OPERATION', 400);
  }
  const action = body.action;
  const capability: OrganizationCapability | null = ['accept', 'reject'].includes(action)
    ? 'bookings.respond'
    : ['start', 'request_completion'].includes(action) ? 'bookings.operate' : null;
  if (!capability) return organizationError(req, env, 'BOOKING_OPERATION_NOT_DELEGABLE', 403);
  const access = await organizationAccess(env, user, organizationId, capability);
  if (!access) return organizationError(req, env, 'ORGANIZATION_CAPABILITY_REQUIRED', 403);
  const limit = await allowAuthenticatedMutation(env, user.uid, 'organization_booking');
  const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many booking operations');
  if (limited) return limited;
  return transitionRequest(req, env, user, requestId, body, { access, actorMemberId: access.membershipId, capability });
}

const SERVICE_PROFILE_JSON_LIMIT_BYTES = 32 * 1024;

function serviceProfileError(req: Request, env: Env, errorCode: string, status: number) {
  return out(env, req, { success: false, error: 'Service profile request could not be completed', errorCode }, status);
}

function validExpectedRevision(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function serviceProfileValue(
  kind: ServiceProfileKind,
  principal: { type: 'individual'; uid: string; accountPurpose: string } | { type: 'organization'; organizationId: string; ownerUid: string; accountPurpose: string },
  draft: ServiceProfileDraft,
  prior: Record<string, unknown> | undefined,
) {
  const now = new Date().toISOString();
  return {
    ...(principal.type === 'individual'
      ? { principalType: 'individual', ownerUid: principal.uid }
      : { principalType: 'organization', organizationId: principal.organizationId, ownerUid: principal.ownerUid }),
    accountPurpose: principal.accountPurpose,
    requestedCapability: kind,
    profileState: 'draft',
    moderationState: 'not_submitted',
    verificationState: 'unverified',
    discoverable: false,
    canReceiveRequests: false,
    draft,
    createdAt: typeof prior?.createdAt === 'string' ? prior.createdAt : now,
    updatedAt: now,
  };
}

async function personalServiceProfiles(req: Request, env: Env, user: User, kind?: ServiceProfileKind) {
  if (req.method !== 'GET' && declaredJsonPayloadTooLarge(req, SERVICE_PROFILE_JSON_LIMIT_BYTES)) return payloadTooLargeResponse(req, env);
  const accountRaw = user.accountProfileRaw || await getRawDoc(env, 'users', user.uid);
  const driverRaw = user.roleProfileRaw || await getRawDoc(env, 'driverProfiles', user.uid);
  if (!isEligibleIndividualServiceAccount(accountRaw?.data || user.accountProfile, driverRaw?.data)) {
    return serviceProfileError(req, env, 'SERVICE_PROFILE_ACCOUNT_INELIGIBLE', 403);
  }
  if (req.method === 'GET') {
    const [operatorRaw, transporterRaw] = await Promise.all([
      getRawDoc(env, serviceProfileCollection('operator'), user.uid),
      getRawDoc(env, serviceProfileCollection('transporter'), user.uid),
    ]);
    return out(env, req, {
      success: true,
      profiles: {
        operator: operatorRaw ? serviceProfileProjection('operator', operatorRaw.data, operatorRaw.updateTime) : null,
        transporter: transporterRaw ? serviceProfileProjection('transporter', transporterRaw.data, transporterRaw.updateTime) : null,
      },
    });
  }
  if (!kind || req.method !== 'PUT') return serviceProfileError(req, env, 'SERVICE_PROFILE_METHOD_NOT_ALLOWED', 405);
  const limit = await allowAuthenticatedMutation(env, user.uid, 'service_profile_save');
  const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many service profile updates');
  if (limited) return limited;
  const parsed = await readBoundedJson(req, SERVICE_PROFILE_JSON_LIMIT_BYTES);
  if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
  const body = parsed.status === 'ok' && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
    ? parsed.value as Record<string, unknown>
    : null;
  if (!body || !Object.keys(body).every(key => ['expectedRevision', 'draft'].includes(key)) || !validExpectedRevision(body.expectedRevision)) {
    return serviceProfileError(req, env, 'SERVICE_PROFILE_INVALID', 400);
  }
  const draft = parseServiceProfileDraft(kind, body.draft);
  if (!draft) return serviceProfileError(req, env, 'SERVICE_PROFILE_INVALID', 400);
  const transaction = await beginTransaction(env);
  const liveAccount = transaction
    ? await transactionDocument(env, `users/${encodeURIComponent(user.uid)}`, transaction)
    : await getRawDoc(env, 'users', user.uid);
  const liveDriver = transaction
    ? await transactionDocument(env, `driverProfiles/${encodeURIComponent(user.uid)}`, transaction)
    : await getRawDoc(env, 'driverProfiles', user.uid);
  if (!liveAccount || !liveDriver || !isEligibleIndividualServiceAccount(liveAccount.data, liveDriver.data)) return serviceProfileError(req, env, 'SERVICE_PROFILE_ACCOUNT_INELIGIBLE', 403);
  const collection = serviceProfileCollection(kind), path = `${collection}/${encodeURIComponent(user.uid)}`;
  const prior = transaction ? await transactionDocument(env, path, transaction) : await getRawDoc(env, collection, user.uid);
  if (prior ? body.expectedRevision !== prior.updateTime : body.expectedRevision !== null) return serviceProfileError(req, env, 'SERVICE_PROFILE_CONFLICT', 409);
  const value = serviceProfileValue(kind, { type: 'individual', uid: user.uid, accountPurpose: organizationAccountPurpose(liveAccount.data) }, draft, prior?.data);
  const auditId = await hashedId(`service-profile-audit:${user.uid}:${kind}:${value.updatedAt}:${crypto.randomUUID()}`);
  const writes = [
    organizationWrite(path, env, value, prior?.updateTime),
    organizationWrite(`serviceProfileAudit/spaudit_${auditId}`, env, { principalType: 'individual', ownerUid: user.uid, actorUid: user.uid, action: `${kind}_draft_saved`, createdAt: value.updatedAt }),
  ];
  try { await commitWrites(env, writes, transaction); }
  catch { return serviceProfileError(req, env, 'SERVICE_PROFILE_CONFLICT', 409); }
  return out(env, req, { success: true, profile: serviceProfileProjection(kind, value, null), refreshRequired: true });
}

async function organizationServiceProfile(req: Request, env: Env, user: User, organizationId: string, kind: ServiceProfileKind) {
  if (req.method !== 'GET' && declaredJsonPayloadTooLarge(req, SERVICE_PROFILE_JSON_LIMIT_BYTES)) return payloadTooLargeResponse(req, env);
  const capability: OrganizationCapability = kind === 'operator' ? 'operators.manage' : 'transport.manage';
  const access = await organizationAccess(env, user, organizationId, capability);
  if (!access) return organizationError(req, env, 'ORGANIZATION_CAPABILITY_REQUIRED', 403);
  const collection = serviceProfileCollection(kind, true), path = `${collection}/${organizationId}`;
  const prior = await getRawDoc(env, collection, organizationId);
  if (req.method === 'GET') return out(env, req, { success: true, profile: prior ? serviceProfileProjection(kind, prior.data, prior.updateTime) : null });
  if (req.method !== 'PUT') return organizationError(req, env, 'ORGANIZATION_SERVICE_METHOD_NOT_ALLOWED', 405);
  const limit = await allowAuthenticatedMutation(env, user.uid, 'organization_service');
  const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many organization service profile updates');
  if (limited) return limited;
  const body = await organizationBody(req);
  if (body === 'too_large') return payloadTooLargeResponse(req, env);
  if (!body || !Object.keys(body).every(key => ['expectedRevision', 'draft'].includes(key)) || !validExpectedRevision(body.expectedRevision)) {
    return organizationError(req, env, 'INVALID_ORGANIZATION_SERVICE_PROFILE', 400);
  }
  const draft = parseServiceProfileDraft(kind, body.draft);
  if (!draft) return organizationError(req, env, 'INVALID_ORGANIZATION_SERVICE_PROFILE', 400);
  if (prior ? body.expectedRevision !== prior.updateTime : body.expectedRevision !== null) return organizationError(req, env, 'ORGANIZATION_SERVICE_PROFILE_CONFLICT', 409);
  const value = serviceProfileValue(kind, {
    type: 'organization', organizationId, ownerUid: String(access.organization.ownerUid), accountPurpose: String(access.organization.accountPurpose || 'standard'),
  }, draft, prior?.data);
  const writes = [
    organizationWrite(path, env, value, prior?.updateTime),
    ...organizationAuthorizationVerifies(env, access),
    await organizationAuditWrite(env, organizationId, access.membershipId, user.uid, access.organization.ownerUid, `${kind}_draft_saved`, organizationId),
  ];
  try { await commitWrites(env, writes); }
  catch { return organizationError(req, env, 'ORGANIZATION_SERVICE_PROFILE_CONFLICT', 409); }
  return out(env, req, { success: true, profile: serviceProfileProjection(kind, value, null), refreshRequired: true });
}

const SERVICE_RFQ_JSON_LIMIT_BYTES = 700 * 1024;
const SERVICE_RFQ_BODY_LIMIT_BYTES = 64 * 1024;
const SERVICE_RFQ_ID = /^rfq_[A-Za-z0-9_-]{43}$/;
const SERVICE_QUOTE_ID = /^quote_[A-Za-z0-9_-]{43}$/;
const SERVICE_PROFILE_ID = /^[A-Za-z0-9_-]{8,128}$/;

type ServiceRfqStored = {
  aggregate: ServiceRfqAggregate;
  creationFingerprint: string;
  updateTime?: string;
};

function serviceRfqCustomer(user: User): ActiveCustomerAuthority {
  const account = user.accountProfile;
  if (!account || account.role !== 'customer' || isStoreReviewAccount(account) || isOperationallyBlocked(account) || account.isActive === false ||
      account.accountStatus !== undefined && account.accountStatus !== 'active') throw new ServiceRfqError('CUSTOMER_NOT_AUTHORIZED');
  return { actorUid: user.uid, role: 'customer', accountState: 'active', revoked: false, accountPurpose: 'standard' };
}

async function serviceRfqAccountVerify(env: Env, user: User) {
  const raw = user.accountProfileRaw?.updateTime ? user.accountProfileRaw : await getRawDoc(env, 'users', user.uid);
  if (!raw?.updateTime) throw new ServiceRfqError('RFQ_NOT_AUTHORIZED');
  return {
    account: raw.data,
    verify: { verify: fullName(env, `users/${encodeURIComponent(user.uid)}`), currentDocument: { updateTime: raw.updateTime } },
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function parseStoredServiceRfq(value: any, updateTime?: string): ServiceRfqStored | null {
  if (!value || value.schemaVersion !== 1 || typeof value.aggregateJson !== 'string' || value.aggregateJson.length > SERVICE_RFQ_JSON_LIMIT_BYTES ||
      typeof value.creationFingerprint !== 'string' || value.creationFingerprint.length !== 43) return null;
  try {
    const aggregate = JSON.parse(value.aggregateJson) as ServiceRfqAggregate;
    const rfq = aggregate?.rfq;
    if (!rfq || !SERVICE_RFQ_ID.test(rfq.rfqId) || rfq.contractVersion !== 1 || rfq.version !== 1 ||
        !['operator', 'transporter'].includes(rfq.serviceKind) || !['draft', 'collecting_test_proposals', 'provisionally_selected', 'cancelled', 'expired'].includes(rfq.status) ||
        !Number.isSafeInteger(rfq.revision) || rfq.revision < 0 || typeof rfq.customerUid !== 'string' ||
        !Array.isArray(rfq.invitedProviders) || rfq.invitedProviders.length < 1 || rfq.invitedProviders.length > 5 ||
        !Array.isArray(aggregate.quotes) || aggregate.quotes.length > 20 || !Array.isArray(aggregate.operationHistory) || aggregate.operationHistory.length > 100 ||
        value.rfqId !== rfq.rfqId || value.customerUid !== rfq.customerUid || value.serviceKind !== rfq.serviceKind || value.status !== rfq.status ||
        value.revision !== rfq.revision || value.quoteCount !== aggregate.quotes.length) return null;
    return { aggregate, creationFingerprint: value.creationFingerprint, updateTime };
  } catch { return null; }
}

function serviceProviderScope(principal: ProviderPrincipal) {
  return principal.kind === 'individual' ? `individual:${principal.providerUid}` : `organization:${principal.organizationId}`;
}

function serviceRfqFields(aggregate: ServiceRfqAggregate, creationFingerprint: string) {
  const aggregateJson = JSON.stringify(aggregate);
  if (new TextEncoder().encode(aggregateJson).byteLength > SERVICE_RFQ_JSON_LIMIT_BYTES) throw new ServiceRfqError('RFQ_STORAGE_LIMIT_REACHED');
  const fields: Record<string, any> = {
    schemaVersion: { integerValue: '1' },
    rfqId: { stringValue: aggregate.rfq.rfqId },
    customerUid: { stringValue: aggregate.rfq.customerUid },
    serviceKind: { stringValue: aggregate.rfq.serviceKind },
    status: { stringValue: aggregate.rfq.status },
    revision: { integerValue: String(aggregate.rfq.revision) },
    quoteCount: { integerValue: String(aggregate.quotes.length) },
    providerScopes: { arrayValue: { values: aggregate.rfq.invitedProviders.map(item => ({ stringValue: serviceProviderScope(item.principal) })) } },
    providerTargets: { arrayValue: { values: aggregate.rfq.invitedProviders.map(item => ({ stringValue: `${serviceProviderScope(item.principal)}|${item.profileId}` })) } },
    targetProfileIds: { arrayValue: { values: aggregate.rfq.invitedProviders.map(item => ({ stringValue: item.profileId })) } },
    createdAt: { timestampValue: aggregate.rfq.createdAt },
    updatedAt: { timestampValue: aggregate.rfq.updatedAt },
    expiresAt: { timestampValue: aggregate.rfq.expiresAt },
    creationFingerprint: { stringValue: creationFingerprint },
    aggregateJson: { stringValue: aggregateJson },
  };
  return fields;
}

function serviceRfqWrite(env: Env, stored: ServiceRfqStored, expectedUpdateTime?: string) {
  const fields = serviceRfqFields(stored.aggregate, stored.creationFingerprint);
  return {
    update: { name: fullName(env, `serviceRfqs/${encodeURIComponent(stored.aggregate.rfq.rfqId)}`), fields },
    ...(expectedUpdateTime ? { updateMask: { fieldPaths: Object.keys(fields) } } : {}),
    currentDocument: expectedUpdateTime ? { updateTime: expectedUpdateTime } : { exists: false },
  };
}

async function serviceRfqAuditWrite(env: Env, aggregate: ServiceRfqAggregate, actorUid: string, operation: string) {
  const auditId = `${aggregate.rfq.rfqId}__${aggregate.rfq.revision}`;
  return {
    update: { name: fullName(env, `serviceRfqAudit/${encodeURIComponent(auditId)}`), fields: {
      rfqId: { stringValue: aggregate.rfq.rfqId }, revision: { integerValue: String(aggregate.rfq.revision) },
      status: { stringValue: aggregate.rfq.status }, operation: { stringValue: operation },
      actorHash: { stringValue: await hashedId(`service-rfq-actor:${actorUid}`) },
      createdAt: { timestampValue: aggregate.rfq.updatedAt },
    } }, currentDocument: { exists: false },
  };
}

function serviceRfqErrorResponse(req: Request, env: Env, error: unknown) {
  const code = error instanceof ServiceRfqError ? error.code : 'SERVICE_RFQ_UNAVAILABLE';
  const status = code.includes('NOT_FOUND') ? 404
    : code.includes('NOT_AUTHORIZED') || code.includes('NOT_INVITED') || code.includes('AUTHORITY_REVOKED') ? 403
      : code.includes('STALE') || code.includes('CONFLICT') || code.includes('ALREADY') || code.includes('LIMIT_REACHED') || code.includes('TRANSITION') || code.includes('NOT_COLLECTING') ? 409
        : code === 'SERVICE_RFQ_UNAVAILABLE' ? 503 : 400;
  return out(env, req, { success: false, error: code, errorCode: code }, status);
}

function serviceRfqDisabled(req: Request, env: Env) {
  return out(env, req, {
    success: false,
    error: 'Service RFQ is not activated',
    errorCode: 'SERVICE_RFQ_NOT_ACTIVATED',
    activation: { enabled: false, reason: SERVICE_RFQ_PRODUCTION_ACTIVATION },
  }, 404);
}

async function invitedProfiles(env: Env, serviceKind: ServiceKind, profileIds: string[], preparedRequest: any) {
  if (profileIds.length < 1 || profileIds.length > 5 || new Set(profileIds).size !== profileIds.length || profileIds.some(id => !SERVICE_PROFILE_ID.test(id))) {
    throw new ServiceRfqError('INVALID_RFQ_TARGETS');
  }
  const collection = serviceKind === 'operator' ? 'operatorDiscoveryProfiles' : 'transporterDiscoveryProfiles';
  const results: { profileId: string; principal: ProviderPrincipal; updateTime: string }[] = [];
  for (const profileId of profileIds) {
    const raw = await getRawDoc(env, collection, profileId);
    const projection = serviceKind === 'operator' ? publicOperatorProjection(profileId, raw?.data) : publicTransporterProjection(profileId, raw?.data);
    if (!raw?.updateTime || !projection || raw.data.principalType !== 'individual' || typeof raw.data.ownerUid !== 'string') {
      throw new ServiceRfqError('RFQ_PROVIDER_NOT_ELIGIBLE');
    }
    if (serviceKind === 'operator' && (!('equipmentSkills' in projection) ||
        !(projection as { equipmentSkills: string[] }).equipmentSkills.includes(String(preparedRequest?.equipmentSkill || '')))) {
      throw new ServiceRfqError('RFQ_PROVIDER_NOT_ELIGIBLE');
    }
    if (serviceKind === 'transporter' && !matchTransportLoad(preparedRequest, projection as any).compatible) {
      throw new ServiceRfqError('RFQ_PROVIDER_NOT_ELIGIBLE');
    }
    results.push({ profileId, principal: { kind: 'individual', providerUid: raw.data.ownerUid }, updateTime: raw.updateTime });
  }
  if (new Set(results.map(item => serviceProviderScope(item.principal))).size !== results.length) throw new ServiceRfqError('INVALID_RFQ_TARGETS');
  return { collection, results };
}

async function providerAuthorityForRfq(env: Env, aggregate: ServiceRfqAggregate, user: User) {
  const liveAccount = await serviceRfqAccountVerify(env, user);
  const account = liveAccount.account;
  if (!account || account.role !== 'driver' || isStoreReviewAccount(account) || isOperationallyBlocked(account) || account.isActive === false ||
      account.accountStatus !== undefined && account.accountStatus !== 'active') throw new ServiceRfqError('PROVIDER_NOT_AUTHORIZED');
  const invited = aggregate.rfq.invitedProviders.find(item => item.principal.kind === 'individual' && item.principal.providerUid === user.uid);
  if (!invited) throw new ServiceRfqError('PROVIDER_NOT_AUTHORIZED');
  const collection = aggregate.rfq.serviceKind === 'operator' ? 'operatorDiscoveryProfiles' : 'transporterDiscoveryProfiles';
  const raw = await getRawDoc(env, collection, invited.profileId);
  const projection = aggregate.rfq.serviceKind === 'operator' ? publicOperatorProjection(invited.profileId, raw?.data) : publicTransporterProjection(invited.profileId, raw?.data);
  if (!raw?.updateTime || !projection || raw.data.ownerUid !== user.uid || raw.data.principalType !== 'individual') {
    throw new ServiceRfqError('PROVIDER_AUTHORITY_REVOKED');
  }
  const authority: FutureProviderAuthority = {
    actorUid: user.uid, accountState: 'active', revoked: false, accountPurpose: 'standard', serviceKind: aggregate.rfq.serviceKind,
    principal: { kind: 'individual', providerUid: user.uid }, eligibility: { state: 'verified_eligible', source: 'future_authoritative_source' },
  };
  return { authority, verifies: [
    liveAccount.verify,
    { verify: fullName(env, `${collection}/${encodeURIComponent(invited.profileId)}`), currentDocument: { updateTime: raw.updateTime } },
  ] };
}

async function loadServiceRfq(env: Env, rfqId: string): Promise<ServiceRfqStored> {
  const raw = await getRawDoc(env, 'serviceRfqs', rfqId);
  const stored = parseStoredServiceRfq(raw?.data, raw?.updateTime);
  if (!stored) throw new ServiceRfqError('RFQ_NOT_FOUND');
  return stored;
}

async function mutateServiceRfq(
  env: Env,
  rfqId: string,
  actorUid: string,
  operation: string,
  mutate: (aggregate: ServiceRfqAggregate) => Promise<{ aggregate: ServiceRfqAggregate; verifies?: any[]; additionalWrites?: any[] }> | { aggregate: ServiceRfqAggregate; verifies?: any[]; additionalWrites?: any[] },
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const transaction = await beginTransaction(env);
    if (!transaction) throw new ServiceRfqError('SERVICE_RFQ_UNAVAILABLE');
    const raw = await transactionDocument(env, `serviceRfqs/${encodeURIComponent(rfqId)}`, transaction);
    const stored = parseStoredServiceRfq(raw?.data, raw?.updateTime);
    if (!stored?.updateTime) throw new ServiceRfqError('RFQ_NOT_FOUND');
    const result = await mutate(stored.aggregate);
    if (result.aggregate === stored.aggregate) {
      await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
      return stored;
    }
    try {
      await commitWrites(env, [
        serviceRfqWrite(env, { ...stored, aggregate: result.aggregate }, stored.updateTime),
        ...(result.verifies || []),
        await serviceRfqAuditWrite(env, result.aggregate, actorUid, operation),
         ...(result.additionalWrites || []),
      ], transaction);
      if (env.__diagnostics) env.__diagnostics.cas = 'succeeded';
      return { ...stored, aggregate: result.aggregate };
    } catch (error) {
      if (env.__diagnostics) env.__diagnostics.cas = error instanceof FirestorePreconditionError ? 'conflict' : 'failed';
      if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
    }
  }
  throw new ServiceRfqError('SERVICE_RFQ_CONFLICT');
}

function serviceRfqProviderUids(aggregate: ServiceRfqAggregate) {
  return aggregate.rfq.invitedProviders.flatMap(item => item.principal.kind === 'individual' ? [item.principal.providerUid] : []);
}

function serviceRfqListSummary(aggregate: ServiceRfqAggregate) {
  return {
    rfqId: aggregate.rfq.rfqId, serviceKind: aggregate.rfq.serviceKind, status: aggregate.rfq.status,
    revision: aggregate.rfq.revision, quoteCount: aggregate.quotes.length,
    createdAt: aggregate.rfq.createdAt, updatedAt: aggregate.rfq.updatedAt, expiresAt: aggregate.rfq.expiresAt,
  };
}

type ServiceRfqListRow = ReturnType<typeof serviceRfqListSummary> & { providerTargets: string[] };

function parseServiceRfqListRow(value: any, documentId: string): ServiceRfqListRow | null {
  if (!value || value.schemaVersion !== 1 || value.rfqId !== documentId || !SERVICE_RFQ_ID.test(documentId) ||
      !['operator', 'transporter'].includes(value.serviceKind) ||
      !['draft', 'collecting_test_proposals', 'provisionally_selected', 'cancelled', 'expired'].includes(value.status) ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.quoteCount) || value.quoteCount < 0 || value.quoteCount > 20 ||
      ![value.createdAt, value.updatedAt, value.expiresAt].every(item => typeof item === 'string' && Number.isFinite(Date.parse(item))) ||
      !Array.isArray(value.providerTargets) || value.providerTargets.length < 1 || value.providerTargets.length > 5 ||
      value.providerTargets.some((item: unknown) => typeof item !== 'string' || item.length > 300)) return null;
  return {
    rfqId: value.rfqId, serviceKind: value.serviceKind, status: value.status, revision: value.revision, quoteCount: value.quoteCount,
    createdAt: value.createdAt, updatedAt: value.updatedAt, expiresAt: value.expiresAt, providerTargets: value.providerTargets,
  };
}

function providerQuoteSummaries(aggregate: ServiceRfqAggregate, principal: ProviderPrincipal, now: string) {
  return aggregate.quotes.filter(quote => serviceProviderScope(quote.principal) === serviceProviderScope(principal)).map(quote => {
    const snapshot = quote.snapshots[quote.currentVersion - 1];
    return {
      quoteId: quote.quoteId, quoteVersion: quote.currentVersion, serviceKind: quote.serviceKind, serviceScope: snapshot.serviceScope,
      schedule: snapshot.schedule, inclusions: snapshot.inclusions, exclusions: snapshot.exclusions, serviceCategory: snapshot.serviceCategory,
      availability: snapshot.availability, currency: snapshot.currency, baseServicePriceMinor: snapshot.baseServicePriceMinor,
      optionalComponents: snapshot.optionalComponents, quotedServicePriceMinor: snapshot.quotedServicePriceMinor, expiresAt: snapshot.expiresAt,
      status: quote.status === 'active' && Date.parse(now) < Date.parse(snapshot.expiresAt) ? 'active' : 'expired',
      eligibility: 'verified_by_future_authoritative_source' as const,
    };
  });
}

async function serviceRfqView(env: Env, aggregate: ServiceRfqAggregate, user: User) {
  const now = new Date().toISOString();
  if (aggregate.rfq.customerUid === user.uid) {
    const customer = serviceRfqCustomer(user);
    return {
      access: 'customer' as const, rfq: { ...serviceRfqListSummary(aggregate), requirementsSnapshot: aggregate.rfq.requirementsSnapshot,
        targetProfileIds: aggregate.rfq.invitedProviders.map(item => item.profileId), provisionalSelection: aggregate.provisionalSelection },
      comparison: { contractVersion: 1, rfqId: aggregate.rfq.rfqId, rfqVersion: 1, serviceKind: aggregate.rfq.serviceKind,
        ...pageSyntheticQuoteSummaries(aggregate, { kind: 'customer', customer }, { now }) },
    };
  }
  const provider = await providerAuthorityForRfq(env, aggregate, user);
  return {
    access: 'provider' as const, rfq: { ...serviceRfqListSummary(aggregate), requirementsSnapshot: aggregate.rfq.requirementsSnapshot,
      targetProfileIds: [], provisionalSelection: aggregate.provisionalSelection?.quoteId &&
        providerQuoteSummaries(aggregate, provider.authority.principal, now).some(item => item.quoteId === aggregate.provisionalSelection?.quoteId)
        ? aggregate.provisionalSelection : null },
    comparison: { contractVersion: 1, rfqId: aggregate.rfq.rfqId, rfqVersion: 1, serviceKind: aggregate.rfq.serviceKind,
      quotes: providerQuoteSummaries(aggregate, provider.authority.principal, now), nextCursor: null },
  };
}

async function createServiceRfq(req: Request, env: Env, user: User) {
  if (serviceRfqActivationOverride !== true) return serviceRfqDisabled(req, env);
  try {
    const customerAccount = await serviceRfqAccountVerify(env, user);
    const customer = serviceRfqCustomer({ ...user, accountProfile: customerAccount.account });
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_rfq_create');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many RFQ submissions');
    if (limited) return limited;
    const parsed = await readBoundedJson(req, SERVICE_RFQ_BODY_LIMIT_BYTES);
    if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
    const body = parsed.status === 'ok' && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value) ? parsed.value as any : null;
    if (!body || !Object.keys(body).every(key => ['draft', 'targetProfileIds', 'idempotencyKey'].includes(key)) ||
        !Array.isArray(body.targetProfileIds) || typeof body.idempotencyKey !== 'string') throw new ServiceRfqError('INVALID_RFQ');
    const serviceKind = body.draft?.serviceKind as ServiceKind;
    if (!['operator', 'transporter'].includes(serviceKind)) throw new ServiceRfqError('INVALID_RFQ');
    const targets = await invitedProfiles(env, serviceKind, body.targetProfileIds, body.draft?.preparedRequest);
    const creationFingerprint = await hashedId(stableJson({ draft: body.draft, targetProfileIds: [...body.targetProfileIds].sort() }));
    const rfqId = `rfq_${await hashedId(`service-rfq:${user.uid}:${body.idempotencyKey}`)}`;
    const now = new Date().toISOString();
    const created = createTestOnlyRfq(body.draft, { rfqId, customer, invitedProviders: targets.results, now });
    const aggregate = openTestOnlyRfq(created, customer, 0, body.idempotencyKey, now);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) throw new ServiceRfqError('SERVICE_RFQ_UNAVAILABLE');
      const priorRaw = await transactionDocument(env, `serviceRfqs/${encodeURIComponent(rfqId)}`, transaction);
      const prior = parseStoredServiceRfq(priorRaw?.data, priorRaw?.updateTime);
      if (prior) {
        await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
        if (prior.aggregate.rfq.customerUid !== user.uid || prior.creationFingerprint !== creationFingerprint) throw new ServiceRfqError('IDEMPOTENCY_CONFLICT');
        return out(env, req, { success: true, ...(await serviceRfqView(env, prior.aggregate, user)), replayed: true });
      }
      const stored = { aggregate, creationFingerprint };
      try {
        const notifications = await enqueueServiceNotifications(
          env,
          serviceRfqProviderUids(aggregate),
          'service_rfq_invited',
          rfqId,
          now,
          `service-rfq:${rfqId}:invited`,
        );
        await commitWrites(env, [
          serviceRfqWrite(env, stored),
          customerAccount.verify,
          ...targets.results.map(item => ({ verify: fullName(env, `${targets.collection}/${encodeURIComponent(item.profileId)}`), currentDocument: { updateTime: item.updateTime } })),
          await serviceRfqAuditWrite(env, aggregate, user.uid, 'rfq_created'),
          ...notifications,
        ], transaction);
        if (env.__diagnostics) env.__diagnostics.cas = 'succeeded';
        return out(env, req, { success: true, ...(await serviceRfqView(env, aggregate, user)), replayed: false }, 201);
      } catch (error) {
        if (env.__diagnostics) env.__diagnostics.cas = error instanceof FirestorePreconditionError ? 'conflict' : 'failed';
        if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
      }
    }
    throw new ServiceRfqError('SERVICE_RFQ_CONFLICT');
  } catch (error) { return serviceRfqErrorResponse(req, env, error); }
}

async function serviceRfqRows(env: Env, fieldPath: 'customerUid' | 'providerScopes', value: string, cursor?: string) {
  const query: any = {
    select: { fields: ['schemaVersion', 'rfqId', 'serviceKind', 'status', 'revision', 'quoteCount', 'createdAt', 'updatedAt', 'expiresAt', 'providerTargets']
      .map(fieldPath => ({ fieldPath })) },
    from: [{ collectionId: 'serviceRfqs' }],
    where: { fieldFilter: { field: { fieldPath }, op: fieldPath === 'providerScopes' ? 'ARRAY_CONTAINS' : 'EQUAL', value: { stringValue: value } } },
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 21,
  };
  if (cursor) query.startAt = { before: false, values: [{ referenceValue: fullName(env, `serviceRfqs/${encodeURIComponent(cursor)}`) }] };
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: query }) }) as any[] || [];
  return result.filter(item => item.document).map(item => ({ id: decodeURIComponent(String(item.document.name).split('/').pop() || ''), data: decode(item.document) }));
}

async function listServiceRfqs(req: Request, env: Env, user: User) {
  if (serviceRfqActivationOverride !== true) return serviceRfqDisabled(req, env);
  try {
    const url = new URL(req.url), cursor = url.searchParams.get('cursor') || undefined;
    if ([...url.searchParams.keys()].some(key => key !== 'cursor') || cursor && !SERVICE_RFQ_ID.test(cursor)) throw new ServiceRfqError('INVALID_RFQ_PAGE');
    const account = user.accountProfile || await getDoc(env, 'users', user.uid);
    let field: 'customerUid' | 'providerScopes', value: string;
    if (account?.role === 'customer') { serviceRfqCustomer(user); field = 'customerUid'; value = user.uid; }
    else if (eligibleAccount(account, 'driver')) { field = 'providerScopes'; value = `individual:${user.uid}`; }
    else throw new ServiceRfqError('RFQ_NOT_AUTHORIZED');
    const rows = await serviceRfqRows(env, field, value, cursor), page = rows.slice(0, 20);
    let summaries = page.map(row => parseServiceRfqListRow(row.data, row.id)).filter((item): item is ServiceRfqListRow => !!item);
    if (field === 'providerScopes') {
      const targetPrefix = `${value}|`;
      const invited = summaries.flatMap(summary => summary.providerTargets
        .filter(target => target.startsWith(targetPrefix) && SERVICE_PROFILE_ID.test(target.slice(targetPrefix.length)))
        .map(target => ({ summary, profileId: target.slice(targetPrefix.length), collection: summary.serviceKind === 'operator' ? 'operatorDiscoveryProfiles' : 'transporterDiscoveryProfiles' })));
      const currentProfiles = await batchGetRawDocs(env, invited.map(item => ({ collection: item.collection, id: item.profileId })));
      summaries = summaries.filter(summary => invited.some(candidate => {
        if (candidate.summary !== summary) return false;
        const raw = currentProfiles.get(`${candidate.collection}/${candidate.profileId}`)?.data;
        const projection = summary.serviceKind === 'operator'
          ? publicOperatorProjection(candidate.profileId, raw)
          : publicTransporterProjection(candidate.profileId, raw);
        return !!projection && raw?.principalType === 'individual' && raw?.ownerUid === user.uid;
      }));
    }
    const rfqs = summaries.map(({ providerTargets: _providerTargets, ...summary }) => summary);
    return out(env, req, { success: true, rfqs, nextCursor: rows.length > 20 ? page.at(-1)?.id || null : null });
  } catch (error) { return serviceRfqErrorResponse(req, env, error); }
}

async function getServiceRfq(req: Request, env: Env, user: User, rfqId: string) {
  if (serviceRfqActivationOverride !== true) return serviceRfqDisabled(req, env);
  try {
    let stored = await loadServiceRfq(env, rfqId);
    const authorizedView = await serviceRfqView(env, stored.aggregate, user);
    if (['draft', 'collecting_test_proposals'].includes(stored.aggregate.rfq.status) && Date.now() >= Date.parse(stored.aggregate.rfq.expiresAt)) {
      stored = await mutateServiceRfq(env, rfqId, user.uid, 'rfq_expired', async aggregate => {
        const now = new Date().toISOString();
        const next = expireTestOnlyRfq(aggregate, aggregate.rfq.revision, now);
        return {
          aggregate: next,
          additionalWrites: await enqueueServiceNotifications(
            env,
            [aggregate.rfq.customerUid, ...serviceRfqProviderUids(aggregate)],
            'service_rfq_expired',
            rfqId,
            now,
            `service-rfq:${rfqId}:expired:${next.rfq.revision}`,
          ),
        };
      });
      return out(env, req, { success: true, ...(await serviceRfqView(env, stored.aggregate, user)) });
    }
    return out(env, req, { success: true, ...authorizedView });
  } catch (error) { return serviceRfqErrorResponse(req, env, error); }
}

async function submitOrReviseServiceQuote(req: Request, env: Env, user: User, rfqId: string, quoteId?: string) {
  if (serviceRfqActivationOverride !== true) return serviceRfqDisabled(req, env);
  try {
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_rfq_quote');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many quotation updates');
    if (limited) return limited;
    const parsed = await readBoundedJson(req, SERVICE_RFQ_BODY_LIMIT_BYTES);
    if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
    const body = parsed.status === 'ok' && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value) ? parsed.value as any : null;
    if (!body || !Object.keys(body).every(key => ['quote', 'expectedRfqRevision', 'idempotencyKey'].includes(key)) ||
        !Number.isSafeInteger(body.expectedRfqRevision) || typeof body.idempotencyKey !== 'string' || quoteId && !SERVICE_QUOTE_ID.test(quoteId)) {
      throw new ServiceRfqError('INVALID_QUOTE');
    }
    const stored = await mutateServiceRfq(env, rfqId, user.uid, quoteId ? 'quote_revised' : 'quote_submitted', async aggregate => {
      const provider = await providerAuthorityForRfq(env, aggregate, user);
      const nextQuoteId = quoteId || `quote_${await hashedId(`service-quote:${rfqId}:${serviceProviderScope(provider.authority.principal)}:${body.idempotencyKey}`)}`;
      const next = quoteId
        ? reviseTestOnlyQuote(aggregate, quoteId, body.quote, { authority: provider.authority, expectedRfqRevision: body.expectedRfqRevision, idempotencyKey: body.idempotencyKey, now: new Date().toISOString() })
        : submitTestOnlyQuote(aggregate, body.quote, { quoteId: nextQuoteId, authority: provider.authority, expectedRfqRevision: body.expectedRfqRevision, idempotencyKey: body.idempotencyKey, now: new Date().toISOString() });
      return {
        aggregate: next,
        verifies: provider.verifies,
        additionalWrites: await enqueueServiceNotifications(
          env,
          [aggregate.rfq.customerUid],
          quoteId ? 'service_quote_revised' : 'service_quote_submitted',
          rfqId,
          next.rfq.updatedAt,
          `service-rfq:${rfqId}:${quoteId ? 'quote-revised' : 'quote-submitted'}:${next.rfq.revision}`,
        ),
      };
    });
    return out(env, req, { success: true, ...(await serviceRfqView(env, stored.aggregate, user)) }, quoteId ? 200 : 201);
  } catch (error) { return serviceRfqErrorResponse(req, env, error); }
}

async function selectServiceQuote(req: Request, env: Env, user: User, rfqId: string) {
  if (serviceRfqActivationOverride !== true) return serviceRfqDisabled(req, env);
  try {
    const customerAccount = await serviceRfqAccountVerify(env, user);
    const customer = serviceRfqCustomer({ ...user, accountProfile: customerAccount.account });
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_rfq_select');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many selection attempts');
    if (limited) return limited;
    const parsed = await readBoundedJson(req, SERVICE_RFQ_BODY_LIMIT_BYTES);
    if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
    const body = parsed.status === 'ok' ? parsed.value as any : null;
    if (!body || !Object.keys(body).every(key => ['quoteId', 'expectedRfqRevision', 'idempotencyKey'].includes(key)) ||
        !SERVICE_QUOTE_ID.test(String(body.quoteId || '')) || !Number.isSafeInteger(body.expectedRfqRevision) || typeof body.idempotencyKey !== 'string') {
      throw new ServiceRfqError('INVALID_SELECTION');
    }
    const stored = await mutateServiceRfq(env, rfqId, user.uid, 'quote_provisionally_selected', async aggregate => {
      const quote = aggregate.quotes.find(item => item.quoteId === body.quoteId);
      if (!quote) throw new ServiceRfqError('QUOTE_NOT_FOUND');
      const invited = aggregate.rfq.invitedProviders.find(item => serviceProviderScope(item.principal) === serviceProviderScope(quote.principal));
      if (!invited || quote.principal.kind !== 'individual') throw new ServiceRfqError('PROVIDER_AUTHORITY_REVOKED');
      const provider = await providerAuthorityForRfq(env, aggregate, { uid: quote.principal.providerUid, admin: false });
      return {
        aggregate: provisionallySelectTestOnlyQuote(aggregate, body.quoteId, customer, provider.authority, body.expectedRfqRevision, body.idempotencyKey, new Date().toISOString()),
        verifies: [customerAccount.verify, ...provider.verifies],
        additionalWrites: await enqueueServiceNotifications(
          env,
          [quote.principal.providerUid],
          'service_quote_provisionally_selected',
          rfqId,
          new Date().toISOString(),
          `service-rfq:${rfqId}:provisional-selection:${body.quoteId}`,
        ),
      };
    });
    return out(env, req, { success: true, ...(await serviceRfqView(env, stored.aggregate, user)), binding: 'non_binding_preliminary_selection' });
  } catch (error) { return serviceRfqErrorResponse(req, env, error); }
}

async function cancelServiceRfq(req: Request, env: Env, user: User, rfqId: string) {
  if (serviceRfqActivationOverride !== true) return serviceRfqDisabled(req, env);
  try {
    const customerAccount = await serviceRfqAccountVerify(env, user);
    const customer = serviceRfqCustomer({ ...user, accountProfile: customerAccount.account });
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_rfq_cancel');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many cancellation attempts');
    if (limited) return limited;
    const parsed = await readBoundedJson(req, SERVICE_RFQ_BODY_LIMIT_BYTES);
    if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
    const body = parsed.status === 'ok' ? parsed.value as any : null;
    if (!body || !Object.keys(body).every(key => ['expectedRevision', 'idempotencyKey'].includes(key)) ||
        !Number.isSafeInteger(body.expectedRevision) || typeof body.idempotencyKey !== 'string') throw new ServiceRfqError('INVALID_RFQ');
    const stored = await mutateServiceRfq(env, rfqId, user.uid, 'rfq_cancelled', async aggregate => {
      const now = new Date().toISOString();
      const next = cancelTestOnlyRfq(aggregate, customer, body.expectedRevision, body.idempotencyKey, now);
      return {
        aggregate: next,
        verifies: [customerAccount.verify],
        additionalWrites: await enqueueServiceNotifications(
          env,
          serviceRfqProviderUids(aggregate),
          'service_rfq_cancelled',
          rfqId,
          now,
          `service-rfq:${rfqId}:cancelled:${next.rfq.revision}`,
        ),
      };
    });
    return out(env, req, { success: true, ...(await serviceRfqView(env, stored.aggregate, user)) });
  } catch (error) { return serviceRfqErrorResponse(req, env, error); }
}

async function withdrawServiceQuote(req: Request, env: Env, user: User, rfqId: string, quoteId: string) {
  if (serviceRfqActivationOverride !== true) return serviceRfqDisabled(req, env);
  try {
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_rfq_quote');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many quotation updates');
    if (limited) return limited;
    const parsed = await readBoundedJson(req, SERVICE_RFQ_BODY_LIMIT_BYTES);
    if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
    const body = parsed.status === 'ok' && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value) ? parsed.value as any : null;
    if (!body || !Object.keys(body).every(key => ['expectedRfqRevision', 'expectedQuoteRevision', 'idempotencyKey'].includes(key)) ||
        !Number.isSafeInteger(body.expectedRfqRevision) || !Number.isSafeInteger(body.expectedQuoteRevision) || typeof body.idempotencyKey !== 'string') {
      throw new ServiceRfqError('INVALID_QUOTE');
    }
    const stored = await mutateServiceRfq(env, rfqId, user.uid, 'quote_withdrawn', async aggregate => {
      const provider = await providerAuthorityForRfq(env, aggregate, user);
      const now = new Date().toISOString();
      const next = withdrawTestOnlyQuote(
        aggregate,
        quoteId,
        provider.authority,
        body.expectedRfqRevision,
        body.expectedQuoteRevision,
        body.idempotencyKey,
        now,
      );
      return {
        aggregate: next,
        verifies: provider.verifies,
        additionalWrites: await enqueueServiceNotifications(
          env,
          [aggregate.rfq.customerUid],
          'service_quote_withdrawn',
          rfqId,
          now,
          `service-rfq:${rfqId}:quote-withdrawn:${quoteId}:${next.rfq.revision}`,
        ),
      };
    });
    return out(env, req, { success: true, ...(await serviceRfqView(env, stored.aggregate, user)) });
  } catch (error) { return serviceRfqErrorResponse(req, env, error); }
}

const SERVICE_MESSAGE_ID = /^service_message_[A-Za-z0-9_-]{43}$/;

type ServiceMessageStored = { message: ServiceMessageRecord; updateTime?: string };

function parseStoredServiceMessage(value: any, updateTime?: string): ServiceMessageStored | null {
  if (!isServiceMessageRecord(value)) return null;
  return { message: value, updateTime };
}

function serviceMessageFields(message: ServiceMessageRecord) {
  return {
    schemaVersion: { integerValue: '1' },
    messageId: { stringValue: message.messageId },
    rfqId: { stringValue: message.rfqId },
    serviceKind: { stringValue: message.serviceKind },
    senderUid: { stringValue: message.senderUid },
    senderRole: { stringValue: message.senderRole },
    recipientUid: { stringValue: message.recipientUid },
    providerUid: { stringValue: message.senderRole === 'provider' ? message.senderUid : message.recipientUid },
    text: { stringValue: message.text },
    idempotencyFingerprint: { stringValue: message.idempotencyFingerprint },
    createdAt: { timestampValue: message.createdAt },
    retentionClass: { stringValue: message.retentionClass },
  };
}

function serviceMessageWrite(env: Env, message: ServiceMessageRecord) {
  return {
    update: { name: fullName(env, `serviceMessages/${encodeURIComponent(message.messageId)}`), fields: serviceMessageFields(message) },
    currentDocument: { exists: false },
  };
}

async function serviceConversationAuthority(
  env: Env,
  aggregate: ServiceRfqAggregate,
  user: User,
  providerProfileId?: string,
  writable = false,
) {
  if (writable && (!['collecting_test_proposals', 'provisionally_selected'].includes(aggregate.rfq.status) ||
      Date.now() >= Date.parse(aggregate.rfq.expiresAt))) throw new ServiceCommunicationError('SERVICE_CONVERSATION_READ_ONLY');
  if (aggregate.rfq.customerUid === user.uid) {
    const liveCustomer = await serviceRfqAccountVerify(env, user);
    serviceRfqCustomer({ ...user, accountProfile: liveCustomer.account });
    if (!providerProfileId || !SERVICE_PROFILE_ID.test(providerProfileId)) throw new ServiceCommunicationError('INVALID_SERVICE_CONVERSATION');
    const invited = aggregate.rfq.invitedProviders.find(item => item.profileId === providerProfileId && item.principal.kind === 'individual');
    if (!invited || invited.principal.kind !== 'individual') throw new ServiceCommunicationError('SERVICE_CONVERSATION_NOT_FOUND');
    let providerVerifies: any[] = [];
    if (writable) {
      const providerAccount = await getRawDoc(env, 'users', invited.principal.providerUid);
      const providerUser: User = { uid: invited.principal.providerUid, admin: false, accountProfileRaw: providerAccount, accountProfile: providerAccount?.data };
      providerVerifies = (await providerAuthorityForRfq(env, aggregate, providerUser)).verifies;
    }
    return {
      role: 'customer' as const,
      providerUid: invited.principal.providerUid,
      providerProfileId: invited.profileId,
      recipientUid: invited.principal.providerUid,
      verifies: [liveCustomer.verify, ...providerVerifies],
    };
  }
  const provider = await providerAuthorityForRfq(env, aggregate, user);
  const invited = aggregate.rfq.invitedProviders.find(item => item.principal.kind === 'individual' && item.principal.providerUid === user.uid);
  if (!invited || providerProfileId && invited.profileId !== providerProfileId) throw new ServiceCommunicationError('SERVICE_CONVERSATION_NOT_FOUND');
  return {
    role: 'provider' as const,
    providerUid: user.uid,
    providerProfileId: invited.profileId,
    recipientUid: aggregate.rfq.customerUid,
    verifies: provider.verifies,
  };
}

function serviceCommunicationErrorResponse(req: Request, env: Env, error: unknown) {
  if (error instanceof ServiceRfqError) return serviceRfqErrorResponse(req, env, error);
  const code = error instanceof ServiceCommunicationError ? error.code : 'SERVICE_COMMUNICATION_UNAVAILABLE';
  const status = code.includes('NOT_FOUND') ? 404
    : code.includes('NOT_AUTHORIZED') ? 403
      : code.includes('CONFLICT') || code.includes('READ_ONLY') ? 409
        : code === 'SERVICE_COMMUNICATION_UNAVAILABLE' ? 503 : 400;
  return out(env, req, { success: false, error: code, errorCode: code }, status);
}

async function sendServiceMessage(req: Request, env: Env, user: User, rfqId: string) {
  if (serviceRfqActivationOverride !== true) return serviceRfqDisabled(req, env);
  try {
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_message_send');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many service messages');
    if (limited) return limited;
    const parsed = await readBoundedJson(req, SERVICE_MESSAGE_LIMITS.bodyBytes);
    if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
    const input = normalizeServiceMessageInput(parsed.status === 'ok' ? parsed.value : null);
    const body = parsed.status === 'ok' && parsed.value && typeof parsed.value === 'object' ? parsed.value as Record<string, unknown> : {};
    if (!Object.keys(body).every(key => ['text', 'idempotencyKey', 'providerProfileId'].includes(key))) {
      throw new ServiceCommunicationError('INVALID_SERVICE_MESSAGE');
    }
    const providerProfileId = typeof body.providerProfileId === 'string' ? body.providerProfileId : undefined;
    const idempotencyFingerprint = await hashedId(stableJson({ rfqId, actorUid: user.uid, text: input.text, providerProfileId: providerProfileId || null }));
    const messageId = `service_message_${await hashedId(`service-message:${rfqId}:${user.uid}:${input.idempotencyKey}`)}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) throw new ServiceCommunicationError('SERVICE_COMMUNICATION_UNAVAILABLE');
      const [rfqRaw, priorRaw] = await Promise.all([
        transactionDocument(env, `serviceRfqs/${encodeURIComponent(rfqId)}`, transaction),
        transactionDocument(env, `serviceMessages/${encodeURIComponent(messageId)}`, transaction),
      ]);
      const stored = parseStoredServiceRfq(rfqRaw?.data, rfqRaw?.updateTime);
      if (!stored?.updateTime) throw new ServiceCommunicationError('SERVICE_CONVERSATION_NOT_FOUND');
      const authority = await serviceConversationAuthority(env, stored.aggregate, user, providerProfileId, true);
      const prior = parseStoredServiceMessage(priorRaw?.data, priorRaw?.updateTime);
      if (prior) {
        await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
        if (prior.message.senderUid !== user.uid || prior.message.rfqId !== rfqId ||
            prior.message.idempotencyFingerprint !== idempotencyFingerprint || prior.message.text !== input.text) {
          throw new ServiceCommunicationError('SERVICE_MESSAGE_IDEMPOTENCY_CONFLICT');
        }
        return out(env, req, { success: true, message: serviceMessageProjection(prior.message), replayed: true });
      }
      const now = new Date().toISOString();
      const message = createServiceMessageRecord({
        messageId,
        rfqId,
        serviceKind: stored.aggregate.rfq.serviceKind,
        senderUid: user.uid,
        senderRole: authority.role,
        recipientUid: authority.recipientUid,
        text: input.text,
        idempotencyFingerprint,
        createdAt: now,
      });
      try {
        await commitWrites(env, [
          serviceMessageWrite(env, message),
          { verify: fullName(env, `serviceRfqs/${encodeURIComponent(rfqId)}`), currentDocument: { updateTime: stored.updateTime } },
          ...authority.verifies,
          ...(await enqueueServiceNotifications(
            env,
            [authority.recipientUid],
            'service_message_received',
            rfqId,
            now,
            `service-message:${messageId}`,
          )),
        ], transaction);
        return out(env, req, { success: true, message: serviceMessageProjection(message), replayed: false }, 201);
      } catch (error) {
        if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
      }
    }
    throw new ServiceCommunicationError('SERVICE_MESSAGE_CONFLICT');
  } catch (error) { return serviceCommunicationErrorResponse(req, env, error); }
}

async function serviceMessageRows(env: Env, rfqId: string, providerUid: string, cursor?: ServiceMessageRecord) {
  if (serviceMessageQueryOverride) return serviceMessageQueryOverride;
  const query: any = {
    from: [{ collectionId: 'serviceMessages' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'rfqId' }, op: 'EQUAL', value: { stringValue: rfqId } } },
      { fieldFilter: { field: { fieldPath: 'providerUid' }, op: 'EQUAL', value: { stringValue: providerUid } } },
    ] } },
    orderBy: [
      { field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' },
      { field: { fieldPath: '__name__' }, direction: 'DESCENDING' },
    ],
    limit: SERVICE_MESSAGE_LIMITS.pageSize + 1,
  };
  if (cursor) query.startAt = { before: false, values: [
    { timestampValue: cursor.createdAt },
    { referenceValue: fullName(env, `serviceMessages/${encodeURIComponent(cursor.messageId)}`) },
  ] };
  return await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: query }) }) as any[] || [];
}

async function listServiceMessages(req: Request, env: Env, user: User, rfqId: string) {
  if (serviceRfqActivationOverride !== true) return serviceRfqDisabled(req, env);
  try {
    const url = new URL(req.url);
    if ([...url.searchParams.keys()].some(key => !['providerProfileId', 'cursor'].includes(key))) {
      throw new ServiceCommunicationError('INVALID_SERVICE_MESSAGE_PAGE');
    }
    const providerProfileId = url.searchParams.get('providerProfileId') || undefined;
    const cursorId = url.searchParams.get('cursor') || undefined;
    if (cursorId && !SERVICE_MESSAGE_ID.test(cursorId)) throw new ServiceCommunicationError('INVALID_SERVICE_MESSAGE_PAGE');
    const stored = await loadServiceRfq(env, rfqId);
    const authority = await serviceConversationAuthority(env, stored.aggregate, user, providerProfileId, false);
    let cursor: ServiceMessageRecord | undefined;
    if (cursorId) {
      const raw = await getRawDoc(env, 'serviceMessages', cursorId);
      const parsed = parseStoredServiceMessage(raw?.data, raw?.updateTime);
      if (!parsed || parsed.message.rfqId !== rfqId ||
          (parsed.message.senderRole === 'provider' ? parsed.message.senderUid : parsed.message.recipientUid) !== authority.providerUid) {
        throw new ServiceCommunicationError('INVALID_SERVICE_MESSAGE_PAGE');
      }
      cursor = parsed.message;
    }
    const rows = await serviceMessageRows(env, rfqId, authority.providerUid, cursor);
    const decoded = rows.flatMap(row => {
      const document = row.document || row;
      const value = document?.fields ? decode(document) : row.data || row;
      const message = parseStoredServiceMessage(value)?.message;
      return message && message.rfqId === rfqId &&
        (message.senderRole === 'provider' ? message.senderUid : message.recipientUid) === authority.providerUid ? [message] : [];
    });
    const page = decoded.slice(0, SERVICE_MESSAGE_LIMITS.pageSize);
    return out(env, req, {
      success: true,
      conversation: { rfqId, serviceKind: stored.aggregate.rfq.serviceKind, status: stored.aggregate.rfq.status, access: authority.role, providerProfileId: authority.providerProfileId },
      messages: page.map(serviceMessageProjection).reverse(),
      nextCursor: decoded.length > SERVICE_MESSAGE_LIMITS.pageSize ? page.at(-1)?.messageId || null : null,
      readOnly: !['collecting_test_proposals', 'provisionally_selected'].includes(stored.aggregate.rfq.status) || Date.now() >= Date.parse(stored.aggregate.rfq.expiresAt),
    });
  } catch (error) { return serviceCommunicationErrorResponse(req, env, error); }
}

const SERVICE_EXECUTION_SOURCE_ID = /^[A-Za-z0-9:_-]{6,160}$/;
const SERVICE_EXECUTION_JSON_LIMIT_BYTES = 256 * 1024;
const SERVICE_EXECUTION_BODY_LIMIT_BYTES = 16 * 1024;

type ServiceExecutionStored = {
  aggregate: ServiceExecutionAggregate;
  creationFingerprint: string;
  updateTime?: string;
};

function serviceExecutionDisabled(req: Request, env: Env) {
  return out(env, req, {
    success: false,
    error: 'Service execution is not activated',
    errorCode: 'SERVICE_EXECUTION_NOT_ACTIVATED',
    activation: { enabled: false, reason: SERVICE_EXECUTION_PRODUCTION_ACTIVATION },
  }, 404);
}

function serviceExecutionErrorResponse(req: Request, env: Env, error: unknown) {
  const code = error instanceof ServiceExecutionError || error instanceof PrivateEvidenceMediaError ? error.code : 'SERVICE_EXECUTION_UNAVAILABLE';
  const status = code.includes('NOT_FOUND') ? 404
    : code.includes('NOT_AUTHORIZED') || code.includes('ACCOUNT_INELIGIBLE') ? 403
      : code === 'EVIDENCE_UPLOAD_VERIFICATION_FAILED' ? 502
        : code === 'EVIDENCE_MEDIA_UNAVAILABLE' ? 503
      : code.includes('STALE') || code.includes('CONFLICT') || code.includes('CHANGED') || code.includes('TRANSITION') || code.includes('LIFECYCLE_REQUIRED') || code.includes('STATE') || code.includes('LIMIT_REACHED') || code.includes('EXPIRED') || code.includes('INCOMPLETE') || code.includes('ALREADY_ATTACHED') ? 409
        : code === 'SERVICE_EXECUTION_UNAVAILABLE' ? 503 : 400;
  return out(env, req, { success: false, error: code, errorCode: code }, status);
}

const PRIVATE_EVIDENCE_INTENT_JSON_LIMIT_BYTES = 48 * 1024;
const PRIVATE_EVIDENCE_MULTIPART_OVERHEAD_BYTES = 128 * 1024;
const PRIVATE_EVIDENCE_FOLDER = /^[A-Za-z0-9_-]{1,64}$/;
const PRIVATE_EVIDENCE_INTENT_ID = /^evidence_intent_[A-Za-z0-9_-]{43}$/;

function privateEvidenceCapability(env: Env): PrivateEvidenceMediaCapability {
  const enabled = serviceExecutionActivationOverride === true && !!env.CLOUDINARY_CLOUD_NAME && !!env.CLOUDINARY_API_KEY &&
    !!env.CLOUDINARY_API_SECRET && PRIVATE_EVIDENCE_FOLDER.test(env.CLOUDINARY_FOLDER || 'heavyar');
  return enabled ? {
    enabled: true,
    backend: 'authenticated_private',
    authenticatedUpload: true,
    participantAuthorizedDelivery: true,
    metadataStrippedBeforeStorage: true,
  } : {
    enabled: false,
    backend: 'authenticated_private',
    authenticatedUpload: false,
    participantAuthorizedDelivery: false,
    metadataStrippedBeforeStorage: false,
    reason: PRIVATE_EVIDENCE_MEDIA_PRODUCTION_ACTIVATION,
  };
}

type PrivateEvidenceStored = { intent: PrivateEvidenceUploadIntent; updateTime?: string };

function parseStoredPrivateEvidenceIntent(value: any, updateTime?: string): PrivateEvidenceStored | null {
  if (!value || value.schemaVersion !== 1 || typeof value.intentJson !== 'string' ||
      new TextEncoder().encode(value.intentJson).byteLength > PRIVATE_EVIDENCE_INTENT_JSON_LIMIT_BYTES) return null;
  try {
    const intent = JSON.parse(value.intentJson) as PrivateEvidenceUploadIntent;
    if (!isPrivateEvidenceUploadIntent(intent) || value.intentId !== intent.intentId || value.executionId !== intent.executionId ||
        value.state !== intent.state || value.expiresAt !== intent.expiresAt) return null;
    return { intent, updateTime };
  } catch { return null; }
}

async function privateEvidenceIntentFields(intent: PrivateEvidenceUploadIntent) {
  const intentJson = JSON.stringify(intent);
  if (new TextEncoder().encode(intentJson).byteLength > PRIVATE_EVIDENCE_INTENT_JSON_LIMIT_BYTES) {
    throw new PrivateEvidenceMediaError('INVALID_EVIDENCE_INTENT');
  }
  return {
    schemaVersion: { integerValue: '1' },
    intentId: { stringValue: intent.intentId },
    executionId: { stringValue: intent.executionId },
    actorHash: { stringValue: await hashedId(`service-evidence-actor:${intent.actorUid}`) },
    state: { stringValue: intent.state },
    expiresAt: { timestampValue: intent.expiresAt },
    retentionClass: { stringValue: intent.retentionClass },
    intentJson: { stringValue: intentJson },
    ...(intent.cleanup?.nextAttemptAt ? { cleanupDueAt: { timestampValue: intent.cleanup.nextAttemptAt } } : {}),
  };
}

async function privateEvidenceIntentWrite(env: Env, intent: PrivateEvidenceUploadIntent, expectedUpdateTime?: string) {
  const fields = await privateEvidenceIntentFields(intent);
  return {
    update: { name: fullName(env, `serviceEvidenceUploadIntents/${encodeURIComponent(intent.intentId)}`), fields },
    currentDocument: expectedUpdateTime ? { updateTime: expectedUpdateTime } : { exists: false },
  };
}

function cloudinarySignaturePayload(params: Record<string, string | number | boolean>) {
  return Object.entries(params).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`).join('&');
}

async function sha1Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-1', enc.encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function signCloudinaryParams(params: Record<string, string | number | boolean>, secret: string) {
  return sha1Hex(`${cloudinarySignaturePayload(params)}${secret}`);
}

async function verifyCloudinaryUploadResponse(result: any, expectedPublicId: string, secret: string) {
  if (!result || result.public_id !== expectedPublicId || result.resource_type !== 'image' || result.type !== 'authenticated' ||
      typeof result.asset_id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(result.asset_id) ||
      !Number.isSafeInteger(result.version) || result.version < 1 || typeof result.signature !== 'string' || !/^[a-f0-9]{40}$/.test(result.signature)) return false;
  const expected = await sha1Hex(`public_id=${expectedPublicId}&version=${result.version}${secret}`);
  return constantTimeBytesEqual(enc.encode(expected), enc.encode(result.signature));
}

async function privateEvidenceDownloadUrl(env: Env, file: PrivateEvidenceUploadIntent['files'][number], expiresAt: string) {
  if (!file.upload || !env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_NOT_ACTIVATED');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    expires_at: Math.floor(Date.parse(expiresAt) / 1000),
    format: file.upload.format === 'jpeg' ? 'jpg' : file.upload.format,
    public_id: file.publicId,
    timestamp,
    type: 'authenticated',
  };
  const signature = await signCloudinaryParams(params, env.CLOUDINARY_API_SECRET);
  const query = new URLSearchParams({
    api_key: env.CLOUDINARY_API_KEY,
    expires_at: String(params.expires_at),
    format: params.format,
    public_id: params.public_id,
    signature,
    timestamp: String(timestamp),
    type: params.type,
  });
  return `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/download?${query.toString()}`;
}

function parseStoredServiceExecution(value: any, updateTime?: string): ServiceExecutionStored | null {
  if (!value || value.schemaVersion !== 1 || typeof value.aggregateJson !== 'string' ||
      new TextEncoder().encode(value.aggregateJson).byteLength > SERVICE_EXECUTION_JSON_LIMIT_BYTES ||
      typeof value.creationFingerprint !== 'string' || value.creationFingerprint.length !== 43) return null;
  try {
    const aggregate = JSON.parse(value.aggregateJson) as ServiceExecutionAggregate;
    if (!isServiceExecutionAggregate(aggregate) || value.executionId !== aggregate.executionId ||
        value.serviceKind !== aggregate.serviceKind || value.status !== aggregate.status || value.revision !== aggregate.revision ||
        value.customerUid !== aggregate.customerUid || value.providerUid !== aggregate.providerUid ||
        value.sourceKind !== aggregate.source.kind || value.sourceId !== aggregate.source.id) return null;
    return { aggregate, creationFingerprint: value.creationFingerprint, updateTime };
  } catch { return null; }
}

function serviceExecutionFields(stored: ServiceExecutionStored) {
  const aggregateJson = JSON.stringify(stored.aggregate);
  if (new TextEncoder().encode(aggregateJson).byteLength > SERVICE_EXECUTION_JSON_LIMIT_BYTES) {
    throw new ServiceExecutionError('EXECUTION_STORAGE_LIMIT_REACHED');
  }
  const state = stored.aggregate;
  return {
    schemaVersion: { integerValue: '1' },
    executionId: { stringValue: state.executionId },
    serviceKind: { stringValue: state.serviceKind },
    lifecycleAuthority: { stringValue: state.lifecycleAuthority },
    sourceKind: { stringValue: state.source.kind },
    sourceId: { stringValue: state.source.id },
    customerUid: { stringValue: state.customerUid },
    providerUid: { stringValue: state.providerUid },
    status: { stringValue: state.status },
    revision: { integerValue: String(state.revision) },
    createdAt: { timestampValue: state.createdAt },
    updatedAt: { timestampValue: state.updatedAt },
    creationFingerprint: { stringValue: stored.creationFingerprint },
    aggregateJson: { stringValue: aggregateJson },
  };
}

function serviceExecutionWrite(env: Env, stored: ServiceExecutionStored, expectedUpdateTime?: string) {
  const fields = serviceExecutionFields(stored);
  return {
    update: { name: fullName(env, `serviceExecutions/${encodeURIComponent(stored.aggregate.executionId)}`), fields },
    ...(expectedUpdateTime ? { updateMask: { fieldPaths: Object.keys(fields) } } : {}),
    currentDocument: expectedUpdateTime ? { updateTime: expectedUpdateTime } : { exists: false },
  };
}

async function serviceExecutionEventWrite(env: Env, aggregate: ServiceExecutionAggregate) {
  const event = aggregate.events.at(-1);
  if (!event) throw new ServiceExecutionError('SERVICE_EXECUTION_UNAVAILABLE');
  return {
    update: { name: fullName(env, `serviceExecutionEvents/${encodeURIComponent(event.eventId)}`), fields: {
      executionId: { stringValue: aggregate.executionId },
      revision: { integerValue: String(event.revision) },
      action: { stringValue: event.action },
      actorRole: { stringValue: event.actorRole },
      actorHash: { stringValue: await hashedId(`service-execution-actor:${event.actorUid}`) },
      occurredAt: { timestampValue: event.occurredAt },
      ...(event.evidence?.note ? { evidenceNote: { stringValue: event.evidence.note } } : {}),
      ...(event.evidence?.mediaIntentId ? { evidenceIntentId: { stringValue: event.evidence.mediaIntentId } } : {}),
      ...(event.evidence?.media?.length ? { evidenceMediaIds: { arrayValue: { values: event.evidence.media.map(item => ({ stringValue: item.mediaId })) } } } : {}),
    } }, currentDocument: { exists: false },
  };
}

function executionAccountEligible(account: any, aggregate: Pick<ServiceExecutionAggregate, 'serviceKind'>, role: 'customer' | 'provider') {
  if (!account || isStoreReviewAccount(account) || isOperationallyBlocked(account) || account.isActive === false ||
      account.accountStatus !== undefined && account.accountStatus !== 'active') return false;
  if (role === 'customer') return account.role === 'customer';
  return aggregate.serviceKind === 'equipment_rental' ? account.role === 'provider' : account.role === 'driver';
}

async function executionAccountVerify(env: Env, uid: string, aggregate: Pick<ServiceExecutionAggregate, 'serviceKind'>, role: 'customer' | 'provider', transaction?: string) {
  const raw = transaction
    ? await transactionDocument(env, `users/${encodeURIComponent(uid)}`, transaction)
    : await getRawDoc(env, 'users', uid);
  if (!raw?.updateTime || !executionAccountEligible(raw.data, aggregate, role)) throw new ServiceExecutionError('EXECUTION_ACCOUNT_INELIGIBLE');
  return { account: raw.data, verify: { verify: fullName(env, `users/${encodeURIComponent(uid)}`), currentDocument: { updateTime: raw.updateTime } } };
}

function serviceExecutionView(env: Env, aggregate: ServiceExecutionAggregate, actorUid: string, rentalStatus?: string) {
  const access = actorUid === aggregate.customerUid ? 'customer' : actorUid === aggregate.providerUid ? 'provider' : null;
  if (!access) throw new ServiceExecutionError('EXECUTION_NOT_AUTHORIZED');
  return {
    access,
    execution: {
      executionId: aggregate.executionId,
      serviceKind: aggregate.serviceKind,
      lifecycleAuthority: aggregate.lifecycleAuthority,
      source: aggregate.source,
      status: aggregate.status,
      revision: aggregate.revision,
      createdAt: aggregate.createdAt,
      updatedAt: aggregate.updatedAt,
      ...(aggregate.lifecycleAuthority === 'rental_v2' ? { rentalStatus: rentalStatus || 'unavailable' } : {}),
      events: aggregate.events.map(event => ({
        eventId: event.eventId, revision: event.revision, action: event.action, actorRole: event.actorRole,
        occurredAt: event.occurredAt, ...(event.evidence ? { evidence: {
          ...(event.evidence.note ? { note: event.evidence.note } : {}),
          ...(event.evidence.media?.length ? { media: event.evidence.media } : {}),
        } } : {}),
      })),
    },
    activation: { productionEnabled: false, reason: SERVICE_EXECUTION_PRODUCTION_ACTIVATION },
    evidenceMedia: {
      enabled: privateEvidenceCapability(env).enabled,
      ...(privateEvidenceCapability(env).enabled ? {} : { reason: PRIVATE_EVIDENCE_MEDIA_PRODUCTION_ACTIVATION }),
      limits: {
        maxFilesPerEvent: PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFilesPerEvent,
        maxFileBytes: PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFileBytes,
      },
    },
  };
}

function serviceExecutionNotificationEvent(action: ServiceExecutionAction): NotificationEvent {
  const events: Record<ServiceExecutionAction, NotificationEvent> = {
    start: 'service_execution_started',
    record_progress: 'service_execution_progress_recorded',
    confirm_pickup: 'service_execution_pickup_confirmed',
    confirm_delivery: 'service_execution_delivery_confirmed',
    request_completion: 'service_execution_completion_requested',
    confirm_completion: 'service_execution_completed',
    dispute_completion: 'service_execution_disputed',
    record_handover: 'service_execution_handover_recorded',
    record_return: 'service_execution_return_recorded',
  };
  return events[action];
}

async function rentalExecutionStatus(env: Env, aggregate: ServiceExecutionAggregate, transaction?: string) {
  if (aggregate.lifecycleAuthority !== 'rental_v2') return undefined;
  const raw = transaction
    ? await transactionDocument(env, `equipmentRequests/${encodeURIComponent(aggregate.source.id)}`, transaction)
    : await getRawDoc(env, 'equipmentRequests', aggregate.source.id);
  if (!raw?.data || raw.data.pricingModelVersion !== 2 || raw.data.customerUid !== aggregate.customerUid || raw.data.providerUid !== aggregate.providerUid) {
    throw new ServiceExecutionError('EXECUTION_SOURCE_NOT_FOUND');
  }
  return { status: String(raw.data.status || ''), verify: raw.updateTime
    ? { verify: fullName(env, `equipmentRequests/${encodeURIComponent(aggregate.source.id)}`), currentDocument: { updateTime: raw.updateTime } }
    : undefined };
}

async function createServiceExecution(req: Request, env: Env, user: User) {
  if (serviceExecutionActivationOverride !== true) return serviceExecutionDisabled(req, env);
  try {
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_execution_create');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many service execution attempts');
    if (limited) return limited;
    const parsed = await readBoundedJson(req, SERVICE_EXECUTION_BODY_LIMIT_BYTES);
    if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
    const body = parsed.status === 'ok' && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value) ? parsed.value as any : null;
    if (!body || !Object.keys(body).every(key => ['sourceKind', 'sourceId', 'idempotencyKey'].includes(key)) ||
        !['service_contract', 'rental_request'].includes(String(body.sourceKind)) ||
        !SERVICE_EXECUTION_SOURCE_ID.test(String(body.sourceId || '')) || typeof body.idempotencyKey !== 'string') {
      throw new ServiceExecutionError('INVALID_SERVICE_EXECUTION');
    }
    // Deliberately no request/env-controlled resolver: only local test code can
    // supply a confirmed source binding while Production activation is closed.
    const binding = await serviceExecutionBindingOverride?.(body.sourceKind, body.sourceId);
    if (!binding || binding.sourceKind !== body.sourceKind || binding.sourceId !== body.sourceId) {
      throw new ServiceExecutionError('EXECUTION_PREREQUISITES_NOT_MET');
    }
    const creationFingerprint = await hashedId(stableJson({
      sourceKind: binding.sourceKind, sourceId: binding.sourceId, sourceRevision: binding.sourceRevision,
      serviceKind: binding.serviceKind, customerUid: binding.customerUid, providerUid: binding.providerUid,
    }));
    const executionId = `execution_${await hashedId(`service-execution:${binding.sourceKind}:${binding.sourceId}`)}`;
    const aggregate = createConfirmedExecution(binding, { executionId, actorUid: user.uid, idempotencyKey: body.idempotencyKey, now: new Date().toISOString() });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) throw new ServiceExecutionError('SERVICE_EXECUTION_UNAVAILABLE');
      const priorRaw = await transactionDocument(env, `serviceExecutions/${encodeURIComponent(executionId)}`, transaction);
      const prior = parseStoredServiceExecution(priorRaw?.data, priorRaw?.updateTime);
      if (prior) {
        await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
        if (prior.creationFingerprint !== creationFingerprint || prior.aggregate.customerUid !== user.uid) throw new ServiceExecutionError('IDEMPOTENCY_CONFLICT');
        const [, , rental] = await Promise.all([
          executionAccountVerify(env, prior.aggregate.customerUid, prior.aggregate, 'customer'),
          executionAccountVerify(env, prior.aggregate.providerUid, prior.aggregate, 'provider'),
          rentalExecutionStatus(env, prior.aggregate),
        ]);
        return out(env, req, { success: true, ...serviceExecutionView(env, prior.aggregate, user.uid, rental?.status), replayed: true });
      }
      const [customer, provider, rental] = await Promise.all([
        executionAccountVerify(env, binding.customerUid, aggregate, 'customer', transaction),
        executionAccountVerify(env, binding.providerUid, aggregate, 'provider', transaction),
        rentalExecutionStatus(env, aggregate, transaction),
      ]);
      if (rental && !['accepted', 'in_progress', 'completion_requested'].includes(rental.status)) {
        throw new ServiceExecutionError('EXECUTION_PREREQUISITES_NOT_MET');
      }
      try {
        await commitWrites(env, [
          serviceExecutionWrite(env, { aggregate, creationFingerprint }),
          customer.verify,
          provider.verify,
          ...(rental?.verify ? [rental.verify] : []),
          await serviceExecutionEventWrite(env, aggregate),
          ...(await enqueueServiceNotifications(
            env,
            [aggregate.providerUid],
            'service_execution_confirmed',
            aggregate.executionId,
            aggregate.updatedAt,
            `service-execution:${aggregate.executionId}:confirmed`,
          )),
        ], transaction);
        return out(env, req, { success: true, ...serviceExecutionView(env, aggregate, user.uid, rental?.status), replayed: false }, 201);
      } catch (error) {
        if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
      }
    }
    throw new ServiceExecutionError('SERVICE_EXECUTION_CONFLICT');
  } catch (error) { return serviceExecutionErrorResponse(req, env, error); }
}

async function getServiceExecution(req: Request, env: Env, user: User, executionId: string) {
  if (serviceExecutionActivationOverride !== true) return serviceExecutionDisabled(req, env);
  try {
    const raw = await getRawDoc(env, 'serviceExecutions', executionId);
    const stored = parseStoredServiceExecution(raw?.data, raw?.updateTime);
    if (!stored) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    const role = user.uid === stored.aggregate.customerUid ? 'customer' : user.uid === stored.aggregate.providerUid ? 'provider' : null;
    if (!role) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    await executionAccountVerify(env, user.uid, stored.aggregate, role);
    const rental = await rentalExecutionStatus(env, stored.aggregate);
    return out(env, req, { success: true, ...serviceExecutionView(env, stored.aggregate, user.uid, rental?.status) });
  } catch (error) { return serviceExecutionErrorResponse(req, env, error); }
}

function privateEvidenceIntentResponse(intent: PrivateEvidenceUploadIntent) {
  return {
    intentId: intent.intentId,
    expiresAt: intent.expiresAt,
    state: intent.state,
    files: intent.files.map(file => ({
      clientFileId: file.clientFileId,
      mediaId: file.mediaId,
      uploaded: !!file.upload,
      uploadPath: `/api/service-executions/${intent.executionId}/evidence-media/intents/${intent.intentId}/files/${file.mediaId}`,
    })),
  };
}

async function createPrivateEvidenceIntentRequest(req: Request, env: Env, user: User, executionId: string) {
  if (serviceExecutionActivationOverride !== true) return serviceExecutionDisabled(req, env);
  try {
    const capability = privateEvidenceCapability(env);
    if (!capability.enabled) throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_NOT_ACTIVATED');
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_evidence_intent');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many evidence upload attempts');
    if (limited) return limited;
    const parsed = await readBoundedJson(req, SERVICE_EXECUTION_BODY_LIMIT_BYTES);
    if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
    const body = parsed.status === 'ok' && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value) ? parsed.value as any : null;
    const actions: ServiceExecutionAction[] = ['start', 'record_progress', 'confirm_pickup', 'confirm_delivery', 'request_completion', 'dispute_completion', 'record_handover', 'record_return'];
    if (!body || !Object.keys(body).every(key => ['expectedRevision', 'action', 'idempotencyKey', 'files'].includes(key)) ||
        !Number.isSafeInteger(body.expectedRevision) || !actions.includes(body.action) || typeof body.idempotencyKey !== 'string' || !Array.isArray(body.files)) {
      throw new PrivateEvidenceMediaError('INVALID_EVIDENCE_INTENT');
    }
    const intentId = `evidence_intent_${await hashedId(`service-evidence-intent:${executionId}:${user.uid}:${body.idempotencyKey}`)}`;
    const folder = env.CLOUDINARY_FOLDER || 'heavyar';
    const serverFiles = await Promise.all(body.files.map(async (file: any) => {
      const mediaId = `evidence_media_${await hashedId(`service-evidence-file:${intentId}:${String(file?.clientFileId || '')}`)}`;
      return { mediaId, publicId: `${folder}/evidence/${executionId}/${mediaId}` };
    }));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_UNAVAILABLE');
      const [executionRaw, priorRaw] = await Promise.all([
        transactionDocument(env, `serviceExecutions/${encodeURIComponent(executionId)}`, transaction),
        transactionDocument(env, `serviceEvidenceUploadIntents/${encodeURIComponent(intentId)}`, transaction),
      ]);
      const stored = parseStoredServiceExecution(executionRaw?.data, executionRaw?.updateTime);
      if (!stored) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
      const role = user.uid === stored.aggregate.customerUid ? 'customer' : user.uid === stored.aggregate.providerUid ? 'provider' : null;
      if (!role) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
      const liveBinding = await serviceExecutionBindingOverride?.(stored.aggregate.source.kind, stored.aggregate.source.id);
      if (!executionBindingMatches(stored.aggregate, liveBinding)) throw new ServiceExecutionError('EXECUTION_SOURCE_CHANGED');
      const [customer, provider, rental] = await Promise.all([
        executionAccountVerify(env, stored.aggregate.customerUid, stored.aggregate, 'customer', transaction),
        executionAccountVerify(env, stored.aggregate.providerUid, stored.aggregate, 'provider', transaction),
        rentalExecutionStatus(env, stored.aggregate, transaction),
      ]);
      const actor = role === 'customer' ? customer : provider;
      // Validate that this actor can perform the intended lifecycle action
      // before reserving provider storage. No state is persisted by this dry run.
      transitionServiceExecution(stored.aggregate, {
        action: body.action,
        expectedRevision: body.expectedRevision,
        idempotencyKey: body.idempotencyKey,
      }, user.uid, new Date().toISOString(), rental?.status);
      const prior = parseStoredPrivateEvidenceIntent(priorRaw?.data, priorRaw?.updateTime)?.intent;
      const intent = createPrivateEvidenceUploadIntent({
        capability,
        execution: stored.aggregate,
        actorUid: user.uid,
        actorAccount: actor.account,
        expectedRevision: body.expectedRevision,
        action: body.action,
        idempotencyKey: body.idempotencyKey,
        files: body.files,
        prior,
        server: { intentId, files: serverFiles, now: new Date().toISOString() },
      });
      if (prior) {
        await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
        return out(env, req, { success: true, ...privateEvidenceIntentResponse(intent), replayed: true });
      }
      try {
        await commitWrites(env, [
          await privateEvidenceIntentWrite(env, intent),
          customer.verify,
          provider.verify,
          ...(rental?.verify ? [rental.verify] : []),
        ], transaction);
        return out(env, req, { success: true, ...privateEvidenceIntentResponse(intent), replayed: false }, 201);
      } catch (error) {
        if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
      }
    }
    throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_CONFLICT');
  } catch (error) { return serviceExecutionErrorResponse(req, env, error); }
}

async function uploadPrivateEvidenceFile(req: Request, env: Env, user: User, executionId: string, intentId: string, mediaId: string) {
  if (serviceExecutionActivationOverride !== true) return serviceExecutionDisabled(req, env);
  try {
    const capability = privateEvidenceCapability(env);
    if (!capability.enabled || !env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_NOT_ACTIVATED');
    }
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_evidence_upload');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many evidence uploads');
    if (limited) return limited;
    const declaredLength = Number(req.headers.get('Content-Length') || 0);
    if (declaredLength > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFileBytes + PRIVATE_EVIDENCE_MULTIPART_OVERHEAD_BYTES) {
      return out(env, req, { success: false, error: 'Evidence file too large', errorCode: 'PAYLOAD_TOO_LARGE' }, 413);
    }
    const [executionRaw, intentRaw] = await Promise.all([
      getRawDoc(env, 'serviceExecutions', executionId),
      getRawDoc(env, 'serviceEvidenceUploadIntents', intentId),
    ]);
    const stored = parseStoredServiceExecution(executionRaw?.data, executionRaw?.updateTime);
    const storedIntent = parseStoredPrivateEvidenceIntent(intentRaw?.data, intentRaw?.updateTime);
    if (!stored || !storedIntent || storedIntent.intent.executionId !== executionId) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    const role = user.uid === stored.aggregate.customerUid ? 'customer' : user.uid === stored.aggregate.providerUid ? 'provider' : null;
    if (!role || storedIntent.intent.actorUid !== user.uid) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    await executionAccountVerify(env, user.uid, stored.aggregate, role);
    const liveBinding = await serviceExecutionBindingOverride?.(stored.aggregate.source.kind, stored.aggregate.source.id);
    if (!executionBindingMatches(stored.aggregate, liveBinding)) throw new ServiceExecutionError('EXECUTION_SOURCE_CHANGED');
    const expected = storedIntent.intent.files.find(file => file.mediaId === mediaId);
    if (!expected) throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
    if (expected.upload) return out(env, req, { success: true, mediaId, uploaded: true, replayed: true });
    if (storedIntent.intent.state !== 'pending' || Date.now() > Date.parse(storedIntent.intent.expiresAt)) {
      throw new PrivateEvidenceMediaError('EVIDENCE_INTENT_EXPIRED');
    }
    const form: any = await req.formData().catch(() => null), file = form?.get('file');
    if (!form || Array.from(form.keys() as Iterable<string>).some(key => key !== 'file') || !(file instanceof Blob) ||
        file.type !== expected.mimeType || file.size !== expected.sizeBytes || file.size > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFileBytes) {
      throw new PrivateEvidenceMediaError('INVALID_EVIDENCE_FILE');
    }
    const sourceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { overwrite: false, public_id: expected.publicId, timestamp, transformation: 'fl_force_strip', type: 'authenticated' };
    const signature = await signCloudinaryParams(params, env.CLOUDINARY_API_SECRET);
    const upload = new FormData();
    upload.append('file', file);
    upload.append('overwrite', 'false');
    upload.append('public_id', expected.publicId);
    upload.append('timestamp', String(timestamp));
    upload.append('transformation', 'fl_force_strip');
    upload.append('type', 'authenticated');
    upload.append('api_key', env.CLOUDINARY_API_KEY);
    upload.append('signature', signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`, { method: 'POST', body: upload });
    const result: any = await response.json().catch(() => null);
    if (!response.ok || !await verifyCloudinaryUploadResponse(result, expected.publicId, env.CLOUDINARY_API_SECRET)) {
      if (response.ok) await destroyPrivateEvidenceAsset(env, expected.publicId).catch(() => false);
      throw new PrivateEvidenceMediaError('EVIDENCE_UPLOAD_VERIFICATION_FAILED');
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_UNAVAILABLE');
      const currentRaw = await transactionDocument(env, `serviceEvidenceUploadIntents/${encodeURIComponent(intentId)}`, transaction);
      const current = parseStoredPrivateEvidenceIntent(currentRaw?.data, currentRaw?.updateTime);
      if (!current?.updateTime) throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
      const next = recordVerifiedPrivateEvidenceUpload({
        intent: current.intent,
        actorUid: user.uid,
        mediaId,
        receipt: {
          assetId: result.asset_id,
          version: result.version,
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          sha256: sourceSha256,
          uploadedAt: new Date().toISOString(),
        },
        now: new Date().toISOString(),
      });
      try {
        await commitWrites(env, [await privateEvidenceIntentWrite(env, next, current.updateTime)], transaction);
        return out(env, req, { success: true, mediaId, uploaded: true, replayed: next === current.intent });
      } catch (error) {
        if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
      }
    }
    throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_CONFLICT');
  } catch (error) { return serviceExecutionErrorResponse(req, env, error); }
}

async function accessPrivateEvidenceFile(req: Request, env: Env, user: User, executionId: string, eventId: string, mediaId: string) {
  if (serviceExecutionActivationOverride !== true) return serviceExecutionDisabled(req, env);
  try {
    const capability = privateEvidenceCapability(env);
    if (!capability.enabled) throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_NOT_ACTIVATED');
    const executionRaw = await getRawDoc(env, 'serviceExecutions', executionId);
    const stored = parseStoredServiceExecution(executionRaw?.data, executionRaw?.updateTime);
    if (!stored) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    const role = user.uid === stored.aggregate.customerUid ? 'customer' : user.uid === stored.aggregate.providerUid ? 'provider' : null;
    if (!role) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    const event = stored.aggregate.events.find(item => item.eventId === eventId);
    const intentId = event?.evidence?.mediaIntentId;
    if (!event || !intentId || !event.evidence?.media?.some(item => item.mediaId === mediaId)) {
      throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    }
    const [account, intentRaw] = await Promise.all([
      executionAccountVerify(env, user.uid, stored.aggregate, role),
      getRawDoc(env, 'serviceEvidenceUploadIntents', intentId),
    ]);
    const intent = parseStoredPrivateEvidenceIntent(intentRaw?.data, intentRaw?.updateTime)?.intent;
    if (!intent || intent.attachedEventId !== eventId) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    const grant = issuePrivateEvidenceAccessGrant({
      capability,
      intent,
      execution: stored.aggregate,
      requesterUid: user.uid,
      requesterAccount: account.account,
      server: { grantId: `evidence_grant_${await hashedId(`service-evidence-grant:${user.uid}:${eventId}:${mediaId}:${Date.now()}:${crypto.randomUUID()}`)}`, now: new Date().toISOString() },
    });
    if (!grant.mediaIds.includes(mediaId)) throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
    const file = intent.files.find(item => item.mediaId === mediaId);
    if (!file?.upload) throw new PrivateEvidenceMediaError('EVIDENCE_UPLOAD_INCOMPLETE');
    return out(env, req, {
      success: true,
      mediaId,
      expiresAt: grant.expiresAt,
      url: await privateEvidenceDownloadUrl(env, file, grant.expiresAt),
    });
  } catch (error) { return serviceExecutionErrorResponse(req, env, error); }
}

async function destroyPrivateEvidenceAsset(env: Env, publicId: string) {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return false;
  const timestamp = Math.floor(Date.now() / 1000), params = { public_id: publicId, timestamp, type: 'authenticated' };
  const form = new FormData();
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('type', 'authenticated');
  form.append('api_key', env.CLOUDINARY_API_KEY);
  form.append('signature', await signCloudinaryParams(params, env.CLOUDINARY_API_SECRET));
  const response = await scheduledExternalFetch(env, 'cloudinary', `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/destroy`, { method: 'POST', body: form });
  const result: any = await response.json().catch(() => null);
  return response.ok && ['ok', 'not found'].includes(String(result?.result || ''));
}

async function claimScheduledPrivateEvidenceCleanup(env: Env, intentId: string, now: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const transaction = await beginTransaction(env);
    if (!transaction) throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_UNAVAILABLE');
    const raw = await transactionDocument(env, `serviceEvidenceUploadIntents/${encodeURIComponent(intentId)}`, transaction);
    const current = parseStoredPrivateEvidenceIntent(raw?.data, raw?.updateTime);
    if (!current?.updateTime || current.intent.intentId !== intentId) {
      await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
      return null;
    }
    let claimed: PrivateEvidenceUploadIntent;
    try {
      claimed = claimPrivateEvidenceCleanup({
        intent: current.intent,
        claimId: `evidence_cleanup_${await hashedId(`service-evidence-cleanup:${intentId}:${now}:${crypto.randomUUID()}`)}`,
        now,
      });
    } catch (error) {
      await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
      if (error instanceof PrivateEvidenceMediaError && error.code === 'EVIDENCE_CLEANUP_NOT_ELIGIBLE') return null;
      throw error;
    }
    try {
      await commitWrites(env, [await privateEvidenceIntentWrite(env, claimed, current.updateTime)], transaction);
      return claimed;
    } catch (error) {
      if (!(error instanceof FirestorePreconditionError) || attempt === 2) throw error;
    }
  }
  return null;
}

async function settleScheduledPrivateEvidenceCleanup(env: Env, claimed: PrivateEvidenceUploadIntent, deleted: boolean, now: string) {
  const claimId = claimed.cleanup?.claimId;
  if (!claimId) throw new PrivateEvidenceMediaError('EVIDENCE_CLEANUP_CLAIM_MISMATCH');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const transaction = await beginTransaction(env);
    if (!transaction) throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_UNAVAILABLE');
    const raw = await transactionDocument(env, `serviceEvidenceUploadIntents/${encodeURIComponent(claimed.intentId)}`, transaction);
    const current = parseStoredPrivateEvidenceIntent(raw?.data, raw?.updateTime);
    if (!current?.updateTime || current.intent.state !== 'cleanup_claimed' || current.intent.cleanup?.claimId !== claimId) {
      await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
      return false;
    }
    const next = deleted
      ? completePrivateEvidenceCleanup({ intent: current.intent, claimId, now })
      : retryPrivateEvidenceCleanup({ intent: current.intent, claimId, now });
    try {
      await commitWrites(env, [await privateEvidenceIntentWrite(env, next, current.updateTime)], transaction);
      return true;
    } catch (error) {
      if (!(error instanceof FirestorePreconditionError) || attempt === 2) throw error;
    }
  }
  return false;
}

export async function processPrivateEvidenceCleanup(env: Env, nowOverride?: string) {
  // The processor deliberately does not depend on feature activation: it must
  // finish previously reserved private assets even if execution is later
  // disabled. Missing provider credentials fail closed and leave records due.
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) return;
  const now = nowOverride || new Date().toISOString();
  const rows = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'serviceEvidenceUploadIntents' }],
    where: { fieldFilter: { field: { fieldPath: 'cleanupDueAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: now } } },
    orderBy: [{ field: { fieldPath: 'cleanupDueAt' }, direction: 'ASCENDING' }],
    limit: PRIVATE_EVIDENCE_MEDIA_LIMITS.cleanupCandidateScanLimit,
  } }) }) as any[] || [];
  for (const row of rows) {
    const intentId = String(row?.document?.name || '').split('/').pop() || '';
    if (!PRIVATE_EVIDENCE_INTENT_ID.test(intentId)) continue;
    const claimed = await claimScheduledPrivateEvidenceCleanup(env, intentId, now);
    if (!claimed) continue;
    let deleted = true;
    for (const file of claimed.files) {
      if (!await destroyPrivateEvidenceAsset(env, file.publicId).catch(() => false)) {
        deleted = false;
        break;
      }
    }
    await settleScheduledPrivateEvidenceCleanup(env, claimed, deleted, now);
    // One claimed intent costs at most eleven external subrequests including
    // query, claim/finalize transactions and three authenticated deletions.
    return;
  }
}

async function abandonPrivateEvidenceIntentRequest(req: Request, env: Env, user: User, executionId: string, intentId: string) {
  if (serviceExecutionActivationOverride !== true) return serviceExecutionDisabled(req, env);
  try {
    const executionRaw = await getRawDoc(env, 'serviceExecutions', executionId);
    const stored = parseStoredServiceExecution(executionRaw?.data, executionRaw?.updateTime);
    if (!stored) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    const role = user.uid === stored.aggregate.customerUid ? 'customer' : user.uid === stored.aggregate.providerUid ? 'provider' : null;
    if (!role) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
    await executionAccountVerify(env, user.uid, stored.aggregate, role);
    let abandoned: PrivateEvidenceUploadIntent | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_UNAVAILABLE');
      const intentRaw = await transactionDocument(env, `serviceEvidenceUploadIntents/${encodeURIComponent(intentId)}`, transaction);
      const current = parseStoredPrivateEvidenceIntent(intentRaw?.data, intentRaw?.updateTime);
      if (!current?.updateTime || current.intent.executionId !== executionId) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
      abandoned = abandonPrivateEvidenceIntent({ intent: current.intent, actorUid: user.uid, now: new Date().toISOString() });
      if (abandoned === current.intent) {
        await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
        break;
      }
      try {
        await commitWrites(env, [await privateEvidenceIntentWrite(env, abandoned, current.updateTime)], transaction);
        break;
      } catch (error) {
        if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
      }
    }
    if (!abandoned) throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_CONFLICT');
    // Deleting every reserved, server-generated public ID also covers the
    // orphan window where Cloudinary accepted a file but the receipt CAS did
    // not commit. `not found` is an idempotent success.
    const cleanup = await Promise.all(abandoned.files.map(file => destroyPrivateEvidenceAsset(env, file.publicId).catch(() => false)));
    return out(env, req, { success: true, state: 'abandoned', cleanupPending: cleanup.some(result => !result) });
  } catch (error) { return serviceExecutionErrorResponse(req, env, error); }
}

async function transitionServiceExecutionRequest(req: Request, env: Env, user: User, executionId: string) {
  if (serviceExecutionActivationOverride !== true) return serviceExecutionDisabled(req, env);
  try {
    const limit = await allowAuthenticatedMutation(env, user.uid, 'service_execution_transition');
    const limited = authenticatedMutationRateLimitResponse(req, env, limit, 'Too many service execution updates');
    if (limited) return limited;
    const parsed = await readBoundedJson(req, SERVICE_EXECUTION_BODY_LIMIT_BYTES);
    if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
    const body = parsed.status === 'ok' && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value) ? parsed.value as any : null;
    const actions: ServiceExecutionAction[] = ['start', 'record_progress', 'confirm_pickup', 'confirm_delivery', 'request_completion', 'confirm_completion', 'dispute_completion', 'record_handover', 'record_return'];
    if (!body || !Object.keys(body).every(key => ['action', 'expectedRevision', 'idempotencyKey', 'evidence'].includes(key)) ||
        !actions.includes(body.action) || !Number.isSafeInteger(body.expectedRevision) || typeof body.idempotencyKey !== 'string') {
      throw new ServiceExecutionError('INVALID_EXECUTION_TRANSITION');
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const transaction = await beginTransaction(env);
      if (!transaction) throw new ServiceExecutionError('SERVICE_EXECUTION_UNAVAILABLE');
      const raw = await transactionDocument(env, `serviceExecutions/${encodeURIComponent(executionId)}`, transaction);
      const stored = parseStoredServiceExecution(raw?.data, raw?.updateTime);
      if (!stored?.updateTime) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
      const role = user.uid === stored.aggregate.customerUid ? 'customer' : user.uid === stored.aggregate.providerUid ? 'provider' : null;
      if (!role) throw new ServiceExecutionError('EXECUTION_NOT_FOUND');
      const liveBinding = await serviceExecutionBindingOverride?.(stored.aggregate.source.kind, stored.aggregate.source.id);
      if (!executionBindingMatches(stored.aggregate, liveBinding)) throw new ServiceExecutionError('EXECUTION_SOURCE_CHANGED');
      const [customer, provider, rental] = await Promise.all([
        executionAccountVerify(env, stored.aggregate.customerUid, stored.aggregate, 'customer', transaction),
        executionAccountVerify(env, stored.aggregate.providerUid, stored.aggregate, 'provider', transaction),
        rentalExecutionStatus(env, stored.aggregate, transaction),
      ]);
      const mediaIntentId = body.evidence && typeof body.evidence === 'object' && !Array.isArray(body.evidence)
        ? String(body.evidence.mediaIntentId || '') : '';
      let evidenceStored: PrivateEvidenceStored | null = null;
      if (mediaIntentId) {
        if (!PRIVATE_EVIDENCE_INTENT_ID.test(mediaIntentId) || !privateEvidenceCapability(env).enabled) {
          throw new ServiceExecutionError('EVIDENCE_PHOTO_DELIVERY_NOT_READY');
        }
        const evidenceRaw = await transactionDocument(env, `serviceEvidenceUploadIntents/${encodeURIComponent(mediaIntentId)}`, transaction);
        evidenceStored = parseStoredPrivateEvidenceIntent(evidenceRaw?.data, evidenceRaw?.updateTime);
        if (!evidenceStored?.updateTime) throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
      }
      const verifiedMedia = evidenceStored ? {
        intentId: evidenceStored.intent.intentId,
        mediaIds: evidenceStored.intent.files.map(file => file.mediaId),
      } : undefined;
      const next = transitionServiceExecution(stored.aggregate, body, user.uid, new Date().toISOString(), rental?.status, verifiedMedia);
      const actorAccount = role === 'customer' ? customer.account : provider.account;
      const attachedIntent = evidenceStored ? attachPrivateEvidenceToEvent({
        intent: evidenceStored.intent,
        execution: next,
        event: next.events.find(event => event.eventId === evidenceStored!.intent.attachedEventId) || next.events.at(-1)!,
        actorUid: user.uid,
        actorAccount,
        now: new Date().toISOString(),
      }) : null;
      if (next === stored.aggregate) {
        await fs(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) }).catch(() => undefined);
        return out(env, req, { success: true, ...serviceExecutionView(env, stored.aggregate, user.uid, rental?.status), replayed: true });
      }
      try {
        const recipientUid = user.uid === next.customerUid ? next.providerUid : next.customerUid;
        await commitWrites(env, [
          serviceExecutionWrite(env, { ...stored, aggregate: next }, stored.updateTime),
          customer.verify,
          provider.verify,
          ...(rental?.verify ? [rental.verify] : []),
          await serviceExecutionEventWrite(env, next),
          ...(attachedIntent && evidenceStored?.updateTime ? [await privateEvidenceIntentWrite(env, attachedIntent, evidenceStored.updateTime)] : []),
          ...(await enqueueServiceNotifications(
            env,
            [recipientUid],
            serviceExecutionNotificationEvent(body.action),
            next.executionId,
            next.updatedAt,
            `service-execution:${next.executionId}:${body.action}:${next.revision}`,
          )),
        ], transaction);
        return out(env, req, { success: true, ...serviceExecutionView(env, next, user.uid, rental?.status), replayed: false });
      } catch (error) {
        if (!(error instanceof FirestorePreconditionError) || attempt === 4) throw error;
      }
    }
    throw new ServiceExecutionError('SERVICE_EXECUTION_CONFLICT');
  } catch (error) { return serviceExecutionErrorResponse(req, env, error); }
}

async function reviewEquipmentDetail(req: Request, env: Env, u: User, id: string) {
  const equipment = await getDoc(env, 'equipment', id);
  const account = u.accountProfile || await getDoc(env, 'users', u.uid);
  if (account?.role !== 'customer' || !isStoreReviewAccount(account) || !equipment ||
      equipment.accountPurpose !== 'store_review' || equipment.moderationReason !== 'store_review_qa_only') {
    return out(env, req, { success: false, error: 'Equipment not found', errorCode: 'EQUIPMENT_NOT_FOUND' }, 404);
  }
  const projection = reviewEquipmentProjection(id, equipment);
  return projection
    ? out(env, req, { success: true, equipment: [projection], nextCursor: null })
    : out(env, req, { success: false, error: 'Equipment not found', errorCode: 'EQUIPMENT_NOT_FOUND' }, 404);
}
async function equipmentSearch(req: Request, env: Env) {
  const result = await searchPublicEquipment(req, {
    projectId: String(env.FIREBASE_PROJECT_ID || ''),
    allowRequest: request => publicEquipmentRateLimit(request, env),
    isMarketplaceEnabled: async countryCode => {
      const market = await countrySettings(env, countryCode);
      return market.enabled === true && market.marketplaceAvailable === true;
    },
    runQuery: query => equipmentSearchRows(env, query),
  });
  return out(env, req, result.body, result.status);
}
async function listingCreate(req: Request, env: Env, u: User) {
  if (declaredJsonPayloadTooLarge(req, LISTING_JSON_LIMIT_BYTES)) return payloadTooLargeResponse(req, env);
  mutationStage(env, 'quota');
  const rateLimit = await allowAuthenticatedMutation(env, u.uid, 'listing_create');
  const rateLimitResponse = authenticatedMutationRateLimitResponse(req, env, rateLimit, 'Too many listing submissions');
  if (rateLimitResponse) return rateLimitResponse;
  mutationStage(env, 'validation');
  try { await enforceEmailVerified(env, u, 'listing'); } catch (error) { if (error instanceof Error && error.message === 'EMAIL_VERIFICATION_REQUIRED') return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403); throw error; }
  const profile = u.accountProfile || await getDoc(env, 'users', u.uid);
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
      || isSecuritySuspended(profile)
      || !onboardingComplete) return out(env, req, { success: false, error: 'Provider onboarding required' }, 403);
  const parsedBody = await readBoundedJson(req, LISTING_JSON_LIMIT_BYTES);
  if (parsedBody.status === 'too_large') return payloadTooLargeResponse(req, env);
  const body: any = parsedBody.status === 'ok' ? parsedBody.value : null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out(env, req, { success: false, error: 'Invalid listing' }, 400);
  // Currency fields are accepted for compatibility with the current Add form,
  // but ignored: country configuration remains authoritative for stored price.
  const allowed = ['title', 'titleAr', 'titleEn', 'description', 'descriptionAr', 'descriptionEn', 'images', 'dailyPrice', 'pricePerDay', 'pricingModelVersion', 'pricing', 'category', 'countryCode', 'region', 'city', 'customCity', 'district', 'location', 'customCategory', 'availability', 'nativeCurrency', 'nativePricePerDay', 'displayCurrency'];
  const forbidden = ['ownerUid', 'providerUid', 'moderationStatus', 'verificationStatus', 'status', 'isActive', 'adminHidden', 'createdAt', 'updatedAt'];
  if (Object.keys(body).some((key) => forbidden.includes(key) || !allowed.includes(key))) return out(env, req, { success: false, error: 'Unsupported listing field' }, 400);
  const titleEn = String(body.titleEn || body.title || '').trim(), titleAr = String(body.titleAr || body.title || '').trim();
  const descriptionEn = String(body.descriptionEn || body.description || '').trim(), descriptionAr = String(body.descriptionAr || body.description || '').trim();
  const dailyPrice = Number(body.dailyPrice ?? body.pricePerDay);
  const v2 = body.pricingModelVersion === 2;
  if (!titleEn || !titleAr || titleEn.length > 160 || titleAr.length > 160 || descriptionEn.length > 5000 || descriptionAr.length > 5000 || (!v2 && (!Number.isFinite(dailyPrice) || dailyPrice <= 0 || dailyPrice > 100000))) return out(env, req, { success: false, error: 'Invalid listing fields' }, 400);
  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > 20 || images.some((image: any) => !image || typeof image !== 'object' || typeof image.publicId !== 'string' || typeof image.url !== 'string' || image.publicId.length > 300 || image.url.length > 2000)) return out(env, req, { success: false, error: 'Invalid listing images' }, 400);
  const availability = body.availability || { from: new Date().toISOString().slice(0, 10) }, availabilityCheck = validateDateRange(availability);
  if (!availabilityCheck.ok) return out(env, req, { success: false, error: availabilityCheck.error }, 400);
  if (Array.isArray(availability.blocked) && availability.blocked.some((range: any) => !validateDateRange(range).ok)) return out(env, req, { success: false, error: 'Invalid blocked dates' }, 400);
  let location;
  try { location = parsePreciseLocation(body.location); }
  catch (error) { return out(env, req, { success: false, error: error instanceof Error ? error.message : 'Invalid location', errorCode: 'INVALID_LOCATION' }, 400); }
  const requestedCountry = String(body.countryCode || profile.countryCode || 'SA').toUpperCase();
  if (profile.countryCode && requestedCountry !== String(profile.countryCode).toUpperCase()) return out(env, req, { success: false, error: 'Listing country must match provider country' }, 400);
  const country = await countrySettings(env, requestedCountry);
  if (!country.enabled || !country.providerOnboardingAvailable || !country.marketplaceAvailable) return out(env, req, { success: false, error: 'Country marketplace unavailable' }, 400);
  let pricing: ReturnType<typeof validateListingPricing> | undefined;
  if (v2) {
    try { pricing = validateListingPricing(body.pricing, country.currency); }
    catch (error) { return out(env, req, { success: false, error: error instanceof Error ? error.message : 'Invalid pricing' }, 400); }
  } else if (body.pricingModelVersion !== undefined || body.pricing !== undefined) return out(env, req, { success: false, error: 'Invalid pricing model version' }, 400);
  const id = `eq_${crypto.randomUUID().replace(/-/g, '')}`, now = new Date().toISOString();
  const ownerPublic = { uid: u.uid, nameAr: String(profile.nameAr || ''), nameEn: String(profile.nameEn || ''), avatar: String(profile.avatar || '') };
  const publicationReason = 'automated_post_moderation_eligible_provider';
  const reviewOnly = profile.accountPurpose === 'store_review';
  const value: any = { ownerUid: u.uid, ...(reviewOnly ? { accountPurpose: 'store_review' } : {}), countryCode: country.code, nativeCurrency: country.currency, ...(v2 ? { pricingModelVersion: 2, pricing } : { nativePricePerDay: dailyPrice, pricePerDay: dailyPrice }), titleAr, titleEn, descriptionAr, descriptionEn, category: String(body.category || '').slice(0, 100), region: String(body.region || '').slice(0, 100), city: String(body.city || '').slice(0, 100), customCity: String(body.customCity || '').slice(0, 100), district: String(body.district || '').slice(0, 100), location, customCategory: String(body.customCategory || '').slice(0, 100), images, availability, ownerPublic, isActive: true, visibility: reviewOnly ? 'hidden' : 'visible', moderationStatus: 'approved', moderationReason: reviewOnly ? 'store_review_qa_only' : publicationReason, createdAt: now, updatedAt: now };
  const writes: any[] = [
    { update: { name: fullName(env, `listingAudit/${encodeURIComponent(`${id}:create`)}`), fields: { listingId: { stringValue: id }, ownerUid: { stringValue: u.uid }, action: { stringValue: 'create' }, reason: { stringValue: publicationReason }, automated: { booleanValue: true }, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } },
  ];
  mutationStage(env, 'commit');
  const publicEquipmentNumber = await createWithPublicIdentifier(env, 'equipment', `equipment/${id}`, value, writes);
  mutationStage(env, 'response');
  return out(env, req, { success: true, id, listing: { id, ...value, publicEquipmentNumber, ...(v2 ? {} : { dailyPrice }) } }, 201);
}
async function listingUpdate(req: Request, env: Env, u: User, id: string) {
  mutationStage(env, 'validation');
  const raw = await getRawDoc(env, 'equipment', id);
  if (!raw?.data || raw.data.ownerUid !== u.uid) return out(env, req, { success: false, error: 'Listing not found' }, 404);
  if (raw.data.visibility === 'archived') return out(env, req, { success: false, error: 'Listing is archived' }, 409);
  const body: any = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out(env, req, { success: false, error: 'Invalid listing update' }, 400);
  const allowed = ['title', 'titleAr', 'titleEn', 'description', 'descriptionAr', 'descriptionEn', 'category', 'region', 'city', 'customCity', 'district', 'location', 'customCategory', 'dailyPrice', 'pricePerDay', 'pricingModelVersion', 'pricing', 'images', 'isActive'];
  const forbidden = ['ownerUid', 'providerUid', 'moderationStatus', 'verificationStatus', 'status', 'adminHidden', 'createdAt', 'updatedAt'];
  if (Object.keys(body).some((key) => forbidden.includes(key) || !allowed.includes(key))) return out(env, req, { success: false, error: 'Unsupported listing field' }, 400);
  let activeRows: RentalRowsResult;
  try { activeRows = await rentalRowsForEquipment(env, id, ALL_ACTIVE_RENTAL_INTERVAL); }
  catch { return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'AVAILABILITY_UNAVAILABLE' }, 503); }
  if (activeRows.exhausted) return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'AVAILABILITY_CAP_EXHAUSTED' }, 503);
  const rentals = activeRows.rows.map(row => row.data);
  if (hasActiveRental(rentals)) return out(env, req, { success: false, error: 'LISTING_EDIT_LOCKED' }, 409);
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k) && !['title', 'description', 'dailyPrice'].includes(k)));
  if (Object.prototype.hasOwnProperty.call(body, 'location')) {
    try { patch.location = parsePreciseLocation(body.location)!; }
    catch (error) { return out(env, req, { success: false, error: error instanceof Error ? error.message : 'Invalid location', errorCode: 'INVALID_LOCATION' }, 400); }
  }
  if (body.title !== undefined) { patch.titleAr = String(body.title); patch.titleEn = String(body.title); }
  if (body.description !== undefined) { patch.descriptionAr = String(body.description); patch.descriptionEn = String(body.description); }
  if (body.dailyPrice !== undefined) { patch.pricePerDay = Number(body.dailyPrice); patch.nativePricePerDay = Number(body.dailyPrice); }
  if (body.pricingModelVersion !== undefined || body.pricing !== undefined) {
    if (body.pricingModelVersion !== 2 || body.pricing === undefined) return out(env, req, { success: false, error: 'Invalid pricing model version' }, 400);
    try {
      patch.pricingModelVersion = 2;
      patch.pricing = validateListingPricing(body.pricing, String(raw.data.nativeCurrency || raw.data.currency || ''));
    } catch (error) { return out(env, req, { success: false, error: error instanceof Error ? error.message : 'Invalid pricing' }, 400); }
  }
  if (Object.keys(patch).length === 0) return out(env, req, { success: false, error: 'No editable fields' }, 400);
  if (patch.pricePerDay !== undefined && (!Number.isFinite(Number(patch.pricePerDay)) || Number(patch.pricePerDay) <= 0 || Number(patch.pricePerDay) > 100000)) return out(env, req, { success: false, error: 'Invalid daily price' }, 400);
  if (patch.isActive !== undefined) patch.visibility = listingVisibilityForOwnerActive(patch.isActive === true);
  if (raw.data.accountPurpose === 'store_review') patch.visibility = 'hidden';
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
  mutationStage(env, 'commit');
  try { await compareAndSwap(env, `equipment/${encodeURIComponent(id)}`, raw.updateTime!, fields); } catch { return out(env, req, { success: false, error: 'LISTING_UPDATE_CONFLICT' }, 409); }
  mutationStage(env, 'response');
  return out(env, req, { success: true, listingId: id, listing: { ...raw.data, ...patch } });
}
async function listingLifecycle(req: Request, env: Env, u: User, id: string, archive: boolean) {
  mutationStage(env, 'validation');
  const raw = await getRawDoc(env, 'equipment', id);
  if (!raw?.data || raw.data.ownerUid !== u.uid) return out(env, req, { success: false, error: 'Listing not found' }, 404);
  let activeRows: RentalRowsResult;
  try { activeRows = await rentalRowsForEquipment(env, id, ALL_ACTIVE_RENTAL_INTERVAL); }
  catch { return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'AVAILABILITY_UNAVAILABLE' }, 503); }
  if (activeRows.exhausted) return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'AVAILABILITY_CAP_EXHAUSTED' }, 503);
  const rentals = activeRows.rows.map(row => row.data);
  if (hasActiveRental(rentals)) return out(env, req, { success: false, error: 'LISTING_LIFECYCLE_LOCKED' }, 409);
  let history = archive;
  if (!archive) {
    try {
      if (firestoreOverride) {
        const injected = firestoreOverride('__queries', 'equipmentRequests:history');
        const fallback = injected === undefined ? firestoreOverride('__queries', 'equipmentRequests') : injected;
        history = Array.isArray(fallback) && fallback.some((item: any) => (item.data || item).equipmentId === id);
      } else {
        const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: 'equipmentRequests' }],
          where: stringField('equipmentId', 'EQUAL', id),
          limit: 1,
        } }) }) as any[] || [];
        history = result.some(row => row.document);
      }
    } catch { return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: 'AVAILABILITY_UNAVAILABLE' }, 503); }
  }
  const now = new Date().toISOString();
  const writes: any[] = archive || history
    ? [{ update: { name: fullName(env, `equipment/${encodeURIComponent(id)}`), fields: { isActive: { booleanValue: false }, visibility: { stringValue: 'archived' }, archivedAt: { timestampValue: now }, archivedBy: { stringValue: u.uid }, updatedAt: { timestampValue: now } } }, updateMask: { fieldPaths: ['isActive', 'visibility', 'archivedAt', 'archivedBy', 'updatedAt'] }, currentDocument: { updateTime: raw.updateTime } }]
    : [{ delete: fullName(env, `equipment/${encodeURIComponent(id)}`), currentDocument: { updateTime: raw.updateTime } }];
  writes.push({ update: { name: fullName(env, `listingAudit/${encodeURIComponent(`${id}:${Date.now()}`)}`), fields: { listingId: { stringValue: id }, ownerUid: { stringValue: u.uid }, action: { stringValue: archive || history ? 'archive' : 'delete' }, reason: { stringValue: archive ? 'owner_archive' : 'owner_delete' }, createdAt: { timestampValue: now } } }, currentDocument: { exists: false } });
  mutationStage(env, 'commit');
  try { await commitWrites(env, writes); } catch { return out(env, req, { success: false, error: 'LISTING_LIFECYCLE_CONFLICT' }, 409); }
  mutationStage(env, 'response');
  return out(env, req, { success: true, listingId: id, action: archive || history ? 'archived' : 'deleted', preservedRentalHistory: history });
}
async function availabilityCheck(req: Request, env: Env, u: User, id: string) {
  const listing = await getDoc(env, 'equipment', id);
  if (!listing || (listing.ownerUid !== u.uid && !canRentEquipment(u, listing))) return out(env, req, { success: false, error: 'Listing not found' }, 404);
  const body: any = await req.json().catch(() => null);
  if (body?.startAt !== undefined || body?.endAt !== undefined) {
    if (!body || Object.keys(body).some(key => !['startAt', 'endAt'].includes(key))) return out(env, req, { success: false, error: 'Invalid availability interval' }, 400);
    try {
      const probe = parseV2RequestInput({ pricingModelVersion: 2, equipmentId: id, rentalMode: 'hourly', rateUnit: 'hourly', requestedStartAt: body.startAt, requestedEndAt: body.endAt, expectedRateAmountMinor: 1 });
      assertListingAvailableForInterval(listing.availability, { startAt: probe.requestedStartAt, endAt: probe.requestedEndAt }, String(listing.countryCode || ''));
      await assertV2Available(env, id, { startAt: probe.requestedStartAt, endAt: probe.requestedEndAt });
      return out(env, req, { success: true, available: true, reason: null, serverNow: new Date().toISOString() });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INVALID_INTERVAL';
      if (['ACTIVE_RENTAL_OVERLAP', 'LISTING_AVAILABILITY_CONFLICT', 'LISTING_TEMPORARILY_UNAVAILABLE'].includes(code)) return out(env, req, { success: true, available: false, reason: code, serverNow: new Date().toISOString() });
      const availabilityFailure = code === 'AVAILABILITY_CAP_EXHAUSTED' || code === 'AVAILABILITY_UNAVAILABLE' || code === 'LISTING_AVAILABILITY_UNAVAILABLE';
      return out(env, req, { success: false, error: availabilityFailure ? 'Availability temporarily unavailable' : code, errorCode: code }, availabilityFailure ? 503 : 400);
    }
  }
  const requested = { from: String(body?.from || ''), until: body?.until === undefined ? undefined : String(body.until) };
  const valid = validateDateRange(requested);
  if (!valid.ok) return out(env, req, { success: false, error: valid.error }, 400);
  const availability = listing.availability || { from: requested.from };
  const base = availabilityAllows(availability, requested);
  if (!base.ok) return out(env, req, { success: true, available: false, reason: base.error });
  const requestedInterval = {
    startAt: `${requested.from}T00:00:00.000Z`,
    endAt: requested.until ? new Date(Date.parse(`${requested.until}T00:00:00.000Z`) + 86_400_000).toISOString() : null,
  };
  try {
    await assertV2Available(env, id, requestedInterval);
    return out(env, req, { success: true, available: true, reason: null });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AVAILABILITY_UNAVAILABLE';
    if (code === 'ACTIVE_RENTAL_OVERLAP') return out(env, req, { success: true, available: false, reason: code });
    return out(env, req, { success: false, error: 'Availability temporarily unavailable', errorCode: code === 'AVAILABILITY_CAP_EXHAUSTED' ? code : 'AVAILABILITY_UNAVAILABLE' }, 503);
  }
}
async function publicGatewayDiscovery(req: Request, env: Env, u: User) {
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({
    structuredQuery: { from: [{ collectionId: 'paymentGateways' }], limit: 20 },
  }) });
  const enabled: any[] = [];
  for (const row of (result || [])) {
    const config: any = decode(row.document || row), registry = gatewayRegistry(env, normalizeTapEnvironment(config.environment));
    const id = String(row.document?.name || '').split('/').pop() as keyof typeof registry, gateway = registry[id];
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
    for (const row of rows) {
      if (!row.data.publicId) {
        const uid = decodeURIComponent(row.name.split('/').pop() || '');
        row.data = { ...row.data, publicId: await canonicalDriverPublicId(uid) };
      }
    }
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

async function driverAccounts(env: Env, uids: string[]): Promise<Map<string, any>> {
  const unique = [...new Set(uids)].slice(0, 100);
  if (firestoreOverride) return new Map(unique.map(uid => [uid, firestoreOverride!('users', uid)]).filter((entry): entry is [string, any] => !!entry[1]));
  if (!unique.length) return new Map();
  // Firestore JSON resource names use opaque document IDs directly. URI
  // escaping applies only to HTTP path segments, not batchGet names.
  const documents = unique.map(uid => fullName(env, `users/${uid}`));
  const result = await fs(env, ':batchGet', { method: 'POST', body: JSON.stringify({ documents }) });
  return new Map((result || []).filter((row: any) => row.found).map((row: any) => {
    const document = row.found, uid = String(document.name || '').split('/').pop() || '';
    return [uid, decode(document)];
  }));
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

function eligibleAccount(account: any, role: 'driver' | 'requester', allowStoreReview = false): boolean {
  if (!account || (!allowStoreReview && isStoreReviewAccount(account)) || (account.accountStatus !== undefined && account.accountStatus !== 'active') || account.isActive === false ||
      isSecuritySuspended(account) ||
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
  if (!eligibleAccount(account, 'driver')) return false;
  const [emailAllowed, country] = await Promise.all([
    emailEligible(env, account.emailVerified, 'driver'),
    countrySettings(env, String(profile.countryCode || account.countryCode || '')),
  ]);
  if (!emailAllowed) return false;
  return country.enabled === true && country.marketplaceAvailable === true && country.code === String(profile.countryCode || '').toUpperCase();
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
  return results;
}

async function ownerDriverProfile(env: Env, uid: string, profile: any) {
  const id = await ensureDriverPublicId(env, uid, profile);
  return { ...publicDriverProfile({ ...profile, id }), active: profile.active === true, moderationStatus: String(profile.moderationStatus || 'pending_review') };
}

async function operatorDiscoveryRows(env: Env, structuredQuery: any): Promise<Array<{ id: string; data: any }>> {
  capturedOperatorQueries?.push(structuredQuery);
  if (firestoreOverride) {
    const injected = firestoreOverride('__queries', 'operatorDiscoveryProfiles');
    const facet = structuredQuery?.where?.fieldFilter?.value?.stringValue;
    let rows = (Array.isArray(injected) ? injected : [])
      .map((item: any) => ({ id: String(item.id || item.name?.split('/').pop() || ''), data: item.data || item }))
      .filter((item: any) => Array.isArray(item.data.discoveryFacets) && item.data.discoveryFacets.includes(facet))
      .sort((a: any, b: any) => String(a.data.sortKey || '').localeCompare(String(b.data.sortKey || '')) || a.id.localeCompare(b.id));
    const start = structuredQuery?.startAt?.values;
    if (Array.isArray(start) && start.length === 2) {
      const cursorSort = String(start[0]?.stringValue || '');
      const cursorId = decodeURIComponent(String(start[1]?.referenceValue || '').split('/').pop() || '');
      rows = rows.filter((row: any) => String(row.data.sortKey || '').localeCompare(cursorSort) > 0 ||
        String(row.data.sortKey || '') === cursorSort && row.id.localeCompare(cursorId) > 0);
    }
    return rows.slice(0, Number(structuredQuery.limit || 21));
  }
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) }) as any[] || [];
  return result.filter((item: any) => item.document).map((item: any) => ({
    id: decodeURIComponent(String(item.document.name).split('/').pop() || ''),
    data: decode(item.document),
  }));
}

async function operatorSearch(req: Request, env: Env) {
  const filters = parseOperatorSearch(new URL(req.url));
  if (!filters) return out(env, req, { success: false, error: 'Invalid operator search filter', errorCode: 'INVALID_OPERATOR_SEARCH' }, 400);
  // M2-D2 intentionally prepares the contract without activating a regulated
  // marketplace. Only tests can open this gate to exercise eligible fixtures.
  if (operatorDiscoveryActivationOverride !== true) return out(env, req, {
    success: true,
    activation: { enabled: false, reason: OPERATOR_DISCOVERY_ACTIVATION },
    operators: [],
    nextCursor: null,
  });
  const rate = await publicDriverRateLimit(req, env, 'operator_search');
  if (rate === null) return out(env, req, { success: false, error: 'Operator discovery temporarily unavailable', errorCode: 'OPERATOR_DISCOVERY_UNAVAILABLE' }, 503);
  if (!rate) {
    const response = out(env, req, { success: false, error: 'Too many requests', errorCode: 'RATE_LIMITED' }, 429);
    response.headers.set('Retry-After', '60');
    response.headers.set('Access-Control-Expose-Headers', 'X-Request-ID, Retry-After');
    return response;
  }
  const market = await countrySettings(env, filters.countryCode);
  if (!market.enabled || !market.marketplaceAvailable) return out(env, req, {
    success: true, activation: { enabled: true }, operators: [], nextCursor: null,
  });
  const query = operatorDiscoveryQuery(String(env.FIREBASE_PROJECT_ID || ''), filters);
  const rows = await operatorDiscoveryRows(env, query);
  const pageRows = rows.slice(0, filters.limit);
  const operators = pageRows.map(row => publicOperatorProjection(row.id, row.data)).filter(Boolean);
  const last = pageRows[pageRows.length - 1];
  let nextCursor: string | null = null;
  if (rows.length > filters.limit && last) {
    try { nextCursor = operatorCursor(String(last.data.sortKey || ''), last.id); }
    catch { nextCursor = null; }
  }
  return out(env, req, { success: true, activation: { enabled: true }, operators, nextCursor });
}

async function operatorRequestPrepare(req: Request, env: Env, user: User) {
  const maxBytes = 32 * 1024;
  if (declaredJsonPayloadTooLarge(req, maxBytes)) return payloadTooLargeResponse(req, env);
  const account = user.accountProfile || await getDoc(env, 'users', user.uid);
  const completeness = evaluateCanonicalCompleteness({ uid: user.uid, email: user.email }, account);
  if (!account || account.role !== 'customer' || isStoreReviewAccount(account) || isOperationallyBlocked(account) || account.isActive === false ||
      account.accountStatus !== undefined && account.accountStatus !== 'active' || completeness.state !== 'authenticated_complete') {
    return out(env, req, { success: false, error: 'Active customer account required', errorCode: 'CUSTOMER_ACCOUNT_REQUIRED' }, 403);
  }
  if (!await emailEligible(env, account.emailVerified ?? user.emailVerified, 'rental')) return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403);
  mutationStage(env, 'quota');
  const rateLimit = await allowAuthenticatedMutation(env, user.uid, 'operator_request_prepare');
  const limited = authenticatedMutationRateLimitResponse(req, env, rateLimit, 'Too many operator request preparations');
  if (limited) return limited;
  mutationStage(env, 'validation');
  const parsed = await readBoundedJson(req, maxBytes);
  if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
  const input = parsed.status === 'ok' ? parseOperatorRequestInput(parsed.value) : null;
  if (!input) return out(env, req, { success: false, error: 'Invalid operator request requirements', errorCode: 'INVALID_OPERATOR_REQUEST' }, 400);
  mutationStage(env, 'response');
  return out(env, req, { success: true, request: prepareOperatorRequest(input) });
}

async function transporterDiscoveryRows(env: Env, structuredQuery: any): Promise<Array<{ id: string; data: any }>> {
  capturedTransporterQueries?.push(structuredQuery);
  if (firestoreOverride) {
    const injected = firestoreOverride('__queries', 'transporterDiscoveryProfiles');
    const filters = structuredQuery?.where?.compositeFilter?.filters;
    const fieldFilters = Array.isArray(filters) ? filters.map((item: any) => item?.fieldFilter).filter(Boolean) : [];
    const facet = fieldFilters.find((item: any) => item?.field?.fieldPath === 'discoveryFacets')?.value?.stringValue;
    const minimum = (path: string) => Number(fieldFilters.find((item: any) => item?.field?.fieldPath === path)?.value?.integerValue || 0);
    const valueAt = (data: any, path: string) => path.split('.').reduce((value: any, key: string) => value?.[key], data);
    const orderPaths = ['declaredCapacityKg', 'declaredDimensionsMm.length', 'declaredDimensionsMm.width', 'declaredDimensionsMm.height', 'sortKey'];
    const compare = (left: any, right: any) => {
      for (const path of orderPaths) {
        const a = valueAt(left.data, path), b = valueAt(right.data, path);
        const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a || '').localeCompare(String(b || ''));
        if (result) return result;
      }
      return left.id.localeCompare(right.id);
    };
    let rows = (Array.isArray(injected) ? injected : [])
      .map((item: any) => ({ id: String(item.id || item.name?.split('/').pop() || ''), data: item.data || item }))
      .filter((item: any) => Array.isArray(item.data.discoveryFacets) && item.data.discoveryFacets.includes(facet))
      .filter((item: any) => Number(item.data.declaredCapacityKg) >= minimum('declaredCapacityKg') &&
        Number(item.data.declaredDimensionsMm?.length) >= minimum('declaredDimensionsMm.length') &&
        Number(item.data.declaredDimensionsMm?.width) >= minimum('declaredDimensionsMm.width') &&
        Number(item.data.declaredDimensionsMm?.height) >= minimum('declaredDimensionsMm.height'))
      .sort(compare);
    const start = structuredQuery?.startAt?.values;
    if (Array.isArray(start) && start.length === 6) {
      const cursor = {
        id: decodeURIComponent(String(start[5]?.referenceValue || '').split('/').pop() || ''),
        data: {
          declaredCapacityKg: Number(start[0]?.integerValue),
          declaredDimensionsMm: { length: Number(start[1]?.integerValue), width: Number(start[2]?.integerValue), height: Number(start[3]?.integerValue) },
          sortKey: String(start[4]?.stringValue || ''),
        },
      };
      rows = rows.filter((row: any) => compare(row, cursor) > 0);
    }
    return rows.slice(0, Number(structuredQuery.limit || 21));
  }
  const result = await fs(env, ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) }) as any[] || [];
  return result.filter((item: any) => item.document).map((item: any) => ({
    id: decodeURIComponent(String(item.document.name).split('/').pop() || ''),
    data: decode(item.document),
  }));
}

async function transporterSearch(req: Request, env: Env) {
  const filters = parseTransporterSearch(new URL(req.url));
  if (!filters) return out(env, req, { success: false, error: 'Invalid transporter search filter', errorCode: 'INVALID_TRANSPORTER_SEARCH' }, 400);
  // Regulatory activation is deliberately source-closed. Only the in-process
  // test hook can expose synthetic eligible fixtures; no HTTP/config flag can.
  if (transporterDiscoveryActivationOverride !== true) return out(env, req, {
    success: true,
    activation: { enabled: false, reason: TRANSPORTER_DISCOVERY_ACTIVATION },
    transporters: [],
    nextCursor: null,
  });
  const rate = await publicDriverRateLimit(req, env, 'transporter_search');
  if (rate === null) return out(env, req, { success: false, error: 'Transporter discovery temporarily unavailable', errorCode: 'TRANSPORTER_DISCOVERY_UNAVAILABLE' }, 503);
  if (!rate) {
    const response = out(env, req, { success: false, error: 'Too many requests', errorCode: 'RATE_LIMITED' }, 429);
    response.headers.set('Retry-After', '60');
    response.headers.set('Access-Control-Expose-Headers', 'X-Request-ID, Retry-After');
    return response;
  }
  const market = await countrySettings(env, filters.countryCode);
  if (!market.enabled || !market.marketplaceAvailable) return out(env, req, {
    success: true, activation: { enabled: true }, transporters: [], nextCursor: null,
  });
  const query = transporterDiscoveryQuery(String(env.FIREBASE_PROJECT_ID || ''), filters);
  const rows = await transporterDiscoveryRows(env, query);
  const pageRows = rows.slice(0, filters.limit);
  const transporters = pageRows.map(row => publicTransporterProjection(row.id, row.data)).filter(Boolean);
  const last = pageRows[pageRows.length - 1];
  let nextCursor: string | null = null;
  if (rows.length > filters.limit && last) {
    try { nextCursor = transporterCursorFromRow(filters, last.id, last.data); }
    catch { nextCursor = null; }
  }
  return out(env, req, { success: true, activation: { enabled: true }, transporters, nextCursor });
}

async function transportRequestPrepare(req: Request, env: Env, user: User) {
  const maxBytes = 32 * 1024;
  if (declaredJsonPayloadTooLarge(req, maxBytes)) return payloadTooLargeResponse(req, env);
  const account = user.accountProfile || await getDoc(env, 'users', user.uid);
  const completeness = evaluateCanonicalCompleteness({ uid: user.uid, email: user.email }, account);
  if (!account || account.role !== 'customer' || isStoreReviewAccount(account) || isOperationallyBlocked(account) || account.isActive === false ||
      account.accountStatus !== undefined && account.accountStatus !== 'active' || completeness.state !== 'authenticated_complete') {
    return out(env, req, { success: false, error: 'Active customer account required', errorCode: 'CUSTOMER_ACCOUNT_REQUIRED' }, 403);
  }
  if (!await emailEligible(env, account.emailVerified ?? user.emailVerified, 'rental')) return out(env, req, { success: false, error: 'EMAIL_VERIFICATION_REQUIRED' }, 403);
  mutationStage(env, 'quota');
  const rateLimit = await allowAuthenticatedMutation(env, user.uid, 'transport_request_prepare');
  const limited = authenticatedMutationRateLimitResponse(req, env, rateLimit, 'Too many transport request preparations');
  if (limited) return limited;
  mutationStage(env, 'validation');
  const parsed = await readBoundedJson(req, maxBytes);
  if (parsed.status === 'too_large') return payloadTooLargeResponse(req, env);
  const input = parsed.status === 'ok' ? parseTransportRequestInput(parsed.value) : null;
  if (!input) return out(env, req, { success: false, error: 'Invalid transport request requirements', errorCode: 'INVALID_TRANSPORT_REQUEST' }, 400);
  mutationStage(env, 'response');
  return out(env, req, { success: true, request: prepareTransportRequest(input) });
}

async function driverProfile(req: Request, env: Env, u: User) {
  if (req.method !== 'GET' && declaredJsonPayloadTooLarge(req, DRIVER_PROFILE_JSON_LIMIT_BYTES)) return payloadTooLargeResponse(req, env);
  if (req.method !== 'GET') mutationStage(env, 'validation');
  const id = u.uid, raw = u.roleProfileRaw === undefined ? await getRawDoc(env, 'driverProfiles', id) : u.roleProfileRaw;
  const account = u.accountProfile || await getDoc(env, 'users', id);
  if (!u.admin && account?.role !== 'driver') return out(env, req, { success: false, error: 'Driver profile unavailable for this account' }, 403);
  if (req.method === 'GET') return out(env, req, { success: true, profile: raw ? await ownerDriverProfile(env, id, raw.data) : null });
  mutationStage(env, 'quota');
  const rateLimit = await allowAuthenticatedMutation(env, u.uid, 'driver_profile_save');
  const rateLimitResponse = authenticatedMutationRateLimitResponse(req, env, rateLimit, 'Too many profile updates');
  if (rateLimitResponse) return rateLimitResponse;
  mutationStage(env, 'validation');
  const parsedBody = await readBoundedJson(req, DRIVER_PROFILE_JSON_LIMIT_BYTES);
  if (parsedBody.status === 'too_large') return payloadTooLargeResponse(req, env);
  const body: any = parsedBody.status === 'ok' ? parsedBody.value : null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out(env, req, { success: false, error: 'Invalid driver profile' }, 400);
  if (raw && ['suspended', 'rejected'].includes(String(raw.data.moderationStatus)) && !u.admin) return out(env, req, { success: false, error: 'DRIVER_MODERATION_LOCKED' }, 403);
  const allowed = ['displayName', 'photoUrl', 'countryCode', 'region', 'city', 'equipmentTypes', 'yearsExperience', 'description', 'availabilityStatus', 'availableFrom', 'availableUntil'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return out(env, req, { success: false, error: 'Unsupported driver profile field' }, 400);
  if (!u.admin && !eligibleAccount(account, 'driver', true)) return out(env, req, { success: false, error: 'Driver profile unavailable for this account' }, 403);
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
  mutationStage(env, 'commit');
  try {
    if (raw) await compareAndSwap(env, `driverProfiles/${encodeURIComponent(id)}`, raw.updateTime!, fields);
    else await createDoc(env, `driverProfiles/${encodeURIComponent(id)}`, fields);
  } catch (error) {
    if (String(error).includes('precondition')) return out(env, req, { success: false, error: 'Driver profile changed; refresh and retry' }, 409);
    throw error;
  }
  mutationStage(env, 'response');
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
  const verificationPolicy = await emailVerificationPolicy(env);
  let cursorReference: string | undefined;
  if (cursor) {
    const resolved = await resolveDriverPublicId(env, cursor);
    if (!resolved) return out(env, req, { success: false, error: 'Invalid cursor' }, 400);
    cursorReference = fullName(env, `driverProfiles/${encodeURIComponent(resolved.uid)}`);
  }
  const query: any = { from: [{ collectionId: 'driverProfiles' }],
    where: { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: 100 };
  if (cursorReference) query.startAt = { before: false, values: [{ referenceValue: cursorReference }] };
  const rows = await driverQueryRows(env, query);
  const identified = rows.map(row => ({ row, uid: decodeURIComponent(row.name.split('/').pop() || '') }));
  const accounts = await driverAccounts(env, identified.map(item => item.uid));
  const drivers: any[] = [];
  let lastScanned: { uid: string; profile: any } | undefined, stoppedEarly = false;
  for (let index = 0; index < identified.length; index += 1) {
    const { row, uid } = identified[index], raw = row.data, account = accounts.get(uid);
    const types = Array.isArray(raw.equipmentTypes) ? raw.equipmentTypes : [];
    lastScanned = { uid, profile: raw };
    const matches = raw.countryCode === countryCode && (!region || raw.region === region) && (!city || raw.city === city) &&
      (!q || String(raw.displayName || '').toLocaleLowerCase().includes(q.toLocaleLowerCase())) &&
      (!equipmentType || types.includes(equipmentType)) && (!availabilityStatus || raw.availabilityStatus === availabilityStatus) &&
      (!trustStatus || raw.trustStatus === trustStatus) &&
      (!requestedFrom || (raw.availableFrom && String(raw.availableFrom) <= requestedFrom)) &&
      (!requestedUntil || (raw.availableUntil && String(raw.availableUntil) >= requestedUntil));
    const eligible = driverEligibility(raw, account, market, verificationPolicy).discoverable;
    if (matches && eligible) {
      const id = await canonicalDriverPublicId(uid);
      drivers.push(publicDriverProfile({ ...raw, id }));
      if (drivers.length === limit) { stoppedEarly = index < identified.length - 1; break; }
    }
  }
  const budgetExhausted = rows.length === 100;
  const continuation = (stoppedEarly || budgetExhausted) && lastScanned
    ? await canonicalDriverPublicId(lastScanned.uid)
    : undefined;
  return out(env, req, { success: true, drivers, nextCursor: continuation });
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
  const requests = await mapWithConcurrency(rows.slice(0, limit), 5, async (row) => {
    const driverUid = String(row.data.driverUid || '');
    const requesterPromise = getDoc(env, 'users', String(row.data.requesterUid || ''));
    const driverRaw = await getDoc(env, 'driverProfiles', driverUid);
    const driverIsPublic = driverRaw && await eligibleDriver(env, String(row.data.driverUid), driverRaw);
    const [driverId, requester] = await Promise.all([
      driverIsPublic ? ensureDriverPublicId(env, driverUid, driverRaw) : Promise.resolve(null),
      requesterPromise,
    ]);
    return {
      id: row.id,
      status: String(row.data.status || ''),
      notes: String(row.data.notes || ''),
      createdAt: row.data.createdAt,
      updatedAt: row.data.updatedAt,
      driver: driverIsPublic ? publicDriverProfile({ ...driverRaw, id: driverId }) : null,
      requesterName: String(requester?.nameEn || requester?.nameAr || requester?.displayName || ''),
      isRequester: row.data.requesterUid === u.uid,
    };
  });
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
  env = { ...env, __executionCtx: executionCtx, __diagnostics: {
    requestId: crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(),
    startedAt: Date.now(),
    stage: 'authentication',
    firestoreReads: 0,
    firestoreWrites: 0,
    firestoreWriteAttempts: 0,
    firestoreRequests: 0,
    firestoreDurationMs: 0,
    upstreamDurationMs: 0,
    cas: 'not_used',
    quota: { checked: false, blocked: false, exhausted: false },
  } };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req.headers.get('Origin')) });
  const path = new URL(req.url).pathname;
  try {
    if (path === '/health') return out(env, req, { success: true, service: 'heavyar-api' });
    if (path === '/api/payment/tap-redirect' && req.method === 'GET') return tapRedirectBridge(req);
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
     if (path === '/api/compliance/policy-acceptance' && (req.method === 'GET' || req.method === 'POST')) return await policyAcceptanceApi(req, env, await authenticatedUser(req, env));
     if (path === '/api/compliance/privacy-requests' && (req.method === 'GET' || req.method === 'POST')) return await privacyRequestApi(req, env, await authenticatedUser(req, env));
     if (path === '/api/compliance/complaints' && (req.method === 'GET' || req.method === 'POST')) return await complaintApi(req, env, await authenticatedUser(req, env));
     if (path === '/api/compliance/refund-cases' && (req.method === 'GET' || req.method === 'POST')) return await refundCaseApi(req, env, await authenticatedUser(req, env));
     if (path === '/api/compliance/incidents' && (req.method === 'GET' || req.method === 'POST')) return await incidentApi(req, env, await authenticatedUser(req, env));
     if (path === '/api/compliance/data-export' && req.method === 'GET') return await userDataExportApi(req, env, await authenticatedUser(req, env));
     if (path === '/api/account/profile-status' && req.method === 'GET') return await accountProfileStatus(req, env, await auth(req, env));
     if (path === '/api/account/identity-delete' && req.method === 'POST') return await identityOnlyDeletion(req, env, await auth(req, env));
     if (path === '/api/account/deletion-request' && req.method === 'GET') return await accountDeletionStatus(req, env, await authenticatedUser(req, env, true));
     if (path === '/api/account/deletion-request' && req.method === 'POST') return await accountDeletionRequest(req, env, await authenticatedUser(req, env, true));
     if (path === '/api/verification/profile' && req.method === 'GET') return await verificationProfile(req, env, await authenticatedUser(req, env));
     if (path === '/api/regulatory-documents' && req.method === 'GET') return await regulatoryDocumentList(req, env, await authenticatedUser(req, env));
     if (path === '/api/regulatory-documents' && req.method === 'POST') return await submitRegulatoryDocument(req, env, await authenticatedUser(req, env));
     if (path === '/api/verification/policy' && req.method === 'GET') return await verificationPolicy(req, env, await authenticatedUser(req, env));
     if (path === '/api/verification/attempts' && req.method === 'POST') return await startVerification(req, env, await authenticatedUser(req, env));
      if (path === '/api/requests/estimate' && req.method === 'POST') return await estimateV2Request(req, env, await authenticatedUser(req, env));
     if (path === '/api/requests' && req.method === 'POST') return await createRequest(req, env, await authenticatedUser(req, env));
      if (path === '/api/equipment/search' && req.method === 'GET') {
        const directId = new URL(req.url).searchParams.get('id');
        if (directId && req.headers.has('Authorization')) {
          try {
            const reviewUser = await authenticatedUser(req, env);
            if (reviewUser.accountProfile && isStoreReviewAccount(reviewUser.accountProfile)) return await reviewEquipmentDetail(req, env, reviewUser, directId);
          } catch { /* public search below remains the safe fallback */ }
        }
        return await equipmentSearch(req, env);
      }
      const listingMatch = path.match(/^\/api\/listings\/([^/]+)\/availability$/);
      if (listingMatch && req.method === 'GET') return await listingAvailability(req, env, await authenticatedUser(req, env), decodeURIComponent(listingMatch[1]));
      if (listingMatch && req.method === 'PATCH') return await listingAvailabilityUpdate(req, env, await authenticatedUser(req, env), decodeURIComponent(listingMatch[1]));
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
       if (path === '/api/operators/search' && req.method === 'GET') return await operatorSearch(req, env);
       if (path === '/api/operator-requests/prepare' && req.method === 'POST') return await operatorRequestPrepare(req, env, await authenticatedUser(req, env));
       if (path === '/api/transporters/search' && req.method === 'GET') return await transporterSearch(req, env);
       if (path === '/api/transport-requests/prepare' && req.method === 'POST') return await transportRequestPrepare(req, env, await authenticatedUser(req, env));
       if ((path === '/api/service-rfqs' || path.startsWith('/api/service-rfqs/')) && serviceRfqActivationOverride !== true) {
         return serviceRfqDisabled(req, env);
       }
       if (path === '/api/service-rfqs' && req.method === 'POST') return await createServiceRfq(req, env, await authenticatedUser(req, env));
       if (path === '/api/service-rfqs' && req.method === 'GET') return await listServiceRfqs(req, env, await authenticatedUser(req, env));
       const serviceRfqDetailMatch = path.match(/^\/api\/service-rfqs\/(rfq_[A-Za-z0-9_-]{43})$/);
       if (serviceRfqDetailMatch && req.method === 'GET') return await getServiceRfq(req, env, await authenticatedUser(req, env), serviceRfqDetailMatch[1]);
       const serviceRfqQuoteCreateMatch = path.match(/^\/api\/service-rfqs\/(rfq_[A-Za-z0-9_-]{43})\/quotes$/);
       if (serviceRfqQuoteCreateMatch && req.method === 'POST') return await submitOrReviseServiceQuote(req, env, await authenticatedUser(req, env), serviceRfqQuoteCreateMatch[1]);
       const serviceRfqQuoteReviseMatch = path.match(/^\/api\/service-rfqs\/(rfq_[A-Za-z0-9_-]{43})\/quotes\/(quote_[A-Za-z0-9_-]{43})$/);
       if (serviceRfqQuoteReviseMatch && req.method === 'PUT') return await submitOrReviseServiceQuote(req, env, await authenticatedUser(req, env), serviceRfqQuoteReviseMatch[1], serviceRfqQuoteReviseMatch[2]);
       const serviceRfqQuoteWithdrawMatch = path.match(/^\/api\/service-rfqs\/(rfq_[A-Za-z0-9_-]{43})\/quotes\/(quote_[A-Za-z0-9_-]{43})\/withdraw$/);
       if (serviceRfqQuoteWithdrawMatch && req.method === 'POST') return await withdrawServiceQuote(req, env, await authenticatedUser(req, env), serviceRfqQuoteWithdrawMatch[1], serviceRfqQuoteWithdrawMatch[2]);
       const serviceRfqSelectionMatch = path.match(/^\/api\/service-rfqs\/(rfq_[A-Za-z0-9_-]{43})\/selection$/);
       if (serviceRfqSelectionMatch && req.method === 'POST') return await selectServiceQuote(req, env, await authenticatedUser(req, env), serviceRfqSelectionMatch[1]);
       const serviceRfqCancelMatch = path.match(/^\/api\/service-rfqs\/(rfq_[A-Za-z0-9_-]{43})\/cancel$/);
       if (serviceRfqCancelMatch && req.method === 'POST') return await cancelServiceRfq(req, env, await authenticatedUser(req, env), serviceRfqCancelMatch[1]);
       const serviceRfqMessagesMatch = path.match(/^\/api\/service-rfqs\/(rfq_[A-Za-z0-9_-]{43})\/messages$/);
       if (serviceRfqMessagesMatch && req.method === 'GET') return await listServiceMessages(req, env, await authenticatedUser(req, env), serviceRfqMessagesMatch[1]);
       if (serviceRfqMessagesMatch && req.method === 'POST') return await sendServiceMessage(req, env, await authenticatedUser(req, env), serviceRfqMessagesMatch[1]);
       if ((path === '/api/service-executions' || path.startsWith('/api/service-executions/')) && serviceExecutionActivationOverride !== true) {
         return serviceExecutionDisabled(req, env);
       }
       if (path === '/api/service-executions' && req.method === 'POST') return await createServiceExecution(req, env, await authenticatedUser(req, env));
       const serviceEvidenceIntentCreateMatch = path.match(/^\/api\/service-executions\/(execution_[A-Za-z0-9_-]{43})\/evidence-media\/intents$/);
       if (serviceEvidenceIntentCreateMatch && req.method === 'POST') return await createPrivateEvidenceIntentRequest(req, env, await authenticatedUser(req, env), serviceEvidenceIntentCreateMatch[1]);
       const serviceEvidenceUploadMatch = path.match(/^\/api\/service-executions\/(execution_[A-Za-z0-9_-]{43})\/evidence-media\/intents\/(evidence_intent_[A-Za-z0-9_-]{43})\/files\/(evidence_media_[A-Za-z0-9_-]{43})$/);
       if (serviceEvidenceUploadMatch && req.method === 'POST') return await uploadPrivateEvidenceFile(req, env, await authenticatedUser(req, env), serviceEvidenceUploadMatch[1], serviceEvidenceUploadMatch[2], serviceEvidenceUploadMatch[3]);
       const serviceEvidenceAbandonMatch = path.match(/^\/api\/service-executions\/(execution_[A-Za-z0-9_-]{43})\/evidence-media\/intents\/(evidence_intent_[A-Za-z0-9_-]{43})$/);
       if (serviceEvidenceAbandonMatch && req.method === 'DELETE') return await abandonPrivateEvidenceIntentRequest(req, env, await authenticatedUser(req, env), serviceEvidenceAbandonMatch[1], serviceEvidenceAbandonMatch[2]);
       const serviceEvidenceAccessMatch = path.match(/^\/api\/service-executions\/(execution_[A-Za-z0-9_-]{43})\/events\/(execution_[A-Za-z0-9_-]{43}__\d{1,3})\/evidence\/(evidence_media_[A-Za-z0-9_-]{43})\/access$/);
       if (serviceEvidenceAccessMatch && req.method === 'GET' && serviceEvidenceAccessMatch[2].startsWith(`${serviceEvidenceAccessMatch[1]}__`)) {
         return await accessPrivateEvidenceFile(req, env, await authenticatedUser(req, env), serviceEvidenceAccessMatch[1], serviceEvidenceAccessMatch[2], serviceEvidenceAccessMatch[3]);
       }
       const serviceExecutionDetailMatch = path.match(/^\/api\/service-executions\/(execution_[A-Za-z0-9_-]{43})$/);
       if (serviceExecutionDetailMatch && req.method === 'GET') return await getServiceExecution(req, env, await authenticatedUser(req, env), serviceExecutionDetailMatch[1]);
       const serviceExecutionTransitionMatch = path.match(/^\/api\/service-executions\/(execution_[A-Za-z0-9_-]{43})\/transitions$/);
       if (serviceExecutionTransitionMatch && req.method === 'POST') return await transitionServiceExecutionRequest(req, env, await authenticatedUser(req, env), serviceExecutionTransitionMatch[1]);
       const publicDriverMatch = path.match(/^\/api\/drivers\/public\/([^/]+)$/);
       if (publicDriverMatch && req.method === 'GET') return await publicDriverDetail(req, env, decodeURIComponent(publicDriverMatch[1]));
       if (path === '/api/drivers/requests' && req.method === 'GET') return await driverRequestList(req, env, await authenticatedUser(req, env));
      if (path === '/api/drivers/requests' && req.method === 'POST') return await driverRequest(req, env, await authenticatedUser(req, env));
      const driverRequestMatch = path.match(/^\/api\/drivers\/requests\/([^/]+)$/);
      if (driverRequestMatch && req.method === 'POST') return await driverRequest(req, env, await authenticatedUser(req, env), decodeURIComponent(driverRequestMatch[1]));
      if (path === '/api/service-profiles' && req.method === 'GET') return await personalServiceProfiles(req, env, await authenticatedUser(req, env));
      const serviceProfileMatch = path.match(/^\/api\/service-profiles\/(operator|transporter)$/);
      if (serviceProfileMatch && req.method === 'PUT') return await personalServiceProfiles(req, env, await authenticatedUser(req, env), serviceProfileMatch[1] as ServiceProfileKind);
      if (path === '/api/organizations' && (req.method === 'GET' || req.method === 'POST')) return await organizationIndex(req, env, await authenticatedUser(req, env));
      if (path === '/api/organization-invitations/accept' && req.method === 'POST') return await organizationAcceptInvitation(req, env, await authenticatedUser(req, env));
      const organizationMembersMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/members$/);
      if (organizationMembersMatch && req.method === 'GET') return await organizationMembers(req, env, await authenticatedUser(req, env), organizationMembersMatch[1]);
      const organizationInvitationsMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/invitations$/);
      if (organizationInvitationsMatch && (req.method === 'GET' || req.method === 'POST')) return await organizationInvitations(req, env, await authenticatedUser(req, env), organizationInvitationsMatch[1]);
      const organizationInvitationCancelMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/invitations\/(orginv_[A-Za-z0-9_-]{43})\/cancel$/);
      if (organizationInvitationCancelMatch && req.method === 'POST') return await organizationCancelInvitation(req, env, await authenticatedUser(req, env), organizationInvitationCancelMatch[1], organizationInvitationCancelMatch[2]);
      const organizationMemberRevokeMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/members\/(orgmem_[A-Za-z0-9_-]{43})\/revoke$/);
      if (organizationMemberRevokeMatch && req.method === 'POST') return await organizationRevokeMember(req, env, await authenticatedUser(req, env), organizationMemberRevokeMatch[1], organizationMemberRevokeMatch[2]);
      const organizationMemberCapabilityMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/members\/(orgmem_[A-Za-z0-9_-]{43})\/capabilities$/);
      if (organizationMemberCapabilityMatch && req.method === 'PATCH') return await organizationUpdateMemberCapabilities(req, env, await authenticatedUser(req, env), organizationMemberCapabilityMatch[1], organizationMemberCapabilityMatch[2]);
      const organizationWorkspaceMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/workspace\/(equipment|bookings)$/);
      if (organizationWorkspaceMatch && req.method === 'GET') return await organizationWorkspace(req, env, await authenticatedUser(req, env), organizationWorkspaceMatch[1], organizationWorkspaceMatch[2] as 'equipment' | 'bookings');
      const organizationEquipmentMetadataMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/equipment\/([A-Za-z0-9_-]{1,128})\/metadata$/);
      if (organizationEquipmentMetadataMatch && req.method === 'PATCH') return await organizationEquipmentMetadata(req, env, await authenticatedUser(req, env), organizationEquipmentMetadataMatch[1], organizationEquipmentMetadataMatch[2]);
      const organizationEquipmentAvailabilityMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/equipment\/([A-Za-z0-9_-]{1,128})\/availability$/);
      if (organizationEquipmentAvailabilityMatch && req.method === 'PATCH') return await organizationEquipmentAvailability(req, env, await authenticatedUser(req, env), organizationEquipmentAvailabilityMatch[1], organizationEquipmentAvailabilityMatch[2]);
      const organizationBookingTransitionMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/bookings\/([A-Za-z0-9_-]{1,128})\/transition$/);
      if (organizationBookingTransitionMatch && req.method === 'POST') return await organizationBookingTransition(req, env, await authenticatedUser(req, env), organizationBookingTransitionMatch[1], organizationBookingTransitionMatch[2]);
      const organizationServiceProfileMatch = path.match(/^\/api\/organizations\/(org_[A-Za-z0-9_-]{43})\/service-profiles\/(operator|transporter)$/);
      if (organizationServiceProfileMatch && (req.method === 'GET' || req.method === 'PUT')) return await organizationServiceProfile(req, env, await authenticatedUser(req, env), organizationServiceProfileMatch[1], organizationServiceProfileMatch[2] as ServiceProfileKind);
       if (path === '/api/staff/invitations/accept' && req.method === 'POST') {
         const result = await acceptStaffInvitation(req, env, await activeFirebaseUser(req, env));
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
    const extensionEstimateMatch = path.match(/^\/api\/requests\/([^/]+)\/extensions\/estimate$/);
     if (extensionEstimateMatch && req.method === 'POST') return await estimateRentalExtension(req, env, await authenticatedUser(req, env), decodeURIComponent(extensionEstimateMatch[1]));
    const extensionCollectionMatch = path.match(/^\/api\/requests\/([^/]+)\/extensions$/);
     if (extensionCollectionMatch && req.method === 'GET') return await getRentalExtension(req, env, await authenticatedUser(req, env), decodeURIComponent(extensionCollectionMatch[1]));
     if (extensionCollectionMatch && req.method === 'POST') return await createRentalExtension(req, env, await authenticatedUser(req, env), decodeURIComponent(extensionCollectionMatch[1]));
    const extensionActionMatch = path.match(/^\/api\/requests\/([^/]+)\/extensions\/([^/]+)\/(approve|decline)$/);
     if (extensionActionMatch && req.method === 'POST') return await reviewRentalExtension(req, env, await authenticatedUser(req, env), decodeURIComponent(extensionActionMatch[1]), decodeURIComponent(extensionActionMatch[2]), extensionActionMatch[3] as 'approve' | 'decline');
    const rentalSummaryMatch = path.match(/^\/api\/requests\/([^/]+)\/rental-summary$/);
     if (rentalSummaryMatch && req.method === 'GET') return await rentalV2Summary(req, env, await authenticatedUser(req, env), decodeURIComponent(rentalSummaryMatch[1]));
    const verificationAttemptMatch = path.match(/^\/api\/verification\/attempts\/([^/]+)$/);
     if (verificationAttemptMatch && req.method === 'GET') return await verificationAttempt(req, env, await authenticatedUser(req, env), verificationAttemptMatch[1]);
    const identityCallbackMatch = path.match(/^\/api\/webhooks\/identity\/([A-Za-z0-9_-]{16,128})$/);
    if (identityCallbackMatch && req.method === 'POST') return await identityCallback(req, env, identityCallbackMatch[1]);
     if (path === '/api/webhooks/resend' && req.method === 'POST') return await resendWebhook(req, env);
      if (path === '/api/notifications' && req.method === 'GET') return await notificationList(req, env, await authenticatedUser(req, env));
      if (path === '/api/notifications/unread-count' && req.method === 'GET') return await notificationCount(req, env, await authenticatedUser(req, env));
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
       // Admin handlers still resolve live staff authority themselves. This
       // directory check additionally rejects disabled/revoked Firebase users
       // and protects the narrowly scoped invitation/bootstrap exceptions.
       const user = await activeFirebaseUser(req, env);
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
    if (env.__diagnostics) {
      env.__diagnostics.exceptionClass = isQuotaError(e)
        ? 'QuotaError'
        : e instanceof AdminDocumentUnavailableError
          ? 'AdminDocumentUnavailableError'
          : e instanceof TypeError
            ? 'TypeError'
            : e instanceof Error
              ? 'Error'
              : undefined;
    }
    if (isQuotaError(e)) {
      const quota = quotaResponse(req, e);
      if (importantMutation(req)) {
        const payload = await quota.clone().json().catch(() => ({ success: false, errorCode: 'SERVICE_TEMPORARILY_BUSY' }));
        const response = out(env, req, payload, quota.status);
        const retryAfter = quota.headers.get('Retry-After');
        if (retryAfter) response.headers.set('Retry-After', retryAfter);
        return response;
      }
      for (const [name, value] of Object.entries(cors(env, req.headers.get('Origin')))) quota.headers.set(name, value);
      quota.headers.set('Access-Control-Expose-Headers', 'Retry-After');
      if (env.__diagnostics) quota.headers.set('X-Request-ID', env.__diagnostics.requestId);
      return quota;
    }
    if (e instanceof AdminDocumentUnavailableError) {
      return out(env, req, { success: false, error: e.message, code: e.code }, e.status);
    }
    if (e instanceof PrivilegedSessionRevokedError) {
      return out(env, req, { success: false, error: e.message, errorCode: e.code }, 401);
    }
    if (e instanceof PrivilegedAuthUnavailableError) {
      return out(env, req, { success: false, error: e.message, errorCode: e.code }, 503);
    }
    const message = e instanceof Error ? e.message : '';
    if (message === 'EMAIL_VERIFICATION_REQUIRED') return out(env, req, { success: false, error: 'Email verification is required before performing this action.', errorCode: message, verificationSubject: 'actor' }, 403);
    if (message === 'ADMIN_REQUIRED') return out(env, req, { success: false, error: 'Admin authorization required', errorCode: 'PERMISSION_DENIED' }, 403);
    if (message === 'AUTH_REQUIRED') return out(env, req, { success: false, error: 'Authentication required', errorCode: 'AUTH_REQUIRED' }, 401);
     const profileRequired = message === 'PROFILE_REQUIRED' || message === 'ACCOUNT_PROVISIONING_INCOMPLETE';
     const forbidden = message === 'ADMIN_REQUIRED' || message === 'ACCOUNT_SUSPENDED' || message === 'ACCOUNT_DELETION_REQUESTED' || message === 'LISTING_UNAVAILABLE' || message.startsWith('TRUST_');
     const stableErrorCode = profileRequired ? 'PROFILE_REQUIRED'
       : ['ACCOUNT_SUSPENDED', 'ACCOUNT_DELETION_REQUESTED', 'LISTING_UNAVAILABLE'].includes(message) ? message
         : undefined;
     return out(env, req, { success: false, error: message === 'AUTH_REQUIRED' ? 'Authentication required' : message === 'ADMIN_REQUIRED' ? 'Admin authorization required' : message === 'ACCOUNT_SUSPENDED' ? 'Account suspended' : message === 'ACCOUNT_DELETION_REQUESTED' ? 'Account deletion requested' : profileRequired ? 'Complete your account setup before continuing.' : message === 'LISTING_UNAVAILABLE' ? 'Listing unavailable' : message.startsWith('TRUST_') ? 'Identity verification required' : 'Internal service error', ...(stableErrorCode ? { errorCode: stableErrorCode } : {}) }, message === 'AUTH_REQUIRED' ? 401 : profileRequired ? 409 : forbidden ? 403 : 500);
} }, async scheduled(_event: unknown, env: Env, executionCtx: { waitUntil(promise: Promise<unknown>): void }) {
  const requestEnv = { ...env, __executionCtx: executionCtx };
  executionCtx.waitUntil((async () => {
    let processorFailed = false;
    const globalBudget = createScheduledGlobalBudget();
    const processors = [
      ['processPendingNotificationOutbox', processPendingNotificationOutbox],
      ['processScheduledCampaigns', processScheduledCampaigns],
      ['processScheduledEarlyAccessCampaigns', processScheduledEarlyAccessCampaigns],
      ['processEmailVerificationReminderJobs', processEmailVerificationReminderJobs],
      ['processStaffClaimSync', processStaffClaimSync],
      ['processDeletionJobs', processDeletionJobs],
      ['processRegulatoryExpiry', processRegulatoryExpiry],
      ['processRentalExpiryReminders', processRentalExpiryReminders],
      ['processPrivateEvidenceCleanup', processPrivateEvidenceCleanup],
      ['retryDueNotificationDeliveries', retryDueNotificationDeliveries],
      ['pollNotificationReceipts', pollNotificationReceipts],
      ['processEarlyAccessRetention', processEarlyAccessRetention],
      ['processTemporaryComplianceCleanup', processTemporaryComplianceCleanup],
    ] as const;
    const scheduledTime = Number((_event as { scheduledTime?: unknown } | null)?.scheduledTime || 0);
    for (const [processorName, processor] of rotatedScheduledProcessors(processors, scheduledTime)) {
      if (quotaBlocked()) break;
      const budget = createScheduledProcessorBudget(globalBudget, processorName as ScheduledProcessorName);
      try { await processor({ ...requestEnv, __scheduledBudget: budget }); }
      catch (error) {
        if (isQuotaError(error)) break;
        if (isScheduledBudgetDeferred(error)) continue;
        processorFailed = true;
        const candidateCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        const candidateClass = error instanceof Error ? error.name : '';
        console.error(JSON.stringify({
          event: 'scheduled_processor_failed',
          processor: processorName,
          ...(candidateCode && /^[A-Z0-9_]{1,64}$/.test(candidateCode) ? { errorCode: candidateCode } : {}),
          errorClass: /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(candidateClass) ? candidateClass : error instanceof Error ? 'Error' : 'UnknownError',
        }));
      } finally {
        if (budget.state.deferred) console.info(JSON.stringify({
          event: 'scheduled_processor_deferred',
          processor: processorName,
          reason: 'SUBREQUEST_BUDGET_DEFERRED',
        }));
      }
    }
    if (processorFailed) throw new Error('Scheduled maintenance temporarily unavailable.');
  })());
} };
