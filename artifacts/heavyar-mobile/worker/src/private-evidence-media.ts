import {
  isServiceExecutionAggregate,
  type ServiceExecutionAction,
  type ServiceExecutionAggregate,
  type ServiceExecutionEvent,
} from './service-execution';

export const PRIVATE_EVIDENCE_MEDIA_PRODUCTION_ACTIVATION =
  'disabled_pending_authenticated_private_media_delivery' as const;

export const PRIVATE_EVIDENCE_MEDIA_LIMITS = Object.freeze({
  maxFilesPerEvent: 3,
  maxFileBytes: 5 * 1024 * 1024,
  maxDimensionPixels: 4096,
  maxTotalPixels: 16_000_000,
  uploadIntentTtlSeconds: 10 * 60,
  accessGrantTtlSeconds: 60,
  cleanupGraceSeconds: 5 * 60,
  cleanupClaimTtlSeconds: 5 * 60,
  cleanupRetryBaseSeconds: 5 * 60,
  cleanupRetryMaxSeconds: 6 * 60 * 60,
  abandonedCleanupBatch: 1,
  cleanupCandidateScanLimit: 1,
});

export type PrivateEvidenceMediaCapability = Readonly<{
  enabled: boolean;
  backend: 'authenticated_private';
  authenticatedUpload: boolean;
  participantAuthorizedDelivery: boolean;
  metadataStrippedBeforeStorage: boolean;
  reason?: typeof PRIVATE_EVIDENCE_MEDIA_PRODUCTION_ACTIVATION;
}>;

export const PRIVATE_EVIDENCE_MEDIA_PRODUCTION_CAPABILITY: PrivateEvidenceMediaCapability = Object.freeze({
  enabled: false,
  backend: 'authenticated_private',
  authenticatedUpload: false,
  participantAuthorizedDelivery: false,
  metadataStrippedBeforeStorage: false,
  reason: PRIVATE_EVIDENCE_MEDIA_PRODUCTION_ACTIVATION,
});

export type PrivateEvidenceFileInput = Readonly<{
  clientFileId: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
  width: number;
  height: number;
}>;

export type VerifiedPrivateEvidenceUpload = Readonly<{
  assetId: string;
  version: number;
  format: 'jpg' | 'jpeg' | 'png' | 'webp';
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  uploadedAt: string;
}>;

export type StoredEvidenceFile = PrivateEvidenceFileInput & Readonly<{
  mediaId: string;
  publicId: string;
  upload?: VerifiedPrivateEvidenceUpload;
}>;
export type PrivateEvidenceCleanup = Readonly<{
  attempts: number;
  nextAttemptAt?: string;
  claimId?: string;
  claimedAt?: string;
  completedAt?: string;
  lastFailureCode?: 'PROVIDER_DELETE_FAILED';
}>;
export type PrivateEvidenceUploadIntent = Readonly<{
  contractVersion: 1;
  intentId: string;
  executionId: string;
  expectedRevision: number;
  action: ServiceExecutionAction;
  actorUid: string;
  idempotencyKey: string;
  fingerprint: string;
  createdAt: string;
  expiresAt: string;
  state: 'pending' | 'attached' | 'abandoned' | 'cleanup_claimed' | 'cleanup_complete';
  files: readonly StoredEvidenceFile[];
  retentionClass: 'transaction_evidence_7y_after_closure';
  attachedEventId?: string;
  cleanup?: PrivateEvidenceCleanup;
}>;

export type PrivateEvidenceAccessGrant = Readonly<{
  grantId: string;
  executionId: string;
  eventId: string;
  requesterUid: string;
  mediaIds: readonly string[];
  expiresAt: string;
}>;

export class PrivateEvidenceMediaError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PrivateEvidenceMediaError';
  }
}

