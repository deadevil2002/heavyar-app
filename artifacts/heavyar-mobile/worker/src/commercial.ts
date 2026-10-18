import { GCC_COUNTRIES } from '../../constants/gcc';
import { mockCategories } from '../../mocks/categories';

export type CommissionMode = 'percentage' | 'fixed' | 'percentage_fixed';
export type CommissionPayer = 'customer' | 'provider' | 'split';
export type CommissionStatus = 'draft' | 'active' | 'scheduled' | 'retired';
export type CommercialServiceKind = 'equipment_rental' | 'operator' | 'transporter';
export type CostEvidence = 'manual_estimate' | 'unknown';

export interface CommissionRule {
  /** Missing only on historical equipment rules created before service kinds existed. */
  serviceKind?: CommercialServiceKind;
  version: string;
  status: CommissionStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  notes: string;
  mode: CommissionMode;
  percentageBps: number;
  fixedAmountMinor: number;
  minimumFeeMinor: number;
  maximumFeeMinor: number | null;
  payer: CommissionPayer;
  customerShareBps: number;
  scope: { countryCode: string | null; categoryId: string | null; providerUid: string | null };
  currency: string;
}

export interface CommercialCatalog {
  revision: number;
  rules: CommissionRule[];
}

export interface CommercialSnapshot {
  /** Missing historical snapshots are explicitly interpreted as equipment rental. */
  serviceKind?: CommercialServiceKind;
  ruleVersion: string;
  ruleStatus: CommissionStatus;
  ruleEffectiveFrom?: string;
  ruleEffectiveTo?: string | null;
  ruleCurrency?: string;
  ruleNotes?: string;
  mode: CommissionMode;
  percentageBps: number;
  fixedAmountMinor: number;
  minimumFeeMinor: number;
  maximumFeeMinor: number | null;
  payer: CommissionPayer;
  customerShareBps: number;
  scope: CommissionRule['scope'];
  baseAmountMinor: number;
  platformFeeMinor: number;
  customerFeeMinor: number;
  providerFeeMinor: number;
  providerReceivableMinor: number;
  customerPayableMinor: number;
  taxAmountMinor: number | null;
  taxRateBps?: number | null;
  gatewayFeeMinor: number | null;
  currency: string;
  countryCode: string;
  categoryId: string;
  providerUid: string;
  calculatedAt: string;
  taxReference?: string;
}

export interface ProfitabilityInput {
  processingCostMinor: number | null;
  processingCostEvidence: CostEvidence;
  operationalCostMinor: number | null;
  operationalCostEvidence: CostEvidence;
  commissionVatTreatment: 'unknown' | 'not_applicable' | 'exclusive' | 'inclusive';
  commissionVatRateBps: number | null;
}

export interface ProfitabilityPreview {
  currency: string;
  commissionRevenueMinor: number;
  processingCost: { amountMinor: number | null; evidence: CostEvidence };
  operationalCost: { amountMinor: number | null; evidence: CostEvidence };
  commissionVat: {
    amountMinor: number | null;
    evidence: CostEvidence;
    treatment: ProfitabilityInput['commissionVatTreatment'];
    rateBps: number | null;
  };
  estimatedContributionMinor: number | null;
  warning: 'unknown_costs' | 'negative_contribution' | null;
  auditedNetProfit: false;
}

export type CommercialChangeCommand = {
  action: 'create' | 'publish' | 'retire';
  expectedRevision: number;
  reason: string;
  rule?: unknown;
  version?: string;
};

export interface CommercialChangeResult {
  catalog: CommercialCatalog;
  audit: {
    action: CommercialChangeCommand['action'];
    actorUid: string;
    at: string;
    reason: string;
    version: string;
    before: CommissionRule | null;
    after: CommissionRule | null;
    revisionBefore: number;
    revisionAfter: number;
    changes: { before: CommissionRule | null; after: CommissionRule | null }[];
  };
}

