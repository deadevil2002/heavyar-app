import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, userA, userB } = vi.hoisted(() => {
  const userA = { uid: 'A', getIdToken: vi.fn(async () => 'token-A') };
  const userB = { uid: 'B', getIdToken: vi.fn(async () => 'token-B') };
  return { auth: { currentUser: userA }, userA, userB };
});
vi.mock('../services/firebaseConfig', () => ({ getFirebaseAuth: () => auth }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { getNotificationUnreadCount, listNotifications, markAllNotificationsRead } from '../services/notificationService';
import { subscribeNotificationReads } from '../services/notificationUnreadPolicy';

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
  it('marks bounded batches with one read event and no intermediate count requests', async () => {
    const listener = vi.fn();
    const release = subscribeNotificationReads(listener);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, hasMore: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, hasMore: false })));
    try {
      await expect(markAllNotificationsRead(10, 'A')).resolves.toEqual({ hasMore: false, remainingCount: 0 });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledExactlyOnceWith('A');
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
      expect(listener).toHaveBeenCalledExactlyOnceWith('A');
    } finally { release(); }
  });
});