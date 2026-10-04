import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAccountDeletionPayload, createAccountDeletionRequest } from '../services/accountDeletionContract';
import { runAccountDeletionFlow } from '../services/accountDeletionFlow';

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

  it('provides the same canonical payload to the authenticated mobile client', () => {
    expect(createAccountDeletionPayload()).toEqual({
      confirmation: 'DELETE_MY_ACCOUNT',
    });
  });

  it('clears the session only after the deletion request succeeds', async () => {
    const calls: string[] = [];

    await runAccountDeletionFlow({
      requestDeletion: async () => { calls.push('request'); },
      logoutAndClear: async () => { calls.push('logout'); },
    });

    expect(calls).toEqual(['request', 'logout']);
  });

  it('does not log out when the deletion request fails', async () => {
    let loggedOut = false;

    await expect(runAccountDeletionFlow({
      requestDeletion: async () => { throw new Error('request failed'); },
      logoutAndClear: async () => { loggedOut = true; },
    })).rejects.toThrow('request failed');

    expect(loggedOut).toBe(false);
  });

  it('exposes the shared deletion action from both authenticated entry points', () => {
    const profile = readFileSync(resolve(process.cwd(), 'app/(tabs)/profile/index.tsx'), 'utf8');
    const settings = readFileSync(resolve(process.cwd(), 'app/settings.tsx'), 'utf8');

    expect(profile).toContain('useAccountDeletion(showDialog)');
    expect(profile).toContain("accessibilityLabel={t('delete_account')}");
    expect(settings).toContain('useAccountDeletion(showDialog)');
    expect(settings).toContain('isAuthenticated && user');
    expect(settings).toContain("accessibilityLabel={t('delete_account')}");
  });

  it('does not role-gate customer, provider, or driver deletion access', () => {
    const hook = readFileSync(resolve(process.cwd(), 'hooks/useAccountDeletion.ts'), 'utf8');
    const profile = readFileSync(resolve(process.cwd(), 'app/(tabs)/profile/index.tsx'), 'utf8');
    const settings = readFileSync(resolve(process.cwd(), 'app/settings.tsx'), 'utf8');

    for (const source of [hook, settings]) {
      expect(source).not.toMatch(/role\s*===\s*['"](?:customer|provider|driver)['"]/);
      expect(source).not.toMatch(/hasCapability\([^\n]*delete/i);
    }
    expect(profile).toContain('const handleAccountDeletion = useAccountDeletion(showDialog);');
    expect(profile).not.toMatch(/hasCapability\([^\n]*delete/i);
  });

  it('uses the authenticated Worker client for the canonical request', () => {
    const service = readFileSync(resolve(process.cwd(), 'services/paymentService.ts'), 'utf8');

    expect(service).toContain("request('/api/account/deletion-request'");
    expect(service).toContain("method: 'POST'");
    expect(service).toContain('createAccountDeletionPayload()');
  });
});