const SAFE_UID = /^[A-Za-z0-9_-]{6,128}$/;
const SAFE_INTENT_ID = /^evidence_intent_[A-Za-z0-9_-]{43}$/;
const SAFE_MEDIA_ID = /^evidence_media_[A-Za-z0-9_-]{43}$/;
const SAFE_PUBLIC_ID = /^[A-Za-z0-9_-]{1,64}\/evidence\/execution_[A-Za-z0-9_-]{43}\/evidence_media_[A-Za-z0-9_-]{43}$/;
const SAFE_GRANT_ID = /^evidence_grant_[A-Za-z0-9_-]{43}$/;
const SAFE_CLEANUP_CLAIM_ID = /^evidence_cleanup_[A-Za-z0-9_-]{43}$/;
const SAFE_CLIENT_FILE_ID = /^[A-Za-z0-9_-]{16,80}$/;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,128}$/;
const SAFE_ASSET_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EVIDENCE_ACTIONS = new Set<ServiceExecutionAction>([
  'start', 'record_progress', 'confirm_pickup', 'confirm_delivery', 'request_completion',
  'dispute_completion', 'record_handover', 'record_return',
]);
const ACTIONS_BY_KIND: Record<ServiceExecutionAggregate['serviceKind'], ReadonlySet<ServiceExecutionAction>> = {
  equipment_rental: new Set(['record_handover', 'record_progress', 'record_return', 'dispute_completion']),
  operator: new Set(['start', 'record_progress', 'request_completion', 'dispute_completion']),
  transporter: new Set(['confirm_pickup', 'record_progress', 'confirm_delivery', 'request_completion', 'dispute_completion']),
};

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function iso(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new PrivateEvidenceMediaError('INVALID_EVIDENCE_TIME');
  return time;
}

function assertCapability(capability: PrivateEvidenceMediaCapability) {
  if (!capability.enabled || !capability.authenticatedUpload || !capability.participantAuthorizedDelivery ||
      !capability.metadataStrippedBeforeStorage || capability.backend !== 'authenticated_private') {
    throw new PrivateEvidenceMediaError('EVIDENCE_MEDIA_NOT_ACTIVATED');
  }
}

function assertEligibleAccount(account: unknown, state: ServiceExecutionAggregate, uid: string) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) throw new PrivateEvidenceMediaError('EVIDENCE_ACCOUNT_INELIGIBLE');
  const value = account as Record<string, unknown>;
  const expectedRole = uid === state.customerUid
    ? 'customer'
    : state.serviceKind === 'equipment_rental' ? 'provider' : 'driver';
  if (value.isActive === false || value.accountStatus !== undefined && value.accountStatus !== 'active' ||
      ['suspended', 'restricted', 'deletion_requested'].includes(String(value.status || '')) ||
      value.accountPurpose === 'store_review' || value.role !== expectedRole) {
    throw new PrivateEvidenceMediaError('EVIDENCE_ACCOUNT_INELIGIBLE');
  }
}

function assertParticipant(state: ServiceExecutionAggregate, uid: string) {
  if (!SAFE_UID.test(uid) || uid !== state.customerUid && uid !== state.providerUid) {
    throw new PrivateEvidenceMediaError('EVIDENCE_NOT_AUTHORIZED');
  }
}

function normalizeFiles(files: readonly PrivateEvidenceFileInput[], serverFiles: readonly { mediaId: string; publicId: string }[]) {
  if (!Array.isArray(files) || files.length < 1 || files.length > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFilesPerEvent ||
      files.length !== serverFiles.length || new Set(serverFiles.map(file => file.mediaId)).size !== serverFiles.length ||
      new Set(serverFiles.map(file => file.publicId)).size !== serverFiles.length) {
    throw new PrivateEvidenceMediaError('INVALID_EVIDENCE_FILES');
  }
  const seenClientIds = new Set<string>();
  return files.map((file, index): StoredEvidenceFile => {
    const serverFile = serverFiles[index];
    if (!file || typeof file !== 'object' || Object.keys(file).some(key => !['clientFileId', 'mimeType', 'sizeBytes', 'width', 'height'].includes(key)) ||
        !SAFE_CLIENT_FILE_ID.test(file.clientFileId) || seenClientIds.has(file.clientFileId) || !MIME_TYPES.has(file.mimeType) ||
        !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFileBytes ||
        !Number.isSafeInteger(file.width) || file.width < 1 || file.width > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxDimensionPixels ||
        !Number.isSafeInteger(file.height) || file.height < 1 || file.height > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxDimensionPixels ||
        file.width * file.height > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxTotalPixels ||
        !serverFile || !SAFE_MEDIA_ID.test(serverFile.mediaId) || !SAFE_PUBLIC_ID.test(serverFile.publicId)) {
      throw new PrivateEvidenceMediaError('INVALID_EVIDENCE_FILE');
    }
    seenClientIds.add(file.clientFileId);
    return freeze({ ...file, mediaId: serverFile.mediaId, publicId: serverFile.publicId });
  });
}

