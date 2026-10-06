import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

// Device-local, account-scoped block list. Blocking hides the other account's
// chat messages and public listings for the signed-in account on this device.
// It is a safety preference only, never permission or mutation authority.
const MAX_BLOCKED = 500;
export const blockedUsersStorageKey = (uid: string) => `heavyar_blocked_users:${uid}`;

type BlockedUsersState = {
  ownerUid: string | null;
  blocked: ReadonlySet<string>;
  load: (uid: string | null) => Promise<void>;
  block: (uid: string) => Promise<void>;
  unblock: (uid: string) => Promise<void>;
};

function decode(raw: string | null): Set<string> {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, MAX_BLOCKED) : []);
  } catch {
    return new Set();
  }
}

export const useBlockedUsersStore = create<BlockedUsersState>((set, get) => {
  const persist = async (ownerUid: string, next: Set<string>) => {
    // Never let a write for a previous account land on the current one.
    if (get().ownerUid !== ownerUid) return;
    set({ blocked: next });
    await AsyncStorage.setItem(blockedUsersStorageKey(ownerUid), JSON.stringify([...next])).catch(() => undefined);
  };
  return {
    ownerUid: null,
    blocked: new Set(),
    load: async uid => {
      if (get().ownerUid === uid) return;
      set({ ownerUid: uid, blocked: new Set() });
      if (!uid) return;
      const raw = await AsyncStorage.getItem(blockedUsersStorageKey(uid)).catch(() => null);
      if (get().ownerUid === uid) set({ blocked: decode(raw) });
    },
    block: async uid => {
      const { ownerUid, blocked } = get();
      if (!ownerUid || !uid || uid === ownerUid || blocked.has(uid)) return;
      await persist(ownerUid, new Set([...blocked, uid].slice(-MAX_BLOCKED)));
    },
    unblock: async uid => {
      const { ownerUid, blocked } = get();
      if (!ownerUid || !blocked.has(uid)) return;
      const next = new Set(blocked);
      next.delete(uid);
      await persist(ownerUid, next);
    },
  };
});

/** Binds the block list to the signed-in account and returns it. */
export function useBlockedUsers(currentUid: string | null | undefined) {
  const uid = currentUid || null;
  const load = useBlockedUsersStore(state => state.load);
  const ownerUid = useBlockedUsersStore(state => state.ownerUid);
  const blocked = useBlockedUsersStore(state => state.blocked);
  const block = useBlockedUsersStore(state => state.block);
  const unblock = useBlockedUsersStore(state => state.unblock);
  useEffect(() => { void load(uid); }, [load, uid]);
  // Mask the previous account's list synchronously during an account switch.
  const active = ownerUid === uid ? blocked : EMPTY;
  return { blocked: active, isBlocked: (otherUid?: string | null) => Boolean(otherUid && active.has(otherUid)), block, unblock };
}

const EMPTY: ReadonlySet<string> = new Set();
