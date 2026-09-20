type Listener = () => void;

const listeners = new Set<Listener>();

export function invalidatePublicEquipment(): void {
  for (const listener of listeners) listener();
}

export function subscribePublicEquipmentInvalidation(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}