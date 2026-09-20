import { describe, expect, test } from 'bun:test';
import { EA, EarlyAccessError, hash, type EarlyAccessStore, type RecordVersion } from './early-access-model';
import { cleanupCampaignCsvQa, importCampaignCsv, previewCampaignCsv } from './early-access-csv-qa';

function qaStore() {
  const docs = new Map<string, NonNullable<RecordVersion>>(), audit: string[] = [];
  let deleteCalls = 0;
  let version = 0;
  const put = (collection: string, id: string, data: any) => docs.set(`${collection}/${id}`, {
    data: structuredClone(data),
    updateTime: String(++version),
    name: `projects/test/databases/(default)/documents/${collection}/${id}`,
  });
  const store: EarlyAccessStore = {
    read: async (collection, id) => structuredClone(docs.get(`${collection}/${id}`) || null),
    readMany: async references => Promise.all(references.map(reference => store.read(reference.collection, reference.id))),
    query: async (collection, query) => [...docs.values()].filter(record =>
      record.name!.includes(`/documents/${collection}/`) &&
      (!query.where?.fieldFilter || String(record.data[query.where.fieldFilter.field.fieldPath]) === String(query.where.fieldFilter.value.stringValue))
    ).slice(0, query.limit),
    ownEmail: async () => null,
    send: async () => ({ delivered: false }),
    save: async (changes, action) => {
      for (const change of changes) {
        if (docs.get(`${change.collection}/${change.id}`)?.updateTime !== change.prior?.updateTime) throw new EarlyAccessError('CONCURRENT_UPDATE', 409);
      }
      for (const change of changes) put(change.collection, change.id, change.data);
      if (action) audit.push(action);
    },
    delete: async (records, action, _target, _reason, guards = []) => {
      deleteCalls++;
      for (const record of records) {
        if (docs.get(`${record.collection}/${record.id}`)?.updateTime !== record.prior.updateTime) throw new EarlyAccessError('CONCURRENT_UPDATE', 409);
      }
      for (const guard of guards) {
        if (docs.get(`${guard.collection}/${guard.id}`)?.updateTime !== guard.prior?.updateTime) throw new EarlyAccessError('CONCURRENT_UPDATE', 409);
      }
      for (const record of records) docs.delete(`${record.collection}/${record.id}`);
      for (const guard of guards) put(guard.collection, guard.id, guard.data);
      if (action) audit.push(action);
    },
  };
  return { docs, audit, put, store, get deleteCalls() { return deleteCalls; } };
}

