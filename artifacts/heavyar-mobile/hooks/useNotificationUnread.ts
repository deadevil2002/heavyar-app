import { useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotificationUnreadCount } from '@/services/notificationService';
import { notificationUnreadKey, NOTIFICATION_UNREAD_STALE_MS, retainNotificationUnread } from '@/services/notificationUnreadPolicy';
import { mobilePerformance } from '@/utils/mobilePerformance';

function fetchUnread({ queryKey, signal }: { queryKey: readonly ['notification-unread', string]; signal: AbortSignal }) {
  mobilePerformance.markRefetch('Tabs:notification-unread');
  return getNotificationUnreadCount(queryKey[1], signal);
}

export function useNotificationUnread(uid: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: notificationUnreadKey(uid),
    queryFn: fetchUnread,
    enabled: !!uid,
    staleTime: NOTIFICATION_UNREAD_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
  useEffect(() => {
    if (!uid) return;
    return retainNotificationUnread(client, uid);
  }, [client, uid]);
  useFocusEffect(useCallback(() => {
    if (!uid) return;
    // fetchQuery reuses fresh data and deduplicates concurrent mount/focus.
    // No interval and no unconditional nested-focus refetch.
    void client.fetchQuery({
      queryKey: notificationUnreadKey(uid),
      queryFn: fetchUnread,
      staleTime: NOTIFICATION_UNREAD_STALE_MS,
      retry: false,
    }).catch(() => undefined); // query.error exposes failure; keep the last count
  }, [client, uid]));
  return { unreadCount: uid ? query.data : undefined, error: query.error };
}