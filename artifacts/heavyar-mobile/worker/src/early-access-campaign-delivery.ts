import { EA, EarlyAccessError, eligible, fail, hash, nowIso, opaqueToken, template, type EarlyAccessStore } from './early-access-model';

export const campaignDeliveryStatuses = ['not_sent', 'queued', 'accepted', 'delivered', 'failed', 'bounced', 'complained', 'suppressed', 'skipped'] as const;
export type CampaignDeliveryStatus = typeof campaignDeliveryStatuses[number];
const MAX_CSV_BYTES = 512 * 1024, MAX_CSV_ROWS = 500, MAX_FIELD = 500;
const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i;

export function normalizeCampaignEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();
  return emailPattern.test(email) && email.length <= 254 ? email : null;
}

function safeCell(value: string) {
  const trimmed = value.trim().slice(0, MAX_FIELD);
  return /^[=+\-@]/.test(trimmed) ? `'${trimmed}` : trimmed;
}

/** RFC4180-compatible enough for exported business CSVs, with bounded cells. */
export function parseCampaignCsv(input: string) {
  if (new TextEncoder().encode(input).byteLength > MAX_CSV_BYTES) fail('CSV_TOO_LARGE', 413);
  const rows: string[][] = [], row: string[] = [];
  let cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i], next = input[i + 1];
    if (c === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(safeCell(cell)); cell = '';
      if (c === '\n' || c === '\r' && next !== '\n') { if (c === '\r' && next === '\n') i++; rows.push(row.splice(0)); }
    } else cell += c;
  }
  if (quoted) fail('INVALID_CSV');
  if (cell || row.length) { row.push(safeCell(cell)); rows.push(row); }
  if (!rows.length) fail('CSV_EMPTY');
  const headers = rows.shift()!.map(x => x.toLowerCase().replace(/^\ufeff/, '').trim());
  if (!headers.includes('email') || headers.length > 40) fail('CSV_EMAIL_REQUIRED');
  if (rows.length > MAX_CSV_ROWS) fail('CSV_TOO_MANY_ROWS', 413);
  const seen = new Set<string>(), contacts: any[] = [], rejected: any[] = [], counts = { validEmail: 0, missingEmail: 0, invalidEmail: 0, duplicateFile: 0 };
  for (const [index, values] of rows.entries()) {
    const item = Object.fromEntries(headers.map((header, i) => [header, values[i] || '']));
    if (!String(item.email || '').trim()) { counts.missingEmail++; rejected.push({ row: index + 2, reason: 'missing_email' }); continue; }
    const email = normalizeCampaignEmail(item.email);
    if (!email) { counts.invalidEmail++; rejected.push({ row: index + 2, reason: 'invalid_email' }); continue; }
    if (seen.has(email)) { counts.duplicateFile++; rejected.push({ row: index + 2, email, reason: 'duplicate_file' }); continue; }
    seen.add(email);
    counts.validEmail++;
    contacts.push({ email, normalizedEmail: email, name: item.name || '', businessName: item.business_name || '', language: item.language === 'en' ? 'en' : 'ar', country: item.country || null, city: item.city || '', category: item.category || '', phone: item.phone || '', website: item.website || '', leadFit: item.lead_fit || '', source: 'csv_import' });
  }
  return { headers, contacts, rejected, counts, totalRows: rows.length };
}

