/** Unknown/pending identities must not briefly start Guest discovery. */
export function canBrowsePublicEquipment(auth: {
  isLoading?: boolean;
  isAuthenticated?: boolean;
  user?: { role: string } | null;
  identityEmail?: string | null;
  accountState?: string | null;
}): boolean {
  if (auth.isLoading !== false) return false;
  if (auth.user) return auth.user.role === 'customer';
  return !auth.isAuthenticated && !auth.identityEmail && !auth.accountState;
}