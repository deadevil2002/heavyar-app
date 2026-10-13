import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = fs.readFileSync('app/company-team.tsx', 'utf8');
const profile = fs.readFileSync('app/(tabs)/profile/index.tsx', 'utf8');
const service = fs.readFileSync('services/organizationService.ts', 'utf8');

describe('company team mobile contract', () => {
  it('uses the shared Tamagui system with bilingual RTL-aware loading, error, and retry states', () => {
    expect(screen).toContain("from '@/components/ui/heavyar'");
    expect(screen).toContain('useHeavyarDirection');
    expect(screen).toContain('isRTL ? ar : en');
    expect(screen).toContain("'Loading team…'");
    expect(screen).toContain("'Retry'");
    expect(screen).toContain('ActivityIndicator');
  });

  it('keeps account-switch isolation and exposes the profile entry without direct Firestore access', () => {
    expect(screen).toContain('generation.current += 1');
    expect(screen).toContain('controller.abort()');
    expect(service).toContain('true, expectedUid');
    expect(screen).not.toMatch(/firebase\/firestore|staffMembers|staffInvitations/);
    expect(profile).toContain("route: '/company-team'");
  });

  it('limits the source UI to read capabilities and does not surface M2-C2 owner operations', () => {
    expect(screen).toContain("['equipment.view', 'bookings.view']");
    expect(screen).toContain('Finance, payouts, refunds, signing, and ownership transfer remain owner-only.');
    expect(service).not.toMatch(/equipment\.create|booking\.accept|finance\.|signature\.|ownership\.transfer/);
  });
});
