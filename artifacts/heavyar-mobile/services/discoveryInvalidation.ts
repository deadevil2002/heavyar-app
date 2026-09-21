type Listener = () => void | Promise<void>;

const listeners = new Set<Listener>();

export function invalidatePublicEquipment(): void {
  // Observers are not part of the persisted mutation. Never let cache/UI work
  // turn a successful server write into a failure (and trigger media cleanup).
  for (const listener of [...listeners]) {
    try {
      const result = listener();
      if (result) void Promise.resolve(result).catch(() => console.warn('[discovery] invalidation observer failed'));
    } catch { console.warn('[discovery] invalidation observer failed'); }
  }
}

export function subscribePublicEquipmentInvalidation(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}