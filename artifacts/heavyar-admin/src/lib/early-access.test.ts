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
    expect(payload.language).toBe('ar');
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
});
