import { describe, expect, test } from 'bun:test';
import { applyCommercialChange, buildApprovedCommercialCatalog, buildLegacyCatalog, calculateCommercial, resolveRule, type CommercialSnapshot } from './commercial';
import type { ServiceContractAggregate } from './service-contract';
import {
  HEAVYAR_TAP_MARKETPLACE_ID,
  HEAVYAR_TAP_MERCHANT_ID,
  buildRentalPreServicePaymentPlan,
  buildServicePreServicePaymentPlan,
  assertPreServiceProviderAssociation,
  preServicePaymentAssociation,
  preServicePaymentMetadata,
  preServicePaymentPublicView,
} from './pre-service-payment';

const NOW = '2026-10-18T12:00:00.000Z';
const CUSTOMER = 'customer-pre-service-0001';
const PROVIDER = 'provider-pre-service-0001';
const CATALOG = buildApprovedCommercialCatalog();

function commercial(baseAmountMinor = 100_000, overrides: Partial<CommercialSnapshot> = {}) {
  const snapshot = calculateCommercial(buildLegacyCatalog().rules[0], {
    baseAmountMinor,
    countryCode: 'SA',
    categoryId: 'excavators',
    providerUid: PROVIDER,
    currency: 'SAR',
    calculatedAt: '2026-10-18T08:00:00.000Z',
    taxAmountMinor: 15_000,
    taxReference: 'locked-rental-vat-evidence',
  });
  return { ...snapshot, ...overrides };
}

function destination(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    providerUid: PROVIDER,
    destinationId: '1234567890',
    merchantId: HEAVYAR_TAP_MERCHANT_ID,
    marketplaceId: HEAVYAR_TAP_MARKETPLACE_ID,
    environment: 'TEST',
    ownershipVerified: true,
    onboardingStatus: 'approved',
    payoutsEnabled: true,
    verifiedAt: '2026-10-18T10:00:00.000Z',
    validUntil: '2026-10-19T10:00:00.000Z',
    ...overrides,
  };
}

function rental(overrides: Record<string, unknown> = {}) {
  const snapshot = commercial();
  return {
    pricingModelVersion: 2,
    status: 'accepted',
    rentalMode: 'fixed_duration',
    customerUid: CUSTOMER,
    providerUid: PROVIDER,
    requestedStartAt: '2026-10-20T08:00:00.000Z',
    requestedEndAt: '2026-10-20T16:00:00.000Z',
    paymentStatus: 'unpaid',
    paymentState: null,
    commercialSnapshotStatus: 'estimated',
    commercialSnapshot: snapshot,
    pricingSnapshot: {
      snapshotId: 'rental-v2:rental_1:locked',
      baseAmountMinor: snapshot.baseAmountMinor,
      commercialTerms: snapshot,
    },
    ...overrides,
  };
}

function rentalPlan(request = rental(), destinationRecord = destination()) {
  return buildRentalPreServicePaymentPlan({
    requestId: 'rental_1', request, actorUid: CUSTOMER, environment: 'TEST', destination: destinationRecord,
    commercialCatalog: CATALOG, now: NOW,
  });
}

function serviceCommercial(kind: 'operator' | 'transporter') {
  const calculatedAt = '2026-10-18T08:00:00.000Z';
  const rule = resolveRule(CATALOG, {
    serviceKind: kind, countryCode: 'SA', categoryId: 'other', providerUid: PROVIDER,
    currency: 'SAR', at: calculatedAt,
  });
  return calculateCommercial(rule, {
    serviceKind: kind, baseAmountMinor: 100_000, countryCode: 'SA', categoryId: 'other',
    providerUid: PROVIDER, currency: 'SAR', calculatedAt, taxAmountMinor: 15_000,
    taxReference: 'locked-service-vat-evidence',
  });
}

