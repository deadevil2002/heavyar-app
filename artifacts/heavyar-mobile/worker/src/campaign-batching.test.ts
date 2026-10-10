import { afterEach, describe, expect, test, vi } from 'vitest';
import { __adminTest, earlyAccessStore, processScheduledCampaigns } from './admin';
import { EA, EarlyAccessError, hash, type EarlyAccessStore, type RecordVersion } from './early-access-model';
import { queueCampaign, snapshotCampaignRecipients } from './early-access-campaign-delivery';
import type { Env } from './index';

const env = { FIREBASE_PROJECT_ID: 'campaign-batching-test' } as Env;
const fullName = (collection: string, id: string) => `projects/campaign-batching-test/databases/(default)/documents/${collection}/${id}`;
const value = (input: any): any => input === null ? { nullValue: null }
  : typeof input === 'boolean' ? { booleanValue: input }
    : typeof input === 'number' ? { integerValue: String(input) }
      : typeof input === 'string' ? { stringValue: input }
        : { mapValue: { fields: Object.fromEntries(Object.entries(input).map(([key, nested]) => [key, value(nested)])) } };
const found = (collection: string, id: string, data: Record<string, any>) => ({
  found: {
    name: fullName(collection, id),
    updateTime: '2026-10-09T00:00:00.000Z',
    fields: Object.fromEntries(Object.entries(data).map(([key, nested]) => [key, value(nested)])),
  },
});

afterEach(() => {
  __adminTest.setQuery(undefined);
  __adminTest.setBatchGet(undefined);
  __adminTest.setFirestore(undefined);
  __adminTest.captureCommits(undefined);
  vi.restoreAllMocks();
});

describe('generic marketing campaign bounded preference reads', () => {
  function arrangeMaximumPage(commits: unknown[][], failBatch = false) {
    const users = Array.from({ length: 300 }, (_, index) => ({
      name: fullName('users', `user-${String(index).padStart(3, '0')}`),
      updateTime: '2026-10-09T00:00:00.000Z',
      data: { role: 'customer', ...(index === 4 ? { accountPurpose: 'store_review' } : {}) },
    }));
    const queryCounts = { campaigns: 0, users: 0 };
    const batchSizes: number[] = [];
    __adminTest.setQuery((collection) => {
      if (collection === 'campaigns') {
        queryCounts.campaigns += 1;
        return [{
          name: fullName('campaigns', 'campaign-1'),
          updateTime: '2026-10-09T00:00:00.000Z',
          data: { status: 'scheduled', scheduledAt: '2026-10-08T00:00:00.000Z', recipientCount: 0, title: 'Title', message: 'Message', filter: { audience: 'all' } },
        }];
      }
      if (collection === 'users') { queryCounts.users += 1; return users; }
      return [];
    });
    __adminTest.setBatchGet(async references => {
      batchSizes.push(references.length);
      if (failBatch) throw new Error('private upstream failure');
      return references.map(reference => {
        if (reference.id === 'user-002') return { missing: fullName(reference.collection, reference.id) };
        const marketing: unknown = reference.id === 'user-001' ? false : reference.id === 'user-003' ? 'yes' : true;
        return found(reference.collection, reference.id, { marketing });
      }).reverse();
    });
    __adminTest.captureCommits(commits);
    return { queryCounts, batchSizes };
  }

  test('bounds each scheduled campaign tick to three users and one unordered batchGet call', async () => {
    const commits: unknown[][] = [];
    const metrics = arrangeMaximumPage(commits);
    await processScheduledCampaigns(env);

    expect(metrics.queryCounts).toEqual({ campaigns: 1, users: 1 });
    expect(metrics.batchSizes).toEqual([3]);
    expect(metrics.batchSizes.reduce((total, size) => total + size, 0)).toBe(3);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toHaveLength(3); // two eligible recipients + one atomic campaign checkpoint.
    const outbox = (commits[0] as any[]).filter(write => String(write.update?.name).includes('/notificationOutbox/'));
    const occurrences = new Set(outbox.map(write => write.update.fields.occurrenceKey.stringValue));
    expect(occurrences.has('campaign:campaign-1:user-001')).toBe(false); // explicit opt-out
    expect(occurrences.has('campaign:campaign-1:user-002')).toBe(true); // missing document keeps default=true

    const firstLogicalIds = outbox.map(write => write.update.name).sort();
    await processScheduledCampaigns(env);
    const retryOutbox = (commits[1] as any[]).filter(write => String(write.update?.name).includes('/notificationOutbox/'));
    expect(retryOutbox.map(write => write.update.name).sort()).toEqual(firstLogicalIds);
    expect(new Set(firstLogicalIds).size).toBe(firstLogicalIds.length);
  });

  test('does not commit or advance the checkpoint when a preference batch fails and emits only safe diagnostics', async () => {
    const commits: unknown[][] = [];
    const metrics = arrangeMaximumPage(commits, true);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await processScheduledCampaigns(env);
    expect(commits).toHaveLength(0);
    expect(metrics.queryCounts).toEqual({ campaigns: 1, users: 1 });
    expect(warning).toHaveBeenCalledWith('campaign_processor_failed', { processor: 'generic_marketing', stage: 'preference_batch_unavailable' });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private upstream failure');
  });
});

