export const STAFF_ROLES = [
  'owner',
  'super_admin',
  'admin',
  'finance',
  'payouts',
  'operations',
  'support',
  'verification',
  'marketing',
  'auditor',
  'moderator',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type Permission =
  | 'seo.read'
  | 'seo.edit'
  | 'seo.publish'
  | 'fees.read'
  | 'fees.manage'
  | 'owner.transfer'
  | 'staff.manage'
  | 'finance.read'
  | 'finance.mutate'
  | 'payouts.read'
  | 'payouts.mutate'
  | 'operations.manage'
  | 'support.manage'
  | 'verification.manage'
  | 'moderation.manage'
  | 'marketing.campaign'
  | 'audit.read'
  | 'config.manage';

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: ['seo.read', 'seo.edit', 'seo.publish', 'fees.read', 'fees.manage', 'owner.transfer', 'staff.manage', 'finance.read', 'finance.mutate', 'payouts.read', 'payouts.mutate', 'operations.manage', 'support.manage', 'verification.manage', 'moderation.manage', 'marketing.campaign', 'audit.read', 'config.manage'],
  super_admin: ['seo.read', 'seo.edit', 'seo.publish', 'fees.read', 'fees.manage', 'staff.manage', 'finance.read', 'finance.mutate', 'payouts.read', 'payouts.mutate', 'operations.manage', 'support.manage', 'verification.manage', 'moderation.manage', 'marketing.campaign', 'audit.read', 'config.manage'],
  admin: ['seo.read', 'finance.read', 'operations.manage', 'support.manage', 'verification.manage', 'moderation.manage', 'marketing.campaign', 'audit.read'],
  finance: ['fees.read', 'finance.read', 'finance.mutate', 'audit.read'],
  payouts: ['payouts.read', 'payouts.mutate', 'audit.read'],
  operations: ['operations.manage', 'audit.read'],
  support: ['support.manage', 'audit.read'],
  verification: ['verification.manage', 'audit.read'],
  marketing: ['seo.read', 'seo.edit', 'marketing.campaign'],
  auditor: ['seo.read', 'fees.read', 'audit.read'],
  moderator: ['moderation.manage', 'audit.read'],
};

export function normalizeStaffRole(value: unknown): StaffRole | null {
  if (typeof value !== 'string') return null;
  if (value === 'super_admin' || value === 'admin') return value;
  return (STAFF_ROLES as readonly string[]).includes(value) ? value as StaffRole : null;
}