const COUNTRIES: Set<string> = new Set(GCC_COUNTRIES.map(c => c.code));
const CURRENCIES: Set<string> = new Set(GCC_COUNTRIES.map(c => c.currency));
const CATEGORIES: Set<string> = new Set(mockCategories.map(c => c.id));
const RULE_KEYS = new Set([
  'serviceKind',
  'version', 'status', 'effectiveFrom', 'effectiveTo', 'createdAt', 'createdBy',
  'updatedAt', 'updatedBy', 'notes', 'mode', 'percentageBps', 'fixedAmountMinor',
  'minimumFeeMinor', 'maximumFeeMinor', 'payer', 'customerShareBps', 'scope', 'currency',
]);
const TERM_KEYS = new Set([
  'serviceKind',
  'effectiveFrom', 'effectiveTo', 'notes', 'mode', 'percentageBps',
  'fixedAmountMinor', 'minimumFeeMinor', 'maximumFeeMinor', 'payer',
  'customerShareBps', 'scope', 'currency',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export const APPROVED_COMMISSION_DEFAULTS = Object.freeze({
  equipment_rental: Object.freeze({ percentageBps: 1_000, payer: 'provider' as const, countryCode: 'SA', currency: 'SAR' }),
  operator: Object.freeze({ percentageBps: 800, payer: 'provider' as const, countryCode: 'SA', currency: 'SAR' }),
  transporter: Object.freeze({ percentageBps: 800, payer: 'provider' as const, countryCode: 'SA', currency: 'SAR' }),
});

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  const unknown = Object.keys(value).find(k => !allowed.has(k));
  if (unknown) throw new Error(`Unknown ${label} field: ${unknown}`);
}
function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${label} must be a safe integer from ${min} to ${max}`);
  }
  return value as number;
}
function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`${label} must be a string`);
  return value.trim();
}
function iso(value: unknown, label: string): string {
  const input = text(value, label);
  if (!UTC.test(input)) throw new Error(`${label} must be an ISO UTC timestamp`);
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is invalid`);
  const canonicalInput = /\.\d{3}Z$/.test(input) ? input : input.replace(/Z$/, '.000Z');
  if (parsed.toISOString() !== canonicalInput) throw new Error(`${label} is not a real calendar timestamp`);
  return parsed.toISOString();
}
function optionalEnd(value: unknown, from: string): string | null {
  if (value === null) return null;
  const end = iso(value, 'effectiveTo');
  if (end <= from) throw new Error('effectiveTo must be after effectiveFrom');
  return end;
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new Error(`Invalid ${label}`);
  return value as T;
}
function safe(big: bigint, label: string): number {
  if (big < 0n || big > MAX_SAFE) throw new Error(`${label} is outside the safe integer range`);
  return Number(big);
}
function safeSigned(big: bigint, label: string): number {
  if (big < -MAX_SAFE || big > MAX_SAFE) throw new Error(`${label} is outside the safe integer range`);
  return Number(big);
}
function halfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

/** Number of ISO-4217 minor digits used by supported GCC currencies. */
export function currencyDecimals(currency: string): 2 | 3 {
  const code = currency.trim().toUpperCase();
  if (!CURRENCIES.has(code)) throw new Error('Unsupported GCC currency');
  return code === 'KWD' || code === 'BHD' || code === 'OMR' ? 3 : 2;
}

/** Converts a decimal major-unit string/number without binary floating-point arithmetic. */
export function majorToMinor(value: string | number, currency: string): number {
  const raw = typeof value === 'number' ? String(value) : value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error('Invalid non-negative decimal amount');
  const digits = currencyDecimals(currency);
  const [whole, fraction = ''] = raw.split('.');
  const scale = 10n ** BigInt(digits);
  const kept = fraction.slice(0, digits).padEnd(digits, '0');
  let result = BigInt(whole) * scale + BigInt(kept || '0');
  if (fraction.length > digits && Number(fraction[digits]) >= 5) result += 1n;
  return safe(result, 'amount');
}

export function minorToMajor(value: number, currency: string): string {
  const amount = BigInt(integer(value, 'minor amount'));
  const digits = currencyDecimals(currency);
  const scale = 10n ** BigInt(digits);
  return `${amount / scale}.${(amount % scale).toString().padStart(digits, '0')}`;
}

/**
 * Validates a persisted commercial snapshot before it is used as financial
 * evidence. Keep this aligned with the payment settlement invariants so
 * projections cannot reinterpret a malformed or cross-currency snapshot.
 */
export function verifiedStoredCommercial(snapshot: unknown, expectedCurrency: string): CommercialSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const value = snapshot as Record<string, unknown>;
  const currency = typeof value.currency === 'string' ? value.currency : '';
  if (!/^[A-Z]{3}$/.test(currency) || currency !== expectedCurrency) return null;
  if (value.serviceKind !== undefined && !['equipment_rental', 'operator', 'transporter'].includes(String(value.serviceKind))) return null;
  try { currencyDecimals(currency); } catch { return null; }
  const integerFields = [
    'baseAmountMinor', 'platformFeeMinor', 'customerFeeMinor', 'providerFeeMinor',
    'providerReceivableMinor', 'customerPayableMinor',
  ] as const;
  if (integerFields.some(field => !Number.isSafeInteger(value[field]) || Number(value[field]) < 0) ||
      value.taxAmountMinor !== null && (!Number.isSafeInteger(value.taxAmountMinor) || Number(value.taxAmountMinor) < 0) ||
      value.taxRateBps !== undefined && value.taxRateBps !== null && (!Number.isSafeInteger(value.taxRateBps) || Number(value.taxRateBps) < 0 || Number(value.taxRateBps) >= 10_000) ||
      value.gatewayFeeMinor !== null && (!Number.isSafeInteger(value.gatewayFeeMinor) || Number(value.gatewayFeeMinor) < 0)) return null;
  const base = BigInt(value.baseAmountMinor as number);
  const platformFee = BigInt(value.platformFeeMinor as number);
  const customerFee = BigInt(value.customerFeeMinor as number);
  const providerFee = BigInt(value.providerFeeMinor as number);
  const providerReceivable = BigInt(value.providerReceivableMinor as number);
  const customerPayable = BigInt(value.customerPayableMinor as number);
  const tax = BigInt((value.taxAmountMinor as number | null) ?? 0);
  if (customerFee + providerFee !== platformFee || providerReceivable !== base - providerFee || customerPayable !== base + customerFee + tax) return null;
  return value as unknown as CommercialSnapshot;
}

