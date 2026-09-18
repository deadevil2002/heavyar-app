import { describe, expect, test } from 'bun:test';
import { earlyAccessStore } from './admin';
import { page } from './early-access-admin';
import { EA, type Change } from './early-access-model';
import type { Env } from './index';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const emulatorTest = host ? test : (test as typeof test & { skip: typeof test }).skip;
describe('Early Access real adapter against local demo Firestore only', () => {
  emulatorTest('indexed facet/prefix pages, exact search, physical cursor, create-only uniqueness and config CAS atomicity', async () => {
    if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) throw new Error('Local emulator required; production forbidden');
    const project = 'demo-early-access-adapter', original = globalThis.fetch;
    const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 1024, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const env: Env = { FIREBASE_PROJECT_ID: project, FIREBASE_CLIENT_EMAIL: 'local@example.test', FIREBASE_PRIVATE_KEY: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey)))) };
    const seen: string[] = [];
    globalThis.fetch = (async (input: any, init: any = {}) => {
      const url = new URL(String(input));
      if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'owner' });
      if (url.hostname !== 'firestore.googleapis.com' || !url.pathname.startsWith(`/v1/projects/${project}/`)) throw new Error('Unexpected network; no production access allowed');
      seen.push(url.pathname);
      return original(`http://${host}${url.pathname}${url.search}`, { ...init, headers: { ...init.headers, Authorization: 'Bearer owner' } });
    }) as typeof fetch;
    try {
      await original(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
      const store = earlyAccessStore(env, { uid: 'local-owner', admin: true, permissionRole: 'owner', emailVerified: true, testInjected: true });
      const changes: Change[] = Array.from({ length: 45 }, (_, i) => ({
        collection: EA.subscribers, id: `subscriber-${String(i).padStart(3, '0')}`, prior: null,
        data: { normalizedEmail: `prefix${String(i).padStart(3, '0')}@example.test`, email: `prefix${String(i).padStart(3, '0')}@example.test`,
          status: 'active', verified: true, consentMarketing: true, country: 'SA', language: 'ar', updatedAt: new Date().toISOString() },
      }));
      await store.save(changes, 'early_access_test_seed', 'local-fixtures');
      const base = 'https://worker.test/?q=prefix&verified=true&consentMarketing=true&country=SA&language=ar&status=active&limit=20';
      const first = await page(store, EA.subscribers, new URL(base));
      const second = await page(store, EA.subscribers, new URL(`${base}&cursor=${first.nextCursor}`));
      const third = await page(store, EA.subscribers, new URL(`${base}&cursor=${second.nextCursor}`));
      expect(first.items.length).toBe(20); expect(second.items.length).toBe(20); expect(third.items.length).toBe(5); expect(third.nextCursor).toBe(null);
      expect(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size).toBe(45);
      const exact = await page(store, EA.subscribers, new URL('https://worker.test/?q=prefix003%40example.test&country=SA'));
      expect(exact.items.length).toBe(1); expect(exact.items[0].id).toBe('subscriber-003');
      await store.save([{ collection: EA.config, id: 'default', prior: null, data: { enabled: true, revision: 1 } }], 'early_access_enabled', 'default');
      const prior = await store.read(EA.config, 'default');
      await store.save([{ collection: EA.config, id: 'default', prior, data: { enabled: false, revision: 2 } }], 'early_access_disabled', 'default');
      let conflicted = false;
      try { await store.save([{ collection: EA.config, id: 'default', prior, data: prior!.data }, { collection: EA.subscribers, id: 'blocked', prior: null, data: changes[0].data }], 'early_access_registration_requested', 'blocked'); }
      catch { conflicted = true; }
      expect(conflicted).toBe(true); expect(await store.read(EA.subscribers, 'blocked')).toBe(null);
      const collision = { collection: EA.subscribers, id: 'same-email-hash', prior: null, data: changes[0].data };
      const raced = await Promise.allSettled([store.save([collision], 'early_access_registration_requested', 'same-email-hash'), store.save([collision], 'early_access_registration_requested', 'same-email-hash')]);
      expect(raced.filter(r => r.status === 'fulfilled').length).toBe(1);
      expect(seen.some(path => path.endsWith('/documents:commit'))).toBe(true);
      expect(seen.some(path => path.endsWith('/documents:runQuery'))).toBe(true);
      expect(seen.some(path => path.includes('/documents/:'))).toBe(false);
    } finally {
      globalThis.fetch = original;
      await original(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
    }
  });
});