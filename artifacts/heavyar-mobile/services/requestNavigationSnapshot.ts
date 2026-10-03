import type { EquipmentRequest } from '@/types';

const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_LIMIT = 30;

interface RequestNavigationSnapshot {
  ownerUid: string;
  request: EquipmentRequest;
  cachedAt: number;
}

const snapshots = new Map<string, RequestNavigationSnapshot>();
let activeOwnerUid: string | null = null;

const keyFor = (uid: string, requestId: string) => `${uid}:${requestId}`;

/** Clears all ephemeral navigation state whenever the canonical identity changes. */
export function synchronizeRequestSnapshotOwner(uid: string | null): void {
  if (activeOwnerUid === uid) return;
  activeOwnerUid = uid;
  snapshots.clear();
}

export function cacheRequestNavigationSnapshot(uid: string, request: EquipmentRequest): void {
  if (!uid || !request.id || (request.customerUid !== uid && request.providerUid !== uid)) return;
  synchronizeRequestSnapshotOwner(uid);
  snapshots.delete(keyFor(uid, request.id));
  snapshots.set(keyFor(uid, request.id), {
    ownerUid: uid,
    request,
    cachedAt: Date.now(),
  });
  while (snapshots.size > SNAPSHOT_LIMIT) {
    const oldest = snapshots.keys().next().value as string | undefined;
    if (!oldest) break;
    snapshots.delete(oldest);
  }
}

export function getRequestNavigationSnapshot(uid: string, requestId: string): EquipmentRequest | null {
  if (!uid || !requestId || activeOwnerUid !== uid) return null;
  const key = keyFor(uid, requestId);
  const snapshot = snapshots.get(key);
  if (!snapshot || snapshot.ownerUid !== uid) return null;
  if (Date.now() - snapshot.cachedAt > SNAPSHOT_TTL_MS) {
    snapshots.delete(key);
    return null;
  }
  const request = snapshot.request;
  if (request.id !== requestId || (request.customerUid !== uid && request.providerUid !== uid)) {
    snapshots.delete(key);
    return null;
  }
  return request;
}

export function clearRequestNavigationSnapshots(): void {
  activeOwnerUid = null;
  snapshots.clear();
}
