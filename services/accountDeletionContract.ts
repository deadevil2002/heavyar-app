/** Request shape required by the Worker account deletion endpoint. */
export function createAccountDeletionRequest(token: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' }),
  };
}