import { EA, OWNER_QA_EMAIL, body, countryCodes, eligible, fail, hash, nowIso, safeId, selectedRecords, template, text, type EarlyAccessStore } from './early-access-model';
import { deliver, rateLimit } from './early-access-public';
import { campaignDeliveryStatuses, snapshotCampaignRecipients, queueCampaign } from './early-access-campaign-delivery';

export function campaignFields(value: Record<string, any>) {
  return { name: text(value.name, 100), subjectAr: text(value.subjectAr, 200), subjectEn: text(value.subjectEn, 200), bodyAr: text(value.bodyAr, 8000), bodyEn: text(value.bodyEn, 8000) };
}
async function subscriberPairs(store: EarlyAccessStore, ids: string[]) {
  const records: any[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    records.push(...await Promise.all(batch.map(async subscriberId => {
      const [subscriber, suppression] = await Promise.all([store.read(EA.subscribers, subscriberId), store.read(EA.suppression, subscriberId)]);
      return [subscriber, suppression];
    })));
  }
  return records.flat();
}
async function readReferences(store: EarlyAccessStore, references: Array<{ collection: string; id: string }>) {
  const records: any[] = [];
  for (let offset = 0; offset < references.length; offset += 100) {
    const batch = references.slice(offset, offset + 100);
    records.push(...(store.readMany ? await store.readMany(batch) : await Promise.all(batch.map(reference => store.read(reference.collection, reference.id)))));
  }
  return records;
}
export async function campaignAction(req: Request, store: EarlyAccessStore, actorUid: string, allowed: { manage: boolean; testSend: boolean; approve: boolean; send?: boolean }) {
  const url = new URL(req.url), segments = url.pathname.split('/'), id = segments[5] ? safeId(segments[5]) : crypto.randomUUID(), action = segments[6];
  if (segments.length > 7) fail('NOT_FOUND', 404);
  if (action === 'send') {
    if (!allowed.send) fail('FORBIDDEN', 403);
    const value = await body(req, ['previewId', 'confirm', 'lawfulBasisConfirmed']);
    if (value.confirm !== true || typeof value.previewId !== 'string') fail('CONFIRMATION_REQUIRED');
    const preview = await store.read(EA.previews, safeId(value.previewId)), campaign = await store.read(EA.campaigns, id);
    if (!preview || !campaign || preview.data.campaignId !== id || preview.data.actorUid !== actorUid || preview.data.campaignRevision !== campaign.data.revision || Date.parse(preview.data.expiresAt) <= Date.now()) fail('PREVIEW_EXPIRED', 409);
    const subscriberIds = Array.isArray(preview.data.subscriberIds) ? preview.data.subscriberIds : [];
    const approvedRecipientIds = Array.isArray(preview.data.recipientIds) ? preview.data.recipientIds : [];
    if (campaign.data.ownerQa === true && (preview.data.ownerQa !== true || subscriberIds.length || approvedRecipientIds.length !== 1 || approvedRecipientIds[0] !== campaign.data.ownerQaRecipientId)) fail('OWNER_QA_AUDIENCE_MISMATCH', 409);
    let finalRecipientIds: string[] = [...approvedRecipientIds];
    if (subscriberIds.length) {
      const records = await subscriberPairs(store, subscriberIds);
      const contacts = subscriberIds.map((subscriberId: string, index: number) => {
        const subscriber = records[index * 2], suppression = records[index * 2 + 1];
        return subscriber ? { ...subscriber.data, id: subscriberId, suppression } : null;
      }).filter(Boolean);
      const snapshot = await snapshotCampaignRecipients(store, id, actorUid, contacts, 'subscriber');
      finalRecipientIds = [...finalRecipientIds, ...snapshot.recipientIds];
    }
    const selectedRecords = await readReferences(store, [...new Set(finalRecipientIds)].map(recipientId => ({ collection: EA.deliveries, id: recipientId })));
    const hasCsvRecipient = selectedRecords.some(record => record?.data.campaignId === id && record.data.source === 'csv_import');
    if (hasCsvRecipient && value.lawfulBasisConfirmed !== true) fail('LAWFUL_BASIS_REQUIRED', 409);
    return queueCampaign(store, id, actorUid, value.previewId, [...new Set(finalRecipientIds)], hasCsvRecipient ? { lawfulBasisConfirmedBy: actorUid, lawfulBasisConfirmedAt: nowIso() } : undefined);
  }
  if (!allowed.manage) fail('FORBIDDEN', 403);
  if (!action && ['POST', 'PATCH'].includes(req.method)) {
    const value = campaignFields(await body(req, ['name', 'subjectAr', 'subjectEn', 'bodyAr', 'bodyEn']));
    const prior = await store.read(EA.campaigns, id);
    if (req.method === 'PATCH' && !prior) fail('NOT_FOUND', 404);
    if (prior?.data.ownerQa === true) fail('OWNER_QA_AUDIENCE_MISMATCH', 409);
    if (req.method === 'POST' && segments[5]) fail('INVALID_ROUTE');
    const campaign = { ...value, status: 'draft', revision: Number(prior?.data.revision || 0) + 1, createdAt: prior?.data.createdAt || nowIso(), updatedAt: nowIso(), createdBy: prior?.data.createdBy || actorUid, storeLinks: { appStore: null, googlePlay: null } };
    await store.save([{ collection: EA.campaigns, id, prior, data: campaign }], prior ? 'early_access_campaign_updated' : 'early_access_campaign_created', id);
    return { campaign: { ...campaign, id } };
  }
  if (req.method !== 'POST') fail('NOT_FOUND', 404);
  const campaign = await store.read(EA.campaigns, id);
  if (!campaign) fail('NOT_FOUND', 404);
  if (campaign.data.ownerQa === true && ['preview', 'test'].includes(action || '')) fail('OWNER_QA_AUDIENCE_MISMATCH', 409);
  if (action === 'preview') {
    const value = await body(req, ['subscriberIds', 'language', 'country', 'recipientIds', 'selectAllRecipients', 'recipientFilters']);
    if (value.subscriberIds !== undefined && (!Array.isArray(value.subscriberIds) || value.subscriberIds.length > 500 || value.subscriberIds.some((v: any) => typeof v !== 'string'))) fail('INVALID_SELECTION');
    const ids: string[] = Array.isArray(value.subscriberIds) ? [...new Set<string>(value.subscriberIds.map((v: string) => safeId(v)))] : [];
    let recipientIds: string[] = Array.isArray(value.recipientIds) ? [...new Set(value.recipientIds.map((v: any) => safeId(String(v))))] : [];
    if (recipientIds.length > 500 || ids.length + recipientIds.length > 500) fail('INVALID_SELECTION');
    if (value.selectAllRecipients === true) {
      if (recipientIds.length || value.recipientFilters === undefined || !value.recipientFilters || typeof value.recipientFilters !== 'object' || Array.isArray(value.recipientFilters)) fail('INVALID_SELECTION');
      const allowed = new Set(['status', 'source', 'country', 'language']);
      if (Object.keys(value.recipientFilters).some(key => !allowed.has(key))) fail('INVALID_FILTER');
      const filters = value.recipientFilters;
      if (filters.status !== undefined && !campaignDeliveryStatuses.includes(filters.status)) fail('INVALID_FILTER');
      if (filters.source !== undefined && !['subscriber', 'csv_import'].includes(filters.source)) fail('INVALID_FILTER');
      if (filters.language !== undefined && !['ar', 'en'].includes(filters.language)) fail('INVALID_FILTER');
      if (filters.country !== undefined && !countryCodes.includes(filters.country)) fail('INVALID_FILTER');
      const rows = await store.query(EA.deliveries, {
        from: [{ collectionId: EA.deliveries }],
        where: { fieldFilter: { field: { fieldPath: 'campaignId' }, op: 'EQUAL', value: { stringValue: id } } },
        limit: 501,
      });
      if (rows.length > 500) fail('AUDIENCE_TOO_LARGE', 413);
      recipientIds = rows.filter(row => Object.entries(filters).every(([field, filterValue]) => String(row.data[field]) === String(filterValue))).map(row => String(row.name || '').split('/').pop()).filter((recipientId): recipientId is string => Boolean(recipientId));
    }
    if (!ids.length && !recipientIds.length) fail('INVALID_SELECTION');
    if (value.language !== undefined && !['ar', 'en'].includes(value.language)) fail('INVALID_LANGUAGE');
    if (value.country !== undefined && !countryCodes.includes(value.country)) fail('INVALID_COUNTRY');
    const byLanguage: Record<string, number> = {}, byCountry: Record<string, number> = {}, exclusionReasons: Record<string, number> = {};
    let recipientCount = 0;
    // Explicit selection only. Never query or scan for an audience.
    const selected = await subscriberPairs(store, ids);
    const deliveryIds = [...new Set(selected.filter((_, i) => i % 2 === 0).flatMap(record => record?.data.deliveryId ? [String(record.data.deliveryId)] : []))];
    const deliveries = await readReferences(store, deliveryIds.map(deliveryId => ({ collection: EA.deliveries, id: deliveryId })));
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
    const selectedCampaignRecipients = recipientIds.length ? await readReferences(store, recipientIds.map(recipientId => ({ collection: EA.deliveries, id: recipientId }))) : [];
    for (const recipient of selectedCampaignRecipients) {
      if (!recipient || recipient.data.campaignId !== id || recipient.data.deliveryStatus !== 'not_sent') { exclusionReasons.suppressed = (exclusionReasons.suppressed || 0) + 1; continue; }
      recipientCount++;
      byLanguage[recipient.data.language || 'ar'] = (byLanguage[recipient.data.language || 'ar'] || 0) + 1;
      byCountry[recipient.data.country || 'unknown'] = (byCountry[recipient.data.country || 'unknown'] || 0) + 1;
    }
    const previewId = crypto.randomUUID(), expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
    const summary = { recipientCount, excludedCount: ids.length + recipientIds.length - recipientCount, byLanguage, byCountry, exclusionReasons, expiresAt };
    const totalSelected = ids.length + recipientIds.length;
    const finalSummary = { ...summary, excludedCount: totalSelected - recipientCount };
    await store.save([{ collection: EA.previews, id: previewId, prior: null, data: { ...finalSummary, campaignId: id, campaignRevision: campaign!.data.revision, actorUid, subscriberIds: ids, recipientIds, language: value.language || null, country: value.country || null } }], 'early_access_campaign_previewed', id);
    return { previewId, ...finalSummary, htmlAr: template(campaign!.data.subjectAr, campaign!.data.bodyAr, 'ar'), htmlEn: template(campaign!.data.subjectEn, campaign!.data.bodyEn, 'en') };
  }
  if (action === 'test' || action === 'approve') {
    if (!(action === 'test' ? allowed.testSend : allowed.approve)) fail('FORBIDDEN', 403);
    const value = await body(req, action === 'test' ? ['previewId', 'confirm', 'idempotencyKey', 'language'] : ['previewId', 'confirm', 'confirmOwnerQa']);
    if (value.confirm !== true || typeof value.previewId !== 'string') fail('CONFIRMATION_REQUIRED');
    const previewId = safeId(value.previewId), preview = await store.read(EA.previews, previewId);
    if (!preview || preview.data.campaignId !== id || preview.data.campaignRevision !== campaign!.data.revision || preview.data.actorUid !== actorUid || Date.parse(preview.data.expiresAt) <= Date.now()) fail('PREVIEW_EXPIRED', 409);
    if (action === 'approve') {
      const ownerQaBypass = value.confirmOwnerQa === true;
      let testDelivery = null;
      if (ownerQaBypass) {
        const recipientIds = Array.isArray(preview.data.recipientIds) ? preview.data.recipientIds : [];
        const ownEmail = await store.ownEmail();
        const recipient = recipientIds.length === 1 ? await store.read(EA.deliveries, recipientIds[0]) : null;
        if (ownEmail !== OWNER_QA_EMAIL || campaign.data.ownerQa !== true || preview.data.ownerQa !== true ||
          preview.data.actorUid !== actorUid || preview.data.recipientCount !== 1 || recipientIds[0] !== campaign.data.ownerQaRecipientId ||
          !recipient || recipient.data.campaignId !== id || recipient.data.source !== 'owner_qa' ||
          recipient.data.email !== OWNER_QA_EMAIL || recipient.data.normalizedEmail !== OWNER_QA_EMAIL) fail('OWNER_QA_AUDIENCE_MISMATCH', 409);
      } else {
        if (preview.data.recipientCount < 1 || !preview.data.testDeliveryId) fail('SUCCESSFUL_TEST_REQUIRED', 409);
        testDelivery = await store.read(EA.deliveries, preview.data.testDeliveryId);
        if (!testDelivery || testDelivery.data.previewId !== previewId || testDelivery.data.campaignRevision !== campaign!.data.revision ||
          testDelivery.data.actorUid !== actorUid || !['accepted', 'delivered'].includes(testDelivery.data.deliveryStatus)) fail('SUCCESSFUL_TEST_REQUIRED', 409);
      }
      const data = { ...campaign!.data, status: 'approved', approvedBy: actorUid, approvedAt: nowIso(), previewId, productionSendEnabled: false };
      const changes: any[] = [
        { collection: EA.campaigns, id, prior: campaign, data },
        { collection: EA.previews, id: previewId, prior: preview, data: preview!.data },
      ];
      if (testDelivery) changes.push({ collection: EA.deliveries, id: preview.data.testDeliveryId, prior: testDelivery, data: testDelivery.data });
      await store.save(changes, ownerQaBypass ? 'early_access_owner_qa_approved' : 'early_access_campaign_approved', id);
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