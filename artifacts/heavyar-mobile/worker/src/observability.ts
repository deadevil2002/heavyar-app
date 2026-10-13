export const MUTATION_STAGES = ['authentication', 'validation', 'quota', 'upload', 'commit', 'response'] as const;
export type MutationStage = typeof MUTATION_STAGES[number];

export type MutationDiagnostics = {
  requestId: string;
  startedAt: number;
  stage: MutationStage;
  firestoreReads: number;
  firestoreWrites: number;
  firestoreWriteAttempts: number;
  firestoreRequests: number;
  firestoreDurationMs: number;
  firestoreLastOperation?: string;
  firestoreFailure?: { operation: string; status: number; code?: string };
  upstreamDurationMs: number;
  upstream?: {
    service: 'cloudinary' | 'tap';
    operation: 'image_upload' | 'image_delete' | 'payment_create';
    status: number;
    ok: boolean;
  };
  payment?: {
    firestoreBeforeProviderMs: number;
    providerMs: number;
    firestoreAfterProviderMs: number;
  };
  cas?: 'not_used' | 'succeeded' | 'conflict' | 'failed';
  quota: {
    checked: boolean;
    blocked: boolean;
    exhausted: boolean;
    reservationOutcome?: 'quota_reserved' | 'quota_exhausted' | 'cas_conflict_retry' | 'quota_infrastructure_failure';
    casConflictRetries?: number;
  };
  exceptionClass?: 'Error' | 'TypeError' | 'QuotaError' | 'AdminDocumentUnavailableError';
};

const SAFE_ERROR_CODES = new Set([
  'AUTH_REQUIRED', 'PERMISSION_DENIED', 'PROFILE_REQUIRED', 'EMAIL_VERIFICATION_REQUIRED',
  'ACCOUNT_SUSPENDED', 'ACCOUNT_DELETION_REQUESTED', 'RATE_LIMITED', 'REQUEST_FAILED',
  'RATE_LIMIT_UNAVAILABLE', 'PAYLOAD_TOO_LARGE',
  'VALIDATION_FAILED', 'CONFLICT', 'NOT_FOUND', 'SERVICE_TEMPORARILY_BUSY',
  'ASSET_INVALID', 'ASSET_NOT_OWNED', 'ASSET_SERVICE_UNAVAILABLE',
  'CLOUDINARY_UPLOAD_FAILED', 'CLOUDINARY_DELETE_FAILED', 'LISTING_COMMIT_FAILED',
  'ACTIVE_RENTAL_OVERLAP', 'AVAILABILITY_CAP_EXHAUSTED', 'AVAILABILITY_UNAVAILABLE',
  'FIXED_DURATION_REQUIRED', 'LISTING_AVAILABILITY_CONFLICT', 'LISTING_TEMPORARILY_UNAVAILABLE', 'LISTING_AVAILABILITY_UNAVAILABLE',
  'CUSTOMER_ACCOUNT_REQUIRED', 'LISTING_UNAVAILABLE', 'LISTING_CHANGED', 'RENTAL_PRICING_UNAVAILABLE',
  'INVALID_RENTAL_REQUEST', 'PAST_START_TIME', 'RENTAL_UNIT_UNAVAILABLE', 'INVALID_RENTAL_INTERVAL',
  'INVALID_LOCATION',
  'EXTENSION_NOT_AVAILABLE', 'EXTENSION_INVALID_END', 'EXTENSION_RENTAL_EXPIRED',
  'EXTENSION_PRICING_UNAVAILABLE', 'EXTENSION_ALREADY_PENDING', 'EXTENSION_CHANGED',
  'EXTENSION_PAYMENT_INTEGRATION_REQUIRED', 'INVALID_AVAILABILITY_POLICY', 'AVAILABILITY_UPDATE_CONFLICT', 'AVAILABILITY_CONFLICT',
  'RENTAL_INTERVAL_EXPIRED',
  'LISTING_UPDATE_CONFLICT', 'LISTING_LIFECYCLE_CONFLICT',
  'ORGANIZATION_CAPABILITY_REQUIRED', 'ORGANIZATION_OWNER_REQUIRED', 'MEMBERSHIP_UPDATE_CONFLICT', 'ORGANIZATION_AUTHORIZATION_CHANGED',
  'INVALID_MEMBERSHIP_UPDATE', 'INVALID_EQUIPMENT_UPDATE', 'EQUIPMENT_UPDATE_CONFLICT',
  'BOOKING_OPERATION_NOT_DELEGABLE', 'INVALID_BOOKING_OPERATION',
  'INVALID_OPERATOR_REQUEST', 'INVALID_OPERATOR_SEARCH', 'OPERATOR_DISCOVERY_UNAVAILABLE',
  'INTERNAL_SERVICE_ERROR',
]);
const SAFE_FIRESTORE_CODES = new Set([
  'ABORTED', 'ALREADY_EXISTS', 'CANCELLED', 'DEADLINE_EXCEEDED', 'FAILED_PRECONDITION',
  'INTERNAL', 'INVALID_ARGUMENT', 'NOT_FOUND', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED',
  'UNAUTHENTICATED', 'UNAVAILABLE',
]);

