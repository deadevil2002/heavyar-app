import { EA, body, countryCodes, eligible, fail, hash, nowIso, safeId, selectedRecords, template, text, type EarlyAccessStore } from './early-access-model';
import { deliver, rateLimit } from './early-access-public';

export function campaignFields(value: Record<string, any>) {
  return { name: text(value.name, 100), subjectAr: text(value.subjectAr, 200), subjectEn: text(value.subjectEn, 200), bodyAr: text(value.bodyAr, 8000), bodyEn: text(value.bodyEn, 8000) };
}
export async function campaignAction(req: Request, store: EarlyAccessStore, actorUid: string, allowed: { manage: boolean; testSend: boolean; approve: boolean }) {
  const url = new URL(req.url), segments = url.pathname.split('/'), id = segments[5] ? safeId(segments[5]) : crypto.randomUUID(), action = segments[6];
  if (segments.length > 7) fail('NOT_FOUND', 404);
  if (action === 'send') fail('PRODUCTION_SEND_DEFERRED', 403); // No flag, approval, or role can bypass this.
  if (!allowed.manage) fail('FORBIDDEN', 403);
  if (!action && ['POST', 'PATCH'].includes(req.method)) {
    const value = campaignFields(await body(req, ['name', 'subjectAr', 'subjectEn', 'bodyAr', 'bodyEn']));
    const prior = await store.read(EA.campaigns, id);
    if (req.method === 'PATCH' && !prior) fail('NOT_FOUND', 404);
    if (req.method === 'POST' && segments[5]) fail('INVALID_ROUTE');
    const campaign = { ...value, status: 'draft', revision: Number(prior?.data.revision || 0) + 1, createdAt: prior?.data.createdAt || nowIso(), updatedAt: nowIso(), createdBy: prior?.data.createdBy || actorUid, storeLinks: { appStore: null, googlePlay: null } };
    await store.save([{ collection: EA.campaigns, id, prior, data: campaign }], prior ? 'early_access_campaign_updated' : 'early_access_campaign_created', id);
    return { campaign: { ...campaign, id } };
  }
  if (req.method !== 'POST') fail('NOT_FOUND', 404);
  const campaign = await store.read(EA.campaigns, id);
  if (!campaign) fail('NOT_FOUND', 404);
  if (action === 'preview') {
    const value = await body(req, ['subscriberIds', 'language', 'country']);
    if (!Array.isArray(value.subscriberIds) || value.subscriberIds.length < 1 || value.subscriberIds.length > 100 || value.subscriberIds.some((v: any) => typeof v !== 'string')) fail('INVALID_SELECTION');
    const ids: string[] = [...new Set<string>(value.subscriberIds.map((v: string) => safeId(v)))];
    if (value.language !== undefined && !['ar', 'en'].includes(value.language)) fail('INVALID_LANGUAGE');
    if (value.country !== undefined && !countryCodes.includes(value.country)) fail('INVALID_COUNTRY');
    const byLanguage: Record<string, number> = {}, byCountry: Record<string, number> = {}, exclusionReasons: Record<string, number> = {};
    let recipientCount = 0;
    // Explicit selection only. Never query or scan for an audience.
    const selected = await selectedRecords(store, ids.flatMap(subscriberId => [{ collection: EA.subscribers, id: subscriberId }, { collection: EA.suppression, id: subscriberId }]));
    const deliveryIds = [...new Set(selected.filter((_, i) => i % 2 === 0).flatMap(record => record?.data.deliveryId ? [String(record.data.deliveryId)] : []))];
    const deliveries = await selectedRecords(store, deliveryIds.map(deliveryId => ({ collection: EA.deliveries, id: deliveryId })));
    const deliveryMap = new Map(deliveryIds.map((deliveryId, index) => [deliveryId, deliveries[index]]));
    for (let i = 0; i < ids.length; i++) {
      const subscriber = selected[i * 2], suppression = selected[i * 2 + 1];
      if (subscriber?.data.deliveryId) {
        const delivery = deliveryMap.get(subscriber.data.deliveryId);
        subscriber.data.deliveryStatus = delivery?.data.deliveryStatus || 'failed';
      }
      const excluded = eligible(subscriber, suppression, value.language, value.country);
      if (excluded) { exclusionReasons[excluded] = (exclusionReasons[excluded] || 0) + 1; continue; }
      recipientCount++;
      const { language, country } = subscriber!.data;
      byLanguage[language || 'ar'] = (byLanguage[language || 'ar'] || 0) + 1;
      byCountry[country || 'unknown'] = (byCountry[country || 'unknown'] || 0) + 1;
    }
    const previewId = crypto.randomUUID(), expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
    const summary = { recipientCount, excludedCount: ids.length - recipientCount, byLanguage, byCountry, exclusionReasons, expiresAt };
    await store.save([{ collection: EA.previews, id: previewId, prior: null, data: { ...summary, campaignId: id, campaignRevision: campaign!.data.revision, actorUid, subscriberIds: ids, language: value.language || null, country: value.country || null } }], 'early_access_campaign_previewed', id);
    return { previewId, ...summary, htmlAr: template(campaign!.data.subjectAr, campaign!.data.bodyAr, 'ar'), htmlEn: template(campaign!.data.subjectEn, campaign!.data.bodyEn, 'en') };
  }
  if (action === 'test' || action === 'approve') {
    if (!(action === 'test' ? allowed.testSend : allowed.approve)) fail('FORBIDDEN', 403);
    const value = await body(req, action === 'test' ? ['previewId', 'confirm', 'idempotencyKey', 'language'] : ['previewId', 'confirm']);
    if (value.confirm !== true || typeof value.previewId !== 'string') fail('CONFIRMATION_REQUIRED');
    const previewId = safeId(value.previewId), preview = await store.read(EA.previews, previewId);
    if (!preview || preview.data.campaignId !== id || preview.data.campaignRevision !== campaign!.data.revision || preview.data.actorUid !== actorUid || Date.parse(preview.data.expiresAt) <= Date.now()) fail('PREVIEW_EXPIRED', 409);
    if (action === 'approve') {
      if (preview.data.recipientCount < 1 || !preview.data.testDeliveryId) fail('SUCCESSFUL_TEST_REQUIRED', 409);
      const testDelivery = await store.read(EA.deliveries, preview.data.testDeliveryId);
      if (!testDelivery || testDelivery.data.previewId !== previewId || testDelivery.data.campaignRevision !== campaign!.data.revision ||
        testDelivery.data.actorUid !== actorUid || !['accepted', 'delivered'].includes(testDelivery.data.deliveryStatus)) fail('SUCCESSFUL_TEST_REQUIRED', 409);
      const data = { ...campaign!.data, status: 'approved', approvedBy: actorUid, approvedAt: nowIso(), previewId, productionSendEnabled: false };
      await store.save([
        { collection: EA.campaigns, id, prior: campaign, data },
        { collection: EA.previews, id: previewId, prior: preview, data: preview!.data },
        { collection: EA.deliveries, id: preview.data.testDeliveryId, prior: testDelivery, data: testDelivery.data },
      ], 'early_access_campaign_approved', id);
      return { campaign: { ...data, id } };
    }
    if (!['ar', 'en'].includes(value.language)) fail('INVALID_LANGUAGE');
    const key = safeId(text(value.idempotencyKey, 100));
    const deliveryId = await hash(`ea-test:${actorUid}:${id}:${key}`), existing = await store.read(EA.deliveries, deliveryId);
    if (existing) {
      if (existing.data.previewId !== previewId || existing.data.language !== value.language) fail('IDEMPOTENCY_CONFLICT', 409);
      return { success: true, deliveryStatus: existing.data.deliveryStatus };
    }
    const email = await store.ownEmail();
    if (!email) fail('VERIFIED_ACTOR_EMAIL_REQUIRED', 403);
    await rateLimit(req, store, `test:${actorUid}`, 5);
    await store.save([
      { collection: EA.campaigns, id, prior: campaign, data: campaign!.data },
      { collection: EA.previews, id: previewId, prior: preview, data: preview!.data },
      { collection: EA.deliveries, id: deliveryId, prior: null, data: { campaignId: id, campaignRevision: campaign!.data.revision, actorUid, previewId, language: value.language, kind: 'test', deliveryStatus: 'pending', createdAt: nowIso() } },
    ], 'early_access_test_requested', id);
    const ar = value.language === 'ar';
    const deliveryStatus = await deliver(store, deliveryId, email, `[TEST] ${campaign!.data[ar ? 'subjectAr' : 'subjectEn']}`, template(campaign!.data[ar ? 'subjectAr' : 'subjectEn'], campaign!.data[ar ? 'bodyAr' : 'bodyEn'], value.language));
    const currentPreview = await store.read(EA.previews, previewId);
    if (currentPreview) await store.save([{ collection: EA.previews, id: previewId, prior: currentPreview, data: { ...currentPreview.data, testDeliveryId: deliveryId } }], 'early_access_test_completed', id);
    return { success: true, deliveryStatus };
  }
  fail('NOT_FOUND', 404);
}