function fingerprint(input: { executionId: string; expectedRevision: number; action: ServiceExecutionAction; actorUid: string; files: readonly StoredEvidenceFile[] }) {
  return JSON.stringify({
    executionId: input.executionId,
    expectedRevision: input.expectedRevision,
    action: input.action,
    actorUid: input.actorUid,
    files: input.files.map(file => ({
      clientFileId: file.clientFileId,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      width: file.width,
      height: file.height,
    })),
  });
}

export function isPrivateEvidenceUploadIntent(value: unknown): value is PrivateEvidenceUploadIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const intent = value as PrivateEvidenceUploadIntent;
  const keys = Object.keys(intent);
  if (keys.some(key => !['contractVersion', 'intentId', 'executionId', 'expectedRevision', 'action', 'actorUid', 'idempotencyKey', 'fingerprint', 'createdAt', 'expiresAt', 'state', 'files', 'retentionClass', 'attachedEventId', 'cleanup'].includes(key)) ||
      intent.contractVersion !== 1 || !SAFE_INTENT_ID.test(String(intent.intentId || '')) ||
      !/^execution_[A-Za-z0-9_-]{43}$/.test(String(intent.executionId || '')) || !SAFE_UID.test(String(intent.actorUid || '')) ||
      !SAFE_IDEMPOTENCY_KEY.test(String(intent.idempotencyKey || '')) || !EVIDENCE_ACTIONS.has(intent.action) ||
      !Number.isSafeInteger(intent.expectedRevision) || intent.expectedRevision < 0 ||
      !['pending', 'attached', 'abandoned', 'cleanup_claimed', 'cleanup_complete'].includes(intent.state) || intent.retentionClass !== 'transaction_evidence_7y_after_closure' || !Array.isArray(intent.files) ||
      intent.files.length < 1 || intent.files.length > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFilesPerEvent) return false;
  let createdAt: number, expiresAt: number;
  try { createdAt = iso(intent.createdAt); expiresAt = iso(intent.expiresAt); } catch { return false; }
  if (expiresAt - createdAt !== PRIVATE_EVIDENCE_MEDIA_LIMITS.uploadIntentTtlSeconds * 1000 ||
      intent.state === 'attached' !== !!intent.attachedEventId ||
      intent.attachedEventId !== undefined && intent.attachedEventId !== `${intent.executionId}__${intent.expectedRevision + 1}`) return false;
  const cleanup = intent.cleanup;
  if (intent.state === 'attached') {
    if (cleanup !== undefined) return false;
  } else {
    if (!cleanup || typeof cleanup !== 'object' || Array.isArray(cleanup) ||
        Object.keys(cleanup).some(key => !['attempts', 'nextAttemptAt', 'claimId', 'claimedAt', 'completedAt', 'lastFailureCode'].includes(key)) ||
        !Number.isSafeInteger(cleanup.attempts) || cleanup.attempts < 0 || cleanup.attempts > 1000) return false;
    const hasNextAttempt = typeof cleanup.nextAttemptAt === 'string';
    const hasClaim = typeof cleanup.claimId === 'string' && typeof cleanup.claimedAt === 'string';
    const hasCompleted = typeof cleanup.completedAt === 'string';
    try {
      if (hasNextAttempt) iso(cleanup.nextAttemptAt!);
      if (cleanup.claimedAt !== undefined) iso(cleanup.claimedAt);
      if (cleanup.completedAt !== undefined) iso(cleanup.completedAt);
    } catch { return false; }
    if (cleanup.lastFailureCode !== undefined && cleanup.lastFailureCode !== 'PROVIDER_DELETE_FAILED') return false;
    if (intent.state === 'pending' && (cleanup.attempts !== 0 || !hasNextAttempt || hasClaim || hasCompleted ||
        cleanup.nextAttemptAt !== new Date(expiresAt + PRIVATE_EVIDENCE_MEDIA_LIMITS.cleanupGraceSeconds * 1000).toISOString())) return false;
    if (intent.state === 'abandoned' && (!hasNextAttempt || hasClaim || hasCompleted)) return false;
    if (intent.state === 'cleanup_claimed' && (!hasNextAttempt || !hasClaim || hasCompleted || !SAFE_CLEANUP_CLAIM_ID.test(cleanup.claimId!))) return false;
    if (intent.state === 'cleanup_complete' && (hasNextAttempt || hasClaim || !hasCompleted)) return false;
  }
  const clientIds = new Set<string>(), mediaIds = new Set<string>();
  for (const file of intent.files) {
    if (!file || typeof file !== 'object' || Object.keys(file).some(key => !['clientFileId', 'mimeType', 'sizeBytes', 'width', 'height', 'mediaId', 'publicId', 'upload'].includes(key)) ||
        !SAFE_CLIENT_FILE_ID.test(file.clientFileId) || clientIds.has(file.clientFileId) || !SAFE_MEDIA_ID.test(file.mediaId) || mediaIds.has(file.mediaId) ||
        !SAFE_PUBLIC_ID.test(file.publicId) ||
        !MIME_TYPES.has(file.mimeType) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFileBytes ||
        !Number.isSafeInteger(file.width) || file.width < 1 || file.width > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxDimensionPixels ||
        !Number.isSafeInteger(file.height) || file.height < 1 || file.height > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxDimensionPixels ||
        file.width * file.height > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxTotalPixels) return false;
    if (file.upload !== undefined) {
      const upload = file.upload;
      if (!upload || typeof upload !== 'object' || Object.keys(upload).some(key => !['assetId', 'version', 'format', 'bytes', 'width', 'height', 'sha256', 'uploadedAt'].includes(key)) ||
          !SAFE_ASSET_ID.test(upload.assetId) || !Number.isSafeInteger(upload.version) || upload.version < 1 ||
          !['jpg', 'jpeg', 'png', 'webp'].includes(upload.format) || !Number.isSafeInteger(upload.bytes) || upload.bytes < 1 ||
          upload.bytes > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFileBytes || !Number.isSafeInteger(upload.width) || upload.width < 1 ||
          upload.width > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxDimensionPixels || !Number.isSafeInteger(upload.height) || upload.height < 1 ||
          upload.height > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxDimensionPixels || upload.width * upload.height > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxTotalPixels ||
          !SHA256.test(upload.sha256)) return false;
      try { iso(upload.uploadedAt); } catch { return false; }
    }
    clientIds.add(file.clientFileId); mediaIds.add(file.mediaId);
  }
  return intent.fingerprint === fingerprint({
    executionId: intent.executionId,
    expectedRevision: intent.expectedRevision,
    action: intent.action,
    actorUid: intent.actorUid,
    files: intent.files,
  });
}

