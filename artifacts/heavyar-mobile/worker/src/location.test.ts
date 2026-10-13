import { describe, expect, it } from 'vitest';
import { parsePreciseLocation } from './location';
import { parseV2RequestInput } from './rental-v2';
import { searchPublicEquipment } from './equipment-search';

describe('Worker precise-location boundary', () => {
  it('validates exact locations and treats 0,0 as unset', () => {
    expect(parsePreciseLocation({ lat: 24.7136, lng: 46.6753, instructions: ' Gate 2 ' })).toEqual({
      lat: 24.7136, lng: 46.6753, instructions: 'Gate 2',
    });
    for (const location of [
      { lat: 0, lng: 0 }, { lat: 91, lng: 46 }, { lat: 24, lng: -181 },
      { lat: '24', lng: 46 }, { lat: NaN, lng: 46 }, { lat: 24, lng: Infinity },
    ]) expect(() => parsePreciseLocation(location)).toThrow();
    expect(parsePreciseLocation(undefined, false)).toBeUndefined();
  });

  it('accepts only the bounded work-site location contract on V2 requests', () => {
    const input = parseV2RequestInput({
      pricingModelVersion: 2, equipmentId: 'equipment-1', rentalMode: 'daily', rateUnit: 'daily',
      requestedStartAt: '2026-10-14T21:00:00.000Z', requestedEndAt: '2026-10-15T21:00:00.000Z',
      expectedRateAmountMinor: 10000, workSiteLocation: { lat: 24.7136, lng: 46.6753 },
    });
    expect(input.workSiteLocation).toEqual({ lat: 24.7136, lng: 46.6753 });
    expect(() => parseV2RequestInput({ ...input, workSiteLocation: { lat: 0, lng: 0 } })).toThrow('Invalid location coordinates');
  });

  it('never exposes exact equipment coordinates through public projection', async () => {
    const result = await searchPublicEquipment(new Request('https://worker/api/equipment/search?country=SA'), {
      projectId: 'heavyar-app',
      isMarketplaceEnabled: async () => true,
      runQuery: async () => [{
        name: 'projects/heavyar-app/databases/(default)/documents/equipment/equipment-1',
        data: {
          isActive: true, visibility: 'visible', moderationStatus: 'approved', countryCode: 'SA',
          titleAr: 'حفار', titleEn: 'Excavator', location: { lat: 24.7136, lng: 46.6753, instructions: 'private' },
        },
      }],
    });
    expect(result.status).toBe(200);
    expect(result.body.equipment?.[0]).not.toHaveProperty('location');
  });
});
