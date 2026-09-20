import { PUBLIC_LINKS } from '../constants/publicLinks';
import type { AccountState } from '../types';

const SUSPENDED_STATUSES = new Set([
  'temporarily_suspended',
  'permanently_suspended',
  'suspended',
]);

export function resolveAccountState(input: {
  canonicalState: 'authenticated_complete' | 'provisioning_incomplete';
  accountStatus?: string | null;
  suspensionStatus?: string | null;
}): AccountState {
  if (input.canonicalState !== 'authenticated_complete') return 'provisioning_incomplete';
  if (input.accountStatus === 'deletion_requested') return 'deletion_requested';
  if (input.accountStatus === 'restricted') return 'restricted';
  if (SUSPENDED_STATUSES.has(String(input.suspensionStatus || ''))) return 'suspended';
  return 'authenticated_complete';
}

export function publicSupportUrl(): string {
  return PUBLIC_LINKS.support;
}