export function validateRule(input: any): CommissionRule {
  const r = object(input, 'rule');
  exactKeys(r, RULE_KEYS, 'rule');
  const version = text(r.version, 'version');
  if (version !== 'legacy-commission-v1' && !UUID.test(version)) throw new Error('version must be a UUID');
  const effectiveFrom = iso(r.effectiveFrom, 'effectiveFrom');
  const serviceKind = r.serviceKind === undefined ? undefined
    : enumValue(r.serviceKind, ['equipment_rental', 'operator', 'transporter'] as const, 'serviceKind');
  const scope = object(r.scope, 'scope');
  exactKeys(scope, new Set(['countryCode', 'categoryId', 'providerUid']), 'scope');
  const countryCode = scope.countryCode === null ? null : text(scope.countryCode, 'countryCode').toUpperCase();
  const categoryId = scope.categoryId === null ? null : text(scope.categoryId, 'categoryId');
  const providerUid = scope.providerUid === null ? null : text(scope.providerUid, 'providerUid');
  if (countryCode !== null && !COUNTRIES.has(countryCode)) throw new Error('Invalid GCC countryCode');
  if (categoryId !== null && !CATEGORIES.has(categoryId)) throw new Error('Invalid canonical categoryId');
  if (providerUid && (countryCode || categoryId)) throw new Error('Provider scope cannot mix country or category');
  if (serviceKind && serviceKind !== 'equipment_rental' && categoryId) throw new Error('Service rules cannot use equipment category scope');
  if (providerUid && providerUid.length > 128) throw new Error('providerUid exceeds 128 characters');
  const currency = text(r.currency, 'currency').toUpperCase();
  if (currency !== '*' && !CURRENCIES.has(currency)) throw new Error('Invalid GCC currency');
  if (countryCode && currency !== '*' && GCC_COUNTRIES.find(c => c.code === countryCode)?.currency !== currency) {
    throw new Error('Country-scoped rule currency must match the country currency');
  }
  const mode = enumValue(r.mode, ['percentage', 'fixed', 'percentage_fixed'] as const, 'mode');
  const percentageBps = integer(r.percentageBps, 'percentageBps', 0, 10_000);
  const fixedAmountMinor = integer(r.fixedAmountMinor, 'fixedAmountMinor');
  const minimumFeeMinor = integer(r.minimumFeeMinor, 'minimumFeeMinor');
  const maximumFeeMinor = r.maximumFeeMinor === null ? null : integer(r.maximumFeeMinor, 'maximumFeeMinor');
  if (maximumFeeMinor !== null && maximumFeeMinor < minimumFeeMinor) throw new Error('maximumFeeMinor is below minimumFeeMinor');
  if (currency === '*' && (mode !== 'percentage' || fixedAmountMinor || minimumFeeMinor || maximumFeeMinor !== null)) {
    throw new Error('Wildcard currency is only valid for percentage rules without currency-bound amounts');
  }
  if (mode === 'percentage' && fixedAmountMinor !== 0) throw new Error('Percentage mode cannot have a fixed amount');
  if (mode === 'fixed' && percentageBps !== 0) throw new Error('Fixed mode cannot have a percentage');
  const payer = enumValue(r.payer, ['customer', 'provider', 'split'] as const, 'payer');
  const customerShareBps = integer(r.customerShareBps, 'customerShareBps', 0, 10_000);
  if (payer === 'customer' && customerShareBps !== 10_000) throw new Error('Customer payer requires 10000 customerShareBps');
  if (payer === 'provider' && customerShareBps !== 0) throw new Error('Provider payer requires 0 customerShareBps');
  return {
    ...(serviceKind ? { serviceKind } : {}),
    version,
    status: enumValue(r.status, ['draft', 'active', 'scheduled', 'retired'] as const, 'status'),
    effectiveFrom,
    effectiveTo: optionalEnd(r.effectiveTo, effectiveFrom),
    createdAt: iso(r.createdAt, 'createdAt'),
    createdBy: text(r.createdBy, 'createdBy'),
    updatedAt: iso(r.updatedAt, 'updatedAt'),
    updatedBy: text(r.updatedBy, 'updatedBy'),
    notes: (() => {
      const notes = text(r.notes, 'notes', true);
      if (notes.length > 2_000) throw new Error('notes exceeds 2000 characters');
      return notes;
    })(),
    mode, percentageBps, fixedAmountMinor, minimumFeeMinor, maximumFeeMinor,
    payer, customerShareBps,
    scope: { countryCode, categoryId, providerUid },
    currency,
  };
}

