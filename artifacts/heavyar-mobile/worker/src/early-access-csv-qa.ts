import { EA, fail, hash, nowIso, type EarlyAccessStore, type RecordVersion } from './early-access-model';
import { normalizeCampaignEmail, parseCampaignCsv } from './early-access-campaign-delivery';

type CsvAssessment = ReturnType<typeof parseCampaignCsv> & {
  counts: ReturnType<typeof parseCampaignCsv>['counts'] & {
    suppressed: number;
    campaignDuplicate: number;
    finalEligible: number;
  };
};

async function assessCampaignCsv(store: EarlyAccessStore, campaignId: string, csv: string) {
  const parsed = parseCampaignCsv(csv);
  const references = await Promise.all(parsed.contacts.map(async contact => ({
    suppression: { collection: EA.suppression, id: await hash(`early-access-email:${contact.email}`) },
    delivery: { collection: EA.deliveries, id: await hash(`early-access-campaign:${campaignId}:${contact.email}`) },
  })));
  const flattened = references.flatMap(reference => [reference.suppression, reference.delivery]);
  const records: RecordVersion[] = [];
  for (let offset = 0; offset < flattened.length; offset += 200) {
    const batch = flattened.slice(offset, offset + 200);
    records.push(...(store.readMany
      ? await store.readMany(batch)
      : await Promise.all(batch.map(reference => store.read(reference.collection, reference.id)))));
  }
  const suppressedEmails = new Set<string>(), duplicateEmails = new Set<string>();
  parsed.contacts.forEach((contact, index) => {
    if (records[index * 2]?.data.suppressed === true) suppressedEmails.add(contact.email);
    const delivery = records[index * 2 + 1];
    if (delivery?.data.campaignId === campaignId) duplicateEmails.add(contact.email);
  });
  const suppressed = suppressedEmails.size, campaignDuplicate = duplicateEmails.size;
  const finalEligible = parsed.contacts.filter(contact => !suppressedEmails.has(contact.email) && !duplicateEmails.has(contact.email)).length;
  const preview: CsvAssessment = {
    ...parsed,
    counts: { ...parsed.counts, suppressed, campaignDuplicate, finalEligible },
  };
  return { preview, suppressedEmails, duplicateEmails };
}

export async function previewCampaignCsv(store: EarlyAccessStore, campaignId: string, actorUid: string, csv: string) {
  const assessed = await assessCampaignCsv(store, campaignId, csv);
  await store.save([], 'early_access_csv_previewed', campaignId, `actor:${actorUid}`);
  return assessed.preview;
}

export async function importCampaignCsv(store: EarlyAccessStore, campaignId: string, actorUid: string, csv: string, filename = 'audience.csv') {
  const campaign = await store.read(EA.campaigns, campaignId);
  if (!campaign) fail('NOT_FOUND', 404);
  if (campaign.data.ownerQa === true) fail('OWNER_QA_AUDIENCE_MISMATCH', 409);
  if (campaign.data.status !== 'draft') fail('CAMPAIGN_LOCKED', 409);
  const { preview, suppressedEmails, duplicateEmails } = await assessCampaignCsv(store, campaignId, csv);
  const importId = crypto.randomUUID(), timestamp = nowIso(), deliveryChanges: any[] = [];
  const importChange = {
    collection: EA.imports,
    id: importId,
    prior: null,
    data: {
      campaignId,
      filename: filename.slice(0, 200),
      importedAt: timestamp,
      importedBy: actorUid,
      source: 'csv_import',
      totalRows: preview.totalRows,
      acceptedRows: preview.contacts.length,
      rejectedRows: preview.rejected.length,
      lawfulBasisConfirmed: true,
    },
  };
  const recipientIds: string[] = [];
  for (const contact of preview.contacts) {
    const id = await hash(`early-access-campaign:${campaignId}:${contact.email}`);
    recipientIds.push(id);
    if (duplicateEmails.has(contact.email)) continue;
    const suppressed = suppressedEmails.has(contact.email);
    deliveryChanges.push({
      collection: EA.deliveries,
      id,
      prior: null,
      data: {
        campaignId,
        campaignRecipientId: id,
        importId,
        normalizedEmail: contact.email,
        email: contact.email,
        name: contact.name || contact.businessName || '',
        businessName: contact.businessName || '',
        language: contact.language === 'en' ? 'en' : 'ar',
        country: contact.country || null,
        source: 'csv_import',
        subscriberId: null,
        lawfulBasisConfirmed: true,
        deliveryStatus: suppressed ? 'suppressed' : 'not_sent',
        suppressionReason: suppressed ? 'global_suppression' : null,
        attempts: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: actorUid,
        retryEligible: false,
      },
    });
  }
  // Campaign CAS + import metadata + audit leave room for at most 497 deliveries.
  // Keeping the whole operation in one commit prevents a concurrent owner-QA
  // snapshot, approval, or send from racing this audience mutation.
  if (deliveryChanges.length > 497) fail('AUDIENCE_TOO_LARGE', 413);
  await store.save([
    { collection: EA.campaigns, id: campaignId, prior: campaign, data: campaign.data },
    importChange,
    ...deliveryChanges,
  ], 'early_access_csv_imported', campaignId);
  return {
    importId,
    preview,
    snapshot: {
      added: deliveryChanges.length,
      duplicate: preview.contacts.length - deliveryChanges.length,
      recipientIds,
    },
  };
}

