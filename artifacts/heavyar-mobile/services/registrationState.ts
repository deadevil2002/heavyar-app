export type RegistrationTransaction =
  | 'idle'
  | 'preflight'
  | 'creating_identity'
  | 'provisioning'
  | 'success'
  | 'known_failure_rollback'
  | 'ambiguous_failure_recovery';

export type RegistrationFailureDisposition = 'stay_on_registration' | 'preserve_recovery_identity';

const ambiguousCodes = new Set([
  'NETWORK_UNAVAILABLE',
  'NETWORK_TIMEOUT',
  'REGISTRATION_RETRY_REQUIRED',
  'SERVICE_UNAVAILABLE',
  'REGISTRATION_ROLLBACK_UNCERTAIN',
]);
const knownCleanCodes = new Set([
  'PHONE_ALREADY_IN_USE',
  'INVALID_PHONE',
  'COUNTRY_DISABLED',
  'ROLE_MISMATCH',
  'INVALID_REGISTRATION_DETAILS',
  'PROVIDER_ONBOARDING_UNAVAILABLE',
  'DUPLICATE_COMPLETE_EMAIL',
  'auth/weak-password',
  'auth/invalid-email',
  'auth/email-already-in-use',
]);

export function registrationFailureDisposition(code: string | undefined): RegistrationFailureDisposition {
  return !code || ambiguousCodes.has(code) || !knownCleanCodes.has(code)
    ? 'preserve_recovery_identity'
    : 'stay_on_registration';
}

const rollbackSafeCodes = new Set([
  'PHONE_ALREADY_IN_USE',
  'INVALID_PHONE',
  'COUNTRY_DISABLED',
  'ROLE_MISMATCH',
  'INVALID_REGISTRATION_DETAILS',
  'PROVIDER_ONBOARDING_UNAVAILABLE',
]);

export function registrationRollbackDisposition(input: {
  code?: string;
  safeToDeleteIdentity: boolean;
  createdThisAttempt: boolean;
  deleteConfirmed: boolean;
}): RegistrationFailureDisposition {
  if (!input.createdThisAttempt && input.code === 'DUPLICATE_COMPLETE_EMAIL') return 'stay_on_registration';
  if (!rollbackSafeCodes.has(input.code || '')) return 'preserve_recovery_identity';
  if (!input.safeToDeleteIdentity || !input.createdThisAttempt || !input.deleteConfirmed) {
    return 'preserve_recovery_identity';
  }
  return 'stay_on_registration';
}

export function registrationFieldForCode(code: string | undefined): 'email' | 'phone' | null {
  if (code === 'PHONE_ALREADY_IN_USE') return 'phone';
  if (code === 'DUPLICATE_COMPLETE_EMAIL' || code === 'auth/email-already-in-use') return 'email';
  return null;
}

export function registrationListenerMayPublish(
  transaction: RegistrationTransaction,
  listenerGeneration: number,
  currentGeneration: number,
): boolean {
  return transaction === 'idle' && listenerGeneration === currentGeneration;
}