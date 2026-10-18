import { minorToMajor, verifiedStoredCommercial, type CommercialSnapshot } from './commercial';
import type { ServiceContractAggregate } from './service-contract';
import type { ProviderPayment, TapEnvironment, TapMarketplaceSplit } from './payment';

export const HEAVYAR_TAP_MERCHANT_ID = '68049852' as const;
export const HEAVYAR_TAP_MARKETPLACE_ID = 'mkt_sbGZ426647Zxcj186R9Q305' as const;
export const PRE_SERVICE_PAYMENT_PRODUCTION_ACTIVATION =
  'disabled_pending_tap_destination_onboarding_financial_parity_and_owner_release' as const;

const SAFE_SOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_DESTINATION_ID = /^[A-Za-z0-9_-]{3,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type PreServicePaymentKind = 'equipment_rental' | 'operator_service' | 'transporter_service';

export class PreServicePaymentError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PreServicePaymentError';
  }
}

export type TapProviderDestination = Readonly<{
  schemaVersion: 1;
  providerUid: string;
  destinationId: string;
  merchantId: typeof HEAVYAR_TAP_MERCHANT_ID;
  marketplaceId: typeof HEAVYAR_TAP_MARKETPLACE_ID;
  environment: TapEnvironment;
  ownershipVerified: true;
  onboardingStatus: 'approved';
  payoutsEnabled: true;
  verifiedAt: string;
  validUntil: string;
}>;

export type ApprovedServiceCommercialTerms = Readonly<{
  approvalId: string;
  serviceKind: 'operator' | 'transporter';
  approvedForProduction: true;
  legalTermsVersion: string;
  commercialSnapshot: CommercialSnapshot;
}>;

export type PreServicePaymentPlan = Readonly<{
  version: 1;
  kind: PreServicePaymentKind;
  sourceId: string;
  sourceRevision: number;
  customerUid: string;
  providerUid: string;
  quoteReference: string;
  currency: 'SAR';
  customerPayableMinor: number;
  providerReceivableMinor: number;
  marketplaceRemainderMinor: number;
  customerPayableMajor: number;
  split: TapMarketplaceSplit;
  commercialSnapshot: CommercialSnapshot;
  paymentState: 'not_started';
  executionAuthorized: false;
  settlementEnabled: false;
  productionEnabled: false;
}>;

export type PreServicePaymentAssociation = Readonly<{
  version: 1;
  flow: 'pre_service';
  kind: PreServicePaymentKind;
  sourceId: string;
  sourceRevision: number;
  customerUid: string;
  providerUid: string;
  quoteReference: string;
  environment: TapEnvironment;
  merchantId: typeof HEAVYAR_TAP_MERCHANT_ID;
  marketplaceId: typeof HEAVYAR_TAP_MARKETPLACE_ID;
  destinationId: string;
  currency: 'SAR';
  customerPayableMinor: number;
  providerReceivableMinor: number;
  marketplaceRemainderMinor: number;
  customerPayableMajor: number;
  commercialSnapshot: CommercialSnapshot;
}>;

function fail(code: string): never {
  throw new PreServicePaymentError(code);
}

