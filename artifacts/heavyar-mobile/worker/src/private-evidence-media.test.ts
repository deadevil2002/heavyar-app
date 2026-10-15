import { describe, expect, it } from 'vitest';
import { createConfirmedExecution, transitionServiceExecution } from './service-execution';
import {
  PRIVATE_EVIDENCE_MEDIA_LIMITS,
  PRIVATE_EVIDENCE_MEDIA_PRODUCTION_CAPABILITY,
  PrivateEvidenceMediaError,
  abandonPrivateEvidenceIntent,
  abandonExpiredEvidenceIntents,
  attachPrivateEvidenceToEvent,
  claimPrivateEvidenceCleanup,
  completePrivateEvidenceCleanup,
  createPrivateEvidenceUploadIntent,
  issuePrivateEvidenceAccessGrant,
  recordVerifiedPrivateEvidenceUpload,
  retryPrivateEvidenceCleanup,
  type PrivateEvidenceFileInput,
  type PrivateEvidenceMediaCapability,
  type PrivateEvidenceUploadIntent,
} from './private-evidence-media';

const customerUid = 'customer_uid_123';
const providerUid = 'provider_uid_456';
const strangerUid = 'stranger_uid_789';
const at = (minute: number) => `2026-10-15T12:${String(minute).padStart(2, '0')}:00.000Z`;
const enabled: PrivateEvidenceMediaCapability = {
  enabled: true,
  backend: 'authenticated_private',
  authenticatedUpload: true,
  participantAuthorizedDelivery: true,
  metadataStrippedBeforeStorage: true,
};
const customerAccount = { role: 'customer', isActive: true, accountStatus: 'active', status: 'active' };
const providerAccount = { role: 'driver', isActive: true, accountStatus: 'active', status: 'active' };
const file = (overrides: Partial<PrivateEvidenceFileInput> = {}): PrivateEvidenceFileInput => ({
  clientFileId: 'client_file_123456',
  mimeType: 'image/jpeg',
  sizeBytes: 512_000,
  width: 1280,
  height: 960,
  ...overrides,
});

function execution() {
  return createConfirmedExecution({
    sourceKind: 'service_contract', sourceId: 'service_contract_123', serviceKind: 'operator',
    customerUid, providerUid, sourceRevision: 1, contractState: 'confirmed', eligibilityState: 'verified',
    bookingState: 'confirmed', paymentState: 'not_required',
  }, {
    executionId: `execution_${'e'.repeat(43)}`, actorUid: customerUid,
    idempotencyKey: 'create:execution:123', now: at(0),
  });
}

function pendingIntent(overrides: Partial<Parameters<typeof createPrivateEvidenceUploadIntent>[0]> = {}) {
  const state = execution();
  return createPrivateEvidenceUploadIntent({
    capability: enabled,
    execution: state,
    actorUid: providerUid,
    actorAccount: providerAccount,
    expectedRevision: state.revision,
    action: 'start',
    idempotencyKey: 'evidence:start:123',
    files: [file()],
    server: { intentId: `evidence_intent_${'i'.repeat(43)}`, files: [{ mediaId: `evidence_media_${'m'.repeat(43)}`, publicId: `heavyar/evidence/execution_${'e'.repeat(43)}/evidence_media_${'m'.repeat(43)}` }], now: at(1) },
    ...overrides,
  });
}

function intent(overrides: Partial<Parameters<typeof createPrivateEvidenceUploadIntent>[0]> = {}) {
  const created = pendingIntent(overrides);
  return recordVerifiedPrivateEvidenceUpload({
    intent: created,
    actorUid: created.actorUid,
    mediaId: created.files[0].mediaId,
    receipt: { assetId: 'asset_verified_123', version: 1, format: 'jpg', bytes: 480_000, width: 1280, height: 960, sha256: 'a'.repeat(64), uploadedAt: at(1) },
    now: at(1),
  });
}

