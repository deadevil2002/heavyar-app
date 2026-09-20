import { describe, expect, it } from 'vitest';
import { publicSupportUrl, resolveAccountState } from '../services/accountAccess';

describe('account access policy', () => {
  it('does not treat the normal active suspension marker as a suspension', () => {
    expect(resolveAccountState({
      canonicalState: 'authenticated_complete',
      accountStatus: 'active',
      suspensionStatus: 'active',
    })).toBe('authenticated_complete');
  });

  it.each(['temporarily_suspended', 'permanently_suspended', 'suspended'])(
    'continues to block an explicit %s security suspension',
    suspensionStatus => {
      expect(resolveAccountState({
        canonicalState: 'authenticated_complete',
        accountStatus: 'active',
        suspensionStatus,
      })).toBe('suspended');
    },
  );

  it('continues to block restricted, deletion-requested, and incomplete accounts', () => {
    expect(resolveAccountState({ canonicalState: 'authenticated_complete', accountStatus: 'restricted' })).toBe('restricted');
    expect(resolveAccountState({ canonicalState: 'authenticated_complete', accountStatus: 'deletion_requested' })).toBe('deletion_requested');
    expect(resolveAccountState({ canonicalState: 'provisioning_incomplete', accountStatus: 'active' })).toBe('provisioning_incomplete');
  });

  it('uses the external public support destination instead of Settings', () => {
    expect(publicSupportUrl()).toMatch(/^https:\/\//);
    expect(publicSupportUrl()).toMatch(/\/support$/);
    expect(publicSupportUrl()).not.toContain('/settings');
  });
});