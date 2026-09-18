import { describe, expect, it } from 'vitest';
import {
  buildDriverOwnerSavePayload,
  canEditDriverOwnerProfile,
  canonicalEquipmentTypes,
} from '../services/driverOwnerContract';

describe('driver owner profile contract', () => {
  it('keeps only unique canonical capability ids', () => {
    expect(canonicalEquipmentTypes(['cranes', 'not-a-category', 'cranes', 'loaders']))
      .toEqual(['cranes', 'loaders']);
  });

  it('builds only the Worker accepted owner fields', () => {
    const payload = buildDriverOwnerSavePayload({
      displayName: '  Driver One ',
      countryCode: 'SA',
      region: ' riyadh ',
      city: 'riyadh',
      equipmentTypes: ['excavators', 'forged'],
      yearsExperience: '12',
      description: '  Experienced operator ',
      availabilityStatus: 'busy',
    });

    expect(payload).toEqual({
      displayName: 'Driver One',
      countryCode: 'SA',
      region: 'riyadh',
      city: 'riyadh',
      equipmentTypes: ['excavators'],
      yearsExperience: 12,
      description: 'Experienced operator',
      availabilityStatus: 'busy',
    });
    expect(payload).not.toHaveProperty('nativeCurrency');
    expect(payload).not.toHaveProperty('customCity');
    expect(payload).not.toHaveProperty('active');
    expect(payload).not.toHaveProperty('moderationStatus');
  });

  it('permits only an eligible driver owner to edit', () => {
    expect(canEditDriverOwnerProfile({ role: 'driver', accountStatus: 'active' })).toBe(true);
    expect(canEditDriverOwnerProfile({ role: 'customer', accountStatus: 'active' })).toBe(false);
    expect(canEditDriverOwnerProfile({ role: 'provider', accountStatus: 'active' })).toBe(false);
    expect(canEditDriverOwnerProfile({ role: 'driver', accountStatus: 'restricted' })).toBe(false);
    expect(canEditDriverOwnerProfile({ role: 'driver', suspensionStatus: 'temporarily_suspended' })).toBe(false);
  });
});