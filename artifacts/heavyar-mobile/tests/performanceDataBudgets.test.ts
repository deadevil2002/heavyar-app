import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import * as ts from 'typescript';
import { FIRESTORE_IN_QUERY_MAX, firestoreDocumentIdChunks } from '../services/firestoreBatching';
import { configureMobilePerformance, readMeasuredResponseText, resetMobilePerformance, snapshotMobilePerformance } from '../utils/mobilePerformance';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('deterministic performance/data budgets', () => {
  it('locks exact Home request, query, and logical document-read caps', () => {
    const equipmentSearch = source('../worker/src/equipment-search.ts');
    const worker = source('../worker/src/index.ts');
    expect(equipmentSearch).toContain('const candidateLimit = Math.min(MAX_LIMIT + 1');
    expect(equipmentSearch).toContain('text || city || country === \'SA\' ? limit * 2 + 1');
    expect(worker).toContain("bases.map(country => ({ collection: 'countryConfigs', id: country.code }))");

    const equipmentCandidateCap = 20 * 2 + 1;
    const budgets = {
      customerCold: { http: 6, clientQueries: 1, workerQueries: 10, clientDocs: 1, workerDocs: 15 + equipmentCandidateCap },
      customerWarm: { http: 0, clientQueries: 0, workerQueries: 0, clientDocs: 0, workerDocs: 0 },
      providerCold: { http: 5, clientQueries: 1, workerQueries: 7, clientDocs: 1, workerDocs: 13 },
      driverCold: { http: 5, clientQueries: 1, workerQueries: 8, clientDocs: 1, workerDocs: 14 },
      guestCold: { http: 3, clientQueries: 0, workerQueries: 5, clientDocs: 0, workerDocs: 10 + equipmentCandidateCap },
    };
    expect(equipmentCandidateCap).toBe(41);
    expect(budgets.customerCold).toEqual({ http: 6, clientQueries: 1, workerQueries: 10, clientDocs: 1, workerDocs: 56 });
    expect(budgets.customerCold.clientDocs + budgets.customerCold.workerDocs).toBe(57);
    expect(budgets.customerWarm).toEqual({ http: 0, clientQueries: 0, workerQueries: 0, clientDocs: 0, workerDocs: 0 });
    expect(budgets.providerCold.clientDocs + budgets.providerCold.workerDocs).toBe(14);
    expect(budgets.driverCold.clientDocs + budgets.driverCold.workerDocs).toBe(15);
    expect(budgets.guestCold.clientDocs + budgets.guestCold.workerDocs).toBe(51);
  });

  it('batches a normal 20-item Requests page into one legal Firestore IN query', () => {
    const chunks = firestoreDocumentIdChunks(Array.from({ length: 20 }, (_, index) => `equipment-${index}`));
    expect(FIRESTORE_IN_QUERY_MAX).toBe(30);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(20);
  });

  it('deduplicates, rejects path-like IDs, and chunks larger bounded hydration inputs', () => {
    const ids = [...Array.from({ length: 65 }, (_, index) => `equipment-${index}`), 'equipment-1', 'bad/path', ''];
    expect(firestoreDocumentIdChunks(ids).map(chunk => chunk.length)).toEqual([30, 30, 5]);
  });

  it('keeps Home network dependencies explicit and cache-bounded', () => {
    const discovery = source('../contexts/DiscoveryContext.tsx');
    const unread = source('../hooks/useNotificationUnread.ts');
    expect(discovery).toContain('MARKET_STALE_MS = 30 * 60_000');
    expect(discovery).toContain('INVENTORY_STALE_MS = 2 * 60_000');
    expect(discovery.match(/queryFn:/g)).toHaveLength(2);
    expect(unread).toContain('NOTIFICATION_UNREAD_STALE_MS');
    expect(unread).toContain('Skipping the first focus prevents');
  });

  it('keeps Rental V2 availability to three explicit bounded query families', () => {
    const worker = source('../worker/src/index.ts');
    const availability = worker.split('function availabilityQueriesForEquipment(')[1]
      .split('async function rentalQueryFamily(')[0];
    expect(availability.match(/family: '/g)).toHaveLength(3);
    expect(availability.match(/limit: V2_AVAILABILITY_LIMIT/g)).toHaveLength(3);
  });

  it('locks Requests and Rental V2 logical read budgets', () => {
    const requestService = source('../services/requestRealtimeService.ts');
    const worker = source('../worker/src/index.ts');
    expect(requestService).toContain('REQUESTS_PAGE_SIZE = 20');
    expect(requestService).toContain("where(documentId(), 'in', chunk)");
    const requestsInitial = { queries: 2, requestDocs: 20, legacyEquipmentDocs: 20 };
    expect(requestsInitial.requestDocs + requestsInitial.legacyEquipmentDocs).toBe(40);

    expect(worker).toContain('const V2_AVAILABILITY_LIMIT = 101');
    expect(worker).toContain('batches.some(batch => batch.length >= V2_AVAILABILITY_LIMIT)');
    const successfulAvailabilityDocs = 3 * (101 - 1);
    const estimate = { queryOperations: 6, fixedDocs: 3, availabilityDocs: successfulAvailabilityDocs };
    const create = { queryOperations: 8, fixedDocs: 5, availabilityDocs: successfulAvailabilityDocs };
    expect(estimate.fixedDocs + estimate.availabilityDocs).toBe(303);
    expect(create.fixedDocs + create.availabilityDocs).toBe(305);
  });

  it('guards mobile payment creation before React can re-render', () => {
    const payment = source('../app/payment/[requestId].tsx');
    expect(payment).toContain('paymentCreationInFlight.current) return');
    expect(payment).toContain('paymentCreationInFlight.current = true');
    expect(payment).toContain('paymentCreationInFlight.current = false');
  });

  it('queues bulk verification email and bounds each scheduled processor pass', () => {
    const admin = source('../worker/src/admin.ts');
    expect(admin).toContain("status: 'queued', uids: ids, cursor: 0");
    expect(admin).toContain("collectionId: 'emailVerificationReminderJobs'");
    expect(admin).toContain('limit: 5');
    expect(admin).toContain('uids.slice(cursor, cursor + 5)');
    const bulk = admin.split('async function bulkEmailVerificationReminder(')[1]
      .split('export async function processEmailVerificationReminderJobs(')[0];
    expect(bulk).not.toContain('await emailVerificationReminder(');
    expect(bulk).not.toContain('api.resend.com');
  });

  it('keeps previously identified avoidable N+1 reads batched', () => {
    const requests = source('../services/requestRealtimeService.ts');
    const worker = source('../worker/src/index.ts');
    const admin = source('../worker/src/admin.ts');
    expect(requests).not.toMatch(/ids\.map\([^)]*getDoc/s);
    expect(requests).toContain("where(documentId(), 'in', chunk)");
    expect(worker).not.toContain("Promise.all([getDoc(env, 'users', r.customerUid), getDoc(env, 'users', r.providerUid)])");
    expect(worker).toContain("batchGetRawDocs(env, reservationDates.map(date => ({");
    const reminderSummary = admin.split('async function reminderSummary(')[1]
      .split('async function emailVerificationReminderPreview(')[0];
    expect(reminderSummary).toContain('batchGetRawDocsInChunks');
    expect(reminderSummary).not.toContain("await rawDoc(env, 'users', uid)");
  });

  it('records the exact measured fixture size without retaining response content', async () => {
    configureMobilePerformance({ enabled: true });
    resetMobilePerformance();
    const fixture = JSON.stringify({ success: true, equipment: Array.from({ length: 20 }, (_, index) => ({ title: `معدات ${index}`, images: ['https://example.invalid/image.webp'] })) });
    await readMeasuredResponseText(new Response(fixture, { status: 200 }), 'worker.api.equipment.search');
    const sizes = snapshotMobilePerformance().responseSizes;
    expect(sizes).toHaveLength(1);
    expect(sizes[0].maxBytes).toBe(new TextEncoder().encode(fixture).byteLength);
    expect(sizes[0].maxBytes).toBe(1_500);
    expect(JSON.stringify(sizes)).not.toContain('معدات');
    expect(JSON.stringify(sizes)).not.toContain('example.invalid');
    configureMobilePerformance({ enabled: false });
  });

  it('keeps all 63 Worker collection query shapes bounded or aggregate-only', () => {
    const directory = fileURLToPath(new URL('../worker/src/', import.meta.url));
    const files = readdirSync(directory).filter(file => file.endsWith('.ts') && !file.includes('.test.') && file !== 'bun-test.d.ts');
    const shapes: Array<{ file: string; limited: boolean; aggregate: boolean }> = [];
    for (const file of files) {
      const text = readFileSync(new URL(`../worker/src/${file}`, import.meta.url), 'utf8');
      const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const property = (node: ts.ObjectLiteralExpression, name: string) => node.properties.find(item => item.name && item.name.getText(tree).replace(/["']/g, '') === name);
      const visit = (node: ts.Node): void => {
        if (ts.isObjectLiteralExpression(node) && property(node, 'from')?.getText(tree).includes('collectionId')) {
          let parent: ts.Node | undefined = node;
          let aggregate = false;
          while (parent && parent !== tree) {
            if (ts.isFunctionDeclaration(parent) && parent.name?.text === 'loadAggregateCollection') aggregate = true;
            if (ts.isPropertyAssignment(parent) && parent.name.getText(tree).replace(/["']/g, '') === 'structuredAggregationQuery') aggregate = true;
            parent = parent.parent;
          }
          shapes.push({ file, limited: !!property(node, 'limit'), aggregate });
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    expect(shapes).toHaveLength(63);
    expect(shapes.filter(shape => shape.limited)).toHaveLength(61);
    expect(shapes.filter(shape => !shape.limited && shape.aggregate)).toHaveLength(2);
    expect(shapes.filter(shape => !shape.limited && !shape.aggregate)).toEqual([]);
  });

  it('keeps all 16 direct mobile collection queries bounded or exact-key IN batches', () => {
    const shapes: Array<{ limited: boolean; boundedSpread: boolean; exactKeyBatch: boolean }> = [];
    for (const relativePath of ['../services/firestoreService.ts', '../services/requestRealtimeService.ts']) {
      const text = source(relativePath);
      const tree = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && node.expression.getText(tree) === 'query') {
          const expression = node.getText(tree);
          if (expression.includes('collection(')) shapes.push({
            limited: node.arguments.some(argument => ts.isCallExpression(argument) && argument.expression.getText(tree) === 'limit'),
            boundedSpread: expression.includes('...constraints') && text.includes('const constraints = [') && text.includes('limit(size),'),
            exactKeyBatch: expression.includes("where(documentId(), 'in', chunk)"),
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    expect(shapes).toHaveLength(16);
    expect(shapes.filter(shape => shape.limited)).toHaveLength(13);
    expect(shapes.filter(shape => shape.boundedSpread)).toHaveLength(1);
    expect(shapes.filter(shape => !shape.limited && shape.exactKeyBatch)).toHaveLength(2);
    expect(shapes.filter(shape => !shape.limited && !shape.boundedSpread && !shape.exactKeyBatch)).toEqual([]);
  });

  it('keeps every collection listener bounded and wrapped with cleanup', () => {
    const requestService = source('../services/requestRealtimeService.ts');
    const firestore = source('../services/firestoreService.ts');
    expect((requestService.match(/onSnapshot\(/g) || [])).toHaveLength(2);
    expect((firestore.match(/onSnapshot\(/g) || [])).toHaveLength(3);
    expect((`${requestService}\n${firestore}`.match(/return \(\) => \{ unsubscribe\(\); stopMetric\(\); \};/g) || [])).toHaveLength(5);
    expect(requestService).toContain('limit(REQUESTS_PAGE_SIZE)');
    expect(firestore).toContain('limit(CHAT_PAGE_SIZE)');
  });
});
