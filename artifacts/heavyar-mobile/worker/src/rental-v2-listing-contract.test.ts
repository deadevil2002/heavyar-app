import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import worker, { __test, type Env } from './index';

type Json = Record<string, any>;

let privateKey = '';
const originalFetch = globalThis.fetch;
const provider = {
  uid: 'provider-1',
  role: 'provider',
  nameAr: 'مزود',
  nameEn: 'Provider',
  avatar: '',
  countryCode: 'SA',
  region: 'riyadh',
  city: 'riyadh',
  termsAccepted: true,
};

const env = () => ({
  CORS_ORIGINS: 'http://localhost',
  FIREBASE_PROJECT_ID: 'listing-contract-test',
  FIREBASE_CLIENT_EMAIL: 'listing-contract-test@example.test',
  FIREBASE_PRIVATE_KEY: privateKey,
}) as Env;

function formPayload(pricing: Json) {
  return {
    titleAr: 'حفار',
    titleEn: 'Excavator',
    descriptionAr: 'وصف',
    descriptionEn: 'Description',
    category: 'excavators',
    customCategory: '',
    region: 'riyadh',
    city: 'riyadh',
    customCity: '',
    district: '',
    location: { lat: 0, lng: 0 },
    pricingModelVersion: 2,
    pricing,
    countryCode: 'SA',
    nativeCurrency: 'SAR',
    displayCurrency: 'SAR',
    images: [{ url: 'https://res.cloudinary.com/demo/image/upload/x.png', publicId: 'heavyar/provider-1/x' }],
    availability: { from: '2099-01-01', temporarilyUnavailable: false },
  };
}

function request(path: string, method: 'POST' | 'PATCH', body: unknown) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function installProviderFixture(extra?: (collection: string, id: string) => any) {
  __test.setAuth({ uid: provider.uid, admin: false, emailVerified: true });
  __test.setFirestore((collection, id) => {
    if (collection === 'users') return provider;
    if (collection === 'publicIdentifierCounters') return { nextSequence: 1 };
    return extra?.(collection, id) ?? null;
  });
}

beforeAll(async () => {
  const keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 1024, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  privateKey = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey))));
});

beforeEach(() => {
  __test.setAuth();
  __test.setFirestore();
  __test.captureCommits();
  __test.captureWrites();
  __test.setPublicEquipmentLimiter();
  __test.resetMutationLimits();
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  __test.setAuth();
  __test.setFirestore();
  __test.captureCommits();
  __test.captureWrites();
  __test.setPublicEquipmentLimiter();
  __test.resetMutationLimits();
  globalThis.fetch = originalFetch;
});

