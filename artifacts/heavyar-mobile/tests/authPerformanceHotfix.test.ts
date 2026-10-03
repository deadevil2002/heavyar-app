import { describe, expect, it, vi } from 'vitest';
import { createShortLivedRequestCache } from '../services/shortLivedRequestCache';
import { existingRegistrationDecision } from '../services/registrationRecovery';
import { createSessionResolutionWaiter } from '../services/authSessionTransition';
import { withTimeout } from '../utils/boundedAsync';

describe('auth performance hotfix primitives', () => {
  it('deduplicates concurrent policy reads and uses a bounded successful cache', async () => {
    let now = 1_000;
    const cache = createShortLivedRequestCache<string>(30_000, () => now);
    const loader = vi.fn(async () => 'policy');
    const [first, second, third] = await Promise.all([
      cache.get(loader), cache.get(loader), cache.get(loader),
    ]);
    expect([first, second, third]).toEqual(['policy', 'policy', 'policy']);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.get(loader);
    expect(loader).toHaveBeenCalledTimes(1);
    now += 30_001;
    await cache.get(loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not permanently cache a failed policy request', async () => {
    const cache = createShortLivedRequestCache<string>(30_000);
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('policy');
    await expect(cache.get(loader)).rejects.toThrow('offline');
    await expect(cache.get(loader)).resolves.toBe('policy');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('bounds canonical session resolution instead of leaving login pending forever', async () => {
    vi.useFakeTimers();
    const waiter = createSessionResolutionWaiter(100);
    const result = waiter.promise;
    await vi.advanceTimersByTimeAsync(101);
    await expect(result).resolves.toEqual({ status: 'failed', errorCode: 'SESSION_RESOLUTION_TIMEOUT' });
    vi.useRealTimers();
  });

  it('bounds non-abortable operations', async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise<string>(() => undefined), 100, 'PROFILE_READ_TIMEOUT');
    const rejection = expect(result).rejects.toMatchObject({ errorCode: 'PROFILE_READ_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
    vi.useRealTimers();
  });
});

describe('legacy registration recovery decision', () => {
  it('resumes an incomplete same-role identity even when a legacy user document exists', () => {
    expect(existingRegistrationDecision(
      { state: 'provisioning_incomplete', role: 'provider' },
      'provider',
    )).toBe('resume');
  });

  it('blocks duplicate registration for a canonically complete identity', () => {
    expect(existingRegistrationDecision(
      { state: 'authenticated_complete', role: 'provider' },
      'provider',
    )).toBe('duplicate_complete');
  });

  it('keeps cross-role recovery blocked', () => {
    expect(existingRegistrationDecision(
      { state: 'provisioning_incomplete', role: 'customer' },
      'provider',
    )).toBe('role_mismatch');
  });
});