export function createPrivateEvidenceUploadIntent(options: {
  capability: PrivateEvidenceMediaCapability;
  execution: ServiceExecutionAggregate;
  actorUid: string;
  actorAccount: unknown;
  expectedRevision: number;
  action: ServiceExecutionAction;
  idempotencyKey: string;
  files: readonly PrivateEvidenceFileInput[];
  prior?: PrivateEvidenceUploadIntent | null;
  server: { intentId: string; files: readonly { mediaId: string; publicId: string }[]; now: string };
}): PrivateEvidenceUploadIntent {
  assertCapability(options.capability);
  if (!isServiceExecutionAggregate(options.execution)) throw new PrivateEvidenceMediaError('INVALID_EVIDENCE_INTENT');
  assertParticipant(options.execution, options.actorUid);
  assertEligibleAccount(options.actorAccount, options.execution, options.actorUid);
  if (!SAFE_INTENT_ID.test(options.server.intentId) || !SAFE_IDEMPOTENCY_KEY.test(options.idempotencyKey) ||
      !Number.isSafeInteger(options.expectedRevision) || options.expectedRevision !== options.execution.revision ||
      !ACTIONS_BY_KIND[options.execution.serviceKind].has(options.action)) {
    throw new PrivateEvidenceMediaError('INVALID_EVIDENCE_INTENT');
  }
  const files = normalizeFiles(options.files, options.server.files);
  const valueFingerprint = fingerprint({ ...options, files, executionId: options.execution.executionId });
  if (options.prior) {
    if (options.prior.actorUid !== options.actorUid) throw new PrivateEvidenceMediaError('EVIDENCE_IDEMPOTENCY_ACTOR_MISMATCH');
    if (options.prior.idempotencyKey !== options.idempotencyKey || options.prior.fingerprint !== valueFingerprint) {
      throw new PrivateEvidenceMediaError('EVIDENCE_IDEMPOTENCY_CONFLICT');
    }
    return options.prior;
  }
  const createdAtMs = iso(options.server.now);
  const expiresAt = new Date(createdAtMs + PRIVATE_EVIDENCE_MEDIA_LIMITS.uploadIntentTtlSeconds * 1000).toISOString();
  return freeze({
    contractVersion: 1,
    intentId: options.server.intentId,
    executionId: options.execution.executionId,
    expectedRevision: options.expectedRevision,
    action: options.action,
    actorUid: options.actorUid,
    idempotencyKey: options.idempotencyKey,
    fingerprint: valueFingerprint,
    createdAt: options.server.now,
    expiresAt,
    state: 'pending',
    retentionClass: 'transaction_evidence_7y_after_closure',
    files,
    cleanup: {
      attempts: 0,
      nextAttemptAt: new Date(Date.parse(expiresAt) + PRIVATE_EVIDENCE_MEDIA_LIMITS.cleanupGraceSeconds * 1000).toISOString(),
    },
  });
}

