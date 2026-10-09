export const FIRESTORE_IN_QUERY_MAX = 30;

/** Firestore document IDs are exact keys. Invalid path-like values are ignored. */
export function firestoreDocumentIdChunks(ids: string[]): string[][] {
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 1_500 && !id.includes('/')))];
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += FIRESTORE_IN_QUERY_MAX) {
    chunks.push(unique.slice(index, index + FIRESTORE_IN_QUERY_MAX));
  }
  return chunks;
}