function batchingStore() {
  const docs = new Map<string, NonNullable<RecordVersion>>();
  const readManySizes: number[] = [];
  let pointReads = 0, version = 0;
  const put = (collection: string, id: string, data: Record<string, any>) => docs.set(`${collection}/${id}`, {
    data: structuredClone(data), updateTime: String(++version), name: fullName(collection, id),
  });
  const store: EarlyAccessStore = {
    read: async (collection, id) => { pointReads += 1; return structuredClone(docs.get(`${collection}/${id}`) || null); },
    readMany: async references => {
      readManySizes.push(references.length);
      return references.map(reference => structuredClone(docs.get(`${reference.collection}/${reference.id}`) || null));
    },
    save: async (changes) => {
      for (const change of changes) if (docs.get(`${change.collection}/${change.id}`)?.updateTime !== change.prior?.updateTime) throw new EarlyAccessError('CONCURRENT_UPDATE', 409);
      for (const change of changes) put(change.collection, change.id, change.data);
    },
    query: async () => [], ownEmail: async () => null, send: async () => ({ delivered: true }),
  };
  return { store, docs, put, readManySizes, pointReads: () => pointReads };
}

describe('Early Access bounded campaign reads and write budget', () => {
  test('snapshots 500 recipients with ten batch reads instead of 1000 point reads', async () => {
    const memory = batchingStore();
    memory.put(EA.campaigns, 'campaign-1', { status: 'draft' });
    const contacts = Array.from({ length: 500 }, (_, index) => ({
      email: `lead-${index}@example.test`, language: 'en', lawfulBasisConfirmed: true,
    }));
    const suppressedId = await hash('early-access-email:lead-42@example.test');
    memory.put(EA.suppression, suppressedId, { suppressed: true });

    const result = await snapshotCampaignRecipients(memory.store, 'campaign-1', 'owner', contacts, 'csv_import');
    expect(result.added).toBe(500);
    expect(memory.pointReads()).toBe(1); // campaign guard only
    expect(memory.readManySizes).toEqual(Array(10).fill(100));
    const suppressedRecipient = await hash('early-access-campaign:campaign-1:lead-42@example.test');
    expect(memory.docs.get(`${EA.deliveries}/${suppressedRecipient}`)?.data.deliveryStatus).toBe('suppressed');
  });

  test('queues 500 subscribers from one delivery preflight plus bounded subscriber/suppression batches', async () => {
    const memory = batchingStore();
    memory.put(EA.campaigns, 'campaign-1', { status: 'approved', previewId: 'preview-1' });
    const recipientIds = Array.from({ length: 500 }, (_, index) => `delivery-${index}`);
    recipientIds.forEach((recipientId, index) => {
      const subscriberId = `subscriber-${index}`;
      memory.put(EA.deliveries, recipientId, { campaignId: 'campaign-1', source: 'subscriber', subscriberId, deliveryStatus: 'not_sent' });
      memory.put(EA.subscribers, subscriberId, { status: 'active', consentMarketing: true, verified: true });
    });

    const result = await queueCampaign(memory.store, 'campaign-1', 'owner', 'preview-1', recipientIds);
    expect(result.queued).toBe(500);
    expect(memory.pointReads()).toBe(1); // campaign guard only
    expect(memory.readManySizes).toEqual(Array(15).fill(100)); // 5 delivery + 10 subscriber/suppression batches
    expect(memory.docs.get(`${EA.campaigns}/campaign-1`)?.data.finalRecipientCount).toBe(500);
  });

  test('places the campaign state change in the final bounded commit for a 500-recipient queue', async () => {
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const store = earlyAccessStore(env, { uid: 'owner', admin: true, permissionRole: 'owner', testInjected: true });
    const changes: Array<{ collection: string; id: string; prior: RecordVersion; data: Record<string, any> }> = Array.from({ length: 500 }, (_, index) => ({
      collection: EA.deliveries, id: `delivery-${index}`, prior: null,
      data: { campaignId: 'campaign-1', deliveryStatus: 'queued', updatedAt: '2026-10-09T00:00:00.000Z' },
    }));
    changes.push({
      collection: EA.campaigns, id: 'campaign-1', prior: null,
      data: { status: 'queued', updatedAt: '2026-10-09T00:00:00.000Z' },
    });

    await store.save(changes, 'early_access_campaign_queued', 'campaign-1');
    expect(commits.map(commit => commit.length)).toEqual([500, 3]);
    expect((commits[0] as any[]).some(write => String(write.update?.name).endsWith('/earlyAccessCampaigns/campaign-1'))).toBe(false);
    expect((commits[1] as any[]).some(write => String(write.update?.name).endsWith('/earlyAccessCampaigns/campaign-1'))).toBe(true);
    expect(commits.every(commit => commit.length <= 500)).toBe(true);
  });

  test('recovers safely from a previously staged queue chunk before final campaign activation', async () => {
    const memory = batchingStore();
    memory.put(EA.campaigns, 'campaign-1', { status: 'approved', previewId: 'preview-1' });
    for (const [recipientId, deliveryStatus] of [['staged', 'queued'], ['remaining', 'not_sent']] as const) {
      const subscriberId = `subscriber-${recipientId}`;
      memory.put(EA.deliveries, recipientId, { campaignId: 'campaign-1', source: 'subscriber', subscriberId, deliveryStatus });
      memory.put(EA.subscribers, subscriberId, { status: 'active', consentMarketing: true, verified: true });
    }
    const result = await queueCampaign(memory.store, 'campaign-1', 'owner', 'preview-1', ['staged', 'remaining']);
    expect(result.queued).toBe(2);
    expect(memory.docs.get(`${EA.campaigns}/campaign-1`)?.data.finalRecipientIds).toEqual(['staged', 'remaining']);
  });
});