export function recordVerifiedPrivateEvidenceUpload(options: {
  intent: PrivateEvidenceUploadIntent;
  actorUid: string;
  mediaId: string;
  receipt: VerifiedPrivateEvidenceUpload;
  now: string;
}): PrivateEvidenceUploadIntent {
  if (!isPrivateEvidenceUploadIntent(options.intent) || options.intent.actorUid !== options.actorUid) {
    throw new PrivateEvidenceMediaError('EVIDENCE_NOT_AUTHORIZED');
  }
  if (options.intent.state !== 'pending' || iso(options.now) > iso(options.intent.expiresAt)) {
    throw new PrivateEvidenceMediaError('EVIDENCE_INTENT_EXPIRED');
  }
  const index = options.intent.files.findIndex(file => file.mediaId === options.mediaId);
  if (index < 0) throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
  const file = options.intent.files[index];
  const receipt = options.receipt;
  const mimeFormat = file.mimeType === 'image/jpeg' ? new Set(['jpg', 'jpeg']) : new Set([file.mimeType.slice(6)]);
  if (!SAFE_ASSET_ID.test(receipt.assetId) || !Number.isSafeInteger(receipt.version) || receipt.version < 1 ||
      !mimeFormat.has(receipt.format) || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1 || receipt.bytes > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFileBytes ||
      !Number.isSafeInteger(receipt.width) || receipt.width < 1 || receipt.width > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxDimensionPixels ||
      !Number.isSafeInteger(receipt.height) || receipt.height < 1 || receipt.height > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxDimensionPixels ||
      receipt.width * receipt.height > PRIVATE_EVIDENCE_MEDIA_LIMITS.maxTotalPixels || !SHA256.test(receipt.sha256) || iso(receipt.uploadedAt) > iso(options.now)) {
    throw new PrivateEvidenceMediaError('EVIDENCE_UPLOAD_VERIFICATION_FAILED');
  }
  if (file.upload) {
    if (JSON.stringify(file.upload) !== JSON.stringify(receipt)) throw new PrivateEvidenceMediaError('EVIDENCE_UPLOAD_CONFLICT');
    return options.intent;
  }
  const files = options.intent.files.map((item, fileIndex) => fileIndex === index ? freeze({ ...item, upload: freeze({ ...receipt }) }) : item);
  return freeze({ ...options.intent, files });
}

