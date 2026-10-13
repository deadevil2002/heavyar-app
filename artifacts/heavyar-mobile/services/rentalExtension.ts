import type { CommercialSnapshot, RentalExtension, RentalExtensionEstimate, RentalExtensionStatus } from '@/types';
import { decodeCommercialSnapshot } from './rentalV2';

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const iso = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const currency = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const rateUnit = (value: unknown): value is 'hourly' | 'daily' => value === 'hourly' || value === 'daily';
const status = (value: unknown): value is RentalExtensionStatus => ['pending_provider', 'awaiting_payment_integration', 'declined', 'expired'].includes(String(value));

function common(raw: unknown) {
  const value = record(raw);
  if (!value
      || !iso(value.originalEndAt) || !iso(value.proposedEndAt) || value.proposedEndAt <= value.originalEndAt
      || !positiveInteger(value.additionalDurationMinutes)
      || !positiveInteger(value.additionalBillableUnits)
      || !positiveInteger(value.additionalBaseAmountMinor)
      || !currency(value.currency)
      || !Number.isSafeInteger(value.currencyDecimals) || Number(value.currencyDecimals) < 0 || Number(value.currencyDecimals) > 3
      || !rateUnit(value.rateUnit)
      || !iso(value.expiresAt)
      || value.paymentActivation !== 'blocked_unverified') return null;
  return value;
}

export function decodeRentalExtension(raw: unknown): RentalExtension | null {
  const value = common(raw);
  if (!value || typeof value.id !== 'string' || !/^ext_[A-Za-z0-9]{16,128}$/.test(value.id)
      || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.requestId)
      || !status(value.status) || !iso(value.createdAt) || !iso(value.updatedAt)) return null;
  return value as unknown as RentalExtension;
}

export function decodeRentalExtensionEstimate(raw: unknown): RentalExtensionEstimate | null {
  const value = common(raw);
  const commercial = value ? decodeCommercialSnapshot(value.commercial) : null;
  if (!value || !commercial) return null;
  return { ...value, commercial } as unknown as RentalExtensionEstimate;
}

export function extensionPaymentIsActivatable(_extension: Pick<RentalExtension, 'paymentActivation' | 'status'>): false {
  // Tap additional-payment / split settlement has not been verified. This
  // source phase intentionally has no activation path.
  return false;
}

export type { CommercialSnapshot };
