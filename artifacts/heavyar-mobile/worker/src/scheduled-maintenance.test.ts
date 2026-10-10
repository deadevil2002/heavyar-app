import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { processRegulatoryExpiry, type Env } from './index';
import { __googleAuthTest } from './google-auth';

let privateKey = '';
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...bytes)).match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
});

afterEach(() => {
  __googleAuthTest.reset();
});

describe('scheduled regulatory notification idempotency', () => {
  for (const existingStatus of ['delivered', 'processing', 'pending', 'failed']) {
    test(`retry preserves an existing ${existingStatus} deterministic outbox occurrence`, async () => {
      const originalFetch = globalThis.fetch;
      const env = { FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: `${existingStatus}@example.test`, FIREBASE_PRIVATE_KEY: privateKey } as Env;
      const commits: any[][] = [];
      let expectedOutboxFields: Record<string, any> | undefined;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 });
        if (url.includes(':runQuery')) return new Response(JSON.stringify([{ document: {
          name: 'projects/p/databases/(default)/documents/regulatoryExpiryQueue/queue-1',
          updateTime: '2026-10-10T00:00:00.000Z',
          fields: {
            documentId: { stringValue: 'document-1' }, ownerUid: { stringValue: 'owner-1' },
            expiresAt: { timestampValue: '2020-01-01T00:00:00.000Z' },
          },
        } }]), { status: 200 });
        if (url.includes(':batchGet')) {
          const documents: string[] = JSON.parse(String(init?.body || '{}')).documents || [];
          if (documents.some(name => name.includes('/regulatoryDocuments/'))) return new Response(JSON.stringify([{ found: {
            name: 'projects/p/databases/(default)/documents/regulatoryDocuments/document-1',
            updateTime: '2026-10-10T00:00:00.000Z',
            fields: { ownerUid: { stringValue: 'owner-1' }, reviewStatus: { stringValue: 'APPROVED' } },
          } }]), { status: 200 });
          const outboxName = documents.find(name => name.includes('/notificationOutbox/'))!;
          return new Response(JSON.stringify([{ found: {
            name: outboxName,
            updateTime: '2026-10-10T00:00:01.000Z',
            fields: { ...expectedOutboxFields, status: { stringValue: existingStatus } },
          } }]), { status: 200 });
        }
        if (url.includes(':commit')) {
          const writes = JSON.parse(String(init?.body || '{}')).writes || [];
          commits.push(writes);
          if (commits.length === 1) {
            const outbox = writes.find((write: any) => String(write.update?.name || '').includes('/notificationOutbox/'));
            expectedOutboxFields = outbox.update.fields;
            return new Response(JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }), { status: 409 });
          }
          return new Response('{}', { status: 200 });
        }
        return new Response('{}', { status: 404 });
      }) as typeof fetch;
      try {
        await expect(processRegulatoryExpiry(env)).resolves.toBeUndefined();
        expect(commits).toHaveLength(2);
        const originalOutbox = commits[0].find(write => String(write.update?.name || '').includes('/notificationOutbox/'));
        expect(originalOutbox.currentDocument).toEqual({ exists: false });
        expect(commits[1].some(write => String(write.update?.name || '').includes('/notificationOutbox/'))).toBe(false);
        expect(commits[1].some(write => write.update?.fields?.reviewStatus?.stringValue === 'EXPIRED')).toBe(true);
        expect(commits[1].some(write => String(write.delete || '').endsWith('/regulatoryExpiryQueue/queue-1'))).toBe(true);
        expect(commits.flat().some(write => write.update?.fields?.status?.stringValue === 'pending' && String(write.update?.name || '').includes('/notificationOutbox/') && write !== originalOutbox)).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
});