export function attachPrivateEvidenceToEvent(options: {
  intent: PrivateEvidenceUploadIntent;
  execution: ServiceExecutionAggregate;
  event: ServiceExecutionEvent;
  actorUid: string;
  actorAccount: unknown;
  now: string;
}): PrivateEvidenceUploadIntent {
  if (!isPrivateEvidenceUploadIntent(options.intent)) throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
  if (!isServiceExecutionAggregate(options.execution)) throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
  assertParticipant(options.execution, options.actorUid);
  assertEligibleAccount(options.actorAccount, options.execution, options.actorUid);
  const now = iso(options.now);
  if (options.intent.state === 'attached') {
    if (options.intent.attachedEventId === options.event.eventId && options.intent.actorUid === options.actorUid) return options.intent;
    throw new PrivateEvidenceMediaError('EVIDENCE_ALREADY_ATTACHED');
  }
  if (options.intent.state !== 'pending' || now > iso(options.intent.expiresAt)) throw new PrivateEvidenceMediaError('EVIDENCE_INTENT_EXPIRED');
  if (options.intent.files.some(file => !file.upload)) throw new PrivateEvidenceMediaError('EVIDENCE_UPLOAD_INCOMPLETE');
  if (options.intent.executionId !== options.execution.executionId || options.intent.actorUid !== options.actorUid ||
      options.intent.action !== options.event.action || options.event.actorUid !== options.actorUid ||
      options.event.revision !== options.intent.expectedRevision + 1 || options.event.eventId !== `${options.execution.executionId}__${options.event.revision}`) {
    throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
  }
  const { cleanup: _cleanup, ...intent } = options.intent;
  return freeze({ ...intent, state: 'attached', attachedEventId: options.event.eventId });
}

export function issuePrivateEvidenceAccessGrant(options: {
  capability: PrivateEvidenceMediaCapability;
  intent: PrivateEvidenceUploadIntent;
  execution: ServiceExecutionAggregate;
  requesterUid: string;
  requesterAccount: unknown;
  server: { grantId: string; now: string };
}): PrivateEvidenceAccessGrant {
  assertCapability(options.capability);
  if (!isPrivateEvidenceUploadIntent(options.intent)) throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
  if (!isServiceExecutionAggregate(options.execution)) throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
  assertParticipant(options.execution, options.requesterUid);
  assertEligibleAccount(options.requesterAccount, options.execution, options.requesterUid);
  if (!SAFE_GRANT_ID.test(options.server.grantId) || options.intent.state !== 'attached' || !options.intent.attachedEventId ||
      options.intent.executionId !== options.execution.executionId || !options.execution.events.some(event => event.eventId === options.intent.attachedEventId)) {
    throw new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH');
  }
  const now = iso(options.server.now);
  return freeze({
    grantId: options.server.grantId,
    executionId: options.execution.executionId,
    eventId: options.intent.attachedEventId,
    requesterUid: options.requesterUid,
    mediaIds: options.intent.files.map(file => file.mediaId),
    expiresAt: new Date(now + PRIVATE_EVIDENCE_MEDIA_LIMITS.accessGrantTtlSeconds * 1000).toISOString(),
  });
}

export function abandonPrivateEvidenceIntent(options: {
  intent: PrivateEvidenceUploadIntent;
  actorUid: string;
  now: string;
}): PrivateEvidenceUploadIntent {
  if (!isPrivateEvidenceUploadIntent(options.intent) || options.intent.actorUid !== options.actorUid) {
    throw new PrivateEvidenceMediaError('EVIDENCE_NOT_AUTHORIZED');
  }
  iso(options.now);
  if (options.intent.state === 'attached') throw new PrivateEvidenceMediaError('EVIDENCE_ALREADY_ATTACHED');
  if (options.intent.state === 'cleanup_claimed') throw new PrivateEvidenceMediaError('EVIDENCE_CLEANUP_IN_PROGRESS');
  if (options.intent.state === 'cleanup_complete') return options.intent;
  if (options.intent.state === 'abandoned') return options.intent;
  return freeze({
    ...options.intent,
    state: 'abandoned',
    cleanup: { attempts: options.intent.cleanup?.attempts || 0, nextAttemptAt: options.now },
  });
}

