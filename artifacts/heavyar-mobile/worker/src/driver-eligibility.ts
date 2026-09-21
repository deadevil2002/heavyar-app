import { isSecuritySuspended, isStoreReviewAccount } from './integrity';

export type DriverEligibility = { discoverable: boolean; reasons: string[] };

// Baseline discovery, not optional search filters. Offline and unverified trust
// are deliberately not blockers. Email uses the same users mirror as search.
export function driverEligibility(profile: any, account: any, market: any, policy: any): DriverEligibility {
  const reasons: string[] = [];
  if (!profile || profile.active !== true) reasons.push('inactive');
  if (profile?.moderationStatus !== 'approved') reasons.push(
    profile?.moderationStatus === 'suspended' ? 'moderation_suspended' :
    profile?.moderationStatus === 'rejected' ? 'rejected' : 'pending_review');
  if (!account) reasons.push('account_missing');
  else {
    if (isStoreReviewAccount(account)) reasons.push('store_review');
    if (account.role !== 'driver') reasons.push('not_driver');
    if ((account.accountStatus !== undefined && account.accountStatus !== 'active') ||
        account.isActive === false || isSecuritySuspended(account)) reasons.push('account_restricted');
  }
  if (policy?.enabled !== false && policy?.requireBeforeDriverActivation !== false &&
      account?.emailVerified !== true) reasons.push('email_verification_required');
  if (!market || market.enabled !== true || market.marketplaceAvailable !== true ||
      market.code !== profile?.countryCode) reasons.push('market_unavailable');
  return { discoverable: reasons.length === 0, reasons };
}

// Country defaults used by public search: only SA is enabled by default.
export function driverDiscoveryMarket(code: unknown, stored: any) {
  const country = String(code || '');
  if (!['SA', 'AE', 'KW', 'QA', 'BH', 'OM'].includes(country)) return null;
  const defaultEnabled = country === 'SA';
  const enabled = stored?.enabled === undefined ? defaultEnabled : stored.enabled === true;
  return { code: country, ...stored, enabled,
    marketplaceAvailable: enabled && (stored?.marketplaceAvailable === undefined ? defaultEnabled : stored.marketplaceAvailable === true) };
}