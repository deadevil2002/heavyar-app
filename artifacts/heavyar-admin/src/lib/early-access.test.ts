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
});
