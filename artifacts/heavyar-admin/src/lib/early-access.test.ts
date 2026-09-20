import { describe, it, expect, vi } from 'vitest';
import * as earlyAccess from './early-access';

describe('Early Access API Payload Contract', () => {
  it('buildSubscribersQuery handles undefined/empty values and exact email search', () => {
    const query = earlyAccess.buildSubscribersQuery({
      q: 'user@example.com',
      status: 'active',
      empty: '',
      undef: undefined,
      limit: 20
    });
    expect(query).toBe('/early-access/subscribers?q=user%40example.com&status=active&limit=20');
  });

  it('buildCampaignsQuery handles pagination cursor', () => {
    const query = earlyAccess.buildCampaignsQuery({
      cursor: 'next-123',
      limit: 20
    });
    expect(query).toBe('/early-access/campaigns?cursor=next-123&limit=20');
  });

  it('buildPreviewPayload converts Set to Array', () => {
    const selected = new Set(['id-1', 'id-2']);
    const payload = earlyAccess.buildPreviewPayload('camp-1', selected, 'ar', 'SA');
    expect(payload.subscriberIds).toEqual(['id-1', 'id-2']);
    expect(payload.recipientIds).toEqual([]);
    expect(payload.language).toBe('ar');
    expect(earlyAccess.buildPreviewPayload('camp-1', new Set(), undefined, undefined, new Set(), true, { status: 'not_sent', source: 'csv_import' })).toMatchObject({
      selectAllRecipients: true,
      recipientFilters: { status: 'not_sent', source: 'csv_import' },
    });
  });

  it('buildTestPayload appends language to base idempotency key', () => {
    const payload = earlyAccess.buildTestPayload('camp-1', 'prev-1', 'base-uuid', 'ar');
    expect(payload.idempotencyKey).toBe('base-uuid-ar');
    expect(payload.language).toBe('ar');
    
    const payloadEn = earlyAccess.buildTestPayload('camp-1', 'prev-1', 'base-uuid', 'en');
    expect(payloadEn.idempotencyKey).toBe('base-uuid-en');
  });

  it('defines correct interfaces for Early Access payloads', () => {
    const mockSubscriber: earlyAccess.Subscriber = {
      id: '1',
      email: 'test@example.com',
      status: 'active',
      consentMarketing: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      verified: true
    };
    expect(mockSubscriber.email).toBe('test@example.com');
  });

  it('builds bounded server-side snapshot payloads without scanning the browser', () => {
    expect(earlyAccess.buildSnapshotPayload(new Set(['a', 'b']))).toEqual({ subscriberIds: ['a', 'b'] });
    expect(earlyAccess.buildSnapshotPayload(new Set(), { source: 'csv_import' }, true)).toEqual({
      selectAll: true,
      filters: { source: 'csv_import' },
    });
  });

  it('keeps CSV preview/import explicit and capped at the Worker contract boundary', () => {
    expect(earlyAccess.buildImportPayload('email\\na@example.com', 'leads.csv')).toEqual({
      csv: 'email\\na@example.com',
      filename: 'leads.csv',
      confirm: false,
    });
    expect(earlyAccess.buildImportPayload('email\\na@example.com', 'leads.csv', true).confirm).toBe(true);
    expect(earlyAccess.buildImportPayload('email\\na@example.com', 'leads.csv', true, true).lawfulBasisConfirmed).toBe(true);
  });

  it('preserves accepted versus delivered as separate delivery states', () => {
    const accepted: earlyAccess.CampaignRecipient = {
      id: 'r1', email: 'a@example.com', source: 'subscriber', deliveryStatus: 'accepted',
    };
    const delivered: earlyAccess.CampaignRecipient = {
      id: 'r2', email: 'b@example.com', source: 'csv_import', deliveryStatus: 'delivered',
    };
    expect(accepted.deliveryStatus).not.toBe(delivered.deliveryStatus);
    expect(({
      id: 'r3', email: 'c@example.com', source: 'subscriber', deliveryStatus: 'not_sent',
    } satisfies earlyAccess.CampaignRecipient).deliveryStatus).toBe('not_sent');
  });

  it('builds only the two exact retry request shapes', () => {
    expect(earlyAccess.buildRetryPayload(['r1', 'r2'])).toEqual({ recipientIds: ['r1', 'r2'] });
    expect(earlyAccess.buildRetryPayload([], true)).toEqual({ allEligible: true });
  });

  it('builds the exact restricted owner QA snapshot payload', () => {
    expect(earlyAccess.buildOwnerQaSnapshotPayload('ar')).toEqual({ confirm: true, language: 'ar' });
    expect(earlyAccess.buildOwnerQaSnapshotPayload('en')).toEqual({ confirm: true, language: 'en' });
  });

  it('requires explicit confirmation for synthetic CSV QA cleanup', () => {
    expect(earlyAccess.buildCleanupQaPayload()).toEqual({ confirm: true });
  });

  it('invalidates the exact recipient, progress, and campaign keys after queue success', async () => {
    expect(earlyAccess.campaignSendInvalidationKeys('campaign-qa')).toEqual([
      ['early-access', 'campaign', 'campaign-qa', 'recipients'],
      ['early-access', 'campaign', 'campaign-qa', 'progress'],
      ['early-access', 'campaigns'],
    ]);
    const calls: unknown[] = [];
    await earlyAccess.invalidateCampaignSendQueries({
      invalidateQueries: async ({ queryKey }: any) => { calls.push(queryKey); },
    } as any, 'campaign-qa');
    expect(calls).toEqual(earlyAccess.campaignSendInvalidationKeys('campaign-qa'));
  });

  it('normalizes all CSV preview counters without inventing unavailable suppression data', () => {
    expect(earlyAccess.csvPreviewCounts({
      headers: ['email'],
      contacts: [{ email: 'owner@example.com' }],
      rejected: [],
      totalRows: 4,
      counts: { validEmail: 2, missingEmail: 1, invalidEmail: 1, duplicateFile: 0, campaignDuplicate: 0, suppressed: 1, finalEligible: 1 },
    })).toEqual({ total: 4, valid: 2, missing: 1, invalid: 1, duplicate: 0, suppressed: 1, eligible: 1 });
    expect(earlyAccess.csvPreviewCounts(null).suppressed).toBeUndefined();
  });

  it('localizes allowlisted delivery reasons and never leaks unknown Worker codes', () => {
    expect(earlyAccess.safeDeliveryReason('global_suppression', 'en')).toBe('Excluded by the global suppression list');
    expect(earlyAccess.safeDeliveryReason('INTERNAL_PROVIDER_CODE', 'en')).toBe('Delivery could not be completed');
    expect(earlyAccess.safeDeliveryReason('INTERNAL_PROVIDER_CODE', 'ar')).toBe('تعذر إكمال التسليم');
  });

  it('derives immutable historical and current eligibility metrics from progress fields', () => {
    const progress: earlyAccess.CampaignProgress = {
      campaignId: 'historical-campaign',
      status: 'sent',
      audience: 4,
      finalRecipientCount: 1,
      finalRecipientIds: ['delivered-recipient'],
      originalAudience: 1,
      currentEligible: 0,
      alreadySent: 1,
      selectedNotSent: 0,
      selectedQueued: 0,
      selectedAccepted: 0,
      selectedDelivered: 1,
      selectedFailed: 0,
      selectedBounced: 0,
      selectedComplained: 0,
      selectedSuppressed: 0,
      selectedSkipped: 0,
      retryableFailed: 0,
      notSent: 3,
      queued: 0,
      accepted: 0,
      delivered: 1,
      failed: 0,
      bounced: 0,
      complained: 0,
      suppressed: 0,
      skipped: 3,
      remaining: 0,
      completedAt: '2025-01-01T00:00:00.000Z',
    };
    expect(earlyAccess.campaignAudienceMetrics(progress)).toEqual({
      originalAudience: 1,
      eligibleNow: 0,
      alreadySent: 1,
      delivered: 1,
      failed: 0,
      remaining: 0,
    });
    expect(earlyAccess.isCampaignDeliveryActive(progress)).toBe(false);
    expect(earlyAccess.isCampaignCompleted(progress)).toBe(true);
  });

  it('keeps accepted delivery active but stops for a terminal stale queued status', () => {
    const base: earlyAccess.CampaignProgress = {
      campaignId: 'campaign',
      status: 'sent',
      audience: 1,
      finalRecipientCount: 1,
      finalRecipientIds: ['recipient'],
      originalAudience: 1,
      currentEligible: 0,
      alreadySent: 1,
      selectedNotSent: 0,
      selectedQueued: 0,
      selectedAccepted: 1,
      selectedDelivered: 0,
      selectedFailed: 0,
      selectedBounced: 0,
      selectedComplained: 0,
      selectedSuppressed: 0,
      selectedSkipped: 0,
      retryableFailed: 0,
      notSent: 0,
      queued: 0,
      accepted: 1,
      delivered: 0,
      failed: 0,
      bounced: 0,
      complained: 0,
      suppressed: 0,
      skipped: 0,
      remaining: 0,
    };
    expect(earlyAccess.isCampaignDeliveryActive(base)).toBe(true);
    expect(earlyAccess.isCampaignDeliveryActive({
      ...base,
      status: 'queued',
      accepted: 0,
      delivered: 1,
      selectedAccepted: 0,
      selectedDelivered: 1,
    })).toBe(false);
  });

  it('ignores unselected historical in-flight rows in summaries and terminal decisions', () => {
    const progress: earlyAccess.CampaignProgress = {
      campaignId: 'selected-terminal',
      status: 'sent',
      audience: 3,
      finalRecipientCount: 1,
      finalRecipientIds: ['selected'],
      originalAudience: 1,
      currentEligible: 0,
      alreadySent: 1,
      notSent: 0,
      queued: 1,
      accepted: 1,
      delivered: 1,
      failed: 1,
      bounced: 0,
      complained: 0,
      suppressed: 0,
      skipped: 0,
      selectedNotSent: 0,
      selectedQueued: 0,
      selectedAccepted: 0,
      selectedDelivered: 1,
      selectedFailed: 0,
      selectedBounced: 0,
      selectedComplained: 0,
      selectedSuppressed: 0,
      selectedSkipped: 0,
      retryableFailed: 0,
      remaining: 0,
      completedAt: '2025-01-01T00:00:00.000Z',
    };
    expect(earlyAccess.getCampaignAudienceSummary(progress).delivered).toBe(1);
    expect(earlyAccess.getCampaignAudienceSummary(progress).failed).toBe(0);
    expect(earlyAccess.campaignNeedsRefresh(progress)).toBe(false);
    expect(earlyAccess.isCampaignCompleted(progress)).toBe(true);
  });

  it('keeps a scheduled retryable failure refreshing until it is queued again', () => {
    const progress: earlyAccess.CampaignProgress = {
      campaignId: 'retry-scheduled',
      status: 'queued',
      audience: 1,
      finalRecipientCount: 1,
      finalRecipientIds: ['selected'],
      originalAudience: 1,
      currentEligible: 1,
      alreadySent: 0,
      notSent: 0,
      queued: 0,
      accepted: 0,
      delivered: 0,
      failed: 1,
      bounced: 0,
      complained: 0,
      suppressed: 0,
      skipped: 0,
      selectedNotSent: 0,
      selectedQueued: 0,
      selectedAccepted: 0,
      selectedDelivered: 0,
      selectedFailed: 1,
      selectedBounced: 0,
      selectedComplained: 0,
      selectedSuppressed: 0,
      selectedSkipped: 0,
      retryableFailed: 1,
      remaining: 0,
    };
    expect(earlyAccess.campaignNeedsRefresh(progress)).toBe(true);
    expect(earlyAccess.campaignNeedsRefresh({ ...progress, status: 'sent' })).toBe(false);
  });
});