export async function snapshotCampaignRecipients(store: EarlyAccessStore, campaignId: string, actorUid: string, contacts: any[], source: 'subscriber' | 'csv_import') {
  if (!contacts.length || contacts.length > 500) fail('INVALID_SELECTION');
  const timestamp = nowIso(), changes: any[] = [], selectedIds: string[] = [];
  for (const contact of contacts) {
    const email = normalizeCampaignEmail(contact.email);
    if (!email) continue;
    const id = await hash(`early-access-campaign:${campaignId}:${email}`);
    const prior = await store.read(EA.deliveries, id);
    if (prior) { selectedIds.push(id); continue; }
    const subscriberId = source === 'subscriber' ? contact.id : undefined;
    const suppressionId = subscriberId || await hash(`early-access-email:${email}`);
    const suppression = await store.read(EA.suppression, suppressionId);
    const suppressed = suppression?.data.suppressed === true;
    if (source === 'subscriber' && (contact.eligibleReason || eligible({ data: contact }, contact.suppression))) continue;
    selectedIds.push(id);
    changes.push({ collection: EA.deliveries, id, prior: null, data: {
      campaignId, campaignRecipientId: id, normalizedEmail: email, email, name: contact.name || contact.businessName || '',
      businessName: contact.businessName || '', language: contact.language === 'en' ? 'en' : 'ar', country: contact.country || null,
      source, subscriberId: subscriberId || null, lawfulBasisConfirmed: source === 'csv_import' ? contact.lawfulBasisConfirmed === true : null,
      deliveryStatus: suppressed ? 'suppressed' : 'not_sent',
      suppressionReason: suppressed ? 'global_suppression' : null, attempts: 0, createdAt: timestamp, updatedAt: timestamp,
      createdBy: actorUid, retryEligible: false,
    } });
  }
  if (changes.length) await store.save(changes, 'early_access_campaign_snapshot_created', campaignId);
  return { added: changes.length, duplicate: contacts.length - changes.length, recipientIds: selectedIds };
}

export async function campaignRecipients(store: EarlyAccessStore, campaignId: string, limit = 50, cursor?: string, filters: { status?: string; source?: string; country?: string; language?: string } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) fail('INVALID_LIMIT');
  const allowedStatuses = new Set(campaignDeliveryStatuses), allowedSources = new Set(['subscriber', 'csv_import']);
  if (filters.status && !allowedStatuses.has(filters.status as CampaignDeliveryStatus)) fail('INVALID_FILTER');
  if (filters.source && !allowedSources.has(filters.source)) fail('INVALID_FILTER');
  if (filters.country && !/^[A-Z]{2}$/.test(filters.country)) fail('INVALID_FILTER');
  if (filters.language && !['ar', 'en'].includes(filters.language)) fail('INVALID_FILTER');
  const fingerprint = `campaign:${campaignId}:${JSON.stringify(filters)}`, query: any = {
    from: [{ collectionId: EA.deliveries }],
    where: { fieldFilter: { field: { fieldPath: 'campaignId' }, op: 'EQUAL', value: { stringValue: campaignId } } },
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit: 501,
  };
  if (cursor) {
    try {
      if (cursor.length > 3000) fail('INVALID_CURSOR');
      const parsed = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
      if (parsed.fingerprint !== fingerprint || typeof parsed.name !== 'string') fail('INVALID_CURSOR');
      query.startAt = { before: false, values: [{ referenceValue: parsed.name }] };
    } catch (error) { if (error instanceof EarlyAccessError) throw error; fail('INVALID_CURSOR'); }
  }
  const rows = await store.query(EA.deliveries, query);
  const matching = rows.filter(row => Object.entries(filters).every(([field, value]) => String(row.data[field]) === value));
  const candidates = matching.slice(0, limit);
  const items = candidates.map(row => ({ id: row.name?.split('/').pop(), ...row.data, email: row.data.email, normalizedEmail: undefined, lastAttemptAt: row.data.lastAttemptAt || null }));
  const last = candidates[candidates.length - 1];
  const nextCursor = matching.length > limit && last?.name ? btoa(JSON.stringify({ fingerprint, name: last.name })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null;
  return { items, nextCursor };
}

