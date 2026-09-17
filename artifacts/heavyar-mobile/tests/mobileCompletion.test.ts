import { describe, expect, it, vi, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadEquipmentView, saveEquipmentView } from '../services/equipmentViewPreference';
import { requestPasswordReset } from '../services/passwordReset';
import { dateOnly, listingLifecyclePath, lifecycleOutcomeMessage } from '../services/listingContracts';
import { sanitizeCreateListingPayload, sanitizeListingPayload } from '../services/listingPayload';
import { driverRequestActions } from '../services/driverRequestContract';

vi.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return { default: { getItem: vi.fn((key: string) => Promise.resolve(values.get(key) ?? null)), setItem: vi.fn((key: string, value: string) => { values.set(key, value); return Promise.resolve(); }) } };
});

describe('mobile completion contracts', () => {
  beforeEach(() => vi.clearAllMocks());
  it('persists only the equipment view preference', async () => {
    await saveEquipmentView('grid');
    expect(await loadEquipmentView()).toBe('grid');
    await saveEquipmentView('list');
    expect(await loadEquipmentView()).toBe('list');
  });

  it('normalizes reset email and collapses account errors', async () => {
    const send = vi.fn().mockRejectedValue(new Error('auth/user-not-found'));
    expect(await requestPasswordReset(send, ' User@Example.COM ')).toBe('unavailable');
    expect(send).toHaveBeenCalledWith('user@example.com');
    expect(await requestPasswordReset(send, 'not-an-email')).toBe('invalid');
  });

  it('uses trusted lifecycle routes and preserves history outcomes', () => {
    expect(listingLifecyclePath('a/b', 'archive')).toBe('/api/listings/a%2Fb/archive');
    expect(listingLifecyclePath('a/b', 'delete')).toBe('/api/listings/a%2Fb');
    expect(lifecycleOutcomeMessage({ action: 'archived', preservedRentalHistory: true })).toBe('archived_history');
    expect(dateOnly(new Date('2027-04-05T16:00:00.000Z'))).toBe('2027-04-05');
  });

  it('excludes privileged listing fields from create and edit payloads', () => {
    const payload = sanitizeListingPayload({ titleAr: 'معدة', images: [], ownerUid: 'attacker', isActive: true, moderationStatus: 'active', createdAt: 'bad' });
    expect(payload).toEqual({ titleAr: 'معدة', images: [], isActive: true });
    expect(payload).not.toHaveProperty('ownerUid');
    expect(payload).not.toHaveProperty('moderationStatus');
    expect(sanitizeCreateListingPayload({ titleAr: 'معدة', isActive: true })).toEqual({ titleAr: 'معدة' });
  });

  it('only exposes driver accept/decline and requester close actions', async () => {
    expect(driverRequestActions({ requesterUid: 'customer', driverUid: 'driver', status: 'open' }, 'driver')).toEqual({ canAccept: true, canDecline: true, canClose: false });
    expect(driverRequestActions({ requesterUid: 'customer', driverUid: 'driver', status: 'accepted' }, 'customer')).toEqual({ canAccept: false, canDecline: false, canClose: true });
    expect(driverRequestActions({ requesterUid: 'customer', driverUid: 'driver', status: 'open' }, 'other')).toEqual({ canAccept: false, canDecline: false, canClose: false });
  });
});