import { describe, expect, it } from 'vitest';
import { createAccountDeletionRequest } from '../services/accountDeletionContract';

describe('account deletion Worker contract', () => {
  it('uses authenticated POST JSON with the required explicit confirmation', () => {
    const request = createAccountDeletionRequest('test-token');

    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
    });
    expect(JSON.parse(String(request.body))).toEqual({
      confirmation: 'DELETE_MY_ACCOUNT',
    });
  });
});