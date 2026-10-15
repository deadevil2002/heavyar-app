import { request, WorkerError } from './workerClient';

export type ServiceMessage = {
  messageId: string;
  senderRole: 'customer' | 'provider';
  text: string;
  createdAt: string;
};

export type ServiceConversationPage = {
  conversation: {
    rfqId: string;
    serviceKind: 'operator' | 'transporter';
    status: 'draft' | 'collecting_test_proposals' | 'provisionally_selected' | 'cancelled' | 'expired';
    access: 'customer' | 'provider';
    providerProfileId: string;
  };
  messages: ServiceMessage[];
  nextCursor: string | null;
  readOnly: boolean;
};

const RFQ_ID = /^rfq_[A-Za-z0-9_-]{43}$/;
const MESSAGE_ID = /^service_message_[A-Za-z0-9_-]{43}$/;
const PROFILE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function decodeMessage(value: unknown): ServiceMessage {
  const raw = record(value);
  if (!raw || !Object.keys(raw).every(key => ['messageId', 'senderRole', 'text', 'createdAt'].includes(key)) ||
      typeof raw.messageId !== 'string' || !MESSAGE_ID.test(raw.messageId) || !['customer', 'provider'].includes(String(raw.senderRole)) ||
      typeof raw.text !== 'string' || raw.text !== raw.text.trim() || !raw.text || raw.text.length > 1000 ||
      typeof raw.createdAt !== 'string' || !ISO.test(raw.createdAt) || !Number.isFinite(Date.parse(raw.createdAt))) {
    throw new WorkerError('Invalid service message response', 502, 'INVALID_SERVICE_MESSAGE_RESPONSE');
  }
  return raw as ServiceMessage;
}

export function decodeServiceConversationPage(value: unknown): ServiceConversationPage {
  const raw = record(value), conversation = record(raw?.conversation);
  if (!raw || !conversation || !Array.isArray(raw.messages) || raw.messages.length > 20 ||
      !Object.keys(conversation).every(key => ['rfqId', 'serviceKind', 'status', 'access', 'providerProfileId'].includes(key)) ||
      typeof conversation.rfqId !== 'string' || !RFQ_ID.test(conversation.rfqId) ||
      !['operator', 'transporter'].includes(String(conversation.serviceKind)) ||
      !['draft', 'collecting_test_proposals', 'provisionally_selected', 'cancelled', 'expired'].includes(String(conversation.status)) ||
      !['customer', 'provider'].includes(String(conversation.access)) || typeof conversation.providerProfileId !== 'string' || !PROFILE_ID.test(conversation.providerProfileId) ||
      raw.nextCursor !== null && (typeof raw.nextCursor !== 'string' || !MESSAGE_ID.test(raw.nextCursor)) || typeof raw.readOnly !== 'boolean') {
    throw new WorkerError('Invalid service conversation response', 502, 'INVALID_SERVICE_MESSAGE_RESPONSE');
  }
  return {
    conversation: conversation as ServiceConversationPage['conversation'],
    messages: raw.messages.map(decodeMessage),
    nextCursor: raw.nextCursor as string | null,
    readOnly: raw.readOnly,
  };
}

export function serviceMessageIdempotencyKey() {
  return `message:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 14)}`;
}

export async function listServiceMessages(
  rfqId: string,
  expectedUid: string,
  providerProfileId?: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (providerProfileId) params.set('providerProfileId', providerProfileId);
  if (cursor) params.set('cursor', cursor);
  const suffix = params.size ? `?${params.toString()}` : '';
  const response = await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}/messages${suffix}`, { signal }, true, expectedUid);
  return decodeServiceConversationPage(response);
}

export async function sendServiceMessage(
  rfqId: string,
  text: string,
  idempotencyKey: string,
  expectedUid: string,
  providerProfileId?: string,
  signal?: AbortSignal,
) {
  const response = await request<unknown>(`/api/service-rfqs/${encodeURIComponent(rfqId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, idempotencyKey, ...(providerProfileId ? { providerProfileId } : {}) }),
    signal,
  }, true, expectedUid);
  const raw = record(response);
  if (!raw || raw.success !== true || typeof raw.replayed !== 'boolean') {
    throw new WorkerError('Invalid service message response', 502, 'INVALID_SERVICE_MESSAGE_RESPONSE');
  }
  return { message: decodeMessage(raw.message), replayed: raw.replayed };
}

export function mergeServiceMessages(current: ServiceMessage[], incoming: ServiceMessage[], prepend: boolean) {
  const merged = prepend ? [...incoming, ...current] : incoming;
  return [...new Map(merged.map(item => [item.messageId, item])).values()].sort((a, b) =>
    Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.messageId.localeCompare(b.messageId));
}