function approvedContract(kind: 'operator' | 'transporter'): ServiceContractAggregate {
  return {
    contractVersion: 1,
    snapshot: {
      contractVersion: 1,
      contractId: `contract_${'C'.repeat(43)}`,
      rfqId: `rfq_${'R'.repeat(43)}`,
      rfqVersion: 1,
      rfqRevisionAtSelection: 4,
      serviceKind: kind,
      customerUid: CUSTOMER,
      providerPrincipal: { kind: 'individual', providerUid: PROVIDER },
      requirementsSnapshot: kind === 'operator' ? { equipmentSkill: 'excavators' } : { pickup: 'private' },
      quoteId: `quote_${'Q'.repeat(43)}`,
      quoteVersion: 2,
      quoteSnapshot: {
        contractVersion: 1,
        quoteVersion: 2,
        serviceScope: 'Approved service scope',
        schedule: { startAt: '2026-10-20T08:00:00.000Z', endAt: '2026-10-20T16:00:00.000Z' },
        inclusions: ['Service'], exclusions: [], serviceCategory: kind,
        availability: 'declared_available', currency: 'SAR', baseServicePriceMinor: 100_000,
        optionalComponents: [], quotedServicePriceMinor: 100_000,
        expiresAt: '2026-10-19T08:00:00.000Z', createdAt: '2026-10-18T08:00:00.000Z',
      },
      terms: { version: 'approved-service-terms-v1', source: 'approved_server', approvedForProduction: true },
      createdAt: '2026-10-18T08:00:00.000Z',
      acceptanceExpiresAt: '2026-10-19T08:00:00.000Z',
    },
    status: 'pending_payment', revision: 2,
    customerAcceptance: { role: 'customer', actorUid: CUSTOMER, acceptedAt: '2026-10-18T09:00:00.000Z', acceptedContractRevision: 1, termsVersion: 'approved-service-terms-v1' },
    providerAcceptance: { role: 'provider', actorUid: PROVIDER, acceptedAt: '2026-10-18T09:01:00.000Z', acceptedContractRevision: 2, termsVersion: 'approved-service-terms-v1' },
    paymentState: 'not_verified', bookingState: 'not_confirmed', executionAuthorized: false, settlementEnabled: false,
    updatedAt: '2026-10-18T09:01:00.000Z', operationHistory: [],
  } as unknown as ServiceContractAggregate;
}