export function buildLegacyCatalog(platformFeeRate = 0.10): CommercialCatalog {
  if (!Number.isFinite(platformFeeRate) || platformFeeRate < 0 || platformFeeRate > 1) throw new Error('Invalid platform fee rate');
  const bps = Math.round(platformFeeRate * 10_000);
  if (Math.abs(platformFeeRate * 10_000 - bps) > Number.EPSILON * 10_000) throw new Error('Rate must be representable in basis points');
  return {
    revision: 1,
    rules: [validateRule({
      version: 'legacy-commission-v1', status: 'active',
      effectiveFrom: '1970-01-01T00:00:00.000Z', effectiveTo: null,
      createdAt: '1970-01-01T00:00:00.000Z', createdBy: 'legacy',
      updatedAt: '1970-01-01T00:00:00.000Z', updatedBy: 'legacy',
      notes: 'Configured legacy provider-paid commission; tax is caller supplied.',
      mode: 'percentage', percentageBps: bps, fixedAmountMinor: 0,
      minimumFeeMinor: 0, maximumFeeMinor: null, payer: 'provider',
      customerShareBps: 0, scope: { countryCode: null, categoryId: null, providerUid: null },
      currency: '*',
    })],
  };
}

/**
 * Owner-approved source defaults for a first explicit persisted catalog.
 * The untouched legacy rule remains the equipment fallback; the additional
 * Saudi rules are separate immutable versions and are never written unless an
 * owner/super-admin performs the existing initialization mutation.
 */
export function buildApprovedCommercialCatalog(platformFeeRate = 0.10): CommercialCatalog {
  const legacy = buildLegacyCatalog(platformFeeRate);
  const base = legacy.rules[0];
  const approved = [
    {
      ...base, serviceKind: 'equipment_rental' as const,
      version: '10000000-0000-4000-8000-000000000010',
      scope: { countryCode: 'SA', categoryId: null, providerUid: null }, currency: 'SAR',
      percentageBps: APPROVED_COMMISSION_DEFAULTS.equipment_rental.percentageBps,
      notes: 'Owner-approved Saudi equipment rental commission: 10% provider-paid.',
    },
    {
      ...base, serviceKind: 'operator' as const,
      version: '10000000-0000-4000-8000-000000000011',
      scope: { countryCode: 'SA', categoryId: null, providerUid: null }, currency: 'SAR',
      percentageBps: APPROVED_COMMISSION_DEFAULTS.operator.percentageBps,
      notes: 'Owner-approved Saudi operator service commission: 8% service-provider-paid.',
    },
    {
      ...base, serviceKind: 'transporter' as const,
      version: '10000000-0000-4000-8000-000000000012',
      scope: { countryCode: 'SA', categoryId: null, providerUid: null }, currency: 'SAR',
      percentageBps: APPROVED_COMMISSION_DEFAULTS.transporter.percentageBps,
      notes: 'Owner-approved Saudi transporter service commission: 8% transporter-paid.',
    },
  ].map(validateRule);
  return { revision: legacy.revision, rules: [legacy.rules[0], ...approved] };
}

export function commercialServiceKind(value: Pick<CommissionRule, 'serviceKind'> | Pick<CommercialSnapshot, 'serviceKind'>): CommercialServiceKind {
  return value.serviceKind ?? 'equipment_rental';
}

type ResolutionInput = {
  serviceKind?: CommercialServiceKind;
  countryCode: string; categoryId: string; providerUid: string; currency: string; at?: string;
  /** Internal historical resolution for an already accepted quote. */
  historical?: boolean;
};

export function resolveRule(catalog: CommercialCatalog, input: ResolutionInput): CommissionRule {
  if (!Number.isSafeInteger(catalog.revision) || catalog.revision < 0 || !Array.isArray(catalog.rules)) throw new Error('Invalid catalog');
  const country = input.countryCode.trim().toUpperCase();
  const category = input.categoryId.trim();
  const provider = input.providerUid.trim();
  const serviceKind = input.serviceKind ?? 'equipment_rental';
  const currency = input.currency.trim().toUpperCase();
  if (!COUNTRIES.has(country)) throw new Error('Invalid GCC countryCode');
  if (!CATEGORIES.has(category)) throw new Error('Invalid canonical categoryId');
  if (!provider) throw new Error('providerUid is required');
  if (provider.length > 128) throw new Error('providerUid exceeds 128 characters');
  currencyDecimals(currency);
  if (GCC_COUNTRIES.find(c => c.code === country)?.currency !== currency) throw new Error('Context currency does not match country');
  const at = input.at === undefined ? new Date().toISOString() : iso(input.at, 'at');
  const candidates = catalog.rules.map(validateRule).filter(r =>
    commercialServiceKind(r) === serviceKind &&
    (r.status === 'active' || r.status === 'scheduled' || input.historical === true && r.status === 'retired' && r.effectiveTo !== null) &&
    r.effectiveFrom <= at && (r.effectiveTo === null || at < r.effectiveTo) &&
    (r.currency === currency || r.currency === '*') &&
    (!r.scope.providerUid || r.scope.providerUid === provider) &&
    (!r.scope.countryCode || r.scope.countryCode === country) &&
    (!r.scope.categoryId || r.scope.categoryId === category));
  const level = (r: CommissionRule) => r.scope.providerUid ? 5
    : r.scope.countryCode && r.scope.categoryId ? 4
      : r.scope.countryCode ? 3 : r.scope.categoryId ? 2 : 1;
  candidates.sort((a, b) => level(b) - level(a)
    || Number(b.currency === currency) - Number(a.currency === currency)
    || b.effectiveFrom.localeCompare(a.effectiveFrom)
    || b.version.localeCompare(a.version));
  if (!candidates.length) throw new Error('No applicable commission rule');
  const bestLevel = level(candidates[0]);
  const bestCurrency = candidates[0].currency === currency;
  if (candidates.slice(1).some(r => level(r) === bestLevel && (r.currency === currency) === bestCurrency)) {
    throw new Error('Ambiguous overlapping commission rules at the same precedence');
  }
  return candidates[0];
}

