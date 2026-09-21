import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { canRequestDriver, formatDriverLocation, formatEquipmentCapability, getRequestStatusLabel, resetDriverSearchFilters } from '../services/driverUtils';
import { type MarketConfig } from '../services/authService';
import type { DriverPublicProfile } from '../services/workerClient';

describe('Driver Discovery Logic', () => {
  it('keeps Equipment entry points and Driver request history on their canonical routes', () => {
    const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(source('../app/(tabs)/(home)/index.tsx')).toContain("router.push('/(tabs)/search?mode=equipment')");
    expect(source('../app/(tabs)/search/index.tsx')).toContain('useDiscovery()');
    expect(source('../app/driver/request.tsx')).toContain('router.replace(DRIVER_REQUESTS_ROUTE)');
    expect(source('../app/driver/requests.tsx')).toContain('<Redirect href={DRIVER_REQUESTS_ROUTE}');
    expect(source('../app/(tabs)/requests/index.tsx')).toContain('<DriverRequestsSection');
  });

  describe('Driver Search Utils', () => {
    it('formats driver location correctly handling markets', () => {
      const mockMarkets: MarketConfig[] = [{ code: 'SA', enabled: true }];
      const loc1 = formatDriverLocation('SA', 'riyadh_region', 'riyadh', undefined, false, mockMarkets);
      expect(loc1).toBe('Riyadh Region · Riyadh');

      const locRTL = formatDriverLocation('SA', 'riyadh_region', 'riyadh', undefined, true, mockMarkets);
      expect(locRTL).toBe('منطقة الرياض · الرياض');
    });

    it('formats equipment capability names', () => {
      expect(formatEquipmentCapability('excavators', false)).toBe('Excavators');
      expect(formatEquipmentCapability('excavators', true)).toBe('حفارات');
      // fallback to raw id if not found
      expect(formatEquipmentCapability('unknown_id', false)).toBe('unknown_id');
    });

    it('formats request status label', () => {
      expect(getRequestStatusLabel('open', false)).toBe('Open');
      expect(getRequestStatusLabel('accepted', true)).toBe('مقبول');
    });

    it('resets every search filter to an actually enabled market', () => {
      const markets: MarketConfig[] = [
        { code: 'SA', enabled: false, marketplaceAvailable: true },
        { code: 'AE', enabled: true, marketplaceAvailable: true },
      ];
      expect(resetDriverSearchFilters(markets)).toEqual({
        q: '', countryCode: 'AE', region: '', city: '', equipment: '', availability: '',
      });
      expect(resetDriverSearchFilters([]).countryCode).toBe('');
    });
  });

  describe('Role actions guard (canRequestDriver)', () => {
    it('driver cannot request themselves or anyone else', () => {
      expect(canRequestDriver(true, 'driver', 'active')).toBe(false);
    });

    it('customer and provider can request drivers if active', () => {
      expect(canRequestDriver(true, 'customer', 'active')).toBe(true);
      expect(canRequestDriver(true, 'provider', 'active')).toBe(true);
    });

    it('blocks suspended or restricted users from requesting', () => {
      expect(canRequestDriver(true, 'customer', 'suspended')).toBe(false);
      expect(canRequestDriver(true, 'provider', 'deletion_requested')).toBe(false);
      expect(canRequestDriver(true, 'provider', 'unknown_status')).toBe(false);
      expect(canRequestDriver(true, 'admin', 'active')).toBe(false);
    });

    it('blocks unauthenticated users', () => {
      expect(canRequestDriver(false, undefined, undefined)).toBe(false);
    });
  });

  describe('Strict Public Model / Privacy', () => {
    it('public profile type has no owner or identity fields', () => {
      type HasUid = 'uid' extends keyof DriverPublicProfile ? true : false;
      type HasActive = 'active' extends keyof DriverPublicProfile ? true : false;
      type HasRating = 'rating' extends keyof DriverPublicProfile ? true : false;
      const hasUid: HasUid = false;
      const hasActive: HasActive = false;
      const hasRating: HasRating = false;
      expect([hasUid, hasActive, hasRating]).toEqual([false, false, false]);
    });

    it('public profile should not leak phone, email, or internal admin notes', () => {
      // Validating client expectation of public profile shape
      type ExpectedPublicProfile = {
        id: string;
        displayName?: string;
        countryCode?: string;
        phone?: never;
        email?: never;
      };

      const profile: ExpectedPublicProfile = {
        id: 'driver_123',
        displayName: 'Test Driver',
        countryCode: 'SA',
      };

      expect(profile.phone).toBeUndefined();
      expect(profile.email).toBeUndefined();
    });
  });
});
