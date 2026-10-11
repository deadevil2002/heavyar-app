import { Timestamp } from 'firebase/firestore';
import type { EquipmentImage, EquipmentRequest, EquipmentRequestSnapshot, PublicUserSnapshot } from '@/types';
import {
  decodeCommercialSnapshot,
  decodeFinalRentalSnapshot,
  decodeRentalPricingSnapshot,
  reportInvalidRentalMoney,
} from './rentalV2';

export function firestoreValueToISOString(value: unknown): string {
  if (!value) return '';
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return '';
}

export function parseFirestoreImages(raw: unknown): EquipmentImage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && 'url' in item) {
      const object = item as Record<string, unknown>;
      return { url: (object.url as string) || '', publicId: (object.publicId as string) || '' };
    }
    return '';
  }).filter((image): image is EquipmentImage => image !== '');
}

export function parseFirestorePublicUser(raw: unknown, fallbackUid?: string): PublicUserSnapshot | undefined {
  if (!raw || typeof raw !== 'object') {
    return fallbackUid ? { uid: fallbackUid, nameAr: '', nameEn: '', avatar: '' } : undefined;
  }
  const object = raw as Record<string, unknown>;
  const uid = (object.uid as string) || fallbackUid || '';
  if (!uid) return undefined;
  return {
    uid,
    nameAr: (object.nameAr as string) || '',
    nameEn: (object.nameEn as string) || '',
    avatar: (object.avatar as string) || '',
  };
}

function parseRequestMode(raw: unknown): EquipmentRequest['requestMode'] {
  if (raw === 'fixed_days' || raw === 'hourly' || raw === 'daily' || raw === 'open_ended') return raw;
  if (raw === 'fixed_duration') return 'fixed_days';
  return undefined;
}

function requestDays(startDate: string, endDate: string): number | undefined {
  if (!startDate || !endDate) return undefined;
  const start = new Date(startDate); const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return undefined;
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
}

function parseEquipmentSnapshot(raw: unknown): EquipmentRequestSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const titleAr = typeof value.titleAr === 'string' ? value.titleAr : '';
  const titleEn = typeof value.titleEn === 'string' ? value.titleEn : '';
  if (!titleAr && !titleEn) return undefined;
  return { titleAr, titleEn, images: parseFirestoreImages(value.images),
    ...(typeof value.category === 'string' ? { category: value.category } : {}),
    ...(typeof value.countryCode === 'string' ? { countryCode: value.countryCode } : {}) };
}

