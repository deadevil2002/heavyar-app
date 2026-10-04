import { describe, expect, test } from 'vitest';
import {
  CURRENT_POLICY_VERSIONS, DRIVER_CREDENTIAL_FRAMEWORK, MODERATION_REASONS,
  acceptanceIsCurrent, canTransitionComplaint, canTransitionIncident, canTransitionPrivacyRequest,
  canTransitionRefundCase, complaintServiceTargets, normalizeModerationReason, regulatoryDecision,
  refundMayBeMarkedExecuted, requiredPolicyVersions, safeUserExport, temporaryRecordExpired,
  validatePolicyAcceptance, LEGACY_POLICY_ACCEPTANCE_COMPAT_ENABLED, policyAcceptanceState,
} from './compliance';

const metadata = { accepted: true, legalCapacityConfirmed: true, appVersion: '1.1.1', platform: 'ios', locale: 'ar', ...CURRENT_POLICY_VERSIONS };

describe('current-release compliance contracts', () => {
  test('requires exact current policy versions and role-specific terms', () => {
    expect(validatePolicyAcceptance(metadata, 'customer')).toMatchObject(requiredPolicyVersions('customer'));
    expect(validatePolicyAcceptance(metadata, 'driver')).toMatchObject({ driverTermsVersion: CURRENT_POLICY_VERSIONS.driverTermsVersion });
    expect(validatePolicyAcceptance(metadata, 'provider')).toBeNull();
    expect(validatePolicyAcceptance({ ...metadata, businessAuthorityConfirmed: true }, 'provider')).toMatchObject({ providerTermsVersion: CURRENT_POLICY_VERSIONS.providerTermsVersion });
    expect(validatePolicyAcceptance({ ...metadata, termsVersion: 'old' }, 'customer')).toBeNull();
    expect(validatePolicyAcceptance({ ...metadata, accepted: false }, 'customer')).toBeNull();
  });

  test('detects missing and old acceptance without overwriting history', () => {
    expect(acceptanceIsCurrent(null, 'customer')).toBe(false);
    expect(acceptanceIsCurrent({ ...requiredPolicyVersions('customer'), legalCapacityConfirmed: true }, 'customer')).toBe(true);
    expect(acceptanceIsCurrent({ ...requiredPolicyVersions('customer'), legalCapacityConfirmed: true, privacyVersion: 'old' }, 'customer')).toBe(false);
    expect(Object.isFrozen(CURRENT_POLICY_VERSIONS)).toBe(true);
  });

  test('classifies missing evidence as legacy without inventing current consent', () => {
    expect(LEGACY_POLICY_ACCEPTANCE_COMPAT_ENABLED).toBe(true);
    expect(policyAcceptanceState({}, 'customer')).toBe('legacy_unversioned');
    expect(policyAcceptanceState({ policyAcceptanceState: 'current', currentPolicyVersions: requiredPolicyVersions('customer') }, 'customer')).toBe('legacy_unversioned');
    expect(policyAcceptanceState({ policyAcceptanceState: 'current', legalCapacityConfirmed: true, currentPolicyVersions: requiredPolicyVersions('customer') }, 'customer')).toBe('current');
    expect(policyAcceptanceState({ policyAcceptanceState: 'current', legalCapacityConfirmed: true, currentPolicyVersions: requiredPolicyVersions('provider') }, 'provider')).toBe('legacy_unversioned');
    expect(policyAcceptanceState({ policyAcceptanceState: 'current', legalCapacityConfirmed: true, businessAuthorityConfirmed: true, currentPolicyVersions: requiredPolicyVersions('provider') }, 'provider')).toBe('current');
  });

  test('enforces complaint lifecycle and computes internal business-day targets', () => {
    expect(canTransitionComplaint('submitted', 'acknowledged')).toBe(true);
    expect(canTransitionComplaint('submitted', 'closed')).toBe(false);
    expect(canTransitionComplaint('closed', 'under_review')).toBe(false);
    expect(complaintServiceTargets('2026-10-02T12:00:00.000Z')).toEqual({ acknowledgeTargetAt: '2026-10-06T12:00:00.000Z', resolutionTargetAt: '2026-10-16T12:00:00.000Z' });
  });

  test('enforces privacy, refund and incident state machines', () => {
    expect(canTransitionPrivacyRequest('submitted', 'under_review')).toBe(true);
    expect(canTransitionPrivacyRequest('completed', 'under_review')).toBe(false);
    expect(canTransitionRefundCase('approved_pending_execution', 'manual_execution_required')).toBe(true);
    expect(canTransitionRefundCase('requested', 'executed')).toBe(false);
    expect(canTransitionIncident('reported', 'under_review')).toBe(true);
    expect(canTransitionIncident('closed', 'under_review')).toBe(false);
  });

  test('never represents a refund as executed without provider evidence', () => {
    expect(refundMayBeMarkedExecuted({ state: 'manual_execution_required', executedAt: new Date().toISOString() })).toBe(false);
    expect(refundMayBeMarkedExecuted({ state: 'manual_execution_required', executedAt: new Date().toISOString(), providerEvidenceReference: 'tap-case-1234' })).toBe(true);
  });

  test('safe export excludes secrets, notes, credentials, and payment material', () => {
    const result = safeUserExport({ user: { uid: 'u1', email: 'a@example.test', password: 'secret', nationalId: 'never', adminNote: 'private' }, requests: [{ id: 'r1', status: 'paid', paymentSecret: 'never' }] });
    expect(result.profile).toEqual({ uid: 'u1', email: 'a@example.test' });
    expect(result.requests).toEqual([{ id: 'r1', status: 'paid' }]);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('nationalId');
  });

  test('cleanup only treats explicit expired records as temporary', () => {
    expect(temporaryRecordExpired({ expiresAt: '2026-01-01T00:00:00.000Z' }, Date.parse('2026-01-02T00:00:00.000Z'))).toBe(true);
    expect(temporaryRecordExpired({ createdAt: '2020-01-01T00:00:00.000Z' })).toBe(false);
  });

  test('unknown regulated activity fails closed and driver credentials stay disabled', () => {
    expect(regulatoryDecision('other', 'equipment_rental')).toMatchObject({ classification: 'unknown', action: 'fail_closed' });
    expect(regulatoryDecision('excavators', 'equipment_rental')).toMatchObject({ action: 'allow' });
    expect(regulatoryDecision('trucks', 'rental_without_driver')).toMatchObject({ classification: 'regulated', action: 'fail_closed' });
    expect(DRIVER_CREDENTIAL_FRAMEWORK.enabled).toBe(false);
  });

  test('moderation accepts only explicit audited reason codes', () => {
    expect(normalizeModerationReason('fraud')).toBe('fraud');
    expect(normalizeModerationReason('because admin said so')).toBeNull();
    expect(MODERATION_REASONS).toContain('unsafe_illegal_listing');
  });
});
