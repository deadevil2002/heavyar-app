/** Early Access is not an authentication identity or a launched market. */
export const EA = {
  config: 'earlyAccessConfig', subscribers: 'earlyAccessSubscribers', suppression: 'earlyAccessSuppression',
  tokens: 'earlyAccessTokens', rates: 'earlyAccessRateLimits', campaigns: 'earlyAccessCampaigns',
  previews: 'earlyAccessPreviews', deliveries: 'earlyAccessDeliveries',
  imports: 'earlyAccessImports',
} as const;
export type RecordVersion = { data: Record<string, any>; updateTime?: string; name?: string } | null;
export type Change = { collection: string; id: string; data: Record<string, any>; prior: RecordVersion };
export interface EarlyAccessStore {
  read(collection: string, id: string): Promise<RecordVersion>;
  readMany?(references: Array<{ collection: string; id: string }>): Promise<RecordVersion[]>;
  save(changes: Change[], action: string, target: string, reason?: string): Promise<void>;
  query(collection: string, query: any): Promise<NonNullable<RecordVersion>[]>;
  ownEmail(): Promise<string | null>;
  send(to: string, subject: string, html: string, key: string): Promise<{ delivered: boolean; messageId?: string }>;
}
export async function selectedRecords(store: EarlyAccessStore, references: Array<{ collection: string; id: string }>) {
  if (references.length > 200) fail('INVALID_SELECTION');
  if (!references.length) return [];
  return store.readMany ? store.readMany(references) : Promise.all(references.map(ref => store.read(ref.collection, ref.id)));
}
export class EarlyAccessError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export function fail(code: string, status = 400): never { throw new EarlyAccessError(code, status); }
export const countryCodes = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM'];
export const subscriberFilterKeys = ['consentMarketing', 'country', 'language', 'status', 'verified'];
export function facetKey(filters: Record<string, unknown>) {
  return subscriberFilterKeys.filter(key => filters[key] !== undefined).map(key => `${key}=${String(filters[key])}`).join('&');
}
/** All combinations of five controlled facets: at most 31 small index entries. */
export function subscriberFacets(data: Record<string, any>) {
  return Array.from({ length: 31 }, (_, i) => facetKey(Object.fromEntries(subscriberFilterKeys
    .filter((_, bit) => ((i + 1) & (1 << bit)) !== 0).map(key => [key, data[key] ?? null]))));
}
export const nowIso = () => new Date().toISOString();
export const configValue = (record: RecordVersion) => ({
  enabled: record?.data.enabled === true, revision: Number(record?.data.revision || 0),
  updatedAt: record?.data.updatedAt || null, retentionDays: 365,
});
export function permissions(role?: string) {
  const privileged = ['owner', 'super_admin'].includes(role || '');
  const manage = privileged || role === 'marketing';
  return { read: manage || ['admin', 'auditor'].includes(role || ''), manage, configure: privileged, testSend: manage, approve: privileged, send: privileged };
}
export async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export function opaqueToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export const safeId = (value: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : fail('INVALID_ID');
export function text(value: unknown, max: number, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('INVALID_FIELD');
  const result = (value as string).trim();
  if (!optional && !result) fail('INVALID_FIELD');
  return result;
}
export async function body(req: Request, fields: string[], form = false) {
  // Streaming bound: Content-Length alone is controlled by the caller.
  if (Number(req.headers.get('Content-Length') || 0) > 24000) fail('PAYLOAD_TOO_LARGE', 413);
  const reader = req.body?.getReader();
  let size = 0, raw = '';
  const decoder = new TextDecoder();
  if (reader) for (;;) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > 24000) { await reader.cancel(); fail('PAYLOAD_TOO_LARGE', 413); }
    raw += decoder.decode(part.value, { stream: true });
  }
  let value: any;
  try { value = form ? Object.fromEntries(new URLSearchParams(raw + decoder.decode())) : JSON.parse(raw + decoder.decode()); } catch { fail('INVALID_JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) fail('INVALID_FIELDS');
  return value as Record<string, any>;
}
export function registration(value: Record<string, any>) {
  const email = text(value.email, 254).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email)) fail('INVALID_EMAIL');
  if (typeof value.consentMarketing !== 'boolean') fail('EXPLICIT_CONSENT_REQUIRED');
  if (value.country !== undefined && value.country !== null && typeof value.country !== 'string') fail('INVALID_COUNTRY');
  if (value.language !== undefined && typeof value.language !== 'string') fail('INVALID_LANGUAGE');
  const country = value.country || null, language = value.language || 'ar';
  if (country && !countryCodes.includes(country)) fail('INVALID_COUNTRY');
  if (!['ar', 'en'].includes(language)) fail('INVALID_LANGUAGE');
  return { email, normalizedEmail: email, name: text(value.name, 100, true), country, language, consentMarketing: value.consentMarketing };
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function template(subject: string, content: string, language: string, unsubscribe?: string) {
  return `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"><body style="font-family:Arial,sans-serif;background:#f5f7f8;padding:24px"><main style="max-width:600px;margin:auto;background:white;padding:32px"><h1>Heavyar</h1><h2>${escapeHtml(subject)}</h2><p style="white-space:pre-wrap">${escapeHtml(content)}</p><p>Heavyar is preparing for launch. نحن نستعد للإطلاق.</p><p>Store links are not available yet. روابط المتاجر غير متاحة بعد.</p><p><a href="mailto:support@mail.heavyar.com">Support / الدعم</a></p>${unsubscribe ? `<p><a href="${escapeHtml(unsubscribe)}">Unsubscribe / إلغاء الاشتراك</a></p>` : '<p>Preview only / معاينة فقط — unsubscribe link is added to recipient emails.</p>'}</main></body></html>`;
}
export function eligible(record: RecordVersion, suppression: RecordVersion, language?: string, country?: string) {
  if (!record) return 'missing';
  const s = record.data;
  if (suppression?.data.suppressed || s.status !== 'active') return 'suppressed';
  if (s.consentMarketing !== true) return 'no_consent';
  if (s.verified !== true) return 'unverified';
  if (['bounced', 'complained', 'failed'].includes(s.deliveryStatus)) return 'delivery_failed';
  if (language && s.language !== language) return 'language';
  if (country && s.country !== country) return 'country';
  return null;
}