describe('Provider form to Worker V2 listing contract', () => {
  it('creates hourly-only, daily-only, and both-rate listings from the exact Add form shape', async () => {
    installProviderFixture();
    const commits: any[] = [];
    __test.captureCommits(commits);
    const combinations = [
      {
        hourly: { enabled: true, amountMinor: 12000 },
        daily: { enabled: false, amountMinor: 0 },
      },
      {
        hourly: { enabled: false, amountMinor: 0 },
        daily: { enabled: true, amountMinor: 150000 },
      },
      {
        hourly: { enabled: true, amountMinor: 12000 },
        daily: { enabled: true, amountMinor: 150000 },
      },
    ];

    for (const rates of combinations) {
      const payload = formPayload({ currency: 'SAR', ...rates });
      // The current Add form sends no legacy pricePerDay fallback. V2 must
      // therefore bypass the old positive-major-price validation entirely.
      expect(Object.hasOwn(payload, 'pricePerDay')).toBe(false);
      const response = await worker.fetch(request('/api/listings', 'POST', payload), env());
      const body: any = await response.json();
      expect(response.status).toBe(201);
      expect(body.listing).toMatchObject({
        pricingModelVersion: 2,
        pricing: { currency: 'SAR', ...rates },
        countryCode: 'SA',
        nativeCurrency: 'SAR',
      });
      expect(body.listing.pricePerDay).toBeUndefined();
      expect(body.listing.nativePricePerDay).toBeUndefined();
    }

    expect(commits).toHaveLength(3);
    for (const writes of commits) {
      const listingWrite = writes.find((write: any) => String(write.update?.name).includes('/equipment/'));
      expect(listingWrite.update.fields.pricingModelVersion.doubleValue).toBe(2);
      expect(listingWrite.update.fields.pricing.mapValue.fields.currency.stringValue).toBe('SAR');
      expect(listingWrite.update.fields.nativeCurrency.stringValue).toBe('SAR');
      expect(listingWrite.update.fields.pricePerDay).toBeUndefined();
    }
  });

  it('upgrades a legacy listing through the exact Edit form patch without rewriting old requests', async () => {
    const legacyListing = {
      ownerUid: provider.uid,
      countryCode: 'SA',
      nativeCurrency: 'SAR',
      pricePerDay: 900,
      nativePricePerDay: 900,
      isActive: true,
      visibility: 'visible',
      moderationStatus: 'approved',
      titleAr: 'حفار',
      titleEn: 'Excavator',
    };
    installProviderFixture((collection, id) =>
      collection === 'equipment' && id === 'legacy-1' ? legacyListing : null,
    );
    const writes: Array<{ path: string; fields: Json }> = [];
    __test.captureWrites(writes);
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'test-token', expires_in: 3600 });
      }
      if (url.endsWith('/documents:runQuery')) {
        const oldRequest = {
          name: 'projects/listing-contract-test/databases/(default)/documents/equipmentRequests/old-completed',
          fields: {
            equipmentId: { stringValue: 'legacy-1' },
            status: { stringValue: 'completed' },
            pricePerDay: { doubleValue: 900 },
            amount: { doubleValue: 1800 },
          },
        };
        return Response.json([{ document: oldRequest }, { readTime: '2099-01-01T00:00:00.000Z' }]);
      }
      throw new Error(`Unexpected network call: ${init?.method || 'GET'} ${url}`);
    };

    const pricing = {
      currency: 'SAR',
      hourly: { enabled: true, amountMinor: 10000 },
      daily: { enabled: true, amountMinor: 100000 },
    };
    const addShape = formPayload(pricing);
    const {
      countryCode: _countryCode,
      nativeCurrency: _nativeCurrency,
      displayCurrency: _displayCurrency,
      location: _location,
      ...editPayload
    } = addShape;
    const response = await worker.fetch(request('/api/listings/legacy-1', 'PATCH', {
      ...editPayload,
      isActive: true,
    }), env());
    const body: any = await response.json();

    expect(response.status).toBe(200);
    expect(body.listing).toMatchObject({ pricingModelVersion: 2, pricing });
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('equipment/legacy-1');
    expect(writes[0].fields.pricingModelVersion).toEqual({ doubleValue: 2 });
    expect(writes[0].fields.pricing.mapValue.fields.daily.mapValue.fields.amountMinor.doubleValue).toBe(100000);
    expect(writes.some(write => write.path.startsWith('equipmentRequests/'))).toBe(false);
    expect(legacyListing).toMatchObject({ pricePerDay: 900, nativePricePerDay: 900 });
  });

  it('keeps V2 pricing in the public marketplace projection', async () => {
    const pricing = {
      currency: 'SAR',
      hourly: { enabled: true, amountMinor: 12000 },
      daily: { enabled: false, amountMinor: 0 },
    };
    installProviderFixture((collection) => collection === '__queries' ? [{
      id: 'v2-public',
      data: {
        isActive: true,
        visibility: 'visible',
        moderationStatus: 'approved',
        countryCode: 'SA',
        nativeCurrency: 'SAR',
        pricingModelVersion: 2,
        pricing,
        titleAr: 'حفار',
        titleEn: 'Excavator',
      },
    }] : null);
    __test.setPublicEquipmentLimiter(async () => true);

    const response = await worker.fetch(
      new Request('https://worker.test/api/equipment/search?country=SA&limit=20'),
      env(),
    );
    const body: any = await response.json();
    expect(response.status).toBe(200);
    expect(body.equipment).toHaveLength(1);
    expect(body.equipment[0]).toMatchObject({ pricingModelVersion: 2, pricing });
  });
});