import { describe, expect, test } from 'bun:test';
import { canApplyProviderResult, canTransitionManualReview, defaultVerificationProfile, deriveProviderTrust, evaluateRisk, normalizeRequiredProviderComponents } from './verification';

describe('verification trust and risk policy', () => {
  test('defaults to backend-owned unverified components', () => {
    const profile = defaultVerificationProfile('u', '2026-01-01T00:00:00.000Z');
    expect(profile.identity.status).toBe('unverified');
    expect(profile.overallTrust.status).toBe('unverified');
  });
  test('uses conservative deterministic risk outcomes', () => {
    expect(evaluateRisk({ suspended: true })).toBe('block');
    expect(evaluateRisk({ policy: { enabled: true, requireCustomerIdentityVerification: true }, identityStatus: 'unverified' })).toBe('require_verification');
    expect(evaluateRisk({ policy: { enabled: true, requireCustomerIdentityVerification: true }, identityStatus: 'verified' })).toBe('allow');
    expect(evaluateRisk({ verificationFailures: 5 })).toBe('restrict');
  });
  test('callback application is uid-bound, expiring, pending, and single-use', () => {
    const base = { uid: 'u', correlationId: 'c', status: 'pending', expiresAt: '2030-01-01T00:00:00.000Z' };
    expect(canApplyProviderResult(base, { uid: 'u', correlationId: 'c', now: Date.parse('2029-01-01') })).toBe(true);
    expect(canApplyProviderResult(base, { uid: 'x', correlationId: 'c', now: Date.parse('2029-01-01') })).toBe(false);
    expect(canApplyProviderResult({ ...base, consumedAt: '2028-01-01T00:00:00.000Z' }, { uid: 'u', correlationId: 'c', now: Date.parse('2029-01-01') })).toBe(false);
    expect(canApplyProviderResult({ ...base, expiresAt: '2028-01-01T00:00:00.000Z' }, { uid: 'u', correlationId: 'c', now: Date.parse('2029-01-01') })).toBe(false);
    expect(canApplyProviderResult({ ...base, correlationId: 'other' }, { uid: 'u', correlationId: 'c', now: Date.parse('2029-01-01') })).toBe(false);
  });
  test('provider trust derives only from configured required components', () => {
    const components = {
      individualIdentity: 'verified', businessLegalEntity: 'unverified', commercialRegistration: 'unverified',
      ownershipAuthorization: 'unverified', payoutBank: 'unverified',
    } as const;
    expect(deriveProviderTrust(components, ['individualIdentity'])).toBe('verified');
    expect(deriveProviderTrust(components, ['individualIdentity', 'commercialRegistration'])).toBe('unverified');
    expect(deriveProviderTrust({ ...components, commercialRegistration: 'manual_review' }, ['individualIdentity', 'commercialRegistration'])).toBe('manual_review');
    expect(JSON.stringify(normalizeRequiredProviderComponents(['individualIdentity', 'individualIdentity']))).toBe('["individualIdentity"]');
  });
  test('manual review has a finite state machine', () => {
    expect(canTransitionManualReview('unverified', 'start_manual_review')).toBe(true);
    expect(canTransitionManualReview('manual_review', 'start_manual_review')).toBe(false);
    expect(canTransitionManualReview('manual_review', 'complete_manual_review')).toBe(true);
    expect(canTransitionManualReview('verified', 'reject_manual_review')).toBe(false);
  });
});