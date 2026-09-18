import { SafeApiError } from './error-messages';

/** IDs are opaque, including legacy UUID-prefixed and percent-encoded records. */
export function invitationId(value: string): string {
  if (typeof value !== 'string' || !value.trim() || new TextEncoder().encode(value).length > 1500
    || value === '.' || value === '..' || /^__.*__$/.test(value) || /[/\\\u0000-\u001f\u007f]/.test(value)) {
    throw new SafeApiError('INVITATION_INVALID', 400);
  }
  return value;
}
export function cancellationPayload(data: { id: string; reason: string }) {
  const reason = data.reason.trim();
  if (reason.length < 3 || reason.length > 1000) throw new SafeApiError('INVITATION_REASON_REQUIRED', 400);
  return { id: invitationId(data.id), reason };
}