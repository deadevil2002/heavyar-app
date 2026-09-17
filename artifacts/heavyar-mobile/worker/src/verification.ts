export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired' | 'manual_review' | 'restricted';
export type RiskOutcome = 'allow' | 'require_verification' | 'require_manual_review' | 'restrict' | 'block';
export const providerComponentNames = ['individualIdentity', 'businessLegalEntity', 'commercialRegistration', 'ownershipAuthorization', 'payoutBank'] as const;
export type ProviderComponentName = typeof providerComponentNames[number];
export type ProviderComponents = Record<ProviderComponentName, VerificationStatus>;

export type VerificationProfile = {
  uid: string;
  identity: { status: VerificationStatus; provider: string; verifiedAt?: string; expiresAt?: string };
  business: { status: VerificationStatus };
  bankAccount: { status: VerificationStatus };
  manualReview: { status: VerificationStatus };
  overallTrust: { status: VerificationStatus };
  /**
   * Provider trust is deliberately distinct from customer identity trust.  A
   * provider is never trusted because an unrelated component happened to pass.
   */
  providerVerification: {
    status: VerificationStatus;
    requiredComponents: ProviderComponentName[];
    components: ProviderComponents;
  };
  updatedAt: string;
};

export type VerificationPolicy = {
  enabled?: boolean;
  requireCustomerIdentityVerification?: boolean;
  verificationRequiredAboveAmountSAR?: number | null;
  verificationRequiredForHighRiskEquipment?: boolean;
  verificationRequiredForSpecificRequestTypes?: string[];
  version?: number;
};
/** Official providers must validate their own callback/authentication material at this boundary. */
export interface IdentityVerificationProvider {
  readonly name: string;
  readonly mode: 'official' | 'test';
  start(input: { uid: string; attemptId: string; correlationId: string; expiresAt: string }): Promise<{ referenceId: string }>;
  validateResult(input: unknown): Promise<{ uid: string; correlationId: string; status: 'verified' | 'rejected' }>;
}
/** Kept only as an injected test seam; no client route can select or activate it. */
export class TestOnlyIdentityProvider implements IdentityVerificationProvider {
  readonly name = 'test_only';
  readonly mode = 'test' as const;
  async start(input: { attemptId: string }) { return { referenceId: input.attemptId }; }
  async validateResult(input: unknown) {
    const value = input as { uid?: string; correlationId?: string; status?: 'verified' | 'rejected' };
    if (!value.uid || !value.correlationId || !['verified', 'rejected'].includes(String(value.status))) throw new Error('Invalid test provider result');
    return { uid: value.uid, correlationId: value.correlationId, status: value.status! };
  }
}

export const verificationStatuses: VerificationStatus[] = ['unverified', 'pending', 'verified', 'rejected', 'expired', 'manual_review', 'restricted'];
export const defaultVerificationProfile = (uid: string, now: string): VerificationProfile => ({
  uid,
  identity: { status: 'unverified', provider: 'unconfigured' },
  business: { status: 'unverified' },
  bankAccount: { status: 'unverified' },
  manualReview: { status: 'unverified' },
  overallTrust: { status: 'unverified' },
  providerVerification: {
    status: 'unverified',
    // Identity is the only default requirement. Other components are added by
    // trusted operations when Heavyar has a legitimate verification process.
    requiredComponents: ['individualIdentity'],
    components: {
    individualIdentity: 'unverified', businessLegalEntity: 'unverified',
    commercialRegistration: 'unverified', ownershipAuthorization: 'unverified',
    payoutBank: 'unverified',
    },
  },
  updatedAt: now,
});

/** A provider cannot become trusted until every required component is independently trusted. */
export function deriveProviderTrust(components: Partial<ProviderComponents> | undefined, requiredComponents: readonly ProviderComponentName[] = providerComponentNames): VerificationStatus {
  if (!components || !requiredComponents.length || requiredComponents.some(component => !providerComponentNames.includes(component))) return 'unverified';
  const states = requiredComponents.map(component => components[component] || 'unverified');
  if (states.includes('restricted')) return 'restricted';
  if (states.includes('manual_review')) return 'manual_review';
  if (states.includes('rejected')) return 'rejected';
  if (states.includes('expired')) return 'expired';
  if (states.every(status => status === 'verified')) return 'verified';
  if (states.some(status => status === 'pending')) return 'pending';
  return 'unverified';
}

export function isProviderComponentName(value: unknown): value is ProviderComponentName {
  return typeof value === 'string' && (providerComponentNames as readonly string[]).includes(value);
}

export function normalizeRequiredProviderComponents(value: unknown): ProviderComponentName[] | null {
  if (!Array.isArray(value) || !value.length || value.length > providerComponentNames.length ||
      value.some(component => !isProviderComponentName(component))) return null;
  return [...new Set(value)] as ProviderComponentName[];
}

