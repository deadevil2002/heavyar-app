import { afterEach, describe, expect, test } from 'bun:test';
import { processDeletionJobs } from './admin';
import type { Env } from './index';
import { __googleAuthTest } from './google-auth';

const project = 'projects/p/databases/(default)/documents';
const value = (input: any): any => input === null
  ? { nullValue: null }
  : Array.isArray(input)
    ? { arrayValue: { values: input.map(value) } }
    : input && typeof input === 'object'
      ? { mapValue: { fields: Object.fromEntries(Object.entries(input).map(([key, item]) => [key, value(item)])) } }
      : typeof input === 'boolean'
        ? { booleanValue: input }
        : typeof input === 'number'
          ? { integerValue: String(input) }
          : { stringValue: String(input) };
const decode = (input: any): any => input?.nullValue !== undefined
  ? null
  : input?.stringValue ?? (input?.integerValue !== undefined ? Number(input.integerValue) : undefined) ?? input?.booleanValue
    ?? (input?.arrayValue ? (input.arrayValue.values || []).map(decode) : input?.mapValue ? Object.fromEntries(Object.entries(input.mapValue.fields || {}).map(([key, item]) => [key, decode(item)])) : undefined);
const document = (path: string, data: Record<string, any>) => ({
  name: `${project}/${path}`,
  updateTime: '2026-10-10T00:00:00.000Z',
  fields: Object.fromEntries(Object.entries(data).map(([key, item]) => [key, value(item)])),
});

afterEach(() => {
  __googleAuthTest.reset();
});

describe('bounded deletion records processing', () => {
  test('large all-shape fixture advances a durable cursor over multiple ticks without first-page loops', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes)).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
    const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'deletion-batching@example.test', FIREBASE_PRIVATE_KEY: privateKey } as Env;
    const originalFetch = globalThis.fetch;
    const job: Record<string, any> = { uid: 'target', status: 'partially_completed', stage: 'records', completedStages: ['auth', 'media', 'historical'], errors: [], attempts: 0 };
    const shapeDocuments = new Map<string, string[]>(), deleted = new Set<string>();
    const cursors: Array<{ collectionIndex: number; ownerFieldIndex: number; documentName?: string } | null> = [];
    const pagesPerTick: number[] = [], deleteBatches: string[][] = [];
    let currentPages = 0;
    let failedProgressOnce = false;
    const docsForShape = (collection: string, ownerField: string, query: any) => {
      const key = `${collection}|${ownerField}`;
      if (!shapeDocuments.has(key)) {
        if (ownerField === '__name__') {
          const reference = query.where.fieldFilter.value.referenceValue;
          shapeDocuments.set(key, [reference]);
        } else {
          const count = key === 'userProfiles|uid' ? 205 : 3;
          shapeDocuments.set(key, Array.from({ length: count }, (_, index) => `${project}/${collection}/${ownerField}-${String(index).padStart(3, '0')}`));
          if (ownerField !== 'uid') shapeDocuments.get(key)![0] = `${project}/${collection}/shared`;
        }
      }
      const start = query.startAt?.values?.[0]?.referenceValue;
      return shapeDocuments.get(key)!.filter(name => !deleted.has(name) && (!start || (query.startAt?.before === false ? name > start : name >= start)));
    };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 });
      if (url.includes(':runQuery')) {
        const query = JSON.parse(String(init?.body || '{}')).structuredQuery || {};
        const collection = String(query.from?.[0]?.collectionId || '');
        if (collection === 'deletionRequests') {
          return new Response(job.status === 'completed' ? '[]' : JSON.stringify([{ document: document('deletionRequests/user:target', job) }]), { status: 200 });
        }
        currentPages++;
        const ownerField = String(query.where?.fieldFilter?.field?.fieldPath || '');
        const names = docsForShape(collection, ownerField, query).slice(0, Number(query.limit || 100));
        return new Response(JSON.stringify(names.map(name => ({ document: { ...document(name.split('/documents/')[1], { uid: 'target' }), name } }))), { status: 200 });
      }
      if (url.includes(':commit')) {
        const writes = JSON.parse(String(init?.body || '{}')).writes || [];
        const deletes = writes.flatMap((write: any) => typeof write.delete === 'string' ? [write.delete] : []);
        const recordsProgress = writes.some((write: any) => String(write.update?.name || '').endsWith('/deletionRequests/user:target')
          && Object.prototype.hasOwnProperty.call(write.update?.fields || {}, 'recordsCursor'));
        if (recordsProgress && !failedProgressOnce) {
          failedProgressOnce = true;
          return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE' } }), { status: 503 });
        }
        if (deletes.length) {
          expect(new Set(deletes).size).toBe(deletes.length);
          deleteBatches.push(deletes);
          deletes.forEach((name: string) => deleted.add(name));
        }
        for (const write of writes) {
          if (!String(write.update?.name || '').endsWith('/deletionRequests/user:target')) continue;
          for (const [key, encoded] of Object.entries(write.update.fields || {})) job[key] = decode(encoded);
          if (Object.prototype.hasOwnProperty.call(write.update.fields || {}, 'recordsCursor')) cursors.push(job.recordsCursor);
        }
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;
    try {
      for (let tick = 0; tick < 30 && job.status !== 'completed'; tick++) {
        currentPages = 0;
        await processDeletionJobs(env);
        pagesPerTick.push(currentPages);
      }
      expect(job.status).toBe('completed');
      expect(job.attempts).toBe(0);
      expect(pagesPerTick.every(count => count <= 4)).toBe(true);
      expect(pagesPerTick.filter(Boolean).length).toBeGreaterThan(1);
      expect(deleteBatches.every(batch => batch.length <= 400)).toBe(true);
      expect(failedProgressOnce).toBe(true);
      const allDeletes = deleteBatches.flat();
      expect(new Set(allDeletes).size).toBe(allDeletes.length);
      expect(Boolean(cursors[0])).toBe(true);
      expect(cursors.at(-1)).toBeNull();
      const progress = cursors.filter((cursor): cursor is NonNullable<typeof cursor> => cursor !== null);
      for (let index = 1; index < progress.length; index++) {
        const previous = progress[index - 1], current = progress[index];
        expect(current.collectionIndex > previous.collectionIndex
          || current.collectionIndex === previous.collectionIndex && current.ownerFieldIndex > previous.ownerFieldIndex
          || current.collectionIndex === previous.collectionIndex && current.ownerFieldIndex === previous.ownerFieldIndex && String(current.documentName) > String(previous.documentName)).toBe(true);
      }
      expect(shapeDocuments.has('users|__name__')).toBe(true);
      expect(shapeDocuments.has('userProfiles|uid')).toBe(true);
      expect(shapeDocuments.size).toBe(42);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
