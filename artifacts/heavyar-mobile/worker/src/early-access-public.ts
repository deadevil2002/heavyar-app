import { EA, EarlyAccessError, body, configValue, fail, hash, nowIso, opaqueToken, registration, template, type EarlyAccessStore, type Change } from './early-access-model';

const publicActorMessage = { success: true, message: 'If eligible, a confirmation email will arrive. إذا كان الطلب مؤهلاً، ستصلك رسالة تأكيد.' };
export async function rateLimit(req: Request, store: EarlyAccessStore, scope: string, limit = 10) {
  // Trust Cloudflare's authenticated edge header, not a caller's X-Forwarded-For.
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const id = await hash(`ea:${scope}:${ip}`), prior = await store.read(EA.rates, id);
  const bucket = Math.floor(Date.now() / 3600000);
  const count = prior?.data.bucket === bucket ? Number(prior.data.count) : 0;
  if (count >= limit) fail('RATE_LIMITED', 429);
  await store.save([{ collection: EA.rates, id, prior, data: { bucket, count: count + 1, expiresAt: new Date((bucket + 2) * 3600000).toISOString() } }], '', id);
}

export async function suppress(store: EarlyAccessStore, id: string, anonymize: boolean, action: string, reason?: string, retentionBefore?: number) {
  const [prior, suppression] = await Promise.all([store.read(EA.subscribers, id), store.read(EA.suppression, id)]);
  if (!prior) return false;
  if (retentionBefore !== undefined && (!prior.data.retentionAt || Date.parse(prior.data.retentionAt) > retentionBefore)) return false;
  if (suppression?.data.suppressed && !prior.data.pending &&
    (prior.data.status === 'anonymized' || !anonymize && prior.data.status === 'unsubscribed' && prior.data.consentMarketing === false)) return false;
  const timestamp = nowIso();
  // Full replacement deliberately removes pending details and provider identifiers.
  const data = anonymize ? {
    status: 'anonymized', email: '', normalizedEmail: '', name: '', country: null, language: 'ar',
    consentMarketing: false, consentAt: null, consentSource: null, verified: false,
    createdAt: prior.data.createdAt, updatedAt: timestamp, unsubscribedAt: timestamp, generation: opaqueToken(), deliveryStatus: 'not_sent',
  } : { ...prior.data, pending: null, consentMarketing: false, status: 'unsubscribed', unsubscribedAt: timestamp, updatedAt: timestamp, generation: opaqueToken() };
  await store.save([
    { collection: EA.subscribers, id, prior, data },
    { collection: EA.suppression, id, prior: suppression, data: { suppressed: true, updatedAt: timestamp } },
  ], action, id, reason);
  return true;
}

export async function deliver(store: EarlyAccessStore, id: string, to: string, subject: string, html: string) {
  let result: { delivered: boolean; messageId?: string };
  try { result = await store.send(to, subject, html, `early-access-${id}`); }
  catch { result = { delivered: false }; }
  // Never retry automatically after an ambiguous network failure.
  const prior = await store.read(EA.deliveries, id);
  if (!prior) fail('DELIVERY_UNAVAILABLE', 503);
  await store.save([{ collection: EA.deliveries, id, prior, data: {
    ...prior.data, deliveryStatus: result.delivered ? 'accepted' : 'failed',
    providerMessageId: result.messageId || null, updatedAt: nowIso(),
  } }], result.delivered ? 'early_access_email_accepted' : 'early_access_email_failed', id);
  return (await store.read(EA.deliveries, id))?.data.deliveryStatus || 'failed';
}