function canonicalIso(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString() === value ? value : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function preServicePaymentAssociation(
  planValue: PreServicePaymentPlan,
  environment: TapEnvironment,
): PreServicePaymentAssociation {
  return Object.freeze({
    version: 1,
    flow: 'pre_service',
    kind: planValue.kind,
    sourceId: planValue.sourceId,
    sourceRevision: planValue.sourceRevision,
    customerUid: planValue.customerUid,
    providerUid: planValue.providerUid,
    quoteReference: planValue.quoteReference,
    environment,
    merchantId: HEAVYAR_TAP_MERCHANT_ID,
    marketplaceId: HEAVYAR_TAP_MARKETPLACE_ID,
    destinationId: planValue.split.destinationId,
    currency: planValue.currency,
    customerPayableMinor: planValue.customerPayableMinor,
    providerReceivableMinor: planValue.providerReceivableMinor,
    marketplaceRemainderMinor: planValue.marketplaceRemainderMinor,
    customerPayableMajor: planValue.customerPayableMajor,
    commercialSnapshot: planValue.commercialSnapshot,
  });
}

export function preServicePaymentMetadata(
  association: PreServicePaymentAssociation,
  quoteId: string,
  idempotencyKey: string,
): Record<string, string> {
  return {
    paymentFlow: association.flow,
    sourceKind: association.kind,
    sourceId: association.sourceId,
    sourceRevision: String(association.sourceRevision),
    requestId: association.sourceId,
    customerUid: association.customerUid,
    providerUid: association.providerUid,
    quoteReference: association.quoteReference,
    quoteId,
    paymentEnvironment: association.environment,
    merchantId: association.merchantId,
    marketplaceId: association.marketplaceId,
    destinationId: association.destinationId,
    amount: String(association.customerPayableMajor),
    currency: association.currency,
    idempotencyKey,
  };
}

export function assertPreServiceProviderAssociation(
  payment: ProviderPayment,
  association: PreServicePaymentAssociation,
  expectedMetadata: Record<string, string>,
): void {
  const split = payment.marketplaceSplits;
  if (!payment.id || payment.amount !== association.customerPayableMajor || payment.currency !== association.currency ||
      Object.entries(expectedMetadata).some(([key, value]) => payment.metadata?.[key] !== value) ||
      !split || split.length !== 1 || split[0].destinationId !== association.destinationId ||
      split[0].amount !== Number(minorToMajor(association.providerReceivableMinor, association.currency)) ||
      split[0].currency !== association.currency) {
    fail('PROVIDER_ASSOCIATION_MISMATCH');
  }
}

function validateDestination(
  value: unknown,
  providerUid: string,
  environment: TapEnvironment,
  now: string,
): TapProviderDestination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('TAP_DESTINATION_UNAVAILABLE');
  const destination = value as Record<string, unknown>;
  const verifiedAt = canonicalIso(destination.verifiedAt);
  const validUntil = canonicalIso(destination.validUntil);
  if (destination.schemaVersion !== 1 || destination.providerUid !== providerUid ||
      typeof destination.destinationId !== 'string' || !SAFE_DESTINATION_ID.test(destination.destinationId) ||
      destination.destinationId === HEAVYAR_TAP_MARKETPLACE_ID ||
      destination.merchantId !== HEAVYAR_TAP_MERCHANT_ID || destination.marketplaceId !== HEAVYAR_TAP_MARKETPLACE_ID ||
      destination.environment !== environment || destination.ownershipVerified !== true ||
      destination.onboardingStatus !== 'approved' || destination.payoutsEnabled !== true ||
      !verifiedAt || !validUntil || Date.parse(validUntil) <= Date.parse(now)) {
    fail('TAP_DESTINATION_NOT_APPROVED');
  }
  return destination as TapProviderDestination;
}

function validateCommercial(
  value: unknown,
  providerUid: string,
  expectedBaseAmountMinor?: number,
  requireApprovedRentalPolicy = false,
): CommercialSnapshot {
  const snapshot = verifiedStoredCommercial(value, 'SAR');
  if (!snapshot || snapshot.providerUid !== providerUid || snapshot.countryCode !== 'SA' ||
      snapshot.currency !== 'SAR' || snapshot.gatewayFeeMinor !== null ||
      expectedBaseAmountMinor !== undefined && snapshot.baseAmountMinor !== expectedBaseAmountMinor) {
    fail('COMMERCIAL_SNAPSHOT_INVALID');
  }
  if (requireApprovedRentalPolicy && (snapshot.ruleVersion !== 'legacy-commission-v1' ||
      snapshot.ruleStatus !== 'active' || snapshot.mode !== 'percentage' || snapshot.percentageBps !== 1000 ||
      snapshot.fixedAmountMinor !== 0 || snapshot.payer !== 'provider' || snapshot.customerShareBps !== 0 ||
      snapshot.platformFeeMinor !== snapshot.providerFeeMinor || snapshot.customerFeeMinor !== 0)) {
    fail('RENTAL_COMMISSION_POLICY_NOT_APPROVED');
  }
  return snapshot;
}

