import { describe, expect, test } from 'bun:test';
import { ensurePublicIdentifier, formatPublicIdentifier } from './public-identifiers';
import { canModerateListing, isPublicRentableListing, requiresListingRereview } from './moderation';

describe('marketplace identifier and moderation contracts', () => {
  test('formats stable human-readable identifiers', () => {
    expect(formatPublicIdentifier('request', 1)).toBe('HV-REQ-000001');
    expect(formatPublicIdentifier('equipment', 501)).toBe('HV-EQP-000501');
  });

  test('backfill is idempotent when a valid identifier already exists', async () => {
    let assigned = false;
    const result = await ensurePublicIdentifier('request', {
      readTarget: async () => ({ publicRequestNumber: 'HV-REQ-000123' }),
      readIdentifier: target => target.publicRequestNumber,
      assignAtomically: async () => { assigned = true; return 'HV-REQ-000124'; },
    });
    expect(JSON.stringify(result)).toBe(JSON.stringify({ identifier: 'HV-REQ-000123', assigned: false }));
    expect(assigned).toBe(false);
  });

  test('only an explicitly approved visible listing is publicly rentable', () => {
    expect(isPublicRentableListing({ isActive: true, visibility: 'visible', moderationStatus: 'approved' })).toBe(true);
    expect(isPublicRentableListing({ isActive: true, visibility: 'visible', moderationStatus: 'pending_review' })).toBe(false);
    expect(isPublicRentableListing({ isActive: true, moderationStatus: 'approved' })).toBe(false);
    expect(requiresListingRereview({ moderationStatus: 'approved' }, { pricePerDay: 100 })).toBe(true);
    expect(canModerateListing('rejected', '')).toBe(false);
    expect(canModerateListing('rejected', 'Duplicate listing')).toBe(true);
  });
});