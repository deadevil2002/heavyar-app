import { describe, expect, test } from 'vitest';
import { registrationErrorMessage } from '../services/registrationErrors';
import { safeErrorMessage } from '../services/errorMessages';
import { registrationFailureDisposition, registrationFieldForCode, registrationListenerMayPublish, registrationRollbackDisposition } from '../services/registrationState';

describe('registration conflict and recovery state machine', () => {
  test.each([
    ['PHONE_ALREADY_IN_USE', 'phone'],
    ['DUPLICATE_COMPLETE_EMAIL', 'email'],
    ['auth/email-already-in-use', 'email'],
  ])('%s stays on the relevant registration field', (code, field) => {
    expect(registrationFailureDisposition(code)).toBe('stay_on_registration');
    expect(registrationFieldForCode(code)).toBe(field);
  });

  test('known phone conflict uses the required bilingual copy without machine codes', () => {
    expect(registrationErrorMessage({ errorCode: 'PHONE_ALREADY_IN_USE' }, 'ar')).toBe(
      'رقم الجوال مستخدم بالفعل في حساب آخر. استخدم رقم جوال مختلفًا أو سجل الدخول إلى حسابك المرتبط بهذا الرقم.',
    );
    expect(registrationErrorMessage({ errorCode: 'PHONE_ALREADY_IN_USE' }, 'en')).toBe(
      'This mobile number is already linked to another account. Use a different number or sign in to the account linked to it.',
    );
  });

  test('ambiguous failures preserve the recovery identity instead of rolling back blindly', () => {
    for (const code of ['NETWORK_UNAVAILABLE', 'NETWORK_TIMEOUT', 'REGISTRATION_RETRY_REQUIRED', 'SERVICE_UNAVAILABLE']) {
      expect(registrationFailureDisposition(code)).toBe('preserve_recovery_identity');
    }
  });

  test.each([
    ['A new email, safe phone conflict, confirmed delete', { code: 'PHONE_ALREADY_IN_USE', safeToDeleteIdentity: true, createdThisAttempt: true, deleteConfirmed: true }, 'stay_on_registration'],
    ['B new email, delete failure', { code: 'PHONE_ALREADY_IN_USE', safeToDeleteIdentity: true, createdThisAttempt: true, deleteConfirmed: false }, 'preserve_recovery_identity'],
    ['C known conflict without a safe-delete acknowledgement', { code: 'INVALID_PHONE', safeToDeleteIdentity: false, createdThisAttempt: true, deleteConfirmed: false }, 'preserve_recovery_identity'],
    ['D unknown protocol response', { code: undefined, safeToDeleteIdentity: false, createdThisAttempt: true, deleteConfirmed: false }, 'preserve_recovery_identity'],
    ['E complete email duplicate', { code: 'DUPLICATE_COMPLETE_EMAIL', safeToDeleteIdentity: false, createdThisAttempt: false, deleteConfirmed: false }, 'stay_on_registration'],
    ['F orphan email identity can only use recovery', { code: 'auth/email-already-in-use', safeToDeleteIdentity: false, createdThisAttempt: false, deleteConfirmed: false }, 'preserve_recovery_identity'],
    ['G ambiguous server failure', { code: 'REGISTRATION_RETRY_REQUIRED', safeToDeleteIdentity: false, createdThisAttempt: true, deleteConfirmed: false }, 'preserve_recovery_identity'],
  ])('%s', (_label, input, expected) => {
    expect(registrationRollbackDisposition(input)).toBe(expected);
  });

  test('a failed credential delete is an ambiguous recovery outcome, never a clean conflict', () => {
    expect(registrationRollbackDisposition({
      code: 'PHONE_ALREADY_IN_USE',
      safeToDeleteIdentity: true,
      createdThisAttempt: true,
      deleteConfirmed: false,
    })).toBe('preserve_recovery_identity');
  });

  test('listener interleaving cannot publish a stale callback after registration starts', () => {
    expect(registrationListenerMayPublish('idle', 4, 4)).toBe(true);
    expect(registrationListenerMayPublish('creating_identity', 4, 4)).toBe(false);
    expect(registrationListenerMayPublish('idle', 4, 5)).toBe(false);
  });

  test('raw backend and Firebase values never become user-facing fallback text', () => {
    for (const code of ['ACTIVE_RENTAL_OVERLAP', 'PHONE_ALREADY_IN_USE', 'EMAIL_ALREADY_IN_USE', 'DELETION_REQUEST_FAILED', 'AUTH_REQUIRED', 'RESOURCE_EXHAUSTED', 'HTTP 500']) {
      const message = registrationErrorMessage({ errorCode: code }, 'en');
      expect(message).not.toContain(code);
    }
    for (const code of ['RESOURCE_EXHAUSTED', 'PERMISSION_DENIED', 'HTTP 500', 'auth/internal-error', 'WORKER_PROTOCOL_ERROR']) {
      const message = safeErrorMessage({ errorCode: code }, 'en');
      expect(message).not.toContain(code);
    }
  });
});