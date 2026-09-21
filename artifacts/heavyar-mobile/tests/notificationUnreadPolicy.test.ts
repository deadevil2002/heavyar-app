import { QueryClient } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { notificationUnreadKey, NOTIFICATION_UNREAD_STALE_MS, publishNotificationRead, subscribeNotificationReads, retainNotificationUnread } from '../services/notificationUnreadPolicy';

describe('authoritative unread cache policy', () => {
  it('shares one read invalidation and retains data when either Home or Tabs unmounts', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const cancel = vi.spyOn(client, 'cancelQueries');
    const releaseTabs = retainNotificationUnread(client, 'provider');
    const releaseHome = retainNotificationUnread(client, 'provider');
    client.setQueryData(notificationUnreadKey('provider'), 16);
    publishNotificationRead({ uid: 'provider', type: 'replace', unreadCount: 15 });
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryData(notificationUnreadKey('provider'))).toBe(15);
    releaseHome();
    expect(cancel).not.toHaveBeenCalled();
    expect(client.getQueryData(notificationUnreadKey('provider'))).toBe(15);
    publishNotificationRead({ uid: 'provider', type: 'replace', unreadCount: 0 });
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryData(notificationUnreadKey('provider'))).toBe(0);
    releaseTabs();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(notificationUnreadKey('provider'))).toBeUndefined();
    publishNotificationRead({ uid: 'provider', type: 'replace', unreadCount: 14 });
    expect(invalidate).not.toHaveBeenCalled();
    client.clear();
  });

  it('isolates a new identity while prior identity still has another observer', () => {
    const client = new QueryClient();
    const releaseA = retainNotificationUnread(client, 'A');
    const releaseB = retainNotificationUnread(client, 'B');
    client.setQueryData(notificationUnreadKey('A'), 16);
    client.setQueryData(notificationUnreadKey('B'), 2);
    releaseA();
    expect(client.getQueryData(notificationUnreadKey('A'))).toBeUndefined();
    expect(client.getQueryData(notificationUnreadKey('B'))).toBe(2);
    releaseB();
    client.clear();
  });
  it('keeps tabs mounted and never reads notification documents just to render the badge', () => {
    const layout = readFileSync('app/(tabs)/_layout.tsx', 'utf8');
    expect(layout).not.toMatch(/listNotifications|unmountOnBlur|key=\{.*uid/);
    expect(layout).toContain('lazy: true');
    const hook = readFileSync('hooks/useNotificationUnread.ts', 'utf8');
    expect(hook).not.toMatch(/setInterval|refetchInterval/);
    expect(hook).toContain('staleTime: NOTIFICATION_UNREAD_STALE_MS');
  });

  it('does not scan or backfill provider inventory merely by viewing Profile', () => {
    const profile = readFileSync('app/(tabs)/profile/index.tsx', 'utf8');
    expect(profile).not.toMatch(/fetchEquipmentByOwner|tryBackfillEquipmentOwnerPublic|useFocusEffect/);
    const requests = readFileSync('app/(tabs)/requests/index.tsx', 'utf8');
    // Focus may activate the selected lazy section, but must not directly
    // issue an unconditional network refresh.
    expect(requests).not.toMatch(/useFocusEffect\(useCallback\(\(\) => \{[^}]*fetchUserRequests/);
    expect(requests).toContain('subscribeToUserRequests');
  });

  it('deduplicates mount/focus and performs zero extra calls for fresh tab switches', async () => {
    const client = new QueryClient();
    const fetchCount = vi.fn(async () => 16);
    const options = { queryKey: notificationUnreadKey('provider'), queryFn: fetchCount, staleTime: NOTIFICATION_UNREAD_STALE_MS };
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    for (let tab = 0; tab < 20; tab++) await client.fetchQuery(options);
    expect(fetchCount).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(options.queryKey)).toBe(16);
    client.clear();
  });

  it('retains the authoritative count on request failure, not a false zero', async () => {
    const client = new QueryClient();
    const queryKey = notificationUnreadKey('provider');
    client.setQueryData(queryKey, 16);
    await expect(client.fetchQuery({ queryKey, queryFn: async () => { throw new Error('unavailable'); }, staleTime: 0, retry: false })).rejects.toThrow('unavailable');
    expect(client.getQueryData(queryKey)).toBe(16);
    client.clear();
  });

  it('isolates identities and removes prior-account data on cleanup', async () => {
    const client = new QueryClient();
    client.setQueryData(notificationUnreadKey('provider'), 16);
    expect(client.getQueryData(notificationUnreadKey('customer'))).toBeUndefined();
    await client.cancelQueries({ queryKey: notificationUnreadKey('provider'), exact: true });
    client.removeQueries({ queryKey: notificationUnreadKey('provider'), exact: true });
    expect(client.getQueryData(notificationUnreadKey('provider'))).toBeUndefined();
    client.clear();
  });

  it('publishes successful reads only to mounted subscribers with captured uid', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNotificationReads(listener);
    publishNotificationRead({ uid: 'original-provider', type: 'replace', unreadCount: 15 });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ uid: 'original-provider', type: 'replace', unreadCount: 15 });
    unsubscribe();
    publishNotificationRead({ uid: 'next-user', type: 'replace', unreadCount: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps exact item and mark-all counts in the shared cache without refetching', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const release = retainNotificationUnread(client, 'provider');
    client.setQueryData(notificationUnreadKey('provider'), 16);
    publishNotificationRead({ uid: 'provider', type: 'replace', unreadCount: 15 });
    expect(client.getQueryData(notificationUnreadKey('provider'))).toBe(15);
    publishNotificationRead({ uid: 'provider', type: 'replace', unreadCount: 0 });
    expect(client.getQueryData(notificationUnreadKey('provider'))).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
    release();
    client.clear();
  });

  it('refreshes once after invalidation rather than on every subsequent focus', async () => {
    const client = new QueryClient();
    const queryKey = notificationUnreadKey('provider');
    const fetchCount = vi.fn().mockResolvedValueOnce(16).mockResolvedValue(15);
    const options = { queryKey, queryFn: fetchCount, staleTime: NOTIFICATION_UNREAD_STALE_MS };
    await client.fetchQuery(options);
    await client.invalidateQueries({ queryKey, exact: true });
    expect(await client.fetchQuery(options)).toBe(15);
    await client.fetchQuery(options);
    expect(fetchCount).toHaveBeenCalledTimes(2);
    client.clear();
  });
});