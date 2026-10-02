import { describe, expect, it, vi } from 'vitest';
import {
  canLeaveLoginAfterResolution,
  createSessionResolutionWaiter,
  isAuthSessionTransitioning,
} from '../services/authSessionTransition';

describe('auth session transition', () => {
  it('does not finish at credential success before canonical resolution', async () => {
    const waiter = createSessionResolutionWaiter();
    const finished = vi.fn();
    void waiter.promise.then(finished);
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();

    waiter.resolve({ status: 'ready' });
    await expect(waiter.promise).resolves.toEqual({ status: 'ready' });
    expect(finished).toHaveBeenCalledOnce();
  });

  it('publishes profile-resolution failure without hanging login', async () => {
    const waiter = createSessionResolutionWaiter();
    waiter.resolve({ status: 'failed', errorCode: 'SESSION_EXPIRED' });
    await expect(waiter.promise).resolves.toEqual({ status: 'failed', errorCode: 'SESSION_EXPIRED' });
  });

  it('settles only once when auth callbacks race', async () => {
    const waiter = createSessionResolutionWaiter();
    waiter.resolve({ status: 'ready' });
    waiter.resolve({ status: 'failed', errorCode: 'SESSION_EXPIRED' });
    await expect(waiter.promise).resolves.toEqual({ status: 'ready' });
  });

  it.each(['initializing', 'signing_in', 'resolving_session', 'signing_out'] as const)(
    'blocks guest rendering during %s',
    (transition) => {
      expect(isAuthSessionTransitioning(false, transition)).toBe(true);
    },
  );

  it('keeps cold restore blocked until the initial listener is ready', () => {
    expect(isAuthSessionTransitioning(true, 'initializing')).toBe(true);
    expect(isAuthSessionTransitioning(false, 'idle')).toBe(false);
  });

  it('leaves Login only for a stable canonical result', () => {
    expect(canLeaveLoginAfterResolution({ sessionReady: false, isAuthenticated: true, accountState: 'authenticated_complete' })).toBe(false);
    expect(canLeaveLoginAfterResolution({ sessionReady: true, isAuthenticated: false, accountState: null })).toBe(false);
    expect(canLeaveLoginAfterResolution({ sessionReady: true, isAuthenticated: true, accountState: 'authenticated_complete' })).toBe(true);
    expect(canLeaveLoginAfterResolution({ sessionReady: true, isAuthenticated: true, accountState: 'provisioning_incomplete' })).toBe(true);
  });
});