export function providerVerificationFor(profile: Partial<VerificationProfile> | undefined) {
  const fallback = defaultVerificationProfile(String(profile?.uid || ''), new Date(0).toISOString()).providerVerification;
  const current = profile?.providerVerification;
  const requiredComponents = normalizeRequiredProviderComponents(current?.requiredComponents) || fallback.requiredComponents;
  const components: ProviderComponents = { ...fallback.components };
  for (const component of providerComponentNames) {
    if (verificationStatuses.includes(current?.components?.[component] as VerificationStatus)) {
      components[component] = current!.components[component];
    }
  }
  return { components, requiredComponents, status: deriveProviderTrust(components, requiredComponents) };
}

export const manualReviewTransitions: Record<'start_manual_review' | 'complete_manual_review' | 'reject_manual_review', readonly VerificationStatus[]> = {
  start_manual_review: ['unverified', 'pending', 'verified', 'rejected', 'expired', 'restricted'],
  complete_manual_review: ['manual_review'],
  reject_manual_review: ['manual_review'],
};

export function canTransitionManualReview(current: unknown, action: keyof typeof manualReviewTransitions) {
  return manualReviewTransitions[action].includes(current as VerificationStatus);
}

export const defaultVerificationPolicy = (): Required<Pick<VerificationPolicy,
  'enabled' | 'requireCustomerIdentityVerification' | 'verificationRequiredForHighRiskEquipment' | 'verificationRequiredForSpecificRequestTypes' | 'version'
>> & VerificationPolicy => ({
  enabled: false,
  requireCustomerIdentityVerification: false,
  verificationRequiredAboveAmountSAR: null,
  verificationRequiredForHighRiskEquipment: false,
  verificationRequiredForSpecificRequestTypes: [],
  version: 1,
});

export function normalizeVerificationPolicy(input: unknown): VerificationPolicy | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const types = value.verificationRequiredForSpecificRequestTypes;
  if (typeof value.enabled !== 'boolean' ||
      typeof value.requireCustomerIdentityVerification !== 'boolean' ||
      typeof value.verificationRequiredForHighRiskEquipment !== 'boolean' ||
      !Array.isArray(types) || types.some(type => typeof type !== 'string' || !/^[a-z_]{1,48}$/.test(type)) ||
      (value.verificationRequiredAboveAmountSAR !== null && value.verificationRequiredAboveAmountSAR !== undefined &&
        (!Number.isFinite(Number(value.verificationRequiredAboveAmountSAR)) || Number(value.verificationRequiredAboveAmountSAR) <= 0))) return null;
  return {
    enabled: value.enabled,
    requireCustomerIdentityVerification: value.requireCustomerIdentityVerification,
    verificationRequiredAboveAmountSAR: value.verificationRequiredAboveAmountSAR == null ? null : Number(value.verificationRequiredAboveAmountSAR),
    verificationRequiredForHighRiskEquipment: value.verificationRequiredForHighRiskEquipment,
    verificationRequiredForSpecificRequestTypes: [...new Set(types)],
  };
}

/** Deliberately conservative and deterministic. Client code never receives the reason details. */
export function evaluateRisk(input: {
  suspended?: boolean; identityStatus?: string; manualReviewStatus?: string;
  policy?: VerificationPolicy; amount?: number; highRiskEquipment?: boolean; requestType?: string;
  verificationFailures?: number; confirmedDisputes?: number; confirmedComplaints?: number;
}): RiskOutcome {
  if (input.suspended) return 'block';
  if ((input.confirmedDisputes || 0) >= 2 || (input.confirmedComplaints || 0) >= 3) return 'require_manual_review';
  if ((input.verificationFailures || 0) >= 5) return 'restrict';
  if (input.manualReviewStatus === 'manual_review' || input.identityStatus === 'manual_review') return 'require_manual_review';
  const policy = { ...defaultVerificationPolicy(), ...(input.policy || {}) };
  if (!policy.enabled) return 'allow';
  const amountThreshold = Number(policy.verificationRequiredAboveAmountSAR);
  const needsIdentity = policy.requireCustomerIdentityVerification === true ||
    (Number.isFinite(amountThreshold) && amountThreshold > 0 && Number(input.amount) >= amountThreshold) ||
    (policy.verificationRequiredForHighRiskEquipment === true && input.highRiskEquipment === true) ||
    (Array.isArray(policy.verificationRequiredForSpecificRequestTypes) &&
      policy.verificationRequiredForSpecificRequestTypes.includes(String(input.requestType || '')));
  return needsIdentity && input.identityStatus !== 'verified' ? 'require_verification' : 'allow';
}

export function canApplyProviderResult(attempt: { uid?: string; correlationId?: string; status?: string; expiresAt?: string; consumedAt?: string }, input: { uid?: string; correlationId?: string; now: number }) {
  return !!attempt && attempt.uid === input.uid && attempt.correlationId === input.correlationId &&
    attempt.status === 'pending' && !attempt.consumedAt && !!attempt.expiresAt && Date.parse(attempt.expiresAt) > input.now;
}