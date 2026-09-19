import { describe, expect, it } from 'vitest';
import { canAccessRolePath, hasCapability } from '../services/roleCapabilities';
import { safeErrorMessage } from '../services/errorMessages';

describe('mobile account integrity boundaries', () => {
  it('isolates provider and driver capabilities', () => {
    expect(hasCapability('customer', 'manageEquipment')).toBe(false);
    expect(hasCapability('customer', 'manageDriverProfile')).toBe(false);
    expect(canAccessRolePath('customer', '/my-equipment')).toBe(false);
    expect(canAccessRolePath('provider', '/my-equipment')).toBe(true);
    expect(canAccessRolePath('driver', '/driver-profile')).toBe(true);
  });
  it('maps overlap errors without exposing raw codes', () => {
    expect(safeErrorMessage({ errorCode: 'ACTIVE_RENTAL_OVERLAP' }, 'ar')).not.toContain('ACTIVE_RENTAL_OVERLAP');
    expect(safeErrorMessage({ errorCode: 'ACTIVE_RENTAL_OVERLAP' }, 'en')).toContain('active request');
    expect(safeErrorMessage({ errorCode: 'UNKNOWN' }, 'en')).not.toContain('UNKNOWN');
  });
});