const ROUTES: Array<[RegExp, string]> = [
  [/^\/api\/create-payment$/, '/api/create-payment'],
  [/^\/api\/requests\/estimate$/, '/api/requests/estimate'],
  [/^\/api\/requests$/, '/api/requests'],
  [/^\/api\/requests\/[^/]+\/extensions\/estimate$/, '/api/requests/:requestId/extensions/estimate'],
  [/^\/api\/requests\/[^/]+\/extensions$/, '/api/requests/:requestId/extensions'],
  [/^\/api\/requests\/[^/]+\/extensions\/[^/]+\/(approve|decline)$/, '/api/requests/:requestId/extensions/:extensionId/action'],
  [/^\/api\/listings$/, '/api/listings'],
  [/^\/api\/listings\/[^/]+\/availability\/check$/, '/api/listings/:listingId/availability/check'],
  [/^\/api\/listings\/[^/]+\/availability$/, '/api/listings/:listingId/availability'],
  [/^\/api\/listings\/[^/]+\/archive$/, '/api/listings/:listingId/archive'],
  [/^\/api\/listings\/[^/]+$/, '/api/listings/:listingId'],
  [/^\/api\/drivers\/profile$/, '/api/drivers/profile'],
  [/^\/api\/operator-requests\/prepare$/, '/api/operator-requests/prepare'],
  [/^\/api\/organizations\/[^/]+\/members\/[^/]+\/capabilities$/, '/api/organizations/:organizationId/members/:memberId/capabilities'],
  [/^\/api\/organizations\/[^/]+\/members\/[^/]+\/revoke$/, '/api/organizations/:organizationId/members/:memberId/revoke'],
  [/^\/api\/organizations\/[^/]+\/equipment\/[^/]+\/metadata$/, '/api/organizations/:organizationId/equipment/:equipmentId/metadata'],
  [/^\/api\/organizations\/[^/]+\/equipment\/[^/]+\/availability$/, '/api/organizations/:organizationId/equipment/:equipmentId/availability'],
  [/^\/api\/organizations\/[^/]+\/bookings\/[^/]+\/transition$/, '/api/organizations/:organizationId/bookings/:requestId/transition'],
  [/^\/cloudinary\/upload$/, '/cloudinary/upload'],
  [/^\/cloudinary\/delete$/, '/cloudinary/delete'],
];

export function mutationRoute(req: Request): string | undefined {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return undefined;
  const pathname = new URL(req.url).pathname;
  return ROUTES.find(([pattern]) => pattern.test(pathname))?.[1];
}

export function canonicalErrorCode(value: unknown, status: number): string {
  if (typeof value === 'string' && SAFE_ERROR_CODES.has(value)) return value;
  if (status === 401) return 'AUTH_REQUIRED';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'INTERNAL_SERVICE_ERROR';
  return status >= 400 ? 'VALIDATION_FAILED' : 'REQUEST_FAILED';
}

export function responseErrorCode(value: unknown, status: number): string {
  if (typeof value === 'string' && SAFE_ERROR_CODES.has(value)) return value;
  return status >= 500 ? 'INTERNAL_SERVICE_ERROR' : 'REQUEST_FAILED';
}

function firestoreWriteOutcome(diagnostics: MutationDiagnostics): 'not_attempted' | 'acknowledged' | 'rejected' | 'unknown' {
  if (diagnostics.firestoreWriteAttempts === 0) return 'not_attempted';
  if (diagnostics.firestoreWrites === diagnostics.firestoreWriteAttempts) return 'acknowledged';
  const status = diagnostics.firestoreFailure?.status;
  if (diagnostics.cas === 'conflict' || (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429)) return 'rejected';
  return 'unknown';
}

export function safeRelease(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : undefined;
}

export function mutationDiagnosticEvent(
  req: Request,
  diagnostics: MutationDiagnostics,
  status: number,
  responseErrorCode: unknown,
  release: unknown,
) {
  const route = mutationRoute(req);
  if (!route) return undefined;
  const writeOutcome = firestoreWriteOutcome(diagnostics);
  return {
    event: 'important_mutation',
    requestId: diagnostics.requestId,
    route,
    method: req.method,
    status,
    canonicalErrorCode: status >= 400 ? canonicalErrorCode(responseErrorCode, status) : null,
    stage: diagnostics.stage,
    durationMs: Math.max(0, Date.now() - diagnostics.startedAt),
    firestoreRequestCount: diagnostics.firestoreRequests,
    firestoreReadCount: diagnostics.firestoreReads,
    firestoreWriteCount: writeOutcome === 'unknown' ? null : diagnostics.firestoreWrites,
    firestoreAttemptedWriteCount: diagnostics.firestoreWriteAttempts,
    firestoreAcknowledgedWriteCount: diagnostics.firestoreWrites,
    firestoreWriteOutcome: writeOutcome,
    firestoreDurationMs: diagnostics.firestoreDurationMs,
    upstreamDurationMs: diagnostics.upstreamDurationMs,
    quotaOutcome: diagnostics.quota.reservationOutcome || (diagnostics.quota.exhausted ? 'exhausted' : diagnostics.quota.blocked ? 'blocked' : diagnostics.quota.checked ? 'allowed' : 'not_checked'),
    ...(diagnostics.quota.casConflictRetries ? {
      casConflictRetry: { occurred: true, count: diagnostics.quota.casConflictRetries },
    } : {}),
    casOutcome: diagnostics.cas || 'not_used',
    release: safeRelease(release),
    ...(diagnostics.exceptionClass ? { exceptionClass: diagnostics.exceptionClass } : {}),
    ...(diagnostics.firestoreFailure ? {
      firestoreFailure: {
        operation: diagnostics.firestoreFailure.operation,
        status: diagnostics.firestoreFailure.status,
        ...(diagnostics.firestoreFailure.code && SAFE_FIRESTORE_CODES.has(diagnostics.firestoreFailure.code)
          ? { code: diagnostics.firestoreFailure.code }
          : {}),
      },
    } : {}),
    ...(diagnostics.upstream ? { upstream: diagnostics.upstream } : {}),
    ...(diagnostics.payment ? { payment: diagnostics.payment } : {}),
  };
}
