/** Early Access is not an authentication identity or a launched market. */
export const EA = {
  config: 'earlyAccessConfig', subscribers: 'earlyAccessSubscribers', suppression: 'earlyAccessSuppression',
  tokens: 'earlyAccessTokens', rates: 'earlyAccessRateLimits', campaigns: 'earlyAccessCampaigns',
  previews: 'earlyAccessPreviews', deliveries: 'earlyAccessDeliveries',
  imports: 'earlyAccessImports', ownerQa: 'earlyAccessOwnerQa',
} as const;
export const OWNER_QA_EMAIL = 'heavyar.official@gmail.com';
export type RecordVersion = { data: Record<string, any>; updateTime?: string; name?: string } | null;
export type Change = { collection: string; id: string; data: Record<string, any>; prior: RecordVersion };
export type DeleteRecord = { collection: string; id: string; prior: NonNullable<RecordVersion> };
export interface EarlyAccessStore {
  read(collection: string, id: string): Promise<RecordVersion>;
  readMany?(references: Array<{ collection: string; id: string }>): Promise<RecordVersion[]>;
  save(changes: Change[], action: string, target: string, reason?: string): Promise<void>;
  delete?(records: DeleteRecord[], action: string, target: string, reason?: string, guards?: Change[]): Promise<void>;
  query(collection: string, query: any): Promise<NonNullable<RecordVersion>[]>;
  ownEmail(): Promise<string | null>;
  send(to: string, subject: string, html: string, key: string, text?: string): Promise<{ delivered: boolean; messageId?: string }>;
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
function personalize(value: string, language: string, vars: { name?: unknown; business_name?: unknown } = {}) {
  const fallbackName = language === 'ar' ? 'عميلنا العزيز' : 'there';
  const fallbackBusiness = language === 'ar' ? 'نشاطك التجاري' : 'your business';
  const name = String(vars.name || '').trim() || fallbackName;
  const business = String(vars.business_name || '').trim() || fallbackBusiness;
  return value.replace(/\{\{\s*name\s*\}\}/gi, name).replace(/\{\{\s*business_name\s*\}\}/gi, business).replace(/\{\{[^{}]+\}\}/g, '');
}
export function renderCampaign(subject: string, content: string, language: string, vars: { name?: unknown; business_name?: unknown } = {}, unsubscribe?: string) {
  const ar = language === 'ar', dir = ar ? 'rtl' : 'ltr', safeSubject = escapeHtml(personalize(subject, language, vars)), safeContent = escapeHtml(personalize(content, language, vars));
  const cta = 'https://heavyar.com', unsubscribeText = unsubscribe ? (ar ? 'إلغاء الاشتراك' : 'Unsubscribe') : (ar ? 'المعاينة فقط — سيُضاف رابط إلغاء الاشتراك عند الإرسال' : 'Preview only — unsubscribe is added when sent');
  const html = `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${dir}"><head><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>body{margin:0;background:#f3f6f8;font-family:Arial,sans-serif;color:#17323a} .wrap{max-width:640px;margin:auto;padding:24px} .card{background:#fff;border-radius:12px;padding:32px;border:1px solid #e4ecef} a{color:#087f8c}</style></head><body><div style="display:none;max-height:0;overflow:hidden">${safeSubject}</div><div class="wrap"><main class="card"><div style="font-size:24px;font-weight:700;color:#087f8c">Heavyar</div><h1 style="font-size:24px">${safeSubject}</h1><div style="font-size:16px;line-height:1.8;white-space:pre-wrap">${safeContent}</div><p style="margin-top:28px"><a href="${cta}" style="display:inline-block;background:#087f8c;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none">${ar ? 'زيارة heavyar.com' : 'Visit heavyar.com'}</a></p><hr style="border:0;border-top:1px solid #e4ecef"><p style="font-size:13px;color:#60747b">${ar ? 'Heavyar — حلول نمو موثوقة لنشاطك التجاري.' : 'Heavyar — trusted growth solutions for your business.'}<br><a href="mailto:noreply@mail.heavyar.com">noreply@mail.heavyar.com</a><br>${unsubscribe ? `<a href="${escapeHtml(unsubscribe)}">${unsubscribeText}</a>` : unsubscribeText}</p></main></div></body></html>`;
  const text = `${personalize(subject, language, vars)}\n\n${personalize(content, language, vars)}\n\n${ar ? 'زيارة heavyar.com' : 'Visit heavyar.com'}: ${cta}\n\n${ar ? 'Heavyar — حلول نمو موثوقة لنشاطك التجاري.' : 'Heavyar — trusted growth solutions for your business.'}\n${unsubscribe ? `${unsubscribeText}: ${unsubscribe}` : unsubscribeText}`;
  return { subject: personalize(subject, language, vars), html, text };
}
export function template(subject: string, content: string, language: string, unsubscribe?: string) {
  return renderCampaign(subject, content, language, {}, unsubscribe).html;
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