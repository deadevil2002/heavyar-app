import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractCreatePayload } from './commercial-form';
import { parseDecimalToMinor } from './currency-utils';
import { applyCommercialChange, buildLegacyCatalog, calculateCommercial } from '../../../heavyar-mobile/worker/src/commercial';

const now = '2026-09-18T18:00:00.000Z';
const context = { baseAmountMinor: 10000, countryCode: 'SA', categoryId: 'cranes', providerUid: 'provider-test', currency: 'SAR', calculatedAt: now, taxAmountMinor: 1500 };
describe('Commercial form uses actual server contracts', () => {
  it('default payload creates a valid server draft without supplied metadata', () => {
    const payload = extractCreatePayload({ mode: 'percentage', percentageBps: 500, payer: 'provider', currency: 'SAR', version: 'forged' }, true);
    assert.equal('version' in payload, false);
    assert.equal('status' in payload, false);
    const change = applyCommercialChange(buildLegacyCatalog(), { action: 'create', expectedRevision: 1, reason: 'Contract draft', rule: payload }, 'owner-test', now);
    assert.equal(change.audit.after?.status, 'draft');
    assert.equal(change.audit.after?.fixedAmountMinor, 0);
    assert.equal(change.audit.after?.maximumFeeMinor, null);
    assert.equal(change.audit.after?.customerShareBps, 0);
  });
  it('all payer selections produce valid server allocation and totals', () => {
    for (const payer of ['customer', 'provider', 'split'] as const) {
      const payload = extractCreatePayload({ mode: 'percentage', percentageBps: 1000, payer, currency: 'SAR' }, true);
      const change = applyCommercialChange(buildLegacyCatalog(), { action: 'create', expectedRevision: 1, reason: 'Payer contract', rule: payload }, 'owner-test', now);
      const quote = calculateCommercial(change.audit.after!, context);
      assert.equal(quote.customerFeeMinor + quote.providerFeeMinor, 1000);
      assert.equal(quote.customerPayableMinor, 11500 + quote.customerFeeMinor);
      assert.equal(quote.providerReceivableMinor, 10000 - quote.providerFeeMinor);
    }
  });
  it('preserves schedules, notes and optional end dates', () => {
    const draft = extractCreatePayload({ mode: 'fixed', percentageBps: 999, fixedAmountMinor: 123, currency: 'KWD', scope: { countryCode: 'KW' }, effectiveFrom: '2026-10-01T00:00:00Z', effectiveTo: '2026-11-01T00:00:00Z', notes: 'Negotiated window' }, false);
    const result = applyCommercialChange(buildLegacyCatalog(), { action: 'create', expectedRevision: 1, reason: 'Scheduled contract', rule: draft }, 'owner-test', now);
    assert.equal(result.audit.after?.percentageBps, 0);
    assert.equal(result.audit.after?.notes, 'Negotiated window');
    assert.equal(result.audit.after?.effectiveTo, '2026-11-01T00:00:00.000Z');
  });
  it('serializes decimal input without binary drift in two and three-digit currencies', () => {
    for (const [input, three, expected] of [['100.005', false, 10001], ['100.004', false, 10000], ['0.1', false, 10], ['.1', false, 10], ['1234.5675', true, 1234568]] as const) {
      assert.equal(parseDecimalToMinor(input, three), expected);
    }
    assert.throws(() => parseDecimalToMinor('-1', false));
    assert.throws(() => parseDecimalToMinor('NaN', true));
    assert.throws(() => parseDecimalToMinor('99999999999999999999999999', false));
  });
});