type CalculationInput = {
  serviceKind?: CommercialServiceKind;
  baseAmountMinor: number;
  countryCode: string;
  categoryId: string;
  providerUid: string;
  currency: string;
  calculatedAt?: string;
  taxAmountMinor?: number;
  taxReference?: string;
  gatewayFeeMinor?: number | null;
};

export function calculateCommercial(ruleInput: CommissionRule, input: CalculationInput): CommercialSnapshot {
  const rule = validateRule(ruleInput);
  const base = integer(input.baseAmountMinor, 'baseAmountMinor');
  const country = text(input.countryCode, 'countryCode').toUpperCase();
  const category = text(input.categoryId, 'categoryId');
  const provider = text(input.providerUid, 'providerUid');
  const serviceKind = input.serviceKind ?? commercialServiceKind(rule);
  if (commercialServiceKind(rule) !== serviceKind) throw new Error('Rule service kind does not match');
  if (!COUNTRIES.has(country)) throw new Error('Invalid GCC countryCode');
  if (!CATEGORIES.has(category)) throw new Error('Invalid canonical categoryId');
  if (provider.length > 128) throw new Error('providerUid exceeds 128 characters');
  const currency = input.currency.trim().toUpperCase();
  currencyDecimals(currency);
  if (GCC_COUNTRIES.find(c => c.code === country)?.currency !== currency) throw new Error('Context currency does not match country');
  if (rule.currency !== '*' && rule.currency !== currency) throw new Error('Rule currency does not match');
  if (rule.scope.countryCode && rule.scope.countryCode !== country) throw new Error('Rule country scope does not match');
  if (rule.scope.categoryId && rule.scope.categoryId !== category) throw new Error('Rule category scope does not match');
  if (rule.scope.providerUid && rule.scope.providerUid !== provider) throw new Error('Rule provider scope does not match');
  const percentage = halfUp(BigInt(base) * BigInt(rule.percentageBps), 10_000n);
  let fee = rule.mode === 'percentage' ? percentage
    : rule.mode === 'fixed' ? BigInt(rule.fixedAmountMinor)
      : percentage + BigInt(rule.fixedAmountMinor);
  if (fee < BigInt(rule.minimumFeeMinor)) fee = BigInt(rule.minimumFeeMinor);
  if (rule.maximumFeeMinor !== null && fee > BigInt(rule.maximumFeeMinor)) fee = BigInt(rule.maximumFeeMinor);
  const customerFee = halfUp(fee * BigInt(rule.customerShareBps), 10_000n);
  const providerFee = fee - customerFee;
  const providerReceivable = BigInt(base) - providerFee;
  if (providerReceivable < 0n) throw new Error('Commission produces a negative provider receivable');
  const tax = input.taxAmountMinor === undefined ? null : integer(input.taxAmountMinor, 'taxAmountMinor');
  const gateway = input.gatewayFeeMinor == null ? null : integer(input.gatewayFeeMinor, 'gatewayFeeMinor');
  const customerPayable = BigInt(base) + customerFee + BigInt(tax ?? 0);
  const calculatedAt = input.calculatedAt === undefined ? new Date().toISOString() : iso(input.calculatedAt, 'calculatedAt');
  const snapshot: CommercialSnapshot = {
    ...(rule.serviceKind || input.serviceKind ? { serviceKind } : {}),
    ruleVersion: rule.version, ruleStatus: rule.status,
    ruleEffectiveFrom: rule.effectiveFrom, ruleEffectiveTo: rule.effectiveTo,
    ruleCurrency: rule.currency, ruleNotes: rule.notes, mode: rule.mode,
    percentageBps: rule.percentageBps, fixedAmountMinor: rule.fixedAmountMinor,
    minimumFeeMinor: rule.minimumFeeMinor, maximumFeeMinor: rule.maximumFeeMinor,
    payer: rule.payer, customerShareBps: rule.customerShareBps, scope: { ...rule.scope },
    baseAmountMinor: base, platformFeeMinor: safe(fee, 'platform fee'),
    customerFeeMinor: safe(customerFee, 'customer fee'), providerFeeMinor: safe(providerFee, 'provider fee'),
    providerReceivableMinor: safe(providerReceivable, 'provider receivable'),
    customerPayableMinor: safe(customerPayable, 'customer payable'),
    taxAmountMinor: tax, gatewayFeeMinor: gateway, currency,
    countryCode: country, categoryId: category,
    providerUid: provider, calculatedAt,
  };
  if (input.taxReference !== undefined) snapshot.taxReference = text(input.taxReference, 'taxReference');
  return snapshot;
}

