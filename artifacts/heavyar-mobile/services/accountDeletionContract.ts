export const ACCOUNT_DELETION_CONFIRMATION = 'DELETE_MY_ACCOUNT' as const;

export function createAccountDeletionPayload() {
  return { confirmation: ACCOUNT_DELETION_CONFIRMATION };
}

/** Standalone authenticated request shape used by contract tests and non-client callers. */
export function createAccountDeletionRequest(token: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(createAccountDeletionPayload()),
  };
}
