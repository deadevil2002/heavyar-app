import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/services/workerClient';
import {
  decodeServiceConversationPage,
  listServiceMessages,
  mergeServiceMessages,
  sendServiceMessage,
} from '@/services/serviceCommunicationService';

vi.mock('@/services/workerClient', () => ({
  request: vi.fn(),
  WorkerError: class WorkerError extends Error {
    status: number; code: string;
    constructor(message: string, status = 500, code = 'WORKER_ERROR') { super(message); this.status = status; this.code = code; }
  },
}));

const mockedRequest = vi.mocked(request);
const RFQ_ID = `rfq_${'R'.repeat(43)}`;
const MESSAGE_A = `service_message_${'A'.repeat(43)}`;
const MESSAGE_B = `service_message_${'B'.repeat(43)}`;
const page = {
  success: true,
  conversation: {
    rfqId: RFQ_ID, serviceKind: 'operator', status: 'collecting_test_proposals', access: 'customer', providerProfileId: 'operator_profile_0001',
  },
  messages: [{ messageId: MESSAGE_A, senderRole: 'customer', text: 'Hello', createdAt: '2026-10-15T10:00:00.000Z' }],
  nextCursor: null,
  readOnly: false,
};

describe('M2-E4 mobile private service communication', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('strictly decodes only the private participant projection', () => {
    expect(decodeServiceConversationPage(page).messages[0].text).toBe('Hello');
    expect(() => decodeServiceConversationPage({ ...page, messages: [{ ...page.messages[0], senderUid: 'private-user' }] })).toThrow();
    expect(() => decodeServiceConversationPage({ ...page, conversation: { ...page.conversation, customerUid: 'private-user' } })).toThrow();
    expect(() => decodeServiceConversationPage({ ...page, messages: [{ ...page.messages[0], imageUrl: 'https://public.example/image.jpg' }] })).toThrow();
  });

  it('uses actor-free authenticated Worker requests and scopes customer threads by provider profile', async () => {
    mockedRequest.mockResolvedValue(page);
    await listServiceMessages(RFQ_ID, 'customer-uid', 'operator_profile_0001');
    expect(mockedRequest).toHaveBeenCalledWith(
      `/api/service-rfqs/${RFQ_ID}/messages?providerProfileId=operator_profile_0001`,
      expect.any(Object), true, 'customer-uid',
    );

    mockedRequest.mockResolvedValue({ success: true, message: page.messages[0], replayed: false });
    await sendServiceMessage(RFQ_ID, 'Hello', 'message:mobile-0001', 'customer-uid', 'operator_profile_0001');
    const body = JSON.parse(String(mockedRequest.mock.calls[1][1]?.body));
    expect(body).toEqual({ text: 'Hello', idempotencyKey: 'message:mobile-0001', providerProfileId: 'operator_profile_0001' });
    expect(body).not.toHaveProperty('senderUid');
    expect(body).not.toHaveProperty('recipientUid');
  });

  it('deduplicates pagination and preserves chronological display order', () => {
    const older = { messageId: MESSAGE_A, senderRole: 'customer' as const, text: 'Older', createdAt: '2026-10-15T09:00:00.000Z' };
    const newer = { messageId: MESSAGE_B, senderRole: 'provider' as const, text: 'Newer', createdAt: '2026-10-15T10:00:00.000Z' };
    expect(mergeServiceMessages([newer], [older, newer], true)).toEqual([older, newer]);
  });
});