/**
 * Proves that a locked payment snapshot came from a persisted published rule
 * that was effective when the price was locked. Current retirement never
 * reprices or invalidates the historical snapshot; drafts can never qualify.
 */
export function approvedCommercialSnapshot(
  snapshotInput: unknown,
  catalog: CommercialCatalog,
  expectedServiceKind: CommercialServiceKind,
): CommercialSnapshot | null {
  const candidate = snapshotInput as Partial<CommercialSnapshot> | null;
  const currency = typeof candidate?.currency === 'string' ? candidate.currency : '';
  const snapshot = verifiedStoredCommercial(snapshotInput, currency);
  if (!snapshot || commercialServiceKind(snapshot) !== expectedServiceKind ||
      !['active', 'scheduled', 'retired'].includes(snapshot.ruleStatus) || !UTC.test(snapshot.calculatedAt)) return null;
  let rules: CommissionRule[];
  try { rules = catalog.rules.map(validateRule); } catch { return null; }
  const rule = rules.find(item => item.version === snapshot.ruleVersion && commercialServiceKind(item) === expectedServiceKind);
  if (!rule || rule.status === 'draft' || rule.effectiveFrom > snapshot.calculatedAt ||
      rule.effectiveTo !== null && snapshot.calculatedAt >= rule.effectiveTo ||
      rule.status === 'retired' && rule.effectiveTo === null) return null;
  let recomputed: CommercialSnapshot;
  try {
    recomputed = calculateCommercial(rule, {
      serviceKind: expectedServiceKind,
      baseAmountMinor: snapshot.baseAmountMinor,
      countryCode: snapshot.countryCode,
      categoryId: snapshot.categoryId,
      providerUid: snapshot.providerUid,
      currency: snapshot.currency,
      calculatedAt: snapshot.calculatedAt,
      ...(snapshot.taxAmountMinor === null ? {} : { taxAmountMinor: snapshot.taxAmountMinor }),
      ...(snapshot.taxReference === undefined ? {} : { taxReference: snapshot.taxReference }),
      gatewayFeeMinor: snapshot.gatewayFeeMinor,
    });
  } catch { return null; }
  const fields = [
    'serviceKind', 'ruleVersion', 'mode', 'percentageBps', 'fixedAmountMinor', 'minimumFeeMinor',
    'maximumFeeMinor', 'payer', 'customerShareBps', 'baseAmountMinor', 'platformFeeMinor',
    'customerFeeMinor', 'providerFeeMinor', 'providerReceivableMinor', 'customerPayableMinor',
    'taxAmountMinor', 'gatewayFeeMinor', 'currency', 'countryCode', 'categoryId', 'providerUid',
    'calculatedAt', 'taxReference',
  ] as const;
  const equivalent = fields.every(field => {
    if (field === 'serviceKind') return commercialServiceKind(recomputed) === commercialServiceKind(snapshot);
    return recomputed[field] === snapshot[field];
  });
  return equivalent && recomputed.scope.countryCode === snapshot.scope?.countryCode &&
    recomputed.scope.categoryId === snapshot.scope?.categoryId && recomputed.scope.providerUid === snapshot.scope?.providerUid
    ? snapshot : null;
}

