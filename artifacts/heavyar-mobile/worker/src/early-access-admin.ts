import { EA, body, configValue, countryCodes, facetKey, fail, nowIso, permissions, safeId, selectedRecords, text, type EarlyAccessStore } from './early-access-model';
import { suppress } from './early-access-public';
import { campaignAction } from './early-access-campaigns';
import { campaignProgress, campaignRecipients, parseCampaignCsv, retryCampaignRecipients, snapshotCampaignRecipients } from './early-access-campaign-delivery';

const value = (s: string) => ({ stringValue: s });
const encode = (v: any) => btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function page(store: EarlyAccessStore, collection: string, url: URL) {
  const n = Number(url.searchParams.get('limit') || 20);
  if (!Number.isInteger(n) || n < 1 || n > 50) fail('INVALID_LIMIT');
  const search = (url.searchParams.get('q') || '').trim().toLowerCase();
  if (search.length > 254 || /[^\x20-\x7e]/.test(search)) fail('INVALID_SEARCH');
  const subscribers = collection === EA.subscribers, sort = subscribers ? 'normalizedEmail' : '__name__';
  const query: any = { from: [{ collectionId: collection }], orderBy: [{ field: { fieldPath: sort }, direction: 'ASCENDING' }], limit: n + 1 };
  if (subscribers) query.orderBy.push({ field: { fieldPath: '__name__' }, direction: 'ASCENDING' });
  if (search && subscribers) query.where = search.includes('@')
    ? { fieldFilter: { field: { fieldPath: sort }, op: 'EQUAL', value: value(search) } }
    : { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: sort }, op: 'GREATER_THAN_OR_EQUAL', value: value(search) } },
      { fieldFilter: { field: { fieldPath: sort }, op: 'LESS_THAN', value: value(`${search}\uf8ff`) } },
    ] } };
  const filterKeys = ['status', 'consentMarketing', 'verified', 'country', 'language'];
  const filters: Record<string, string> = Object.fromEntries(filterKeys.map(k => [k, url.searchParams.get(k)]).filter(([, v]) => v));
  for (const [key, v] of Object.entries(filters)) {
    const choices = key === 'status' ? ['active', 'unsubscribed', 'anonymized'] : key === 'country' ? countryCodes : key === 'language' ? ['ar', 'en'] : ['true', 'false'];
    if (!choices.includes(v!)) fail('INVALID_FILTER');
  }
  if (subscribers && Object.keys(filters).length) {
    const facet = { fieldFilter: { field: { fieldPath: 'filterFacets' }, op: 'ARRAY_CONTAINS', value: value(facetKey(filters)) } };
    query.where = query.where ? { compositeFilter: { op: 'AND', filters: [query.where, facet] } } : facet;
  }
  const fingerprint = JSON.stringify([collection, search, filters]);
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    try {
      if (cursor.length > 3000) fail('INVALID_CURSOR');
      const parsed = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
      if (parsed.fingerprint !== fingerprint || typeof parsed.name !== 'string' || !parsed.name.includes(`/documents/${collection}/`) || parsed.name.split(`/documents/${collection}/`)[1].includes('/')) fail('INVALID_CURSOR');
      query.startAt = { before: false, values: subscribers ? [value(String(parsed.sort)), { referenceValue: parsed.name }] : [{ referenceValue: parsed.name }] };
    } catch { fail('INVALID_CURSOR'); }
  }
  const rows = await store.query(collection, query), candidates = rows.slice(0, n);
  const matching = candidates.filter(row => Object.entries(filters).every(([k, v]) => String(row.data[k]) === v));
  const fields = ['email', 'name', 'country', 'language', 'status', 'consentMarketing', 'consentAt', 'consentSource', 'createdAt', 'updatedAt', 'verified', 'deliveryStatus', 'unsubscribedAt'];
  const deliveryIds = subscribers ? [...new Set(matching.flatMap(row => row.data.deliveryId && row.data.status !== 'anonymized' ? [String(row.data.deliveryId)] : []))] : [];
  const deliveries = await selectedRecords(store, deliveryIds.map(id => ({ collection: EA.deliveries, id })));
  const deliveryMap = new Map(deliveryIds.map((id, index) => [id, deliveries[index]]));
  const items = [];
  for (const row of matching) {
    const id = row.name!.split('/').pop()!;
    if (!subscribers) { items.push({ ...row.data, id }); continue; }
    const item: Record<string, any> = Object.fromEntries(fields.map(field => [field, row.data[field] ?? null]));
    // Read at most one current delivery projection per returned subscriber.
    if (row.data.deliveryId && row.data.status !== 'anonymized') item.deliveryStatus = deliveryMap.get(row.data.deliveryId)?.data.deliveryStatus || item.deliveryStatus;
    items.push({ ...item, verified: item.verified === true, consentMarketing: item.consentMarketing === true, deliveryStatus: item.deliveryStatus || 'not_sent', id });
  }
  const last = candidates[candidates.length - 1];
  return { items, nextCursor: rows.length > n && last ? encode({ fingerprint, name: last.name, sort: last.data[sort] }) : null, boundedCandidatePage: true };
}
export async function handleEarlyAccessAdmin(req: Request, store: EarlyAccessStore, actor: { uid: string; role?: string }) {
  const url = new URL(req.url), path = url.pathname, allowed = permissions(actor.role);
  if (!allowed.read) fail('FORBIDDEN', 403);
  if (path === '/api/admin/early-access/config') {
    const prior = await store.read(EA.config, 'default'), config = configValue(prior);
    if (req.method === 'GET') return { config, permissions: allowed };
    if (req.method === 'PATCH') {
      if (!allowed.configure) fail('FORBIDDEN', 403);
      const value = await body(req, ['enabled', 'revision']);
      if (typeof value.enabled !== 'boolean' || !Number.isInteger(value.revision)) fail('INVALID_CONFIG');
      if (value.revision !== config.revision) fail('CONFIG_CONFLICT', 409);
      const updated = { ...config, enabled: value.enabled, revision: config.revision + 1, updatedAt: nowIso(), seoPageKey: 'early-access' };
      await store.save([{ collection: EA.config, id: 'default', prior, data: updated }], value.enabled ? 'early_access_enabled' : 'early_access_disabled', 'default');
      return { config: configValue({ data: updated }), permissions: allowed };
    }
  }
  if (path === '/api/admin/early-access/subscribers' && req.method === 'GET') return page(store, EA.subscribers, url);
  const action = /^\/api\/admin\/early-access\/subscribers\/([^/]+)\/action$/.exec(path);
  if (action && req.method === 'POST') {
    if (!allowed.manage) fail('FORBIDDEN', 403);
    const value = await body(req, ['action', 'reason']);
    if (!['unsubscribe', 'anonymize'].includes(value.action)) fail('INVALID_ACTION');
    const reason = text(value.reason, 500);
    await suppress(store, safeId(action[1]), value.action === 'anonymize', `early_access_admin_${value.action}`, reason);
    return { success: true };
  }
  if (path === '/api/admin/early-access/campaigns' && req.method === 'GET') return page(store, EA.campaigns, url);
  const campaignMatch = /^\/api\/admin\/early-access\/campaigns\/([^/]+)\/(recipients|import|snapshot|retry|progress)$/.exec(path);
  if (campaignMatch) {
    const campaignId = safeId(campaignMatch[1]), operation = campaignMatch[2];
    if (operation === 'retry') {
      if (!allowed.send) fail('FORBIDDEN', 403);
      if (req.method !== 'POST') fail('NOT_FOUND', 404);
      const value = await body(req, ['recipientIds', 'allEligible']);
      if (value.recipientIds !== undefined && (!Array.isArray(value.recipientIds) || value.recipientIds.some((id: any) => typeof id !== 'string'))) fail('INVALID_SELECTION');
      const recipientIds = Array.isArray(value.recipientIds) ? [...new Set(value.recipientIds.map((id: string) => safeId(id)))] : undefined;
      if (value.allEligible !== undefined && typeof value.allEligible !== 'boolean') fail('INVALID_SELECTION');
      return retryCampaignRecipients(store, campaignId, actor.uid, recipientIds, value.allEligible === true);
    }
    if (!allowed.manage) fail('FORBIDDEN', 403);
    if (!await store.read(EA.campaigns, campaignId)) fail('NOT_FOUND', 404);
    if (operation === 'progress' && req.method === 'GET') return campaignProgress(store, campaignId);
    if (operation === 'recipients' && req.method === 'GET') return campaignRecipients(store, campaignId, Math.min(50, Number(url.searchParams.get('limit') || 20)), url.searchParams.get('cursor') || undefined, {
      status: url.searchParams.get('status') || undefined, source: url.searchParams.get('source') || undefined,
      country: url.searchParams.get('country') || undefined, language: url.searchParams.get('language') || undefined,
    });
    if (operation === 'import' && req.method === 'POST') {
      const raw = await req.text();
      if (new TextEncoder().encode(raw).byteLength > 540000) fail('CSV_TOO_LARGE', 413);
      let input: any;
      try { input = JSON.parse(raw); } catch { fail('INVALID_JSON'); }
      if (!input || typeof input.csv !== 'string' || Object.keys(input).some(key => !['csv', 'filename', 'confirm', 'lawfulBasisConfirmed'].includes(key))) fail('INVALID_FIELDS');
      const parsed = parseCampaignCsv(input.csv), importId = crypto.randomUUID();
      if (input.confirm !== true) return { importId, preview: parsed };
      if (input.lawfulBasisConfirmed !== true) fail('LAWFUL_BASIS_REQUIRED', 409);
      const timestamp = nowIso();
      await store.save([{ collection: EA.imports, id: importId, prior: null, data: {
        campaignId, filename: typeof input.filename === 'string' ? input.filename.slice(0, 200) : 'audience.csv',
        importedAt: timestamp, importedBy: actor.uid, source: 'csv_import', totalRows: parsed.totalRows,
         acceptedRows: parsed.contacts.length, rejectedRows: parsed.rejected.length, lawfulBasisConfirmed: true,
      } }], 'early_access_csv_imported', campaignId);
       return { importId, preview: parsed, snapshot: await snapshotCampaignRecipients(store, campaignId, actor.uid, parsed.contacts.map(contact => ({ ...contact, lawfulBasisConfirmed: true })), 'csv_import') };
    }
    if (operation === 'snapshot' && req.method === 'POST') {
      const raw = await req.text();
      if (new TextEncoder().encode(raw).byteLength > 24000) fail('PAYLOAD_TOO_LARGE', 413);
      let input: any;
      try { input = JSON.parse(raw); } catch { fail('INVALID_JSON'); }
      if (!input || Object.keys(input).some(key => !['subscriberIds', 'selectAll', 'filters'].includes(key))) fail('INVALID_FIELDS');
      let ids: string[] = Array.isArray(input.subscriberIds) ? [...new Set(input.subscriberIds.map((id: any) => safeId(String(id))))] as string[] : [];
      if (input.selectAll === true) {
        const rows = await store.query(EA.subscribers, { from: [{ collectionId: EA.subscribers }], orderBy: [{ field: { fieldPath: 'normalizedEmail' }, direction: 'ASCENDING' }], limit: 501 });
        if (rows.length > 500) fail('AUDIENCE_TOO_LARGE', 413);
        const filters = input.filters && typeof input.filters === 'object' ? input.filters : {};
        ids = rows.filter(row => Object.entries(filters).every(([key, value]) => String(row.data[key]) === String(value))).map(row => String(row.name || '').split('/').pop()).filter((value): value is string => Boolean(value));
      }
      if (!ids.length || ids.length > 500) fail('INVALID_SELECTION');
       const records: any[] = [];
       for (let offset = 0; offset < ids.length; offset += 100) {
         const batch = ids.slice(offset, offset + 100);
         const subscribers = store.readMany
           ? await store.readMany(batch.map(id => ({ collection: EA.subscribers, id })))
           : await Promise.all(batch.map(id => store.read(EA.subscribers, id)));
         const suppressions = store.readMany
           ? await store.readMany(batch.map(id => ({ collection: EA.suppression, id })))
           : await Promise.all(batch.map(id => store.read(EA.suppression, id)));
         records.push(...subscribers.map((subscriber, index) => subscriber ? { ...subscriber.data, id: batch[index], suppression: suppressions[index] } : null));
       }
       const contacts = records.filter(Boolean);
      return { snapshot: await snapshotCampaignRecipients(store, campaignId, actor.uid, contacts, 'subscriber') };
    }
  }
  if (path === '/api/admin/early-access/campaigns' || path.startsWith('/api/admin/early-access/campaigns/')) return campaignAction(req, store, actor.uid, allowed);
  fail('NOT_FOUND', 404);
}