export async function queueCampaign(store: EarlyAccessStore, campaignId: string, actorUid: string, previewId: string, recipients: string[], confirmation?: { lawfulBasisConfirmedBy: string; lawfulBasisConfirmedAt: string }) {
  if (!recipients.length || recipients.length > 500) fail('EMPTY_AUDIENCE', 409);
  const campaign = await store.read(EA.campaigns, campaignId);
  if (!campaign || campaign.data.status !== 'approved' || campaign.data.previewId !== previewId) fail('CAMPAIGN_NOT_APPROVED', 409);
  const changes: any[] = [], skipped: string[] = [];
  for (const recipientId of [...new Set(recipients)]) {
    const recipient = await store.read(EA.deliveries, recipientId);
    if (!recipient || recipient.data.campaignId !== campaignId || recipient.data.deliveryStatus !== 'not_sent') { skipped.push(recipientId); continue; }
    if (recipient.data.source === 'csv_import' && recipient.data.lawfulBasisConfirmed !== true) fail('LAWFUL_BASIS_REQUIRED', 409);
    if (recipient.data.source === 'subscriber') {
      const subscriber = recipient.data.subscriberId ? await store.read(EA.subscribers, recipient.data.subscriberId) : null;
      const suppression = recipient.data.subscriberId ? await store.read(EA.suppression, recipient.data.subscriberId) : null;
      if (eligible(subscriber, suppression)) { skipped.push(recipientId); continue; }
    }
    const now = nowIso();
    changes.push({ collection: EA.deliveries, id: recipientId, prior: recipient, data: { ...recipient.data, deliveryStatus: 'queued', queuedAt: now, updatedAt: now } });
  }
  if (!changes.length) fail('EMPTY_AUDIENCE', 409);
  const finalRecipientIds = changes.map(change => change.id);
  await store.save([
    ...changes,
    { collection: EA.campaigns, id: campaignId, prior: campaign, data: {
      ...campaign.data, status: 'queued', queuedAt: nowIso(), queuedBy: actorUid,
      sendStartedAt: campaign.data.sendStartedAt || nowIso(), finalRecipientIds, finalRecipientCount: finalRecipientIds.length, recipientCount: finalRecipientIds.length,
      ...(confirmation ? { lawfulBasisConfirmed: true, lawfulBasisConfirmedBy: confirmation.lawfulBasisConfirmedBy, lawfulBasisConfirmedAt: confirmation.lawfulBasisConfirmedAt } : {}),
    } },
  ], 'early_access_campaign_queued', campaignId);
  return { success: true, status: 'queued', recipientCount: finalRecipientIds.length, selected: recipients.length, queued: finalRecipientIds.length, skipped: skipped.length };
}

export async function retryCampaignRecipients(store: EarlyAccessStore, campaignId: string, actorUid: string, recipientIds?: string[], allEligible = false) {
  if (recipientIds && (!recipientIds.length || recipientIds.length > 500)) fail('INVALID_SELECTION');
  if (recipientIds && allEligible || !recipientIds && !allEligible) fail('INVALID_SELECTION');
  const candidates = recipientIds
    ? (await Promise.all(recipientIds.map(id => store.read(EA.deliveries, id)))).map((record, index) => record ? { ...record, requestedId: recipientIds[index] } : null)
    : await store.query(EA.deliveries, {
      from: [{ collectionId: EA.deliveries }],
      where: { fieldFilter: { field: { fieldPath: 'campaignId' }, op: 'EQUAL', value: { stringValue: campaignId } } },
      limit: 501,
    });
  if (!recipientIds && candidates.length > 500) fail('AUDIENCE_TOO_LARGE', 413);
  const changes: any[] = [];
  let queued = 0, skipped = 0;
  for (const candidate of candidates) {
    if (!candidate || candidate.data.campaignId !== campaignId || candidate.data.deliveryStatus !== 'failed' || candidate.data.retryEligible !== true) { skipped++; continue; }
    const id = String(candidate.name || '').split('/').pop();
    if (!id) { skipped++; continue; }
    changes.push({ collection: EA.deliveries, id, prior: candidate, data: {
      ...candidate.data, deliveryStatus: 'queued', retryEligible: false, nextAttemptAt: null,
      leaseToken: null, leaseUntil: null, updatedAt: nowIso(),
    } });
    queued++;
  }
  const campaign = await store.read(EA.campaigns, campaignId);
  if (!campaign) fail('NOT_FOUND', 404);
  if (queued > 0 && campaign.data.status === 'sent') changes.push({
    collection: EA.campaigns, id: campaignId, prior: campaign,
    data: { ...campaign.data, status: 'queued', retryQueuedAt: nowIso(), retryQueuedBy: actorUid },
  });
  await store.save(changes, 'early_access_campaign_manual_retry', campaignId, actorUid);
  return { selected: candidates.length, queued, skipped };
}

