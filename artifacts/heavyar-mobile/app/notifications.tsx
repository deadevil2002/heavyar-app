import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { createNotificationOperationGuard } from '@/services/notificationOperationGuard';
import { notificationUnreadKey } from '@/services/notificationUnreadPolicy';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  mergeNotificationPage,
  notificationActionRoute,
  type NotificationItem,
} from '@/services/notificationService';
import { mobilePerformance } from '@/utils/mobilePerformance';

export default function NotificationsScreen() {
  mobilePerformance.countRender('Notifications');
  const { t, isRTL, localizedText } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const uid = isAuthenticated ? user?.uid || '' : '';
  const operations = useRef(createNotificationOperationGuard()).current;
  const openingItems = useRef(new Set<string>()).current;
  operations.setIdentity(uid);
  useEffect(() => () => operations.invalidate(), [operations]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [readAllRemaining, setReadAllRemaining] = useState(0);

  const load = useCallback(async (append = false) => {
    if (!uid) return;
    const isCurrent = operations.begin(uid, 'load');
    const mutationSnapshot = operations.mutationSnapshot();
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await listNotifications(append ? nextPageToken : null, uid);
      if (!isCurrent()) return;
      setItems((current) => mergeNotificationPage(current, page.notifications, append));
      setNextPageToken(page.nextPageToken || null);
      if (operations.mutationIsCurrent(mutationSnapshot)) {
        setUnreadCount(page.unreadCount);
        queryClient.setQueryData(notificationUnreadKey(uid), page.unreadCount);
      }
    } catch (e) {
      if (!isCurrent()) return;
      setError((e as Error).message === 'SESSION_EXPIRED' ? t('session_expired') : t('notifications_error'));
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [uid, nextPageToken, operations, queryClient, t]);

  useEffect(() => {
    setItems([]);
    setUnreadCount(0);
    setNextPageToken(null);
    setOpeningId(null);
    setMutationBusy(false);
    setLoadingMore(false);
    setReadAllRemaining(0);
    setError(null);
    setLoading(!!uid);
    void load();
  }, [uid]); // only reload on actual identity changes, not preference edits

  const openItem = useCallback(async (item: NotificationItem) => {
    if (openingId || openingItems.has(item.id) || !uid) return;
    const mutationLock = operations.tryLockMutation();
    if (mutationLock === null) return;
    openingItems.add(item.id);
    setMutationBusy(true);
    const isCurrent = operations.beginMutation(uid, 'open');
    const countCancellation = queryClient.cancelQueries({ queryKey: notificationUnreadKey(uid), exact: true });
    setOpeningId(item.id);
    try {
      const route = notificationActionRoute(item.action);
      // Legacy, malformed, and unsupported records are inbox-only. Do not
      // acknowledge them: there is no safe destination to take the user to.
      if (!route) return;
      let readError = false;
      if (!item.read) {
        try {
          const authoritativeCount = await operations.serializeWrite(async () => {
            await countCancellation;
            return markNotificationRead(item.id, uid);
          });
          if (!isCurrent()) return;
          setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
          setUnreadCount(authoritativeCount);
        } catch {
          // A notification destination must remain usable when the read
          // acknowledgement is unavailable. The service reconciles the
          // shared badge when possible; navigation is intentionally separate.
          readError = true;
        }
      }
      if (!isCurrent()) return;
      router.push(route as never);
      if (readError && isCurrent()) setError(t('notifications_error'));
    } catch {
      if (isCurrent()) setError(t('notifications_error'));
    } finally {
      openingItems.delete(item.id);
      operations.unlockMutation(mutationLock);
      setMutationBusy(false);
      if (isCurrent()) setOpeningId(null);
    }
  }, [openingId, openingItems, operations, queryClient, router, t, uid]);

  const markAll = useCallback(async () => {
    if (!unreadCount || !uid) return;
    const mutationLock = operations.tryLockMutation();
    if (mutationLock === null) return;
    setMutationBusy(true);
    const isCurrent = operations.beginMutation(uid, 'markAll');
    const countCancellation = queryClient.cancelQueries({ queryKey: notificationUnreadKey(uid), exact: true });
    try {
      const result = await operations.serializeWrite(async () => {
        await countCancellation;
        return markAllNotificationsRead(10, uid);
      });
      if (!isCurrent()) return;
      if (!result.hasMore) setItems((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadCount(result.remainingCount);
      setReadAllRemaining(result.hasMore ? result.remainingCount : 0);
      if (result.hasMore) await load();
    } catch { if (isCurrent()) setError(t('notifications_error')); }
    finally {
      operations.unlockMutation(mutationLock);
      setMutationBusy(false);
    }
  }, [load, operations, queryClient, t, unreadCount, uid]);

  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const BackChevron = isRTL ? ChevronRight : ChevronLeft;
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.back()} style={styles.iconButton}>
          <BackChevron size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{t('notifications')}</Text>
        <Pressable testID="notifications-mark-all" accessibilityRole="button" accessibilityLabel={t('mark_all_read')} onPress={markAll} style={styles.markAllButton} disabled={!unreadCount || mutationBusy}>
          <CheckCheck size={22} color={unreadCount ? Colors.gold : Colors.textMuted} />
          <Text style={[styles.markAllText, !unreadCount && styles.markAllTextDisabled]}>{t('mark_all_read')}</Text>
        </Pressable>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={Colors.gold} /><Text style={styles.muted}>{t('loading')}</Text></View> :
        error && !items.length ? <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('try_again')} onPress={() => void load()} style={styles.retry}><RefreshCw size={17} color={Colors.primary} /><Text style={styles.retryText}>{t('try_again')}</Text></Pressable></View> :
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={items.length ? styles.list : styles.emptyList}
            onRefresh={() => void load()}
            refreshing={loading}
            onEndReached={() => { if (nextPageToken && !loadingMore) void load(true); }}
            onEndReachedThreshold={0.4}
            ListEmptyComponent={<View style={styles.center}><Bell size={38} color={Colors.textMuted} /><Text style={styles.muted}>{t('no_notifications')}</Text></View>}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.gold} /> : null}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${localizedText(item.titleAr, item.titleEn)}${item.read ? '' : `, ${t('unread')}`}`}
                accessibilityState={{ busy: openingId === item.id, selected: !item.read }}
                disabled={openingId !== null || mutationBusy}
                onPress={() => void openItem(item)}
                style={[styles.card, !item.read && styles.unreadCard, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              >
                <View style={styles.dot}>{!item.read && <View style={styles.dotInner} />}</View>
                <View style={styles.copy}>
                  <Text style={[styles.itemTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{localizedText(item.titleAr, item.titleEn)}</Text>
                  {item.bodyAr || item.bodyEn ? <Text style={[styles.itemBody, { textAlign: isRTL ? 'right' : 'left' }]}>{localizedText(item.bodyAr || '', item.bodyEn || '')}</Text> : null}
                  {Number.isFinite(Date.parse(item.createdAt)) ? <Text style={[styles.date, { textAlign: isRTL ? 'right' : 'left' }]}>{new Date(item.createdAt).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}</Text> : null}
                </View>
                <Chevron size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          />}
      {error && items.length ? <Text style={styles.inlineError}>{error}</Text> : null}
      {readAllRemaining > 0 ? <Text style={styles.inlineError}>{t('notifications_remaining')}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.textPrimary, fontSize: 20, fontWeight: '800' },
  list: { padding: 16, gap: 10 },
  emptyList: { flexGrow: 1 },
  card: { minHeight: 92, alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  unreadCard: { borderColor: Colors.gold, backgroundColor: Colors.surfaceLight },
  dot: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  copy: { flex: 1 },
  itemTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  itemBody: { color: Colors.textMuted, marginTop: 4, lineHeight: 20 },
  date: { color: Colors.textMuted, fontSize: 11, marginTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  muted: { color: Colors.textMuted, textAlign: 'center' },
  error: { color: Colors.error, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 18, borderRadius: 10, backgroundColor: Colors.gold, flexDirection: 'row', gap: 8, alignItems: 'center' },
  retryText: { color: Colors.primary, fontWeight: '700' },
  markAllButton: { minHeight: 44, maxWidth: 150, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'flex-end' },
  markAllText: { color: Colors.gold, fontSize: 12, fontWeight: '700' },
  markAllTextDisabled: { color: Colors.textMuted },
  inlineError: { color: Colors.error, textAlign: 'center', padding: 8 },
});
