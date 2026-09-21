// Identity epochs also reject A -> B -> A late completions.
export function createNotificationOperationGuard() {
  let uid = '';
  let epoch = 0;
  let mutationEpoch = 0;
  let mutationLock: number | null = null;
  let lockGeneration = 0;
  let writeTail: Promise<unknown> = Promise.resolve();
  const generations = new Map<string, number>();
  const begin = (expectedUid: string, operation: string) => {
    const capturedEpoch = epoch;
    const generation = (generations.get(operation) || 0) + 1;
    generations.set(operation, generation);
    return () => uid === expectedUid && epoch === capturedEpoch && generations.get(operation) === generation;
  };
  return {
    setIdentity(next: string) {
      if (next !== uid) { uid = next; epoch++; mutationEpoch++; mutationLock = null; lockGeneration++; generations.clear(); }
    },
    invalidate() { epoch++; mutationEpoch++; mutationLock = null; lockGeneration++; generations.clear(); },
    begin,
    mutationSnapshot() { return mutationEpoch; },
    mutationIsCurrent(snapshot: number) { return snapshot === mutationEpoch; },
    tryLockMutation() {
      if (mutationLock !== null) return null;
      mutationLock = ++lockGeneration;
      return mutationLock;
    },
    unlockMutation(lock: number) {
      if (mutationLock === lock) mutationLock = null;
    },
    beginMutation(expectedUid: string, operation: string) {
      mutationEpoch++;
      const mutation = mutationEpoch;
      const operationIsCurrent = begin(expectedUid, operation);
      return () => operationIsCurrent() && mutation === mutationEpoch;
    },
    serializeWrite<T>(write: () => Promise<T>): Promise<T> {
      const result = writeTail.then(write, write);
      writeTail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}

export function assertNotificationIdentity(expectedUid: string, currentUid: string | undefined, signal?: AbortSignal | null) {
  if (signal?.aborted) throw new Error('NOTIFICATION_REQUEST_ABORTED');
  if (!expectedUid || currentUid !== expectedUid) throw new Error('SESSION_EXPIRED');
}