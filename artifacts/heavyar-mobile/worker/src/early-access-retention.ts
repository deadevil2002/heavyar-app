import { EA, type EarlyAccessStore } from './early-access-model';
import { suppress } from './early-access-public';

let completedDay = '';
export async function dailyEarlyAccessRetention(store: EarlyAccessStore, now = Date.now()) {
  const date = new Date(now), day = date.toISOString().slice(0, 10);
  // Existing five-minute cron, only its first half hour UTC can do any IO.
  if (date.getUTCHours() !== 0 || date.getUTCMinutes() >= 30 || completedDay === day) return;
  const lease = await store.read(EA.config, 'retention-lease');
  if (lease?.data.completedDay === day) { completedDay = day; return; }
  if (Date.parse(lease?.data.leaseUntil || '') > now) return;
  const owner = crypto.randomUUID();
  try {
    await store.save([{ collection: EA.config, id: 'retention-lease', prior: lease, data: { owner, leaseUntil: new Date(now + 10 * 60000).toISOString() } }], '', 'retention');
  } catch { return; } // Another isolate wins the CAS; never run without a lease.
  const result = await retainEarlyAccess(store, now);
  const current = await store.read(EA.config, 'retention-lease');
  if (current?.data.owner === owner) {
    await store.save([{ collection: EA.config, id: 'retention-lease', prior: current, data: { completedDay: day, leaseUntil: new Date(now).toISOString(), anonymized: result.anonymized } }], '', 'retention');
    completedDay = day;
  }
}

/** Existing cron only: one indexed page, no refills or all-audience scans. */
export async function retainEarlyAccess(store: EarlyAccessStore, now = Date.now()) {
  const rows = await store.query(EA.subscribers, {
    from: [{ collectionId: EA.subscribers }],
    where: { fieldFilter: { field: { fieldPath: 'retentionAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: new Date(now).toISOString() } } },
    orderBy: [{ field: { fieldPath: 'retentionAt' }, direction: 'ASCENDING' }], limit: 20,
  });
  let anonymized = 0;
  for (const row of rows) {
    if (!row.data.retentionAt || Date.parse(row.data.retentionAt) > now || row.data.status === 'anonymized') continue;
    // Compare again inside the mutation: a concurrent re-registration must not
    // be anonymized based on a stale retention page.
    const id = row.name!.split('/').pop()!;
    if (await suppress(store, id, true, 'early_access_retention_anonymized', '365 day retention', now)) anonymized++;
  }
  return { anonymized };
}