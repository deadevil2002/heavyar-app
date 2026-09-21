import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const { auth, userA, userB } = vi.hoisted(() => {
  const userA = { uid: 'A', getIdToken: vi.fn(async () => 'token-A') };
  const userB = { uid: 'B', getIdToken: vi.fn(async () => 'token-B') };
  return { auth: { currentUser: userA }, userA, userB };
});
vi.mock('../services/firebaseConfig', () => ({ getFirebaseAuth: () => auth }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { getNotificationUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead, mergeNotificationPage, type NotificationItem } from '../services/notificationService';
import { notificationUnreadKey, retainNotificationUnread, subscribeNotificationReads } from '../services/notificationUnreadPolicy';

describe('unread service binds requests to the query identity', () => {
  beforeEach(() => { auth.currentUser = userA; vi.stubGlobal('fetch', vi.fn()); });
  it('does not fetch using B credentials under A cache key', async () => {
    auth.currentUser = userB;
    await expect(getNotificationUnreadCount('A')).rejects.toThrow('SESSION_EXPIRED');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a late A response after switching to B', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      auth.currentUser = userB;
      return new Response(JSON.stringify({ success: true, unreadCount: 16 }));
    });
    await expect(getNotificationUnreadCount('A')).rejects.toThrow('SESSION_EXPIRED');
  });
  it('passes cancellation to fetch and rejects cancelled responses', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      return new Response(JSON.stringify({ success: true, unreadCount: 16 }));
    });
    await expect(getNotificationUnreadCount('A', controller.signal)).rejects.toThrow('NOTIFICATION_REQUEST_ABORTED');
  });
  it('returns a validated count only for the matching identity', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true, unreadCount: 16 })));
    await expect(getNotificationUnreadCount('A')).resolves.toBe(16);
  });
  it('does not silently turn a missing list aggregate into a zero badge', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true, notifications: [] })));
    await expect(listNotifications(null, 'A')).rejects.toThrow('NOTIFICATION_COUNT_INVALID');
  });
  it('does not let an old refresh or cursor page revert a locally confirmed read', () => {
    const item = (id: string, read: boolean): NotificationItem => ({
      id, read, category: 'rental', titleAr: '', titleEn: id, createdAt: '2026-01-01T00:00:00Z',
    });
    expect(mergeNotificationPage([item('same', true)], [item('same', false)], false)).toEqual([item('same', true)]);
    expect(mergeNotificationPage([item('same', true)], [item('same', false), item('next', false)], true))
      .toEqual([item('same', true), item('next', false)]);
  });
  it('patches the shared UID cache exactly once after an item read', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const release = retainNotificationUnread(client, 'A');
    client.setQueryData(notificationUnreadKey('A'), 16);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, unreadCount: 15 })));
    try {
      await markNotificationRead('notification_1', 'A');
      expect(client.getQueryData(notificationUnreadKey('A'))).toBe(15);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      release();
      client.clear();
    }
  });
  it('keeps the authoritative count when an idempotent read targets an already-read document', async () => {
    const client = new QueryClient();
    const listener = vi.fn();
    const releaseCache = retainNotificationUnread(client, 'A');
    const releaseListener = subscribeNotificationReads(listener);
    client.setQueryData(notificationUnreadKey('A'), 16);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, unreadCount: 16 })));
    try {
      await markNotificationRead('already_read_1', 'A');
      expect(client.getQueryData(notificationUnreadKey('A'))).toBe(16);
      expect(listener).toHaveBeenCalledExactlyOnceWith({ uid: 'A', type: 'replace', unreadCount: 16 });
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      releaseListener();
      releaseCache();
      client.clear();
    }
  });
  it('does not double-decrement when a stale cursor item retries the same read', async () => {
    const client = new QueryClient();
    const listener = vi.fn();
    const releaseCache = retainNotificationUnread(client, 'A');
    const releaseListener = subscribeNotificationReads(listener);
    client.setQueryData(notificationUnreadKey('A'), 16);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, unreadCount: 15 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, unreadCount: 15 })));
    try {
      await markNotificationRead('stale_cursor_1', 'A');
      await markNotificationRead('stale_cursor_1', 'A');
      expect(client.getQueryData(notificationUnreadKey('A'))).toBe(15);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, { uid: 'A', type: 'replace', unreadCount: 15 });
      expect(listener).toHaveBeenNthCalledWith(2, { uid: 'A', type: 'replace', unreadCount: 15 });
      expect(fetch).toHaveBeenCalledTimes(4);
    } finally {
      releaseListener();
      releaseCache();
      client.clear();
    }
  });
  it('marks bounded batches with one read event and no intermediate count requests', async () => {
    const listener = vi.fn();
    const release = subscribeNotificationReads(listener);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, hasMore: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, hasMore: false })));
    try {
      await expect(markAllNotificationsRead(10, 'A')).resolves.toEqual({ hasMore: false, remainingCount: 0 });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledExactlyOnceWith({ uid: 'A', type: 'replace', unreadCount: 0 });
    } finally { release(); }
  });
  it('publishes partial success once when a later read batch fails', async () => {
    const listener = vi.fn();
    const release = subscribeNotificationReads(listener);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, hasMore: true })))
      .mockRejectedValueOnce(new Error('offline'));
    try {
      await expect(markAllNotificationsRead(10, 'A')).rejects.toThrow();
      expect(listener).toHaveBeenCalledExactlyOnceWith({ uid: 'A', type: 'invalidate' });
    } finally { release(); }
  });
});