export async function handleEarlyAccessPublic(req: Request, store: EarlyAccessStore) {
  const url = new URL(req.url), route = url.pathname.split('/').pop();
  if (url.pathname !== `/api/early-access/${route}`) fail('NOT_FOUND', 404);
  if (route === 'config' && req.method === 'GET') return { enabled: configValue(await store.read(EA.config, 'default')).enabled };
  if (route === 'register' && req.method === 'POST') {
    const config = await store.read(EA.config, 'default');
    if (!configValue(config).enabled) fail('REGISTRATION_CLOSED', 403);
    const value = registration(await body(req, ['email', 'name', 'country', 'language', 'consentMarketing']));
    await rateLimit(req, store, 'register');
    const id = await hash(`early-access-email:${value.email}`);
    const [prior, suppression] = await Promise.all([store.read(EA.subscribers, id), store.read(EA.suppression, id)]);
    // Already-verified consent cannot be changed by someone typing an email.
    if (prior?.data.status === 'active' && prior.data.verified === true && !suppression?.data.suppressed) return publicActorMessage;
    if (Date.parse(prior?.data.nextEmailAt || '') > Date.now()) return publicActorMessage;
    if (suppression?.data.suppressed && !value.consentMarketing) return publicActorMessage;
    const token = opaqueToken(), unsubscribe = opaqueToken(), generation = opaqueToken(), timestamp = nowIso();
    const verifyId = await hash(token), unsubId = await hash(unsubscribe), deliveryId = crypto.randomUUID();
    const pending = { ...value, consentAt: value.consentMarketing ? timestamp : null, consentSource: 'public_early_access_api', consentVersion: 'early-access-v1' };
    const data = {
      ...(prior?.data || { email: value.email, normalizedEmail: value.email, name: value.name, country: value.country, language: value.language, createdAt: timestamp, status: 'active', verified: false, consentMarketing: false, consentAt: null, consentSource: null, unsubscribedAt: null }),
      pending, generation, updatedAt: timestamp, nextEmailAt: new Date(Date.now() + 3600000).toISOString(), deliveryStatus: 'pending', deliveryId,
    };
    const changes: Change[] = [
      // No-op write is a compare-and-swap guard: a concurrent toggle aborts the entire reservation.
      { collection: EA.config, id: 'default', prior: config, data: config!.data },
      { collection: EA.subscribers, id, prior, data },
      { collection: EA.tokens, id: verifyId, prior: null, data: { subscriberId: id, generation, kind: 'verify', expiresAt: new Date(Date.now() + 86400000).toISOString(), used: false } },
      { collection: EA.tokens, id: unsubId, prior: null, data: { subscriberId: id, kind: 'unsubscribe', expiresAt: new Date(Date.now() + 365 * 86400000).toISOString() } },
      { collection: EA.deliveries, id: deliveryId, prior: null, data: { subscriberId: id, kind: 'verification', deliveryStatus: 'pending', createdAt: timestamp } },
    ];
    await store.save(changes, 'early_access_registration_requested', id);
    const verifyUrl = `${url.origin}/api/early-access/verify?token=${token}`;
    const unsubUrl = `${url.origin}/api/early-access/unsubscribe?token=${unsubscribe}`;
    const subject = 'تم تسجيل اهتمامك بالوصول المبكر / Heavyar early access';
    const html = template(subject, 'Confirm your registration using the link below. Registration alone never subscribes you to marketing. On the confirmation page, choose the separate unchecked box only if you want optional launch and news emails. Resubscribing also requires this fresh choice.\nأكد اهتمامك عبر الرابط أدناه. التسجيل وحده لا يعني الموافقة على التسويق. اختر مربع الموافقة الاختياري في صفحة التأكيد فقط إذا رغبت بأخبار الإطلاق والمستجدات. إعادة الاشتراك تتطلب موافقة جديدة أيضاً.', value.language, unsubUrl)
      .replace('</main>', `<p><a href="${verifyUrl}">Confirm registration / تأكيد التسجيل</a></p></main>`);
    await deliver(store, deliveryId, value.email, subject, html);
    return publicActorMessage;
  }
  if (['verify', 'unsubscribe'].includes(route || '') && ['GET', 'POST'].includes(req.method)) {
    const token = url.searchParams.get('token') || '';
    if (!/^[a-f0-9]{64}$/.test(token)) fail('INVALID_LINK');
    if (req.method === 'GET') return confirmationPage(route!, token);
    await rateLimit(req, store, 'link', 60);
    const id = await hash(token), record = await store.read(EA.tokens, id);
    if (!record || (route === 'unsubscribe' ? !['unsubscribe', 'campaign_unsubscribe'].includes(record.data.kind) : record.data.kind !== route) || Date.parse(record.data.expiresAt) <= Date.now()) fail('LINK_EXPIRED');
    if (route === 'unsubscribe') {
      if (record.data.kind === 'campaign_unsubscribe') {
        const recipient = await store.read(EA.deliveries, record.data.recipientId);
        if (recipient) {
          const suppressionId = record.data.subscriberId || await hash(`early-access-email:${recipient.data.email}`);
          const suppression = await store.read(EA.suppression, suppressionId);
          if (suppression?.data.suppressed === true && recipient.data.deliveryStatus === 'suppressed' &&
              recipient.data.suppressionReason === 'unsubscribe' && recipient.data.retryEligible === false) {
            return completed(req, 'unsubscribe');
          }
          const timestamp = nowIso();
          await store.save([
            { collection: EA.suppression, id: suppressionId, prior: suppression, data: { suppressed: true, updatedAt: suppression?.data.updatedAt || timestamp } },
            { collection: EA.deliveries, id: record.data.recipientId, prior: recipient, data: { ...recipient.data, deliveryStatus: 'suppressed', suppressionReason: 'unsubscribe', retryEligible: false, updatedAt: timestamp } },
          ], 'early_access_campaign_unsubscribed', record.data.recipientId);
        }
        return completed(req, 'unsubscribe');
      }
      await suppress(store, record.data.subscriberId, false, 'early_access_unsubscribed');
      return completed(req, 'unsubscribe');
    }
    if (record.data.used) return completed(req, 'verify');
    const form = req.headers.get('Content-Type')?.includes('application/x-www-form-urlencoded') === true;
    const confirmation = await body(req, ['consentMarketing'], form);
    if (confirmation.consentMarketing !== undefined && !(form ? ['true', 'false'].includes(confirmation.consentMarketing) : typeof confirmation.consentMarketing === 'boolean')) fail('INVALID_CONSENT');
    const affirmed = confirmation.consentMarketing === true || form && confirmation.consentMarketing === 'true';
    const subscriberId = record.data.subscriberId;
    const [subscriber, suppression] = await Promise.all([store.read(EA.subscribers, subscriberId), store.read(EA.suppression, subscriberId)]);
    if (!subscriber || subscriber.data.generation !== record.data.generation || !subscriber.data.pending) fail('LINK_EXPIRED');
    const pending = subscriber.data.pending;
    // Both the original request and the email holder's separate unchecked
    // confirmation must opt in. Confirming interest alone never grants consent.
    const consentMarketing = pending.consentMarketing === true && affirmed;
    const remainsSuppressed = suppression?.data.suppressed === true && !consentMarketing;
    const changes: Change[] = [
      { collection: EA.subscribers, id: subscriberId, prior: subscriber, data: { ...subscriber.data, ...pending, consentMarketing, consentAt: consentMarketing ? nowIso() : null, consentSource: consentMarketing ? 'email_confirmation_checkbox' : null, pending: null, verified: true, verifiedAt: nowIso(), status: remainsSuppressed ? 'unsubscribed' : 'active', unsubscribedAt: remainsSuppressed ? subscriber.data.unsubscribedAt : null, updatedAt: nowIso() } },
      { collection: EA.tokens, id, prior: record, data: { ...record.data, used: true } },
    ];
    if (suppression && consentMarketing) changes.push({ collection: EA.suppression, id: subscriberId, prior: suppression, data: { suppressed: false, updatedAt: nowIso() } });
    await store.save(changes, consentMarketing ? 'early_access_verified_consent' : 'early_access_verified', subscriberId);
    return completed(req, 'verify');
  }
  throw new EarlyAccessError('NOT_FOUND', 404);
}