describe('M2-E3 private evidence media contract', () => {
  it('keeps Production media disabled until every private-delivery property is verified', () => {
    expect(() => intent({ capability: PRIVATE_EVIDENCE_MEDIA_PRODUCTION_CAPABILITY }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_MEDIA_NOT_ACTIVATED'));
    expect(() => intent({ capability: { ...enabled, metadataStrippedBeforeStorage: false } }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_MEDIA_NOT_ACTIVATED'));
  });

  it('binds an authorized upload intent to one authoritative event and issues a short participant grant', () => {
    const initial = execution();
    const upload = intent({ execution: initial });
    const started = transitionServiceExecution(initial, {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:123',
    }, providerUid, at(2));
    const attached = attachPrivateEvidenceToEvent({
      intent: upload, execution: started, event: started.events[1], actorUid: providerUid,
      actorAccount: providerAccount, now: at(2),
    });
    const grant = issuePrivateEvidenceAccessGrant({
      capability: enabled, intent: attached, execution: started, requesterUid: customerUid,
      requesterAccount: customerAccount, server: { grantId: `evidence_grant_${'g'.repeat(43)}`, now: at(3) },
    });
    expect(attached).toMatchObject({ state: 'attached', attachedEventId: started.events[1].eventId });
    expect(grant.mediaIds).toEqual([`evidence_media_${'m'.repeat(43)}`]);
    expect(Date.parse(grant.expiresAt) - Date.parse(at(3))).toBe(PRIVATE_EVIDENCE_MEDIA_LIMITS.accessGrantTtlSeconds * 1000);
    expect(JSON.stringify(grant)).not.toMatch(/url|publicId|provider/i);
  });

  it('denies unrelated and suspended or restricted accounts before private evidence access', () => {
    expect(() => intent({ actorUid: strangerUid })).toThrowError(new PrivateEvidenceMediaError('EVIDENCE_NOT_AUTHORIZED'));
    expect(() => intent({ actorAccount: { ...providerAccount, isActive: false } }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_ACCOUNT_INELIGIBLE'));
    expect(() => intent({ actorAccount: { ...providerAccount, accountStatus: 'restricted' } }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_ACCOUNT_INELIGIBLE'));
    expect(() => intent({ actorAccount: { ...providerAccount, accountPurpose: 'store_review' } }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_ACCOUNT_INELIGIBLE'));
    expect(() => intent({ actorAccount: customerAccount }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_ACCOUNT_INELIGIBLE'));

    const initial = execution();
    const upload = intent({ execution: initial });
    const started = transitionServiceExecution(initial, {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:blocked',
    }, providerUid, at(2));
    expect(() => attachPrivateEvidenceToEvent({
      intent: upload, execution: started, event: started.events[1], actorUid: providerUid,
      actorAccount: { ...providerAccount, status: 'suspended' }, now: at(2),
    })).toThrowError(new PrivateEvidenceMediaError('EVIDENCE_ACCOUNT_INELIGIBLE'));
    const attached = attachPrivateEvidenceToEvent({
      intent: upload, execution: started, event: started.events[1], actorUid: providerUid,
      actorAccount: providerAccount, now: at(2),
    });
    expect(() => issuePrivateEvidenceAccessGrant({
      capability: enabled, intent: attached, execution: started, requesterUid: customerUid,
      requesterAccount: { ...customerAccount, accountStatus: 'restricted' },
      server: { grantId: `evidence_grant_${'g'.repeat(43)}`, now: at(3) },
    })).toThrowError(new PrivateEvidenceMediaError('EVIDENCE_ACCOUNT_INELIGIBLE'));
  });

  it('rejects forged media identifiers, unsupported files, oversized bytes and excessive dimensions', () => {
    expect(() => intent({ server: { intentId: `evidence_intent_${'i'.repeat(43)}`, files: [{ mediaId: 'https://public.example/file.jpg', publicId: 'public' }], now: at(1) } }))
      .toThrowError(new PrivateEvidenceMediaError('INVALID_EVIDENCE_FILE'));
    expect(() => intent({ files: [file({ mimeType: 'image/gif' as never })] }))
      .toThrowError(new PrivateEvidenceMediaError('INVALID_EVIDENCE_FILE'));
    expect(() => intent({ files: [file({ sizeBytes: PRIVATE_EVIDENCE_MEDIA_LIMITS.maxFileBytes + 1 })] }))
      .toThrowError(new PrivateEvidenceMediaError('INVALID_EVIDENCE_FILE'));
    expect(() => intent({ files: [file({ width: 4096, height: 4096 })] }))
      .toThrowError(new PrivateEvidenceMediaError('INVALID_EVIDENCE_FILE'));
  });

  it('rejects stale revisions, expired intents and cross-request attachment', () => {
    expect(() => intent({ expectedRevision: 2 })).toThrowError(new PrivateEvidenceMediaError('INVALID_EVIDENCE_INTENT'));
    const initial = execution();
    const upload = intent({ execution: initial });
    const started = transitionServiceExecution(initial, {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:456',
    }, providerUid, at(2));
    expect(() => attachPrivateEvidenceToEvent({ intent: upload, execution: started, event: started.events[1], actorUid: providerUid, actorAccount: providerAccount, now: at(12) }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_INTENT_EXPIRED'));
    expect(() => attachPrivateEvidenceToEvent({
      intent: { ...upload, executionId: `execution_${'x'.repeat(43)}` }, execution: started,
      event: started.events[1], actorUid: providerUid, actorAccount: providerAccount, now: at(2),
    })).toThrowError(new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH'));
    expect(() => attachPrivateEvidenceToEvent({
      intent: { ...upload, files: [{ ...upload.files[0], mediaId: 'https://public.example/evidence.jpg' }] },
      execution: started, event: started.events[1], actorUid: providerUid, actorAccount: providerAccount, now: at(2),
    })).toThrowError(new PrivateEvidenceMediaError('EVIDENCE_REFERENCE_MISMATCH'));
  });

  it('requires a verified upload receipt and makes abandonment bounded and irreversible', () => {
    const initial = execution(), pending = pendingIntent({ execution: initial });
    const started = transitionServiceExecution(initial, {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:pending',
    }, providerUid, at(2));
    expect(() => attachPrivateEvidenceToEvent({ intent: pending, execution: started, event: started.events[1], actorUid: providerUid, actorAccount: providerAccount, now: at(2) }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_UPLOAD_INCOMPLETE'));
    const abandoned = abandonPrivateEvidenceIntent({ intent: pending, actorUid: providerUid, now: at(2) });
    expect(abandoned.state).toBe('abandoned');
    expect(abandonPrivateEvidenceIntent({ intent: abandoned, actorUid: providerUid, now: at(3) })).toBe(abandoned);
    expect(() => abandonPrivateEvidenceIntent({ intent: pending, actorUid: customerUid, now: at(2) }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_NOT_AUTHORIZED'));
  });

  it('makes actor-bound idempotent creation and attachment safe for transaction/CAS callers', () => {
    const initial = execution();
    const created = intent({ execution: initial });
    expect(intent({ execution: initial, prior: created })).toBe(created);
    expect(() => intent({ execution: initial, actorUid: customerUid, actorAccount: customerAccount, prior: created }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_IDEMPOTENCY_ACTOR_MISMATCH'));
    expect(() => intent({ execution: initial, files: [file({ sizeBytes: 512_001 })], prior: created }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_IDEMPOTENCY_CONFLICT'));

    const started = transitionServiceExecution(initial, {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:789',
    }, providerUid, at(2));
    const attached = attachPrivateEvidenceToEvent({ intent: created, execution: started, event: started.events[1], actorUid: providerUid, actorAccount: providerAccount, now: at(2) });
    expect(attachPrivateEvidenceToEvent({ intent: attached, execution: started, event: started.events[1], actorUid: providerUid, actorAccount: providerAccount, now: at(3) })).toBe(attached);
    expect(() => attachPrivateEvidenceToEvent({ intent: attached, execution: started, event: started.events[1], actorUid: customerUid, actorAccount: customerAccount, now: at(3) }))
      .toThrowError(new PrivateEvidenceMediaError('EVIDENCE_ALREADY_ATTACHED'));
  });

  it('marks only a bounded batch of abandoned pending uploads for cleanup', () => {
    const expired = intent() as PrivateEvidenceUploadIntent;
    const records = Array.from({ length: PRIVATE_EVIDENCE_MEDIA_LIMITS.abandonedCleanupBatch + 2 }, (_, index) => ({
      ...expired, intentId: `evidence_intent_${String(index).padStart(43, 'a')}`,
    }));
    const cleaned = abandonExpiredEvidenceIntents(records, at(20));
    expect(cleaned).toHaveLength(PRIVATE_EVIDENCE_MEDIA_LIMITS.abandonedCleanupBatch);
    expect(cleaned.every(item => item.state === 'abandoned')).toBe(true);
  });

  it('claims expired cleanup atomically and prevents event attachment after the claim', () => {
    const initial = execution(), upload = intent({ execution: initial });
    expect(() => claimPrivateEvidenceCleanup({
      intent: upload, claimId: `evidence_cleanup_${'c'.repeat(43)}`, now: at(15),
    })).toThrowError(new PrivateEvidenceMediaError('EVIDENCE_CLEANUP_NOT_ELIGIBLE'));
    const claimed = claimPrivateEvidenceCleanup({
      intent: upload, claimId: `evidence_cleanup_${'c'.repeat(43)}`, now: at(16),
    });
    const started = transitionServiceExecution(initial, {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:cleanup',
    }, providerUid, at(2));
    expect(claimed.state).toBe('cleanup_claimed');
    expect(() => attachPrivateEvidenceToEvent({
      intent: claimed, execution: started, event: started.events[1], actorUid: providerUid,
      actorAccount: providerAccount, now: at(2),
    })).toThrowError(new PrivateEvidenceMediaError('EVIDENCE_INTENT_EXPIRED'));
    expect(completePrivateEvidenceCleanup({
      intent: claimed, claimId: claimed.cleanup!.claimId!, now: at(17),
    })).toMatchObject({ state: 'cleanup_complete', cleanup: { attempts: 1, completedAt: at(17) } });
  });

  it('backs failed deletion off and recovers a stale cleanup claim idempotently', () => {
    const first = claimPrivateEvidenceCleanup({
      intent: intent(), claimId: `evidence_cleanup_${'a'.repeat(43)}`, now: at(16),
    });
    const retry = retryPrivateEvidenceCleanup({ intent: first, claimId: first.cleanup!.claimId!, now: at(17) });
    expect(retry).toMatchObject({
      state: 'abandoned',
      cleanup: { attempts: 1, nextAttemptAt: at(22), lastFailureCode: 'PROVIDER_DELETE_FAILED' },
    });
    expect(() => claimPrivateEvidenceCleanup({
      intent: retry, claimId: `evidence_cleanup_${'b'.repeat(43)}`, now: at(21),
    })).toThrowError(new PrivateEvidenceMediaError('EVIDENCE_CLEANUP_NOT_ELIGIBLE'));
    const second = claimPrivateEvidenceCleanup({
      intent: retry, claimId: `evidence_cleanup_${'b'.repeat(43)}`, now: at(22),
    });
    const recovered = claimPrivateEvidenceCleanup({
      intent: second, claimId: `evidence_cleanup_${'d'.repeat(43)}`, now: at(28),
    });
    expect(recovered).toMatchObject({ state: 'cleanup_claimed', cleanup: { attempts: 3 } });
    expect(completePrivateEvidenceCleanup({
      intent: recovered, claimId: recovered.cleanup!.claimId!, now: at(29),
    }).state).toBe('cleanup_complete');
  });

  it('never makes attached evidence eligible for cleanup', () => {
    const initial = execution(), upload = intent({ execution: initial });
    const started = transitionServiceExecution(initial, {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:retained',
    }, providerUid, at(2));
    const attached = attachPrivateEvidenceToEvent({
      intent: upload, execution: started, event: started.events[1], actorUid: providerUid,
      actorAccount: providerAccount, now: at(2),
    });
    expect(() => claimPrivateEvidenceCleanup({
      intent: attached, claimId: `evidence_cleanup_${'c'.repeat(43)}`, now: at(30),
    })).toThrowError(new PrivateEvidenceMediaError('EVIDENCE_CLEANUP_NOT_ELIGIBLE'));
  });
});