export function hasPermission(role: StaffRole | null, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

export const CANONICAL_RENTAL_STATES = [
  'pending',
  'accepted',
  'in_progress',
  'completion_requested',
  'completed',
  'rejected',
  'cancelled',
] as const;

const ACTIVE_RENTAL_STATES = new Set(['pending', 'accepted', 'in_progress', 'completion_requested', 'payment_pending', 'paid']);

export function hasActiveRental(requests: readonly Record<string, unknown>[]): boolean {
  return requests.some((request) => ACTIVE_RENTAL_STATES.has(String(request.status)) || request.paymentState === 'paid');
}

export type DateRange = { from: string; until?: string };

export function validateDateRange(range: DateRange): { ok: true; from: string; until?: string } | { ok: false; error: string } {
  if (!range || typeof range.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(range.from)) return { ok: false, error: 'Invalid availability start date' };
  if (range.until !== undefined && (typeof range.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(range.until))) return { ok: false, error: 'Invalid availability end date' };
  if (range.until && range.until < range.from) return { ok: false, error: 'Availability end precedes start' };
  return { ok: true, from: range.from, until: range.until };
}

export function rangesOverlap(left: DateRange, right: DateRange): boolean {
  const leftEnd = left.until || '9999-12-31';
  const rightEnd = right.until || '9999-12-31';
  return left.from <= rightEnd && right.from <= leftEnd;
}

export function availabilityAllows(
  availability: { from: string; until?: string; blocked?: DateRange[]; temporarilyUnavailable?: boolean },
  requested: DateRange,
): { ok: true } | { ok: false; error: string } {
  const valid = validateDateRange(requested);
  if (!valid.ok) return valid;
  if (availability.temporarilyUnavailable) return { ok: false, error: 'Equipment temporarily unavailable' };
  if (requested.from < availability.from || (availability.until && (requested.until || requested.from) > availability.until)) {
    return { ok: false, error: 'Requested dates are outside availability' };
  }
  if ((availability.blocked || []).some((blocked) => rangesOverlap(blocked, requested))) return { ok: false, error: 'Requested dates are blocked' };
  return { ok: true };
}

export const DRIVER_REQUEST_STATES = ['open', 'accepted', 'declined', 'closed'] as const;
export type DriverRequestState = (typeof DRIVER_REQUEST_STATES)[number];

export function transitionDriverRequest(current: DriverRequestState, next: DriverRequestState): boolean {
  return (current === 'open' && (next === 'accepted' || next === 'declined' || next === 'closed')) ||
    (current === 'accepted' && next === 'closed');
}

export function publicDriverProfile(profile: Record<string, unknown>): Record<string, unknown> {
  const allowed = ['id', 'displayName', 'photoUrl', 'countryCode', 'region', 'city', 'equipmentTypes', 'yearsExperience', 'description', 'availabilityStatus', 'availableFrom', 'availableUntil'];
  return Object.fromEntries(allowed.filter((key) => profile[key] !== undefined).map((key) => [key, profile[key]]));
}

export type GatewayName = 'tap' | 'moyasar' | 'myfatoorah';

export function gatewayRegistry(env: { TAP_SECRET_KEY_TEST?: string; MOYASAR_SECRET_KEY?: string; MYFATOORAH_API_KEY?: string }) {
  return {
    tap: { provider: 'tap' as const, configured: typeof env.TAP_SECRET_KEY_TEST === 'string' && env.TAP_SECRET_KEY_TEST.length > 0, environment: 'TEST' as const, adapterAvailable: true, enabled: false, supportsSplit: false },
    moyasar: { provider: 'moyasar' as const, configured: typeof env.MOYASAR_SECRET_KEY === 'string' && env.MOYASAR_SECRET_KEY.length > 0, environment: 'TEST' as const, adapterAvailable: false, enabled: false, supportsSplit: false },
    myfatoorah: { provider: 'myfatoorah' as const, configured: typeof env.MYFATOORAH_API_KEY === 'string' && env.MYFATOORAH_API_KEY.length > 0, environment: 'TEST' as const, adapterAvailable: false, enabled: false, supportsSplit: false },
  };
}

/**
 * Capability-only identity integration description.  This intentionally never
 * exposes values, and an environment variable alone does not make Rabet/Nafath
 * ready: an official adapter, callback and signature validation are mandatory.
 */
export function identityIntegrationRegistry(env: {
  RABET_NAFATH_CLIENT_ID?: string;
  RABET_NAFATH_CLIENT_SECRET?: string;
  RABET_NAFATH_BASE_URL?: string;
  RABET_NAFATH_CALLBACK_URL?: string;
  RABET_NAFATH_JWK_CONFIGURED?: string;
  RABET_NAFATH_OFFICIAL_ADAPTER?: string;
}) {
  const configured = {
    clientId: Boolean(env.RABET_NAFATH_CLIENT_ID),
    clientSecret: Boolean(env.RABET_NAFATH_CLIENT_SECRET),
    baseUrl: Boolean(env.RABET_NAFATH_BASE_URL),
    callback: Boolean(env.RABET_NAFATH_CALLBACK_URL),
    signatureValidation: env.RABET_NAFATH_JWK_CONFIGURED === 'true',
    officialAdapter: env.RABET_NAFATH_OFFICIAL_ADAPTER === 'true',
  };
  const ready = Object.values(configured).every(Boolean);
  return {
    nafath_rabet: {
      provider: 'Nafath via Rabet',
      key: 'nafath_rabet' as const,
      configured,
      ready,
      status: ready ? 'ready' : 'waiting_for_activation',
      mode: 'sandbox',
    },
  };
}

export function identityIntegrationMayEnable(integration: ReturnType<typeof identityIntegrationRegistry>[keyof ReturnType<typeof identityIntegrationRegistry>]): boolean {
  return integration.ready && integration.configured.officialAdapter && integration.configured.signatureValidation && integration.configured.callback;
}

export function enabledConfiguredGateways(
  registry: ReturnType<typeof gatewayRegistry>,
  configured: Partial<Record<GatewayName, boolean>>,
) {
  return Object.values(registry).filter((gateway) => gateway.configured && gateway.adapterAvailable && configured[gateway.provider]).map(({ provider, configured: isConfigured, adapterAvailable, environment, supportsSplit }) => ({ provider, configured: isConfigured, adapterAvailable, environment, supportsSplit }));
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.min(500, Math.floor(size)));
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) result.push(items.slice(i, i + safeSize));
  return result;
}

export function campaignRecipients(users: readonly { uid: string; role?: string; region?: string; city?: string; marketingOptOut?: boolean; accountPurpose?: string }[], filter: { audience: 'all' | 'customers' | 'providers' | 'drivers'; region?: string; city?: string }): string[] {
  return users.filter((user) => {
    if (user.accountPurpose === 'store_review') return false;
    if (user.marketingOptOut === true) return false;
    if (filter.region && user.region !== filter.region) return false;
    if (filter.city && user.city !== filter.city) return false;
    if (filter.audience === 'customers') return user.role === 'customer';
    if (filter.audience === 'providers') return user.role === 'provider';
    if (filter.audience === 'drivers') return user.role === 'driver' || user.role === 'customer' || user.role === 'provider';
    return true;
  }).map((user) => user.uid);
}

export function invitationExpiry(now = Date.now(), ttlMs = 24 * 60 * 60 * 1000): string {
  return new Date(now + Math.max(60_000, Math.min(ttlMs, 7 * 24 * 60 * 60 * 1000))).toISOString();
}

export function ownerTransferAllowed(currentOwnerUid: string | null, targetUid: string, recentAuthAt: number | null, now = Date.now()): boolean {
  return !!currentOwnerUid && !!targetUid && currentOwnerUid !== targetUid && !!recentAuthAt && now - recentAuthAt <= 5 * 60 * 1000;
}