export function abandonExpiredEvidenceIntents(intents: readonly PrivateEvidenceUploadIntent[], nowValue: string) {
  const now = iso(nowValue);
  return intents.slice(0, PRIVATE_EVIDENCE_MEDIA_LIMITS.abandonedCleanupBatch).map(intent =>
    isPrivateEvidenceUploadIntent(intent) && intent.state === 'pending' && iso(intent.cleanup!.nextAttemptAt!) <= now
      ? freeze({ ...intent, state: 'abandoned' as const, cleanup: { attempts: 0, nextAttemptAt: nowValue } }) : intent,
  );
}

export function claimPrivateEvidenceCleanup(options: {
  intent: PrivateEvidenceUploadIntent;
  claimId: string;
  now: string;
}): PrivateEvidenceUploadIntent {
  if (!isPrivateEvidenceUploadIntent(options.intent) || !SAFE_CLEANUP_CLAIM_ID.test(options.claimId)) {
    throw new PrivateEvidenceMediaError('EVIDENCE_CLEANUP_NOT_ELIGIBLE');
  }
  const now = iso(options.now);
  if (options.intent.state === 'attached' || options.intent.state === 'cleanup_complete' ||
      !options.intent.cleanup?.nextAttemptAt || iso(options.intent.cleanup.nextAttemptAt) > now) {
    throw new PrivateEvidenceMediaError('EVIDENCE_CLEANUP_NOT_ELIGIBLE');
  }
  if (!['pending', 'abandoned', 'cleanup_claimed'].includes(options.intent.state)) {
    throw new PrivateEvidenceMediaError('EVIDENCE_CLEANUP_NOT_ELIGIBLE');
  }
  return freeze({
    ...options.intent,
    state: 'cleanup_claimed',
    cleanup: {
      attempts: options.intent.cleanup.attempts + 1,
      claimId: options.claimId,
      claimedAt: options.now,
      nextAttemptAt: new Date(now + PRIVATE_EVIDENCE_MEDIA_LIMITS.cleanupClaimTtlSeconds * 1000).toISOString(),
    },
  });
}

function assertMatchingCleanupClaim(intent: PrivateEvidenceUploadIntent, claimId: string) {
  if (!isPrivateEvidenceUploadIntent(intent) || intent.state !== 'cleanup_claimed' || intent.cleanup?.claimId !== claimId) {
    throw new PrivateEvidenceMediaError('EVIDENCE_CLEANUP_CLAIM_MISMATCH');
  }
}

export function completePrivateEvidenceCleanup(options: {
  intent: PrivateEvidenceUploadIntent;
  claimId: string;
  now: string;
}): PrivateEvidenceUploadIntent {
  assertMatchingCleanupClaim(options.intent, options.claimId);
  iso(options.now);
  return freeze({
    ...options.intent,
    state: 'cleanup_complete',
    cleanup: { attempts: options.intent.cleanup!.attempts, completedAt: options.now },
  });
}

export function retryPrivateEvidenceCleanup(options: {
  intent: PrivateEvidenceUploadIntent;
  claimId: string;
  now: string;
}): PrivateEvidenceUploadIntent {
  assertMatchingCleanupClaim(options.intent, options.claimId);
  const now = iso(options.now);
  const exponent = Math.min(10, Math.max(0, options.intent.cleanup!.attempts - 1));
  const delaySeconds = Math.min(
    PRIVATE_EVIDENCE_MEDIA_LIMITS.cleanupRetryBaseSeconds * 2 ** exponent,
    PRIVATE_EVIDENCE_MEDIA_LIMITS.cleanupRetryMaxSeconds,
  );
  return freeze({
    ...options.intent,
    state: 'abandoned',
    cleanup: {
      attempts: options.intent.cleanup!.attempts,
      nextAttemptAt: new Date(now + delaySeconds * 1000).toISOString(),
      lastFailureCode: 'PROVIDER_DELETE_FAILED',
    },
  });
}
