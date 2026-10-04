export interface AccountDeletionFlowDependencies {
  requestDeletion: () => Promise<void>;
  logoutAndClear: () => Promise<void>;
}

/**
 * Submit first, then clear the authenticated session only after the Worker
 * durably accepts the deletion request. A rejected request leaves the user
 * signed in so they can retry or contact support.
 */
export async function runAccountDeletionFlow({
  requestDeletion,
  logoutAndClear,
}: AccountDeletionFlowDependencies): Promise<void> {
  await requestDeletion();
  await logoutAndClear();
}
