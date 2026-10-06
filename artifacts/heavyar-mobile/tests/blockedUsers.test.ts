import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  pendingGets: [] as { key: string; resolve: () => void }[],
  deferGets: false,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => mocks.deferGets
      ? new Promise(resolve => mocks.pendingGets.push({ key, resolve: () => resolve(mocks.storage.get(key) ?? null) }))
      : Promise.resolve(mocks.storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => { mocks.storage.set(key, value); return Promise.resolve(); }),
  },
}));

import { blockedUsersStorageKey, useBlockedUsersStore } from '../services/blockedUsers';

const store = () => useBlockedUsersStore.getState();

describe('device-local blocked users', () => {
  beforeEach(() => {
    mocks.storage.clear();
    mocks.pendingGets = [];
    mocks.deferGets = false;
    useBlockedUsersStore.setState({ ownerUid: null, blocked: new Set() });
  });

  it('persists blocks per account and never blocks self', async () => {
    await store().load('customer-a');
    await store().block('provider-x');
    await store().block('customer-a');
    expect([...store().blocked]).toEqual(['provider-x']);
    expect(JSON.parse(mocks.storage.get(blockedUsersStorageKey('customer-a'))!)).toEqual(['provider-x']);

    await store().load('customer-b');
    expect(store().blocked.size).toBe(0);
    await store().load('customer-a');
    expect(store().blocked.has('provider-x')).toBe(true);

    await store().unblock('provider-x');
    expect(store().blocked.size).toBe(0);
  });

  it('does not let a slow load for a previous account populate the new account', async () => {
    mocks.storage.set(blockedUsersStorageKey('old'), JSON.stringify(['provider-old']));
    mocks.deferGets = true;
    const oldLoad = store().load('old');
    const newLoad = store().load('new');
    for (const pending of mocks.pendingGets) pending.resolve();
    await Promise.all([oldLoad, newLoad]);
    expect(store().ownerUid).toBe('new');
    expect(store().blocked.size).toBe(0);
  });

  it('ignores corrupt stored data and blocking while signed out', async () => {
    mocks.storage.set(blockedUsersStorageKey('a'), '{not json');
    await store().load('a');
    expect(store().blocked.size).toBe(0);
    await store().load(null);
    await store().block('anyone');
    expect(store().blocked.size).toBe(0);
  });
});
