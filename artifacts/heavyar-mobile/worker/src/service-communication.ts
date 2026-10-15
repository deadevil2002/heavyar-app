export const SERVICE_MESSAGE_LIMITS = Object.freeze({ textLength: 1000, pageSize: 20, bodyBytes: 16 * 1024 });

export type ServiceMessageRecord = Readonly<{
  schemaVersion: 1;
  messageId: string;
  rfqId: string;
  serviceKind: 'operator' | 'transporter';
  senderUid: string;
  senderRole: 'customer' | 'provider';
  recipientUid: string;
  text: string;
  idempotencyFingerprint: string;
  createdAt: string;
  retentionClass: 'transaction_evidence_7y_after_closure';
}>;

export class ServiceCommunicationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ServiceCommunicationError';
  }
}

const MESSAGE_ID = /^service_message_[A-Za-z0-9_-]{43}$/;
const RFQ_ID = /^rfq_[A-Za-z0-9_-]{43}$/;
const UID = /^[A-Za-z0-9_-]{6,128}$/;
const IDEMPOTENCY = /^[A-Za-z0-9:_-]{8,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function normalizeServiceMessageInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceCommunicationError('INVALID_SERVICE_MESSAGE');
  const raw = value as Record<string, unknown>;
  if (!Object.keys(raw).every(key => ['text', 'idempotencyKey', 'providerProfileId'].includes(key)) ||
      typeof raw.text !== 'string' || typeof raw.idempotencyKey !== 'string' || !IDEMPOTENCY.test(raw.idempotencyKey) ||
      raw.providerProfileId !== undefined && (typeof raw.providerProfileId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(raw.providerProfileId))) {
    throw new ServiceCommunicationError('INVALID_SERVICE_MESSAGE');
  }
  const text = raw.text.trim();
  if (!text || text.length > SERVICE_MESSAGE_LIMITS.textLength || CONTROL.test(text)) {
    throw new ServiceCommunicationError('INVALID_SERVICE_MESSAGE');
  }
  return Object.freeze({ text, idempotencyKey: raw.idempotencyKey });
}

export function createServiceMessageRecord(input: {
  messageId: string;
  rfqId: string;
  serviceKind: 'operator' | 'transporter';
  senderUid: string;
  senderRole: 'customer' | 'provider';
  recipientUid: string;
  text: string;
  idempotencyFingerprint: string;
  createdAt: string;
}): ServiceMessageRecord {
  if (!MESSAGE_ID.test(input.messageId) || !RFQ_ID.test(input.rfqId) || !UID.test(input.senderUid) || !UID.test(input.recipientUid) ||
      input.senderUid === input.recipientUid || !['operator', 'transporter'].includes(input.serviceKind) ||
      !['customer', 'provider'].includes(input.senderRole) || !input.text || input.text.length > SERVICE_MESSAGE_LIMITS.textLength || CONTROL.test(input.text) ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.idempotencyFingerprint) || !ISO.test(input.createdAt) || !Number.isFinite(Date.parse(input.createdAt))) {
    throw new ServiceCommunicationError('INVALID_SERVICE_MESSAGE');
  }
  return Object.freeze({ schemaVersion: 1, ...input, retentionClass: 'transaction_evidence_7y_after_closure' });
}

export function isServiceMessageRecord(value: unknown): value is ServiceMessageRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as ServiceMessageRecord;
  return message.schemaVersion === 1 && MESSAGE_ID.test(String(message.messageId || '')) && RFQ_ID.test(String(message.rfqId || '')) &&
    ['operator', 'transporter'].includes(message.serviceKind) && UID.test(String(message.senderUid || '')) && UID.test(String(message.recipientUid || '')) &&
    message.senderUid !== message.recipientUid && ['customer', 'provider'].includes(message.senderRole) && typeof message.text === 'string' &&
    message.text === message.text.trim() && message.text.length > 0 && message.text.length <= SERVICE_MESSAGE_LIMITS.textLength && !CONTROL.test(message.text) &&
    /^[A-Za-z0-9_-]{43}$/.test(String(message.idempotencyFingerprint || '')) && ISO.test(String(message.createdAt || '')) &&
    Number.isFinite(Date.parse(message.createdAt)) && message.retentionClass === 'transaction_evidence_7y_after_closure';
}

export function serviceMessageProjection(message: ServiceMessageRecord) {
  return Object.freeze({
    messageId: message.messageId,
    senderRole: message.senderRole,
    text: message.text,
    createdAt: message.createdAt,
  });
}
