export type ExistingRegistrationStatus = {
  state: 'authenticated_complete' | 'provisioning_incomplete';
  role: 'customer' | 'provider' | 'driver' | null;
};

export type ExistingRegistrationDecision = 'resume' | 'duplicate_complete' | 'role_mismatch';

/** Canonical Worker status, never mere Firestore document existence, decides recovery. */
export function existingRegistrationDecision(
  status: ExistingRegistrationStatus,
  requestedRole: 'customer' | 'provider' | 'driver',
): ExistingRegistrationDecision {
  if (status.role && status.role !== requestedRole) return 'role_mismatch';
  if (status.state === 'authenticated_complete') return 'duplicate_complete';
  return 'resume';
}
