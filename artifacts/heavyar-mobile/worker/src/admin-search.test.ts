import { describe, expect, test } from 'bun:test';
import {
  ADMIN_SEARCH_QUERY_MAX_LENGTH,
  adminPrefixBounds,
  normalizeAdminSearchQuery,
  safeAdminDocumentId,
} from './admin-search';

describe('Admin search normalization', () => {
  test('normalizes Unicode, whitespace, email casing, and canonical public identifiers', () => {
    expect(normalizeAdminSearchQuery('  USER＠EXAMPLE.COM  ')).toMatchObject({
      query: 'USER@EXAMPLE.COM',
      folded: 'user@example.com',
      email: 'user@example.com',
    });
    expect(normalizeAdminSearchQuery('  مؤسسة   الأطلس  ')?.query).toBe('مؤسسة الأطلس');
    expect(normalizeAdminSearchQuery('hv-eqp-000004')?.publicIdentifier).toBe('HV-EQP-000004');
  });

  test('keeps prefix bounds deterministic and rejects unsafe inputs', () => {
    expect(adminPrefixBounds('حف')).toEqual({ start: 'حف', end: 'حف\uf8ff' });
    expect(normalizeAdminSearchQuery('   ')).toBeNull();
    expect(() => normalizeAdminSearchQuery(`safe\u0000unsafe`)).toThrow('Invalid search query');
    expect(() => normalizeAdminSearchQuery('x'.repeat(ADMIN_SEARCH_QUERY_MAX_LENGTH + 1))).toThrow('Invalid search query');
    expect(safeAdminDocumentId('account-id')).toBe(true);
    expect(safeAdminDocumentId('collection/account-id')).toBe(false);
  });
});
