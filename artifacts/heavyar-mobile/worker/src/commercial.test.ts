import { describe, expect, test } from 'bun:test';
import {
  applyCommercialChange, buildLegacyCatalog, calculateCommercial, majorToMinor,
  minorToMajor, resolveRule, validateRule,
} from './commercial';

const NOW = '2026-01-01T00:00:00.000Z';

describe('authoritative commercial engine', () => {
  test('legacy rule remains provider-paid 10 percent with no assumed tax', () => {
    const catalog = buildLegacyCatalog();
    const rule = resolveRule(catalog, {
      countryCode: 'SA', categoryId: 'cranes', providerUid: 'p1', currency: 'SAR', at: NOW,
    });
    const value = calculateCommercial(rule, {
      baseAmountMinor: 10005, countryCode: 'SA', categoryId: 'cranes',
      providerUid: 'p1', currency: 'SAR', calculatedAt: NOW,
    });
    expect(value.platformFeeMinor).toBe(1001);
    expect(value.providerReceivableMinor).toBe(9004);
    expect(value.customerPayableMinor).toBe(10005);
    expect(value.taxAmountMinor).toBe(null);
    expect(value.gatewayFeeMinor).toBe(null);
    expect(Object.prototype.hasOwnProperty.call(value, 'taxReference')).toBe(false);
  });

  test('uses BigInt half-up for percentage and split allocation', () => {
    const rule = { ...buildLegacyCatalog().rules[0], payer: 'split' as const, customerShareBps: 5000 };
    const value = calculateCommercial(rule, {
      baseAmountMinor: 5, countryCode: 'AE', categoryId: 'loaders',
      providerUid: 'p', currency: 'AED', calculatedAt: NOW, taxAmountMinor: 2,
      gatewayFeeMinor: 9, taxReference: 'tax-1',
    });
    expect(value.platformFeeMinor).toBe(1);
    expect(value.customerFeeMinor).toBe(1);
    expect(value.providerFeeMinor).toBe(0);
    expect(value.customerPayableMinor).toBe(8);
    expect(value.gatewayFeeMinor).toBe(9);
  });

  test('resolves precedence and exact currency deterministically', () => {
    const base = buildLegacyCatalog().rules[0];
    const rule = (version: string, scope: typeof base.scope, currency = '*') => ({
      ...base, version, scope, currency,
    });
    const catalog = {
      revision: 1,
      rules: [
        base,
        rule('10000000-0000-4000-8000-000000000001', { countryCode: null, categoryId: 'cranes', providerUid: null }),
        rule('10000000-0000-4000-8000-000000000002', { countryCode: 'SA', categoryId: 'cranes', providerUid: null }),
        rule('10000000-0000-4000-8000-000000000003', { countryCode: null, categoryId: null, providerUid: 'p' }),
        rule('10000000-0000-4000-8000-000000000004', { countryCode: null, categoryId: null, providerUid: 'p' }, 'SAR'),
      ],
    };
    expect(resolveRule(catalog, {
      countryCode: 'SA', categoryId: 'cranes', providerUid: 'p', currency: 'SAR', at: NOW,
    }).version).toBe('10000000-0000-4000-8000-000000000004');
  });

  test('validates wildcard money constraints and canonical scopes', () => {
    const base = buildLegacyCatalog().rules[0];
    let error = '';
    try { validateRule({ ...base, fixedAmountMinor: 1 }); } catch (e) { error = String(e); }
    expect(error.includes('Wildcard currency')).toBe(true);
    try { validateRule({ ...base, scope: { countryCode: 'US', categoryId: null, providerUid: null } }); } catch (e) { error = String(e); }
    expect(error.includes('GCC')).toBe(true);
  });

  test('converts GCC two and three digit currencies exactly', () => {
    expect(majorToMinor('1.2345', 'KWD')).toBe(1235);
    expect(majorToMinor('90071992547409.91', 'SAR')).toBe(9007199254740991);
    expect(minorToMajor(1235, 'KWD')).toBe('1.235');
  });

  test('creates, publishes, replaces and audits immutable versions', () => {
    const legacy = buildLegacyCatalog();
    const terms = {
      effectiveFrom: NOW, effectiveTo: null, notes: 'new rate', mode: 'percentage',
      percentageBps: 800, fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null,
      payer: 'provider', customerShareBps: 0,
      scope: { countryCode: null, categoryId: null, providerUid: null }, currency: '*',
    };
    const created = applyCommercialChange(legacy, {
      action: 'create', expectedRevision: 1, reason: 'approved', rule: terms,
    }, 'admin', NOW);
    expect(created.catalog.rules[1].status).toBe('draft');
    const published = applyCommercialChange(created.catalog, {
      action: 'publish', expectedRevision: 2, reason: 'go live', version: created.audit.version,
    }, 'admin', NOW);
    expect(published.catalog.rules[0].effectiveTo).toBe(NOW);
    expect(published.catalog.rules[1].status).toBe('active');
    expect(published.audit.before?.status).toBe('draft');
    expect(published.audit.after?.status).toBe('active');
  });

  test('enforces revision, spoofing and global continuity guards', () => {
    let error = '';
    try {
      applyCommercialChange(buildLegacyCatalog(), {
        action: 'create', expectedRevision: 1, reason: 'x',
        rule: { version: 'spoof' },
      }, 'admin', NOW);
    } catch (e) { error = String(e); }
    expect(error.includes('Unknown create rule field')).toBe(true);
    try {
      applyCommercialChange(buildLegacyCatalog(), {
        action: 'retire', expectedRevision: 1, reason: 'x', version: 'legacy-commission-v1',
      }, 'admin', NOW);
    } catch (e) { error = String(e); }
    expect(error.includes('global fallback')).toBe(true);
  });

  test('rejects unknown actions rather than treating them as retirement', () => {
    let error = '';
    try {
      applyCommercialChange(buildLegacyCatalog(), {
        action: 'destroy', expectedRevision: 1, reason: 'bad', version: 'legacy-commission-v1',
      } as any, 'admin', NOW);
    } catch (e) { error = String(e); }
    expect(error.includes('Invalid action')).toBe(true);
  });

  test('normalizes null immediate marker and rejects stale revisions and impossible dates', () => {
    const terms = {
      effectiveFrom: null, effectiveTo: null, notes: '', mode: 'percentage',
      percentageBps: 500, fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null,
      payer: 'provider', customerShareBps: 0,
      scope: { countryCode: null, categoryId: 'cranes', providerUid: null }, currency: '*',
    };
    const created = applyCommercialChange(buildLegacyCatalog(), {
      action: 'create', expectedRevision: 1, reason: 'now', rule: terms,
    }, 'admin', NOW);
    expect(created.catalog.rules[1].effectiveFrom).toBe(NOW);
    let error = '';
    try {
      applyCommercialChange(created.catalog, {
        action: 'publish', expectedRevision: 1, reason: 'stale', version: created.audit.version,
      }, 'admin', NOW);
    } catch (e) { error = String(e); }
    expect(error.includes('revision conflict')).toBe(true);
    try { validateRule({ ...buildLegacyCatalog().rules[0], createdAt: '2026-02-30T00:00:00Z' }); } catch (e) { error = String(e); }
    expect(error.includes('real calendar')).toBe(true);
  });

  test('truncates a passed scheduled predecessor and audits every changed rule', () => {
    const legacy = buildLegacyCatalog();
    const first = {
      ...legacy.rules[0], version: '10000000-0000-4000-8000-000000000010',
      status: 'scheduled' as const, effectiveFrom: '2026-01-02T00:00:00.000Z',
    };
    const draft = {
      ...legacy.rules[0], version: '10000000-0000-4000-8000-000000000011',
      status: 'draft' as const, effectiveFrom: '2026-01-03T00:00:00.000Z',
      createdAt: NOW, updatedAt: NOW,
    };
    const result = applyCommercialChange({ revision: 4, rules: [
      { ...legacy.rules[0], effectiveTo: first.effectiveFrom }, first, draft,
    ] }, {
      action: 'publish', expectedRevision: 4, reason: 'replace', version: draft.version,
    }, 'admin', '2026-01-04T00:00:00.000Z');
    expect(result.catalog.rules[1].effectiveTo).toBe('2026-01-04T00:00:00.000Z');
    expect(result.audit.changes.length).toBe(2);
  });

  test('cancelling a future schedule restores its closed predecessor', () => {
    const legacy = buildLegacyCatalog();
    const future = {
      ...legacy.rules[0], version: '10000000-0000-4000-8000-000000000020',
      status: 'scheduled' as const, effectiveFrom: '2026-02-01T00:00:00.000Z',
      createdAt: NOW, updatedAt: NOW,
    };
    const catalog = { revision: 2, rules: [
      { ...legacy.rules[0], effectiveTo: future.effectiveFrom }, future,
    ] };
    const result = applyCommercialChange(catalog, {
      action: 'retire', expectedRevision: 2, reason: 'cancel', version: future.version,
    }, 'admin', NOW);
    expect(result.catalog.rules[0].effectiveTo).toBe(null);
    expect(result.catalog.rules[1].status).toBe('retired');
    expect(result.audit.changes.length).toBe(2);
  });

  test('rejects ambiguous overlaps, invalid contexts and unsafe totals', () => {
    const legacy = buildLegacyCatalog();
    const duplicate = {
      ...legacy.rules[0], version: '10000000-0000-4000-8000-000000000030',
    };
    let error = '';
    try {
      resolveRule({ revision: 1, rules: [legacy.rules[0], duplicate] }, {
        countryCode: 'SA', categoryId: 'cranes', providerUid: 'p', currency: 'SAR', at: NOW,
      });
    } catch (e) { error = String(e); }
    expect(error.includes('Ambiguous')).toBe(true);
    try {
      calculateCommercial(legacy.rules[0], {
        baseAmountMinor: 100, countryCode: 'SA', categoryId: 'not-canonical',
        providerUid: 'p', currency: 'SAR', calculatedAt: NOW,
      });
    } catch (e) { error = String(e); }
    expect(error.includes('canonical')).toBe(true);
    const customerRule = { ...legacy.rules[0], payer: 'customer' as const, customerShareBps: 10_000 };
    try {
      calculateCommercial(customerRule, {
        baseAmountMinor: Number.MAX_SAFE_INTEGER, countryCode: 'SA', categoryId: 'cranes',
        providerUid: 'p', currency: 'SAR', calculatedAt: NOW,
      });
    } catch (e) { error = String(e); }
    expect(error.includes('safe integer range')).toBe(true);
  });

  test('conserves fee allocation and provider deduction across many amounts', () => {
    const rule = { ...buildLegacyCatalog().rules[0], payer: 'split' as const, customerShareBps: 3333 };
    for (let base = 0; base < 500; base++) {
      const value = calculateCommercial(rule, {
        baseAmountMinor: base, countryCode: 'KW', categoryId: 'other',
        providerUid: 'p', currency: 'KWD', calculatedAt: NOW,
      });
      expect(value.customerFeeMinor + value.providerFeeMinor).toBe(value.platformFeeMinor);
      expect(value.providerReceivableMinor + value.providerFeeMinor).toBe(base);
    }
  });

  test('covers fixed, percentage-plus-fixed, min and max calculation modes', () => {
    const legacy = buildLegacyCatalog().rules[0];
    const context = {
      baseAmountMinor: 1000, countryCode: 'SA', categoryId: 'cranes',
      providerUid: 'p', currency: 'SAR', calculatedAt: NOW,
    };
    const fixed = validateRule({
      ...legacy, currency: 'SAR', mode: 'fixed', percentageBps: 0,
      fixedAmountMinor: 125, maximumFeeMinor: 100,
    });
    expect(calculateCommercial(fixed, context).platformFeeMinor).toBe(100);
    const combined = validateRule({
      ...legacy, currency: 'SAR', mode: 'percentage_fixed', percentageBps: 100,
      fixedAmountMinor: 5, minimumFeeMinor: 20,
    });
    expect(calculateCommercial(combined, context).platformFeeMinor).toBe(20);
  });

  test('rejects conflicting schedules and finite global fallback gaps', () => {
    const legacy = buildLegacyCatalog();
    const scheduled = {
      ...legacy.rules[0], version: '10000000-0000-4000-8000-000000000040',
      status: 'scheduled' as const, effectiveFrom: '2026-02-01T00:00:00.000Z',
    };
    const draft = {
      ...legacy.rules[0], version: '10000000-0000-4000-8000-000000000041',
      status: 'draft' as const, effectiveFrom: '2026-03-01T00:00:00.000Z',
      createdAt: NOW, updatedAt: NOW,
    };
    let error = '';
    try {
      applyCommercialChange({ revision: 3, rules: [legacy.rules[0], scheduled, draft] }, {
        action: 'publish', expectedRevision: 3, reason: 'conflict', version: draft.version,
      }, 'admin', NOW);
    } catch (e) { error = String(e); }
    expect(error.includes('Conflicting future schedule')).toBe(true);

    const finiteDraft = {
      ...draft, version: '10000000-0000-4000-8000-000000000042',
      effectiveFrom: NOW, effectiveTo: '2026-04-01T00:00:00.000Z',
    };
    try {
      applyCommercialChange({ revision: 2, rules: [legacy.rules[0], finiteDraft] }, {
        action: 'publish', expectedRevision: 2, reason: 'gap', version: finiteDraft.version,
      }, 'admin', NOW);
    } catch (e) { error = String(e); }
    expect(error.includes('global fallback continuity')).toBe(true);
  });
});