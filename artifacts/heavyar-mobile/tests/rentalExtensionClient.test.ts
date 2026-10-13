import { describe, expect, it } from 'vitest';
import { decodeRentalExtension, decodeRentalExtensionEstimate, extensionPaymentIsActivatable } from '@/services/rentalExtension';

const common = {
  originalEndAt: '2030-09-20T07:00:00.000Z', proposedEndAt: '2030-09-20T08:00:00.000Z',
  additionalDurationMinutes: 60, additionalBillableUnits: 60, additionalBaseAmountMinor: 9_500,
  currency: 'SAR', currencyDecimals: 2, rateUnit: 'hourly', expiresAt: '2030-09-20T06:00:00.000Z',
  paymentActivation: 'blocked_unverified',
} as const;

const commercial = {
  ruleVersion: 'rule-1', ruleStatus: 'active', mode: 'percentage', percentageBps: 1000,
  fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null, payer: 'provider', customerShareBps: 0,
  scope: { countryCode: null, categoryId: null, providerUid: null }, baseAmountMinor: 9_500,
  platformFeeMinor: 950, customerFeeMinor: 0, providerFeeMinor: 950, providerReceivableMinor: 8_550,
  customerPayableMinor: 9_500, taxAmountMinor: null, gatewayFeeMinor: null, currency: 'SAR',
  countryCode: 'SA', categoryId: 'other', providerUid: 'provider-1', calculatedAt: '2030-09-19T00:00:00.000Z',
};

describe('rental extension runtime decoding', () => {
  it('accepts strict server estimates and stored extension DTOs', () => {
    expect(decodeRentalExtensionEstimate({ ...common, commercial })?.additionalBaseAmountMinor).toBe(9_500);
    const extension = decodeRentalExtension({
      ...common, id: 'ext_0123456789abcdef', requestId: 'request_1', status: 'pending_provider',
      createdAt: '2030-09-19T00:00:00.000Z', updatedAt: '2030-09-19T00:00:00.000Z',
    });
    expect(extension?.status).toBe('pending_provider');
    expect(extensionPaymentIsActivatable(extension!)).toBe(false);
  });

  it.each([9.5, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1, '950', null])(
    'rejects malformed additional minor amounts %p without rounding or conversion',
    value => expect(decodeRentalExtensionEstimate({ ...common, additionalBaseAmountMinor: value, commercial })).toBeNull(),
  );

  it('rejects altered payment activation, invalid status, and malformed commercial money', () => {
    expect(decodeRentalExtensionEstimate({ ...common, paymentActivation: 'active', commercial })).toBeNull();
    expect(decodeRentalExtension({ ...common, id: 'ext_0123456789abcdef', requestId: 'request_1', status: 'confirmed', createdAt: common.expiresAt, updatedAt: common.expiresAt })).toBeNull();
    expect(decodeRentalExtensionEstimate({ ...common, commercial: { ...commercial, baseAmountMinor: 9.5 } })).toBeNull();
  });
});