export function calculateProfitabilityPreview(
  snapshotInput: CommercialSnapshot,
  input: ProfitabilityInput,
): ProfitabilityPreview {
  const snapshot = verifiedStoredCommercial(snapshotInput, snapshotInput.currency);
  if (!snapshot) throw new Error('Invalid commercial snapshot for profitability preview');
  const cost = (amount: number | null, evidence: CostEvidence, label: string) => {
    if (!['manual_estimate', 'unknown'].includes(evidence)) throw new Error(`Invalid ${label} evidence`);
    if (evidence === 'unknown') {
      if (amount !== null) throw new Error(`${label} must be null when unknown`);
      return { amountMinor: null, evidence };
    }
    return { amountMinor: integer(amount, label), evidence };
  };
  const processingCost = cost(input.processingCostMinor, input.processingCostEvidence, 'processingCostMinor');
  const operationalCost = cost(input.operationalCostMinor, input.operationalCostEvidence, 'operationalCostMinor');
  const treatment = enumValue(input.commissionVatTreatment,
    ['unknown', 'not_applicable', 'exclusive', 'inclusive'] as const, 'commissionVatTreatment');
  let commissionVatAmount: number | null = null;
  let commissionVatEvidence: CostEvidence = 'unknown';
  let rateBps: number | null = null;
  if (treatment === 'not_applicable') {
    if (input.commissionVatRateBps !== null) throw new Error('VAT rate must be null when not applicable');
    commissionVatAmount = 0;
    commissionVatEvidence = 'manual_estimate';
  } else if (treatment === 'exclusive' || treatment === 'inclusive') {
    rateBps = integer(input.commissionVatRateBps, 'commissionVatRateBps', 1, 9_999);
    const fee = BigInt(snapshot.platformFeeMinor);
    commissionVatAmount = treatment === 'exclusive'
      ? safe(halfUp(fee * BigInt(rateBps), 10_000n), 'commission VAT')
      : safe(fee - halfUp(fee * 10_000n, BigInt(10_000 + rateBps)), 'commission VAT');
    commissionVatEvidence = 'manual_estimate';
  } else if (input.commissionVatRateBps !== null) {
    throw new Error('VAT rate must be null when treatment is unknown');
  }
  const unknown = processingCost.amountMinor === null || operationalCost.amountMinor === null || commissionVatAmount === null;
  const contribution = unknown ? null : safeSigned(
    BigInt(snapshot.platformFeeMinor) - BigInt(processingCost.amountMinor!)
      - BigInt(operationalCost.amountMinor!) - BigInt(commissionVatAmount!),
    'estimated contribution',
  );
  return {
    currency: snapshot.currency,
    commissionRevenueMinor: snapshot.platformFeeMinor,
    processingCost,
    operationalCost,
    commissionVat: {
      amountMinor: commissionVatAmount,
      evidence: commissionVatEvidence,
      treatment,
      rateBps,
    },
    estimatedContributionMinor: contribution,
    warning: unknown ? 'unknown_costs' : contribution! < 0 ? 'negative_contribution' : null,
    auditedNetProfit: false,
  };
}

