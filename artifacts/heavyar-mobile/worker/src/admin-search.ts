export const ADMIN_SEARCH_QUERY_MAX_LENGTH = 200;
export const ADMIN_SEARCH_DEFAULT_LIMIT = 20;
export const ADMIN_SEARCH_MAX_LIMIT = 50;
export const ADMIN_SEARCH_SOURCE_DOCUMENT_BUDGET = 50;

export type NormalizedAdminSearchQuery = {
  query: string;
  folded: string;
  email: string | null;
  publicIdentifier: string;
};

/**
 * Normalization is deliberately lossless for names and document IDs. English
 * name-prefix queries remain case-sensitive because canonical source fields do
 * not have a synchronously maintained lowercase mirror.
 */
export function normalizeAdminSearchQuery(value: unknown): NormalizedAdminSearchQuery | null {
  if (typeof value !== 'string') return null;
  const query = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!query) return null;
  if (query.length > ADMIN_SEARCH_QUERY_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(query)) {
    throw new Error('Invalid search query');
  }
  const folded = query.toLocaleLowerCase('en');
  const email = /^[^\s@]+@[^\s@]+$/u.test(query) ? folded : null;
  const publicIdentifier = /^hv-[a-z]{3}-[a-z0-9-]+$/iu.test(query) ? query.toUpperCase() : query;
  return { query, folded, email, publicIdentifier };
}

export function adminPrefixBounds(query: string) {
  return { start: query, end: `${query}\uf8ff` };
}

export function safeAdminDocumentId(query: string) {
  return query.length <= 128 && !/[\/\u0000-\u001f\u007f]/u.test(query);
}
