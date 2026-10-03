export type AuthTransition = 'initializing' | 'idle' | 'signing_in' | 'resolving_session' | 'signing_out';

export type SessionResolution =
  | { status: 'ready' }
  | { status: 'failed'; errorCode: string };

export type SessionResolutionWaiter = {
  promise: Promise<SessionResolution>;
  resolve: (resolution: SessionResolution) => void;
};

export function isAuthSessionTransitioning(isLoading: boolean, transition: AuthTransition): boolean {
  return isLoading || transition !== 'idle';
}

export function canLeaveLoginAfterResolution(input: {
  sessionReady: boolean;
  isAuthenticated: boolean;
  accountState: string | null;
}): boolean {
  return input.sessionReady && input.isAuthenticated && Boolean(input.accountState);
}

/** Bridges credential completion to the existing canonical auth-state listener. */
export function createSessionResolutionWaiter(timeoutMs = 60_000): SessionResolutionWaiter {
  let settled = false;
  let settlePromise: (resolution: SessionResolution) => void = () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<SessionResolution>((resolve) => {
    settlePromise = resolve;
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: 'failed', errorCode: 'SESSION_RESOLUTION_TIMEOUT' });
    }, Math.max(1, timeoutMs));
  });

  return {
    promise,
    resolve: (resolution) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      settlePromise(resolution);
    },
  };
}
