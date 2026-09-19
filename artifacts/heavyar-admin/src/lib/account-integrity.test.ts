import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_INTEGRITY_MAX_PAGE_SIZE,
  ACCOUNT_INTEGRITY_ENDPOINT,
  marketplaceRoleLabel,
  normalizeIntegrityParams,
  safeMissingFields,
} from './account-integrity';

describe('account integrity contract', () => {
  it('uses localized canonical marketplace labels and never exposes raw role codes', () => {
    expect(ACCOUNT_INTEGRITY_ENDPOINT).toBe('/account-integrity');
    expect(marketplaceRoleLabel('customer', 'ar')).toBe('عميل');
    expect(marketplaceRoleLabel('provider', 'ar')).toBe('مقدم خدمة');
    expect(marketplaceRoleLabel('driver', 'ar')).toBe('سائق');
    expect(marketplaceRoleLabel('not-a-role', 'ar')).toBe('غير معروف');
    expect(marketplaceRoleLabel('customer', 'en')).toBe('Customer');
  });

  it('caps pages and only forwards known filters', () => {
    expect(normalizeIntegrityParams({
      q: '  auth-only  ',
      state: 'incomplete',
      limit: 500,
      cursor: 'next',
      ignored: 'secret',
    } as never)).toEqual({
      q: 'auth-only',
      registrationState: 'incomplete',
      limit: String(ACCOUNT_INTEGRITY_MAX_PAGE_SIZE),
      pageToken: 'next',
    });
  });

  it('bounds missing-state metadata', () => {
    expect(safeMissingFields(['email', '', 1, 'role', 'x'.repeat(81)])).toEqual(['email', 'role']);
  });
});