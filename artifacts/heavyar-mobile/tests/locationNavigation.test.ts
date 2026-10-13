import { describe, expect, it } from 'vitest';
import {
  buildPreciseLocation,
  decodePreciseLocation,
  isValidCoordinate,
  mapTilerStyleUrl,
  navigationUrls,
} from '../services/location';
import { buildRentalRequestPayload } from '../services/rentalV2';

describe('precise location contracts', () => {
  it('accepts finite in-range coordinates and bounded optional instructions', () => {
    expect(decodePreciseLocation({ lat: 24.7136, lng: 46.6753, instructions: ' Gate 2 ' })).toEqual({
      lat: 24.7136, lng: 46.6753, instructions: 'Gate 2',
    });
    expect(buildPreciseLocation({ lat: -90, lng: 180 })).toEqual({ lat: -90, lng: 180 });
  });

  it.each([
    [0, 0], [91, 46], [-91, 46], [24, 181], [24, -181], [NaN, 46], [24, Infinity], ['24', 46], [null, 46],
  ])('rejects invalid or unset coordinates (%s, %s)', (lat, lng) => {
    expect(isValidCoordinate(lat, lng)).toBe(false);
    expect(decodePreciseLocation({ lat, lng })).toBeNull();
  });

  it('rejects unbounded, control-bearing, or mass-assigned location payloads', () => {
    expect(decodePreciseLocation({ lat: 24, lng: 46, instructions: 'x'.repeat(501) })).toBeNull();
    expect(decodePreciseLocation({ lat: 24, lng: 46, instructions: 'bad\u0000value' })).toBeNull();
    expect(decodePreciseLocation({ lat: 24, lng: 46, ownerUid: 'attacker' })).toBeNull();
  });

  it('fails clearly without a MapTiler key and encodes a configured style key', () => {
    expect(mapTilerStyleUrl('')).toBeNull();
    expect(mapTilerStyleUrl('valid_key-123')).toBe('https://api.maptiler.com/maps/streets-v4/style.json?key=valid_key-123');
  });

  it('builds safe native and browser navigation destinations', () => {
    const urls = navigationUrls({ lat: 24.7136, lng: 46.6753 }, 'Work site');
    expect(urls.android).toContain('geo:0,0?q=24.713600%2C46.675300');
    expect(urls.apple).toMatch(/^https:\/\/maps\.apple\.com\//);
    expect(urls.google).toMatch(/^comgooglemaps:\/\//);
    expect(urls.waze).toMatch(/^waze:\/\//);
    expect(urls.browser).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
  });

  it('preserves only a validated static work-site location in the rental payload', () => {
    const payload = buildRentalRequestPayload({
      equipmentId: 'equipment-1', pricingModelVersion: 2, rentalMode: 'daily', rateUnit: 'daily',
      expectedRateAmountMinor: 10000, requestedStartAt: '2026-10-14T21:00:00.000Z',
      requestedEndAt: '2026-10-15T21:00:00.000Z',
      workSiteLocation: { lat: 24.7136, lng: 46.6753, instructions: ' North gate ' },
    });
    expect(payload.workSiteLocation).toEqual({ lat: 24.7136, lng: 46.6753, instructions: 'North gate' });
    expect(() => buildRentalRequestPayload({ ...payload, workSiteLocation: { lat: 0, lng: 0 } })).toThrow('INVALID_WORK_SITE_LOCATION');
  });
});