describe('Early Access CSV QA', () => {
  test('previews canonical owner format with UTF-8, validation, formulas, suppression, and campaign duplicates', async () => {
    const m = qaStore(), campaignId = 'campaign';
    m.put(EA.campaigns, campaignId, { createdBy: 'owner' });
    const suppressed = await hash('early-access-email:suppressed@example.test');
    const duplicate = await hash(`early-access-campaign:${campaignId}:duplicate@example.test`);
    m.put(EA.suppression, suppressed, { suppressed: true });
    m.put(EA.deliveries, duplicate, { campaignId, email: 'duplicate@example.test' });
    const csv = [
      'business_name,phone,whatsapp_candidate,email,website,category,address,rating,review_count,city,lead_fit',
      'شركة عربية,123,+123,good@example.test,https://example.test,نقل,الرياض,5,10,الرياض,high',
      '=SUM(1+1),,,,https://example.test,,,,,,,',
      'Bad,,,not-an-email,,,,,,,,',
      'Duplicate file,,,GOOD@EXAMPLE.TEST,,,,,,,,',
      'Suppressed,,,suppressed@example.test,,,,,,,,',
      'Campaign duplicate,,,duplicate@example.test,,,,,,,,',
    ].join('\n');
    const preview = await previewCampaignCsv(m.store, campaignId, 'owner', csv);
    expect(preview.totalRows).toBe(6);
    expect(preview.contacts[0].businessName).toBe('شركة عربية');
    expect(preview.rejected.map(row => row.reason)).toEqual(['missing_email', 'invalid_email', 'duplicate_file']);
    expect(preview.counts).toEqual({
      validEmail: 3,
      missingEmail: 1,
      invalidEmail: 1,
      duplicateFile: 1,
      suppressed: 1,
      campaignDuplicate: 1,
      finalEligible: 1,
    });
    expect([...m.docs.keys()].some(key => key.startsWith(`${EA.subscribers}/`))).toBe(false);
    expect(m.audit).toEqual(['early_access_csv_previewed']);
  });

  test('confirmed import writes provenance but never subscribers', async () => {
    const m = qaStore(), campaignId = 'campaign';
    m.put(EA.campaigns, campaignId, { createdBy: 'owner', status: 'draft' });
    const result = await importCampaignCsv(m.store, campaignId, 'owner', 'email,business_name\nqa@example.test,=FORMULA()', 'qa.csv');
    expect(result.snapshot.added).toBe(1);
    const delivery = m.docs.get(`${EA.deliveries}/${result.snapshot.recipientIds[0]}`)!;
    expect(delivery.data).toMatchObject({ source: 'csv_import', importId: result.importId, deliveryStatus: 'not_sent', createdBy: 'owner' });
    expect(delivery.data.name).toBe("'=FORMULA()");
    expect([...m.docs.keys()].some(key => key.startsWith(`${EA.subscribers}/`))).toBe(false);
  });

  test('owner-QA and locked campaigns reject CSV mutation before writes', async () => {
    const m = qaStore(), csv = 'email\nqa@example.test';
    m.put(EA.campaigns, 'owner-qa', { createdBy: 'owner', status: 'draft', ownerQa: true });
    await expect(importCampaignCsv(m.store, 'owner-qa', 'owner', csv)).rejects.toMatchObject({ code: 'OWNER_QA_AUDIENCE_MISMATCH' });
    m.put(EA.campaigns, 'approved', { createdBy: 'owner', status: 'approved' });
    await expect(importCampaignCsv(m.store, 'approved', 'owner', csv)).rejects.toMatchObject({ code: 'CAMPAIGN_LOCKED' });
    expect([...m.docs.keys()].some(key => key.startsWith(`${EA.imports}/`) || key.startsWith(`${EA.deliveries}/`))).toBe(false);
  });

  test('cleanup deletes only fully synthetic actor-owned unsent imports and preserves mixed, sent, and canonical data', async () => {
    const m = qaStore(), campaignId = 'campaign';
    m.put(EA.campaigns, campaignId, { createdBy: 'owner', status: 'draft' });
    m.put(EA.imports, 'synthetic', { campaignId, importedBy: 'owner', acceptedRows: 1 });
    m.put(EA.deliveries, 'synthetic-row', { campaignId, importId: 'synthetic', source: 'csv_import', email: 'qa@example.test', deliveryStatus: 'not_sent', createdBy: 'owner' });
    m.put(EA.imports, 'mixed', { campaignId, importedBy: 'owner', acceptedRows: 2 });
    m.put(EA.deliveries, 'mixed-synthetic', { campaignId, importId: 'mixed', source: 'csv_import', email: 'qa@invalid', deliveryStatus: 'not_sent', createdBy: 'owner' });
    m.put(EA.deliveries, 'mixed-real', { campaignId, importId: 'mixed', source: 'csv_import', email: 'person@example.com', deliveryStatus: 'not_sent', createdBy: 'owner' });
    m.put(EA.deliveries, 'sent', { campaignId, source: 'csv_import', email: 'sent@example.test', deliveryStatus: 'accepted', createdBy: 'owner' });
    m.put(EA.deliveries, 'other-actor', { campaignId, source: 'csv_import', email: 'other@example.test', deliveryStatus: 'not_sent', createdBy: 'other' });
    m.put(EA.subscribers, 'subscriber', { email: 'subscriber@example.test' });
    m.put(EA.suppression, 'suppression', { suppressed: true });
    const result = await cleanupCampaignCsvQa(m.store, campaignId, 'owner');
    expect(result).toEqual({ deletedRecipients: 1, deletedImports: 1 });
    expect(m.docs.has(`${EA.deliveries}/synthetic-row`)).toBe(false);
    expect(m.docs.has(`${EA.imports}/synthetic`)).toBe(false);
    for (const key of [`${EA.imports}/mixed`, `${EA.deliveries}/mixed-synthetic`, `${EA.deliveries}/mixed-real`, `${EA.deliveries}/sent`, `${EA.deliveries}/other-actor`, `${EA.subscribers}/subscriber`, `${EA.suppression}/suppression`]) {
      expect(m.docs.has(key)).toBe(true);
    }
    expect(m.audit.at(-1)).toBe('early_access_csv_qa_cleaned');
  });

  test('cleanup refuses queued campaigns and oversized deletion sets without deleting anything', async () => {
    const queued = qaStore();
    queued.put(EA.campaigns, 'queued', { createdBy: 'owner', status: 'queued' });
    queued.put(EA.deliveries, 'qa', { campaignId: 'queued', source: 'csv_import', email: 'qa@example.test', deliveryStatus: 'not_sent', createdBy: 'owner' });
    await expect(cleanupCampaignCsvQa(queued.store, 'queued', 'owner')).rejects.toMatchObject({ code: 'CAMPAIGN_LOCKED' });
    expect(queued.docs.has(`${EA.deliveries}/qa`)).toBe(true);
    expect(queued.deleteCalls).toBe(0);

    const oversized = qaStore();
    oversized.put(EA.campaigns, 'large', { createdBy: 'owner', status: 'draft' });
    for (let i = 0; i < 499; i++) {
      oversized.put(EA.deliveries, `qa-${i}`, { campaignId: 'large', source: 'csv_import', email: `qa-${i}@example.test`, deliveryStatus: 'not_sent', createdBy: 'owner' });
    }
    await expect(cleanupCampaignCsvQa(oversized.store, 'large', 'owner')).rejects.toMatchObject({ code: 'AUDIENCE_TOO_LARGE' });
    expect([...oversized.docs.keys()].filter(key => key.startsWith(`${EA.deliveries}/`))).toHaveLength(499);
    expect(oversized.deleteCalls).toBe(0);
  });
});