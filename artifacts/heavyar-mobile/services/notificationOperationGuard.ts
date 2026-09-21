// Identity epochs also reject A -> B -> A late completions.
export function createNotificationOperationGuard() {
  let uid = '';
  let epoch = 0;
  const generations = new Map<string, number>();
  return {
    setIdentity(next: string) {
      if (next !== uid) { uid = next; epoch++; generations.clear(); }
    },
    invalidate() { epoch++; generations.clear(); },
    begin(expectedUid: string, operation: string) {
      const capturedEpoch = epoch;
      const generation = (generations.get(operation) || 0) + 1;
      generations.set(operation, generation);
      return () => uid === expectedUid && epoch === capturedEpoch && generations.get(operation) === generation;
    },
  };
}

export function assertNotificationIdentity(expectedUid: string, currentUid: string | undefined, signal?: AbortSignal | null) {
  if (signal?.aborted) throw new Error('NOTIFICATION_REQUEST_ABORTED');
  if (!expectedUid || currentUid !== expectedUid) throw new Error('SESSION_EXPIRED');
}