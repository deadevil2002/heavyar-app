import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStoreReviewAccount, STORE_REVIEW_PURPOSE, evaluateCanonicalCompleteness } from './integrity';
import { isPublicRentableListing } from './moderation';
import { STORE_REVIEW_ALIASES } from './admin';

const here = dirname(fileURLToPath(import.meta.url));
const adminSource = readFileSync(join(here, 'admin.ts'), 'utf8');
const workerSource = readFileSync(join(here, 'index.ts'), 'utf8');
const completionSource = readFileSync(join(here, 'completion.ts'), 'utf8');

describe('Store Review account contract', () => {
  test('recognizes only the immutable server marker', () => {
    expect(STORE_REVIEW_PURPOSE).toBe('store_review');
    expect(isStoreReviewAccount({ accountPurpose: STORE_REVIEW_PURPOSE })).toBe(true);
    expect(isStoreReviewAccount({ role: 'driver' })).toBe(false);
  });

  test('uses exactly three fixed aliases and roles', () => {
    expect(JSON.stringify(Object.keys(STORE_REVIEW_ALIASES).sort())).toBe(JSON.stringify([
      'heavyar.official+review.customer@gmail.com',
      'heavyar.official+review.driver@gmail.com',
      'heavyar.official+review.provider@gmail.com',
    ]));
    expect(STORE_REVIEW_ALIASES['heavyar.official+review.customer@gmail.com']).toBe('customer');
    expect(STORE_REVIEW_ALIASES['heavyar.official+review.provider@gmail.com']).toBe('provider');
    expect(STORE_REVIEW_ALIASES['heavyar.official+review.driver@gmail.com']).toBe('driver');
  });

  test('completeness does not require phone for review accounts', () => {
    const result = evaluateCanonicalCompleteness({ uid: 'review', email: 'store-review-customer@heavyar.com' }, {
      uid: 'review', email: 'store-review-customer@heavyar.com', accountPurpose: STORE_REVIEW_PURPOSE,
      role: 'customer', nameEn: 'QA Customer', countryCode: 'SA', region: 'Riyadh', city: 'Riyadh',
    });
    expect(result.state).toBe('authenticated_complete');
    expect(result.missingFields.includes('phone')).toBe(false);
  });

  test('review-owned inventory is never public even when otherwise active', () => {
    expect(isPublicRentableListing({ accountPurpose: STORE_REVIEW_PURPOSE, isActive: true, visibility: 'visible', moderationStatus: 'approved' })).toBe(false);
    expect(isPublicRentableListing({ isActive: true, visibility: 'visible', moderationStatus: 'approved' })).toBe(true);
  });

  test('provisions passwords only through the privileged endpoint without returning them', () => {
    expect(adminSource.includes("accounts:signUp?key=")).toBe(true);
    expect(adminSource.includes('password.length < 12')).toBe(true);
    expect(adminSource.includes('passwordSetupRequired: false')).toBe(true);
    expect(adminSource.includes('password, accountPurpose')).toBe(false);
  });

  test('keeps review identities out of public discovery, campaigns, and settlement', () => {
    expect(workerSource.includes('isStoreReviewAccount')).toBe(true);
    expect(workerSource.includes("STORE_REVIEW_FINANCIAL_DISABLED")).toBe(true);
    expect(completionSource.includes("user.accountPurpose === 'store_review'")).toBe(true);
    expect(adminSource.includes("accountPurpose: STORE_REVIEW_PURPOSE")).toBe(true);
  });
});