describe('Launch Packet 2 pre-service payment integrity', () => {
  test('prepares an accepted fixed rental from the immutable 10 percent provider-paid snapshot', () => {
    const plan = rentalPlan();
    expect(plan.kind).toBe('equipment_rental');
    expect(plan.customerPayableMinor).toBe(115_000);
    expect(plan.providerReceivableMinor).toBe(90_000);
    expect(plan.marketplaceRemainderMinor).toBe(25_000);
    expect(plan.providerReceivableMinor + plan.marketplaceRemainderMinor).toBe(plan.customerPayableMinor);
    expect(plan.split).toEqual({ destinationId: '1234567890', amount: 900, currency: 'SAR' });
    expect(plan.commercialSnapshot.percentageBps).toBe(1000);
    expect(plan.paymentState).toBe('not_started');
    expect(plan.executionAuthorized).toBe(false);
  });

  test('public preparation never exposes destination identity, provider share, or private participant IDs', () => {
    const view = preServicePaymentPublicView(rentalPlan());
    expect(JSON.stringify(view)).not.toContain('1234567890');
    expect(JSON.stringify(view)).not.toContain(CUSTOMER);
    expect(JSON.stringify(view)).not.toContain(PROVIDER);
    expect(view.productionEnabled).toBe(false);
    expect(view.activation.enabled).toBe(false);
  });

  test('binds authoritative provider responses to the exact source, amount, environment, and destination', () => {
    const plan = rentalPlan();
    const association = preServicePaymentAssociation(plan, 'TEST');
    const metadata = preServicePaymentMetadata(association, 'quote:rental_1:locked', 'idempotency-1');
    expect(() => assertPreServiceProviderAssociation({
      id: 'chg_1', status: 'INITIATED', amount: 1150, currency: 'SAR', metadata,
      marketplaceSplits: [{ destinationId: '1234567890', amount: 900, currency: 'SAR' }],
    }, association, metadata)).not.toThrow();
    expect(() => assertPreServiceProviderAssociation({
      id: 'chg_1', status: 'INITIATED', amount: 1150, currency: 'SAR', metadata,
      marketplaceSplits: [{ destinationId: 'other_destination', amount: 900, currency: 'SAR' }],
    }, association, metadata)).toThrow('PROVIDER_ASSOCIATION_MISMATCH');
    expect(() => assertPreServiceProviderAssociation({
      id: 'chg_1', status: 'INITIATED', amount: 1150, currency: 'SAR', metadata: { ...metadata, sourceId: 'other' },
      marketplaceSplits: [{ destinationId: '1234567890', amount: 900, currency: 'SAR' }],
    }, association, metadata)).toThrow('PROVIDER_ASSOCIATION_MISMATCH');
  });

  test('rejects wrong actor, stale state, open-ended rental, unlocked quote, and nonzero deposit', () => {
    expect(() => buildRentalPreServicePaymentPlan({ requestId: 'rental_1', request: rental(), actorUid: 'other-account', environment: 'TEST', destination: destination(), commercialCatalog: CATALOG, now: NOW })).toThrow('RENTAL_PAYMENT_PREREQUISITES_NOT_MET');
    expect(() => rentalPlan(rental({ status: 'completed' }))).toThrow('RENTAL_PAYMENT_PREREQUISITES_NOT_MET');
    expect(() => rentalPlan(rental({ rentalMode: 'open_ended' }))).toThrow('RENTAL_PAYMENT_PREREQUISITES_NOT_MET');
    expect(() => rentalPlan(rental({ commercialSnapshotStatus: 'finalized' }))).toThrow('RENTAL_PAYMENT_QUOTE_NOT_LOCKED');
    expect(() => rentalPlan(rental({ refundableDepositMinor: 10_000 }))).toThrow('REFUNDABLE_DEPOSIT_NOT_SUPPORTED');
  });

  test('rejects unapproved or inconsistent rental pricing instead of using the future draft rate', () => {
    const draft = commercial(100_000, {
      ruleVersion: '20000000-0000-4000-8000-000000000020', percentageBps: 2000,
      platformFeeMinor: 20_000, providerFeeMinor: 20_000, providerReceivableMinor: 80_000,
    });
    expect(() => rentalPlan(rental({
      commercialSnapshot: draft,
      pricingSnapshot: { snapshotId: 'rental-v2:rental_1:locked', baseAmountMinor: 100_000, commercialTerms: draft },
    }))).toThrow('RENTAL_COMMISSION_POLICY_NOT_APPROVED');
    expect(() => rentalPlan(rental({
      pricingSnapshot: { ...rental().pricingSnapshot as object, commercialTerms: commercial(90_000) },
    }))).toThrow('COMMERCIAL_SNAPSHOT_INVALID');
  });

  test('accepts an exact published versioned equipment rule without hardcoding the legacy version', () => {
    const created = applyCommercialChange(CATALOG, {
      action: 'create', expectedRevision: 1, reason: 'Versioned equipment rate test', rule: {
        serviceKind: 'equipment_rental', effectiveFrom: null, effectiveTo: null, notes: '12 percent test',
        mode: 'percentage', percentageBps: 1200, fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null,
        payer: 'provider', customerShareBps: 0, scope: { countryCode: 'SA', categoryId: null, providerUid: null }, currency: 'SAR',
      },
    }, 'owner', '2026-10-18T08:00:00.000Z');
    const catalog = applyCommercialChange(created.catalog, {
      action: 'publish', expectedRevision: 2, reason: 'Publish versioned equipment rate', version: created.audit.version,
    }, 'owner', '2026-10-18T08:00:00.000Z').catalog;
    const rule = resolveRule(catalog, {
      serviceKind: 'equipment_rental', countryCode: 'SA', categoryId: 'excavators', providerUid: PROVIDER,
      currency: 'SAR', at: '2026-10-18T08:00:00.000Z',
    });
    const snapshot = calculateCommercial(rule, {
      serviceKind: 'equipment_rental', baseAmountMinor: 100_000, countryCode: 'SA', categoryId: 'excavators',
      providerUid: PROVIDER, currency: 'SAR', calculatedAt: '2026-10-18T08:00:00.000Z',
      taxAmountMinor: 15_000, taxReference: 'locked-rental-vat-evidence',
    });
    const request = rental({
      commercialSnapshot: snapshot,
      pricingSnapshot: { snapshotId: 'rental-v2:rental_1:locked', baseAmountMinor: 100_000, commercialTerms: snapshot },
    });
    const plan = buildRentalPreServicePaymentPlan({
      requestId: 'rental_1', request, actorUid: CUSTOMER, environment: 'TEST', destination: destination(),
      commercialCatalog: catalog, now: NOW,
    });
    expect(plan.commercialSnapshot.ruleVersion).toBe(created.audit.version);
    expect(plan.commercialSnapshot.percentageBps).toBe(1200);
    expect(plan.providerReceivableMinor).toBe(88_000);
  });

  test('requires an authoritative current destination for the same provider, marketplace, merchant, and environment', () => {
    for (const override of [
      { providerUid: 'other-provider' },
      { destinationId: HEAVYAR_TAP_MARKETPLACE_ID },
      { merchantId: 'wrong-heavyar-merchant' },
      { marketplaceId: 'mkt_other' },
      { environment: 'LIVE' },
      { onboardingStatus: 'pending' },
      { payoutsEnabled: false },
      { validUntil: NOW },
    ]) expect(() => rentalPlan(rental(), destination(override))).toThrow();
  });

  test('operator and transporter payment bind the accepted contract, quote, and approved server policy', () => {
    for (const kind of ['operator', 'transporter'] as const) {
      const contract = approvedContract(kind);
      const snapshot = serviceCommercial(kind);
      const result = buildServicePreServicePaymentPlan({
        contract, actorUid: CUSTOMER, environment: 'TEST', destination: destination(), now: NOW,
        approvedTerms: {
          approvalId: `commercial:${snapshot.ruleVersion}`, serviceKind: kind, approvedForProduction: true,
          legalTermsVersion: 'approved-service-terms-v1', commercialSnapshot: snapshot,
        },
        commercialCatalog: CATALOG,
      });
      expect(result.kind).toBe(`${kind}_service`);
      expect(result.sourceId).toBe(contract.snapshot.contractId);
      expect(result.sourceRevision).toBe(2);
      expect(result.quoteReference).toContain(`${contract.snapshot.quoteId}:2:`);
      expect(result.paymentState).toBe('not_started');
      expect(result.executionAuthorized).toBe(false);
      expect(result.commercialSnapshot.percentageBps).toBe(800);
      expect(result.providerReceivableMinor).toBe(92_000);
    }
  });

  test('operator and transporter fail closed without approved legal and commission terms', () => {
    const approved = approvedContract('operator');
    expect(() => buildServicePreServicePaymentPlan({
      contract: { ...approved, snapshot: { ...approved.snapshot, terms: { version: 'synthetic-local-test-v1', source: 'synthetic_local_test_only', approvedForProduction: false } } } as ServiceContractAggregate,
      actorUid: CUSTOMER, environment: 'TEST', destination: destination(), approvedTerms: null, commercialCatalog: CATALOG, now: NOW,
    })).toThrow('SERVICE_LEGAL_TERMS_NOT_APPROVED');
    expect(() => buildServicePreServicePaymentPlan({
      contract: approved, actorUid: CUSTOMER, environment: 'TEST', destination: destination(), approvedTerms: null, commercialCatalog: CATALOG, now: NOW,
    })).toThrow('SERVICE_COMMISSION_POLICY_NOT_APPROVED');
  });

  test('rejects stale, wrong-account, already-paid, or dispatch-authorized service state', () => {
    const contract = approvedContract('transporter');
    const transportSnapshot = serviceCommercial('transporter');
    const approvedTerms = {
      approvalId: `commercial:${transportSnapshot.ruleVersion}`, serviceKind: 'transporter' as const, approvedForProduction: true as const,
      legalTermsVersion: 'approved-service-terms-v1', commercialSnapshot: transportSnapshot,
    };
    for (const changed of [
      { ...contract, status: 'cancelled' },
      { ...contract, paymentState: 'verified' },
      { ...contract, executionAuthorized: true },
    ]) expect(() => buildServicePreServicePaymentPlan({ contract: changed as ServiceContractAggregate, actorUid: CUSTOMER, environment: 'TEST', destination: destination(), approvedTerms, commercialCatalog: CATALOG, now: NOW })).toThrow('SERVICE_PAYMENT_PREREQUISITES_NOT_MET');
    expect(() => buildServicePreServicePaymentPlan({ contract, actorUid: 'other-account', environment: 'TEST', destination: destination(), approvedTerms, commercialCatalog: CATALOG, now: NOW })).toThrow('SERVICE_PAYMENT_PREREQUISITES_NOT_MET');
  });
});