export async function campaignProgress(store: EarlyAccessStore, campaignId: string) {
  const rows = await store.query(EA.deliveries, {
    from: [{ collectionId: EA.deliveries }],
    where: { fieldFilter: { field: { fieldPath: 'campaignId' }, op: 'EQUAL', value: { stringValue: campaignId } } },
    limit: 501,
  });
  if (rows.length > 500) fail('AUDIENCE_TOO_LARGE', 413);
  const counts = { audience: rows.length, notSent: 0, queued: 0, accepted: 0, delivered: 0, failed: 0, bounced: 0, complained: 0, suppressed: 0, skipped: 0 };
  for (const row of rows) {
    const status = row.data.deliveryStatus;
    if (status === 'not_sent') counts.notSent++;
    else if (status === 'queued') counts.queued++;
    else if (status === 'accepted') counts.accepted++;
    else if (status === 'delivered') counts.delivered++;
    else if (status === 'failed') counts.failed++;
    else if (status === 'bounced') counts.bounced++;
    else if (status === 'complained') counts.complained++;
    else if (status === 'suppressed') counts.suppressed++;
    else if (status === 'skipped') counts.skipped++;
  }
  const campaign = await store.read(EA.campaigns, campaignId);
  if (!campaign) fail('NOT_FOUND', 404);
  const finalIds = new Set<string>(Array.isArray(campaign.data.finalRecipientIds) ? campaign.data.finalRecipientIds : []);
  const selectedCounts = { selected: finalIds.size, selectedNotSent: 0, selectedQueued: 0, selectedAccepted: 0 };
  for (const row of rows) if (finalIds.has(String(row.name || '').split('/').pop() || '')) {
    if (row.data.deliveryStatus === 'not_sent') selectedCounts.selectedNotSent++;
    else if (row.data.deliveryStatus === 'queued') selectedCounts.selectedQueued++;
    else if (row.data.deliveryStatus === 'accepted') selectedCounts.selectedAccepted++;
  }
  return {
    campaignId, status: campaign.data.status, ...counts, ...selectedCounts,
    remaining: selectedCounts.selectedNotSent + selectedCounts.selectedQueued + selectedCounts.selectedAccepted,
    finalRecipientCount: campaign.data.finalRecipientCount || 0,
    finalRecipientIds: campaign.data.finalRecipientIds || [],
    queuedAt: campaign.data.queuedAt || null, sendStartedAt: campaign.data.sendStartedAt || null,
    completedAt: campaign.data.completedAt || null, sendCompletedAt: campaign.data.sendCompletedAt || null, retryQueuedAt: campaign.data.retryQueuedAt || null,
  };
}

