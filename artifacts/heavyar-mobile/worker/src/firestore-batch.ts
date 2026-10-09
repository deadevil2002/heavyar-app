/**
 * Keep Firestore documents:batchGet requests deliberately below the service
 * maximum and the Worker's subrequest/concurrency budgets. All bounded
 * multi-document reads in the Worker use this one limit.
 */
export const FIRESTORE_BATCH_READ_LIMIT = 100;

/** Firestore commits accept at most 500 writes. */
export const FIRESTORE_COMMIT_WRITE_LIMIT = 500;

export function firestoreChunks<T>(items: readonly T[], limit = FIRESTORE_BATCH_READ_LIMIT): T[][] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid Firestore chunk limit');
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += limit) chunks.push(items.slice(offset, offset + limit));
  return chunks;
}
