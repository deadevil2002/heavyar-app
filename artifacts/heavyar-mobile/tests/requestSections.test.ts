import { describe, expect, it, vi } from 'vitest';
import { QueryClient, InfiniteQueryObserver } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { DRIVER_REQUEST_STALE_MS, DRIVER_REQUESTS_ROUTE, driverRequestsAllowed, driverRequestsKey, requestSections, resolveRequestSection } from '../services/requestSections';
import { canAccessRolePath } from '../services/roleCapabilities';

describe('unified role requests', () => {
  it('resolves canonical and legacy sections without granting cross-role equipment access', () => {
    expect(DRIVER_REQUESTS_ROUTE).toEqual({ pathname: '/(tabs)/requests', params: { section: 'drivers' } });
    expect(requestSections('driver')).toEqual(['drivers']);
    expect(requestSections('provider', 'store_review')).toEqual(['equipment', 'active']);
    expect(resolveRequestSection('driver', 'equipment')).toBe('drivers');
    expect(resolveRequestSection('provider', undefined, 'active')).toBe('active');
    expect(resolveRequestSection('provider', 'drivers')).toBe('drivers');
    expect(resolveRequestSection('provider', 'drivers', undefined, 'store_review')).toBe('equipment');
    expect(resolveRequestSection('customer', 'invalid')).toBe('equipment');
    expect(requestSections()).toEqual([]);
    expect(canAccessRolePath('provider', '/driver/requests')).toBe(true);
    expect(canAccessRolePath('provider', '/driver/request')).toBe(true);
    expect(canAccessRolePath('driver', '/driver/request')).toBe(false);
    for (const role of ['driver', 'provider', 'customer'] as const) {
      expect(canAccessRolePath(role, '/notifications')).toBe(true);
      expect(driverRequestsAllowed({ uid: 'review', role, accountPurpose: 'store_review' })).toBe(false);
    }
  });

  it('hides Store Review driver-request entry points while retaining deep-link explanation', () => {
    const home = readFileSync(new URL('../app/(tabs)/(home)/index.tsx', import.meta.url), 'utf8');
    const requests = readFileSync(new URL('../app/(tabs)/requests/index.tsx', import.meta.url), 'utf8');
    const driverProfile = readFileSync(new URL('../app/driver-profile.tsx', import.meta.url), 'utf8');
    expect(home).toContain('provider && canUseDriverRequests');
    expect(home).toContain("user?.accountPurpose !== 'store_review'");
    expect(requests).toContain('restrictedDriverDeepLink');
    expect(requests).toContain('Driver requests are unavailable for this Store Review account.');
    expect(driverProfile).toContain('driverRequestsAllowed(user)');
  });

  it('makes one entry call, zero timer calls over30s, reuses fresh focus and refetches stale focus; isolates roles/UIDs', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let calls = 0;
    const options = (uid = 'a', role: 'provider' | 'driver' = 'provider') => ({
      queryKey: driverRequestsKey(uid, role),
      initialPageParam: undefined as string | undefined,
      queryFn: async () => { calls++; return { requests: [], nextCursor: undefined }; },
      getNextPageParam: () => undefined,
      staleTime: DRIVER_REQUEST_STALE_MS,
      refetchOnMount: true as const,
      refetchOnWindowFocus: false as const,
      refetchInterval: false as const,
    });
    const mount = (uid?: string, role?: 'provider' | 'driver') => new InfiniteQueryObserver(client, options(uid, role)).subscribe(() => {});
    try {
      const first = mount();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toBe(1); // old source: entry +15s+30s =3 for one loaded page
      first();
      const fresh = mount();
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(1);
      fresh();
      await vi.advanceTimersByTimeAsync(DRIVER_REQUEST_STALE_MS);
      const stale = mount();
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(2);
      stale();
      const otherUid = mount('b');
      const otherRole = mount('a', 'driver');
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(4);
      otherUid(); otherRole();
    } finally { client.clear(); vi.useRealTimers(); }
  });

  it('does not activate a restricted query and cancels requests on removal', async () => {
    const client = new QueryClient();
    const fetcher = vi.fn(async () => ({ requests: [] }));
    const restricted = new InfiniteQueryObserver(client, {
      queryKey: driverRequestsKey('review', 'provider'), initialPageParam: undefined,
      queryFn: fetcher, getNextPageParam: () => undefined,
      enabled: driverRequestsAllowed({ uid: 'review', role: 'provider', accountPurpose: 'store_review' }),
    });
    const off = restricted.subscribe(() => {});
    expect(fetcher).not.toHaveBeenCalled();
    off();
    let signal: AbortSignal | undefined;
    const active = new InfiniteQueryObserver(client, {
      queryKey: driverRequestsKey('a', 'provider'), initialPageParam: undefined,
      queryFn: (context) => { signal = context.signal; return new Promise<{ requests: [] }>(() => {}); },
      getNextPageParam: () => undefined,
    });
    const unmount = active.subscribe(() => {});
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    client.clear();
  });

  it('mounts only a focused selected owner and keeps old links as redirect only', () => {
    const root = readFileSync(new URL('../app/(tabs)/requests/index.tsx', import.meta.url), 'utf8');
    const driver = readFileSync(new URL('../components/DriverRequestsSection.tsx', import.meta.url), 'utf8');
    const legacy = readFileSync(new URL('../app/driver/requests.tsx', import.meta.url), 'utf8');
    expect(root).toContain("focused ? selected === 'drivers'");
    expect(root).toContain('key={`${user.uid}:${user.role}`}');
    expect(root).toContain("activeOnly={selected === 'active'}");
    expect(driver).toContain('refetchInterval: false');
    expect(driver).toContain('onRefresh=');
    expect(driver).not.toContain('setInterval');
    expect(legacy).toContain('<Redirect href={DRIVER_REQUESTS_ROUTE}');
    expect(legacy).not.toContain('getDriverRequests');
  });
});