export async function processEarlyAccessCampaigns(store: EarlyAccessStore, send: (to: string, subject: string, html: string, key: string) => Promise<{ delivered: boolean; messageId?: string }>, now = Date.now()) {
  const campaigns = await store.query(EA.campaigns, { from: [{ collectionId: EA.campaigns }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'queued' } } }, limit: 5 });
  let processed = 0;
  for (const campaign of campaigns) {
    const id = String(campaign.name || '').split('/').pop()!, rows = await store.query(EA.deliveries, {
      from: [{ collectionId: EA.deliveries }],
      where: { fieldFilter: { field: { fieldPath: 'campaignId' }, op: 'EQUAL', value: { stringValue: id } } },
      limit: 501,
    });
    const recipients = rows.filter(row => (row.data.deliveryStatus === 'queued' || row.data.retryEligible === true) && (!row.data.leaseUntil || Date.parse(row.data.leaseUntil) <= now) && (!row.data.nextAttemptAt || Date.parse(row.data.nextAttemptAt) <= now)).slice(0, 50);
    for (const recipient of recipients) {
      const rid = String(recipient.name || '').split('/').pop()!, attempt = Number(recipient.data.attempts || 0) + 1;
      if (recipient.data.suppressionReason) continue;
      const leaseToken = opaqueToken(), leaseUntil = new Date(now + 5 * 60000).toISOString();
      let claimed: NonNullable<Awaited<ReturnType<typeof store.read>>>;
      try {
        await store.save([{ collection: EA.deliveries, id: rid, prior: recipient, data: { ...recipient.data, leaseToken, leaseUntil, lastAttemptAt: nowIso(), updatedAt: nowIso() } }], 'early_access_campaign_recipient_claimed', id);
        claimed = await store.read(EA.deliveries, rid) as NonNullable<Awaited<ReturnType<typeof store.read>>>;
      } catch { continue; }
      const suppressionId = recipient.data.subscriberId || await hash(`early-access-email:${recipient.data.email}`);
      const suppression = await store.read(EA.suppression, suppressionId);
      if (suppression?.data.suppressed === true) {
        await store.save([{ collection: EA.deliveries, id: rid, prior: claimed, data: { ...claimed.data, deliveryStatus: 'suppressed', suppressionReason: 'global_suppression', retryEligible: false, leaseToken: null, leaseUntil: null, updatedAt: nowIso() } }], 'early_access_campaign_recipient_suppressed', id);
        continue;
      }
      const unsubscribeToken = opaqueToken(), unsubscribeId = await hash(unsubscribeToken);
      const unsubscribeUrl = `https://heavyar.com/api/early-access/unsubscribe?token=${unsubscribeToken}`;
      await store.save([
        { collection: EA.tokens, id: unsubscribeId, prior: null, data: { kind: 'campaign_unsubscribe', recipientId: rid, subscriberId: recipient.data.subscriberId || null, emailHash: await hash(`early-access-email:${recipient.data.email}`), expiresAt: new Date(now + 365 * 86400000).toISOString() } },
        { collection: EA.deliveries, id: rid, prior: claimed, data: { ...claimed.data, unsubscribeTokenId: unsubscribeId, deliveryStatus: 'queued', updatedAt: nowIso() } },
      ], 'early_access_campaign_delivery_reserved', id);
      let result: { delivered: boolean; messageId?: string };
      try { result = await send(recipient.data.email, campaign.data[recipient.data.language === 'en' ? 'subjectEn' : 'subjectAr'], template(campaign.data[recipient.data.language === 'en' ? 'subjectEn' : 'subjectAr'], campaign.data[recipient.data.language === 'en' ? 'bodyEn' : 'bodyAr'], recipient.data.language === 'en' ? 'en' : 'ar', unsubscribeUrl), `early-access-campaign-${id}-${rid}`); }
      catch { result = { delivered: false }; }
      const accepted = result.delivered === true;
      const reserved = await store.read(EA.deliveries, rid);
      if (reserved?.data.leaseToken === leaseToken) await store.save([{ collection: EA.deliveries, id: rid, prior: reserved, data: { ...reserved.data, deliveryStatus: accepted ? 'accepted' : 'failed', providerMessageId: result.messageId || null, attempts: attempt, retryEligible: !accepted && attempt < 3, nextAttemptAt: !accepted && attempt < 3 ? new Date(now + 2 ** attempt * 60000).toISOString() : null, leaseToken: null, leaseUntil: null, updatedAt: nowIso() } }], accepted ? 'early_access_campaign_email_accepted' : 'early_access_campaign_email_failed', id);
      processed++;
    }
    const current = await store.query(EA.deliveries, { from: [{ collectionId: EA.deliveries }], where: { fieldFilter: { field: { fieldPath: 'campaignId' }, op: 'EQUAL', value: { stringValue: id } } }, limit: 501 });
    const remaining = current.some(row => (row.data.deliveryStatus === 'queued' || row.data.retryEligible === true) && (!row.data.leaseUntil || Date.parse(row.data.leaseUntil) <= now));
    if (!remaining) {
      try { const completedAt = nowIso(); await store.save([{ collection: EA.campaigns, id, prior: campaign, data: { ...campaign.data, status: 'sent', completedAt, sendCompletedAt: completedAt, sentAt: completedAt } }], 'early_access_campaign_completed', id); }
      catch { /* another scheduler invocation completed this campaign */ }
    }
  }
  return { processed };
}