function syntheticEmail(value: unknown) {
  const email = normalizeCampaignEmail(value);
  if (!email) return false;
  const domain = email.split('@').pop()!;
  return domain === 'example.test' || domain.endsWith('.example.test') || domain === 'invalid' || domain.endsWith('.invalid');
}

function rowId(record: NonNullable<RecordVersion>) {
  return String(record.name || '').split('/').pop() || '';
}

export async function cleanupCampaignCsvQa(store: EarlyAccessStore, campaignId: string, actorUid: string) {
  if (!store.delete) fail('STORAGE_UNAVAILABLE', 503);
  const campaign = await store.read(EA.campaigns, campaignId);
  if (!campaign) fail('NOT_FOUND', 404);
  if (campaign.data.createdBy !== actorUid) fail('FORBIDDEN', 403);
  if (campaign.data.status !== 'draft') fail('CAMPAIGN_LOCKED', 409);
  const rows = await store.query(EA.deliveries, {
    from: [{ collectionId: EA.deliveries }],
    where: { fieldFilter: { field: { fieldPath: 'campaignId' }, op: 'EQUAL', value: { stringValue: campaignId } } },
    limit: 501,
  });
  if (rows.length > 500) fail('AUDIENCE_TOO_LARGE', 413);
  const safe = (row: NonNullable<RecordVersion>) => row.data.campaignId === campaignId &&
    row.data.source === 'csv_import' && row.data.deliveryStatus === 'not_sent' &&
    row.data.createdBy === actorUid && syntheticEmail(row.data.email);
  const byImport = new Map<string, NonNullable<RecordVersion>[]>();
  for (const row of rows) {
    const importId = typeof row.data.importId === 'string' ? row.data.importId : '';
    if (importId) byImport.set(importId, [...(byImport.get(importId) || []), row]);
  }
  const importRecords = new Map<string, NonNullable<RecordVersion>>();
  for (const importId of byImport.keys()) {
    const record = await store.read(EA.imports, importId);
    if (record) importRecords.set(importId, record);
  }
  const deletions: Array<{ collection: string; id: string; prior: NonNullable<RecordVersion> }> = [];
  for (const row of rows) {
    const importId = typeof row.data.importId === 'string' ? row.data.importId : '';
    if (!safe(row)) continue;
    if (importId) {
      const group = byImport.get(importId) || [], metadata = importRecords.get(importId);
      const wholeImportIsSynthetic = !!metadata && metadata.data.campaignId === campaignId &&
        metadata.data.importedBy === actorUid && Number(metadata.data.acceptedRows) === group.length &&
        group.every(safe);
      if (!wholeImportIsSynthetic) continue;
    }
    const id = rowId(row);
    if (id) deletions.push({ collection: EA.deliveries, id, prior: row });
  }
  for (const [importId, metadata] of importRecords) {
    const group = byImport.get(importId) || [];
    if (metadata.data.campaignId === campaignId && metadata.data.importedBy === actorUid &&
      Number(metadata.data.acceptedRows) === group.length && group.length > 0 && group.every(safe)) {
      deletions.push({ collection: EA.imports, id: importId, prior: metadata });
    }
  }
  const recipientCount = deletions.filter(record => record.collection === EA.deliveries).length;
  // Firestore's 500-write limit includes one campaign CAS guard and one audit.
  if (deletions.length > 498) fail('AUDIENCE_TOO_LARGE', 413);
  await store.delete(
    deletions,
    'early_access_csv_qa_cleaned',
    campaignId,
    `actor:${actorUid};recipients:${recipientCount}`,
    [{ collection: EA.campaigns, id: campaignId, prior: campaign, data: campaign.data }],
  );
  return { deletedRecipients: recipientCount, deletedImports: deletions.length - recipientCount };
}