function plan(
  input: {
    kind: PreServicePaymentKind;
    sourceId: string;
    sourceRevision: number;
    customerUid: string;
    providerUid: string;
    quoteReference: string;
    commercialSnapshot: CommercialSnapshot;
    destination: TapProviderDestination;
  },
): PreServicePaymentPlan {
  const { commercialSnapshot: commercial } = input;
  const marketplaceRemainderMinor = commercial.customerPayableMinor - commercial.providerReceivableMinor;
  if (marketplaceRemainderMinor < 0 ||
      commercial.providerReceivableMinor + marketplaceRemainderMinor !== commercial.customerPayableMinor) {
    fail('SPLIT_ACCOUNTING_MISMATCH');
  }
  const destinationAmount = Number(minorToMajor(commercial.providerReceivableMinor, commercial.currency));
  const customerPayableMajor = Number(minorToMajor(commercial.customerPayableMinor, commercial.currency));
  if (!Number.isFinite(destinationAmount) || !Number.isFinite(customerPayableMajor) ||
      destinationAmount <= 0 || customerPayableMajor <= 0) fail('SPLIT_ACCOUNTING_MISMATCH');
  return Object.freeze({
    version: 1,
    kind: input.kind,
    sourceId: input.sourceId,
    sourceRevision: input.sourceRevision,
    customerUid: input.customerUid,
    providerUid: input.providerUid,
    quoteReference: input.quoteReference,
    currency: 'SAR',
    customerPayableMinor: commercial.customerPayableMinor,
    providerReceivableMinor: commercial.providerReceivableMinor,
    marketplaceRemainderMinor,
    customerPayableMajor,
    split: Object.freeze({
      destinationId: input.destination.destinationId,
      amount: destinationAmount,
      currency: 'SAR' as const,
    }),
    commercialSnapshot: commercial,
    paymentState: 'not_started',
    executionAuthorized: false,
    settlementEnabled: false,
    productionEnabled: false,
  });
}

export function buildRentalPreServicePaymentPlan(input: {
  requestId: string;
  request: Record<string, unknown>;
  actorUid: string;
  environment: TapEnvironment;
  destination: unknown;
  now: string;
  allowExistingAttempt?: boolean;
}): PreServicePaymentPlan {
  const request = input.request;
  const sourceId = input.requestId;
  const providerUid = String(request.providerUid || '');
  const customerUid = String(request.customerUid || '');
  const startAt = canonicalIso(request.requestedStartAt);
  const endAt = canonicalIso(request.requestedEndAt);
  const paymentReady = ['', 'unpaid', undefined, null].includes(request.paymentStatus as never) &&
    [undefined, null, '', 'failed', 'cancelled', 'expired'].includes(request.paymentState as never);
  const existingAttempt = input.allowExistingAttempt === true && request.paymentStatus === 'pending_payment' &&
    ['pending', 'requires_action', 'processing'].includes(String(request.paymentState || '')) &&
    typeof request.paymentId === 'string' && request.paymentId.length > 0;
  if (!SAFE_SOURCE_ID.test(sourceId) || request.pricingModelVersion !== 2 || request.status !== 'accepted' ||
      request.rentalMode === 'open_ended' || !startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt) ||
      Date.parse(endAt) <= Date.parse(input.now) || customerUid !== input.actorUid || !customerUid || !providerUid ||
      !(paymentReady || existingAttempt)) {
    fail('RENTAL_PAYMENT_PREREQUISITES_NOT_MET');
  }
  const deposit = request.refundableDepositMinor ?? request.depositAmountMinor ?? 0;
  if (!Number.isSafeInteger(deposit) || Number(deposit) !== 0) fail('REFUNDABLE_DEPOSIT_NOT_SUPPORTED');
  const pricing = request.pricingSnapshot as Record<string, unknown> | null;
  const baseAmountMinor = Number(pricing?.baseAmountMinor);
  if (!pricing || !Number.isSafeInteger(baseAmountMinor) || baseAmountMinor <= 0 ||
      typeof pricing.snapshotId !== 'string' || pricing.snapshotId !== `rental-v2:${sourceId}:locked` ||
      request.commercialSnapshotStatus !== 'estimated') fail('RENTAL_PAYMENT_QUOTE_NOT_LOCKED');
  const commercial = validateCommercial(request.commercialSnapshot, providerUid, baseAmountMinor, true);
  const pricingCommercial = validateCommercial(pricing.commercialTerms, providerUid, baseAmountMinor, true);
  if (stableJson(commercial) !== stableJson(pricingCommercial)) fail('RENTAL_PAYMENT_QUOTE_NOT_LOCKED');
  const destination = validateDestination(input.destination, providerUid, input.environment, input.now);
  return plan({
    kind: 'equipment_rental', sourceId, sourceRevision: Number(request.revision || 0), customerUid, providerUid,
    quoteReference: String(pricing.snapshotId), commercialSnapshot: commercial, destination,
  });
}

