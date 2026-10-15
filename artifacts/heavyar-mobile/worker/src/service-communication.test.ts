import { describe, expect, test } from 'bun:test';
import {
  ServiceCommunicationError,
  createServiceMessageRecord,
  isServiceMessageRecord,
  normalizeServiceMessageInput,
  serviceMessageProjection,
} from './service-communication';

const base = {
  messageId: `service_message_${'M'.repeat(43)}`,
  rfqId: `rfq_${'R'.repeat(43)}`,
  serviceKind: 'operator' as const,
  senderUid: 'customer-0001',
  senderRole: 'customer' as const,
  recipientUid: 'provider-0001',
  text: 'Private request-scoped message',
  idempotencyFingerprint: 'F'.repeat(43),
  createdAt: '2026-10-15T10:00:00.000Z',
};

describe('M2-E4 private service communication contract', () => {
  test('normalizes bounded text and rejects actor or media injection', () => {
    expect(normalizeServiceMessageInput({ text: '  hello  ', idempotencyKey: 'message:0001', providerProfileId: 'operator_profile_0001' }).text).toBe('hello');
    for (const invalid of [
      { text: '', idempotencyKey: 'message:0001' },
      { text: 'x'.repeat(1001), idempotencyKey: 'message:0001' },
      { text: 'hello\u0000', idempotencyKey: 'message:0001' },
      { text: 'hello', idempotencyKey: 'message:0001', senderUid: 'forged-user' },
      { text: 'hello', idempotencyKey: 'message:0001', imageUrl: 'https://public.example/image.jpg' },
    ]) {
      let rejected: unknown;
      try { normalizeServiceMessageInput(invalid); } catch (error) { rejected = error; }
      expect(rejected instanceof ServiceCommunicationError).toBe(true);
    }
  });

  test('keeps stored evidence strict and returns a minimal projection', () => {
    const record = createServiceMessageRecord(base);
    expect(isServiceMessageRecord(record)).toBe(true);
    expect(serviceMessageProjection(record)).toEqual({
      messageId: base.messageId, senderRole: 'customer', text: base.text, createdAt: base.createdAt,
    });
    expect(Object.hasOwn(serviceMessageProjection(record), 'senderUid')).toBe(false);
    expect(Object.hasOwn(serviceMessageProjection(record), 'recipientUid')).toBe(false);
    expect(() => createServiceMessageRecord({ ...base, senderUid: base.recipientUid })).toThrow();
  });
});