function sameSlot(a: CommissionRule, b: CommissionRule): boolean {
  return commercialServiceKind(a) === commercialServiceKind(b)
    && a.currency === b.currency
    && a.scope.countryCode === b.scope.countryCode
    && a.scope.categoryId === b.scope.categoryId
    && a.scope.providerUid === b.scope.providerUid;
}
function generatedVersion(actor: string, now: string, revision: number): string {
  // Server-owned deterministic UUID; client-supplied identity fields are rejected.
  let hash = 2166136261;
  for (const ch of `${actor}|${now}|${revision}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const h = (hash >>> 0).toString(16).padStart(8, '0');
  return `${h}-0000-4000-8000-${revision.toString(16).padStart(12, '0').slice(-12)}`;
}
function cloneRule(r: CommissionRule): CommissionRule {
  return { ...r, scope: { ...r.scope } };
}
function operationalStatus(r: CommissionRule, now: string): CommissionStatus {
  return r.status === 'scheduled' && r.effectiveFrom <= now ? 'active' : r.status;
}
function hasContinuousGlobalFallback(rules: CommissionRule[], currency: string, now: string, serviceKind: CommercialServiceKind): boolean {
  const intervals = rules.filter(r =>
    commercialServiceKind(r) === serviceKind &&
    !r.scope.countryCode && !r.scope.categoryId && !r.scope.providerUid
    && (operationalStatus(r, now) === 'active' || r.status === 'scheduled')
    && (r.currency === '*' || r.currency === currency)
    && (r.effectiveTo === null || r.effectiveTo > now));
  let point = now;
  for (let guard = 0; guard <= intervals.length; guard++) {
    const covering = intervals.filter(r => r.effectiveFrom <= point && (r.effectiveTo === null || r.effectiveTo > point));
    if (covering.some(r => r.effectiveTo === null)) return true;
    const next = covering.reduce<string | null>((max, r) =>
      r.effectiveTo !== null && (max === null || r.effectiveTo > max) ? r.effectiveTo : max, null);
    if (next === null || next <= point) return false;
    point = next;
  }
  return false;
}

export function applyCommercialChange(
  catalogInput: CommercialCatalog,
  command: CommercialChangeCommand,
  actorUid: string,
  nowInput: string,
): CommercialChangeResult {
  const now = iso(nowInput, 'now');
  const actor = text(actorUid, 'actorUid');
  if (actor.length > 128) throw new Error('actorUid exceeds 128 characters');
  const commandObject = object(command, 'command');
  exactKeys(commandObject, new Set(['action', 'expectedRevision', 'reason', 'rule', 'version']), 'command');
  const action = enumValue(commandObject.action, ['create', 'publish', 'retire'] as const, 'action');
  const reason = text(commandObject.reason, 'reason');
  if (reason.length > 2_000) throw new Error('reason exceeds 2000 characters');
  const revision = integer(catalogInput.revision, 'catalog revision');
  if (integer(command.expectedRevision, 'expectedRevision') !== revision) throw new Error('Catalog revision conflict');
  if (!Array.isArray(catalogInput.rules)) throw new Error('Invalid catalog rules');
  const rules = catalogInput.rules.map(validateRule).map(cloneRule);
  if (rules.length >= 400 && action === 'create') throw new Error('Commercial catalog capacity of 400 versions reached');
  let before: CommissionRule | null = null;
  let after: CommissionRule | null = null;
  let version = '';
  const changes: { before: CommissionRule | null; after: CommissionRule | null }[] = [];

  if (action === 'create') {
    if (!command.rule || command.version !== undefined) throw new Error('Create requires rule terms and forbids a client version');
    const terms = object(command.rule, 'rule');
    exactKeys(terms, TERM_KEYS, 'create rule');
    if (terms.effectiveFrom === undefined) throw new Error('effectiveFrom is required (use null for immediate)');
    const from = terms.effectiveFrom === null ? now : iso(terms.effectiveFrom, 'effectiveFrom');
    if (from < now) throw new Error('Backdated rule creation is forbidden; use null for immediate');
    version = generatedVersion(actor, now, revision + 1);
    if (rules.some(r => r.version === version)) throw new Error('Generated commission version already exists');
    after = validateRule({
      ...terms, serviceKind: terms.serviceKind ?? 'equipment_rental', version, status: 'draft', effectiveFrom: from,
      effectiveTo: terms.effectiveTo ?? null,
      createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor,
      notes: terms.notes ?? '',
    });
    rules.push(after);
    changes.push({ before: null, after: cloneRule(after) });
  } else {
    if (command.rule !== undefined) throw new Error(`${action} does not accept rule terms`);
    version = text(command.version, 'version');
    const index = rules.findIndex(r => r.version === version);
    if (index < 0) throw new Error('Commission rule version not found');
    before = cloneRule(rules[index]);
    if (action === 'publish') {
      if (before.status !== 'draft') throw new Error('Only a draft can be published');
      const from = before.effectiveFrom <= now ? now : before.effectiveFrom;
      if (before.effectiveTo !== null && from >= before.effectiveTo) throw new Error('Published rule would have an empty effective window');
      const target = before;
      const conflict = rules.find((r, i) => i !== index && sameSlot(r, target)
        && (r.status === 'active' || r.status === 'scheduled')
        && ((r.status === 'scheduled' && r.effectiveFrom > now)
          || (r.effectiveFrom >= from && (r.effectiveTo === null || r.effectiveTo > from))));
      if (conflict) throw new Error('Conflicting future schedule exists for this scope and currency');
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        if (i !== index && sameSlot(r, before) && operationalStatus(r, now) === 'active'
          && r.effectiveFrom < from && (r.effectiveTo === null || r.effectiveTo > from)) {
          const replacement = { ...r, effectiveTo: from, updatedAt: now, updatedBy: actor };
          rules[i] = replacement;
          changes.push({ before: cloneRule(r), after: cloneRule(replacement) });
        }
      }
      after = { ...before, effectiveFrom: from, status: from > now ? 'scheduled' : 'active', updatedAt: now, updatedBy: actor };
      rules[index] = after;
      changes.push({ before: cloneRule(before), after: cloneRule(after) });
    } else {
      const retiring = before;
      const effectiveStatus = operationalStatus(retiring, now);
      if (effectiveStatus !== 'active' && retiring.status !== 'scheduled') throw new Error('Only active or scheduled rules can be retired');
      if (retiring.status === 'scheduled' && retiring.effectiveFrom > now) {
        const predecessorIndex = rules.findIndex((r, i) => i !== index && sameSlot(r, retiring)
          && operationalStatus(r, now) === 'active' && r.effectiveTo === retiring.effectiveFrom);
        if (predecessorIndex >= 0) {
          const predecessor = rules[predecessorIndex];
          // Publication explicitly closed this predecessor at the cancelled start.
          // With only one permitted future schedule in a slot, reopening it is safe.
          const restored = { ...predecessor, effectiveTo: null, updatedAt: now, updatedBy: actor };
          rules[predecessorIndex] = restored;
          changes.push({ before: cloneRule(predecessor), after: cloneRule(restored) });
        }
      }
      after = {
        ...before, status: 'retired',
        effectiveTo: effectiveStatus === 'active' ? now : before.effectiveTo,
        updatedAt: now, updatedBy: actor,
      };
      rules[index] = after;
      changes.push({ before: cloneRule(before), after: cloneRule(after) });
    }
  }
  const touchedGlobalKinds = new Set(changes.flatMap(change => {
    const r = change.after ?? change.before;
    return r && !r.scope.countryCode && !r.scope.categoryId && !r.scope.providerUid
      && (action === 'publish' || action === 'retire') ? [commercialServiceKind(r)] : [];
  }));
  if ([...touchedGlobalKinds].some(kind => [...CURRENCIES].some(currency => !hasContinuousGlobalFallback(rules, currency, now, kind)))) {
    throw new Error('Change would create a gap in global fallback continuity');
  }
  const next = { revision: revision + 1, rules };
  return {
    catalog: next,
    audit: {
      action, actorUid: actor, at: now, reason, version,
      before, after: after && cloneRule(after),
      revisionBefore: revision, revisionAfter: next.revision, changes,
    },
  };
}
