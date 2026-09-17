import { describe, expect, test } from 'vitest';
import { redirectSystemPath } from '../app/+native-intent';

describe('Heavyar native deep links', () => {
  test('accepts both host and triple-slash payment links', () => {
    const expected = '/payment/request_1?paymentId=pay_12345678';
    expect(redirectSystemPath({ path: 'heavyar://payment/request_1?paymentId=pay_12345678', initial: true })).toBe(expected);
    expect(redirectSystemPath({ path: 'heavyar:///payment/request_1?paymentId=pay_12345678', initial: true })).toBe(expected);
  });

  test('passes only a strictly formatted payment ID to payment routes', () => {
    expect(redirectSystemPath({ path: 'heavyar://payment/request_1?paymentId=pay_12345678', initial: true })).toContain('?paymentId=pay_12345678');
    expect(redirectSystemPath({ path: 'heavyar://payment/request_1?paymentId=javascript:bad', initial: true })).toBe('/payment/request_1');
  });

  test('rejects unallowlisted routes and malformed IDs', () => {
    expect(redirectSystemPath({ path: 'heavyar://admin/secret', initial: true })).toBe('/');
    expect(redirectSystemPath({ path: 'heavyar://payment/../../secret', initial: true })).toBe('/');
  });
});