export function buildServicePreServicePaymentPlan(input: {
  contract: ServiceContractAggregate;
  actorUid: string;
  environment: TapEnvironment;
  destination: unknown;
  approvedTerms: ApprovedServiceCommercialTerms | null;
  now: string;
}): PreServicePaymentPlan {
  const contract = input.contract;
  const providerUid = contract.snapshot.providerPrincipal.kind === 'individual'
    ? contract.snapshot.providerPrincipal.providerUid : '';
  const kind = contract.snapshot.serviceKind === 'operator' ? 'operator_service' : 'transporter_service';
  const terms = contract.snapshot.terms as unknown as {
    version: string;
    source: string;
    approvedForProduction: boolean;
  };
  if (contract.status !== 'pending_payment' || !contract.customerAcceptance || !contract.providerAcceptance ||
      contract.snapshot.customerUid !== input.actorUid || !providerUid || contract.paymentState !== 'not_verified' ||
      contract.bookingState !== 'not_confirmed' || contract.executionAuthorized || contract.settlementEnabled ||
      Date.parse(contract.snapshot.acceptanceExpiresAt) <= Date.parse(input.now)) {
    fail('SERVICE_PAYMENT_PREREQUISITES_NOT_MET');
  }
  if (terms.approvedForProduction !== true ||
      terms.source === 'synthetic_local_test_only') fail('SERVICE_LEGAL_TERMS_NOT_APPROVED');
  const approved = input.approvedTerms;
  if (!approved || approved.approvedForProduction !== true || approved.serviceKind !== contract.snapshot.serviceKind ||
      approved.legalTermsVersion !== terms.version || !approved.approvalId) {
    fail('SERVICE_COMMISSION_POLICY_NOT_APPROVED');
  }
  const quotedMinor = contract.snapshot.quoteSnapshot.quotedServicePriceMinor;
  const commercial = validateCommercial(approved.commercialSnapshot, providerUid, quotedMinor, false);
  const destination = validateDestination(input.destination, providerUid, input.environment, input.now);
  return plan({
    kind, sourceId: contract.snapshot.contractId, sourceRevision: contract.revision,
    customerUid: contract.snapshot.customerUid, providerUid,
    quoteReference: `${contract.snapshot.quoteId}:${contract.snapshot.quoteVersion}:${approved.approvalId}`,
    commercialSnapshot: commercial, destination,
  });
}

export function preServicePaymentPublicView(value: PreServicePaymentPlan) {
  return {
    version: value.version,
    kind: value.kind,
    sourceId: value.sourceId,
    sourceRevision: value.sourceRevision,
    quoteReference: value.quoteReference,
    currency: value.currency,
    customerPayableMinor: value.customerPayableMinor,
    paymentState: value.paymentState,
    executionAuthorized: value.executionAuthorized,
    settlementEnabled: value.settlementEnabled,
    productionEnabled: value.productionEnabled,
    activation: { enabled: false as const, reason: PRE_SERVICE_PAYMENT_PRODUCTION_ACTIVATION },
  };
}