export function parseFirestoreRequest(id: string, data: Record<string, unknown>): EquipmentRequest {
  const requestedStartAt = firestoreValueToISOString(data.requestedStartAt);
  const requestedEndAt = data.requestedEndAt ? firestoreValueToISOString(data.requestedEndAt) : null;
  const startDate = requestedStartAt || firestoreValueToISOString(data.startDate) || (data.startDate as string) || '';
  const endDate = requestedEndAt || firestoreValueToISOString(data.endDate) || (data.endDate as string) || '';
  const rentalMode = data.rentalMode === 'hourly' || data.rentalMode === 'daily' || data.rentalMode === 'open_ended' ? data.rentalMode : undefined;
  const requestMode = rentalMode || parseRequestMode(data.requestMode) || 'fixed_days';
  const pricingSnapshot = decodeRentalPricingSnapshot(data.pricingSnapshot);
  const finalRentalSnapshot = decodeFinalRentalSnapshot(data.finalRentalSnapshot);
  const commercialSnapshot = decodeCommercialSnapshot(data.commercialSnapshot);
  const finalCommercialSnapshot = decodeCommercialSnapshot(data.finalCommercialSnapshot);
  if (data.pricingModelVersion === 2 && !pricingSnapshot) reportInvalidRentalMoney({ context: 'firestore_request', code: 'INVALID_PRICING_SNAPSHOT', fields: ['pricingSnapshot'], requestId: id });
  if (data.finalRentalSnapshot != null && !finalRentalSnapshot) reportInvalidRentalMoney({ context: 'firestore_request', code: 'INVALID_FINAL_RENTAL_SNAPSHOT', fields: ['finalRentalSnapshot'], requestId: id });
  if (data.commercialSnapshot != null && !commercialSnapshot) reportInvalidRentalMoney({ context: 'firestore_request', code: 'INVALID_COMMERCIAL_SNAPSHOT', fields: ['commercialSnapshot'], requestId: id });
  if (data.finalCommercialSnapshot != null && !finalCommercialSnapshot) reportInvalidRentalMoney({ context: 'firestore_request', code: 'INVALID_COMMERCIAL_SNAPSHOT', fields: ['finalCommercialSnapshot'], requestId: id });
  const rawDays = typeof data.numberOfDays === 'number' ? data.numberOfDays : undefined;
  return {
    id, publicRequestNumber: typeof data.publicRequestNumber === 'string' ? data.publicRequestNumber : undefined,
    equipmentId: (data.equipmentId as string) || '', equipmentSnapshot: parseEquipmentSnapshot(data.equipmentSnapshot),
    customerUid: (data.customerUid as string) || '', customerPublic: parseFirestorePublicUser(data.customerPublic, (data.customerUid as string) || ''),
    providerUid: (data.providerUid as string) || '', providerPublic: parseFirestorePublicUser(data.providerPublic, (data.providerUid as string) || ''),
    status: (data.status as EquipmentRequest['status']) || 'pending', requestMode,
    pricingModelVersion: data.pricingModelVersion === 2 ? 2 : undefined, rentalMode,
    rateUnit: data.rateUnit === 'hourly' || data.rateUnit === 'daily' ? data.rateUnit : undefined,
    requestedStartAt: requestedStartAt || undefined, requestedEndAt,
    actualStartAt: data.actualStartAt ? firestoreValueToISOString(data.actualStartAt) : null,
    actualEndAt: data.actualEndAt ? firestoreValueToISOString(data.actualEndAt) : null,
    pricingSnapshot: pricingSnapshot || undefined, finalRentalSnapshot,
    cancellationReason: typeof data.cancellationReason === 'string' ? data.cancellationReason : undefined,
    completionRequestedBy: typeof data.completionRequestedBy === 'string' ? data.completionRequestedBy : undefined,
    numberOfDays: requestMode === 'fixed_days' ? (rawDays || requestDays(startDate, endDate)) : undefined,
    startDate, endDate, notes: (data.notes as string) || '', amount: (data.amount as number) || 0,
    platformFee: (data.platformFee as number) || 0, providerAmount: (data.providerAmount as number) || 0,
    paymentStatus: (data.paymentStatus as EquipmentRequest['paymentStatus']) || 'unpaid', paymentId: (data.paymentId as string) || '',
    paidAt: data.paidAt ? firestoreValueToISOString(data.paidAt) : null, currency: (data.currency as string) || 'SAR',
    allowChat: (data.allowChat as boolean) ?? false, pricePerDay: typeof data.pricePerDay === 'number' ? data.pricePerDay : undefined,
    startedAt: data.startedAt ? firestoreValueToISOString(data.startedAt) : undefined,
    endedAt: data.endedAt ? firestoreValueToISOString(data.endedAt) : undefined,
    finalAmount: typeof data.finalAmount === 'number' ? data.finalAmount : undefined,
    finalPlatformFee: typeof data.finalPlatformFee === 'number' ? data.finalPlatformFee : undefined,
    finalProviderAmount: typeof data.finalProviderAmount === 'number' ? data.finalProviderAmount : undefined,
    commercialSnapshot: commercialSnapshot || undefined,
    commercialSnapshotStatus: data.commercialSnapshotStatus === 'estimated' || data.commercialSnapshotStatus === 'finalized' ? data.commercialSnapshotStatus : undefined,
    finalCommercialSnapshot: finalCommercialSnapshot || undefined,
    createdAt: firestoreValueToISOString(data.createdAt), updatedAt: firestoreValueToISOString(data.updatedAt),
  };
}