function completed(req: Request, action: string) {
  if (!req.headers.get('Content-Type')?.includes('application/x-www-form-urlencoded')) return { success: true };
  const message = action === 'unsubscribe'
    ? 'You are unsubscribed from optional emails. تم إلغاء الاشتراك في الرسائل الاختيارية.'
    : 'Your interest and optional email preference are confirmed. تم تأكيد اهتمامك وتفضيل الرسائل الاختيارية.';
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Heavyar — confirmed</title><main><h1>Heavyar</h1><p>${message}</p></main></html>`, { headers: confirmationHeaders });
}
const confirmationHeaders = {
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
function confirmationPage(action: string, token: string) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Heavyar — ${action}</title><main><h1>Heavyar</h1><p>Confirm ${action === 'verify' ? 'registration / تأكيد التسجيل' : 'unsubscribe / إلغاء الاشتراك'}.</p><form method="post" action="?token=${token}">${action === 'verify' ? '<p>Confirming interest does not subscribe you to marketing. Previously unsubscribed? Only a fresh checked choice below can restore optional emails, if requested in your registration.</p><p lang="ar" dir="rtl">تأكيد الاهتمام لا يعني الاشتراك التسويقي. إعادة الاشتراك تتطلب موافقة جديدة اختيارية أدناه إذا طلبتها عند التسجيل.</p><label><input type="checkbox" name="consentMarketing" value="true"> I explicitly agree to optional Heavyar launch/news emails, including resubscribing if I previously opted out. I can unsubscribe at any time. أوافق صراحة على رسائل الإطلاق والمستجدات الاختيارية، وإعادة الاشتراك إن ألغيت سابقاً. يمكنني الإلغاء في أي وقت.</label><p>You may leave this unchecked and confirm your interest only. يمكنك تأكيد الاهتمام دون تحديد الموافقة.</p>' : ''}<button type="submit">Confirm / تأكيد</button></form></main></html>`, {
    headers: confirmationHeaders,
  });
}