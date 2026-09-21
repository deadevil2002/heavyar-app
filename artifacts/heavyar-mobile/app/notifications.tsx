import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { createNotificationOperationGuard } from '@/services/notificationOperationGuard';
import {
  defaultPreferences,
  getNotificationPreferences,
  updateNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationActionRoute,
  type NotificationItem,
  type NotificationPreferences,
} from '@/services/notificationService';

export default function NotificationsScreen() {
  const { t, isRTL, localizedText } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const uid = isAuthenticated ? user?.uid || '' : '';
  const operations = useRef(createNotificationOperationGuard()).current;
  operations.setIdentity(uid);
  useEffect(() => () => operations.invalidate(), [operations]);
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [savingPreference, setSavingPreference] = useState<string | null>(null);
  const [readAllRemaining, setReadAllRemaining] = useState(0);

  const load = useCallback(async (append = false) => {
    if (!uid) return;
    const isCurrent = operations.begin(uid, 'load');
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const [page, prefs] = await Promise.all([
        listNotifications(append ? nextPageToken : null, uid),
        append ? Promise.resolve(preferences) : getNotificationPreferences(uid),
      ]);
      if (!isCurrent()) return;
      setItems((current) => {
        const combined = append ? [...current, ...page.notifications] : page.notifications;
        return [...new Map(combined.map(item => [item.id, item])).values()];
      });
      setNextPageToken(page.nextPageToken || null);
      setUnreadCount(page.unreadCount);
      if (!append) setPreferences(prefs);
    } catch (e) {
      if (!isCurrent()) return;
      setError((e as Error).message === 'SESSION_EXPIRED' ? t('session_expired') : t('notifications_error'));
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [uid, nextPageToken, operations, preferences, t]);

  useEffect(() => {
    setItems([]);
    setUnreadCount(0);
    setNextPageToken(null);
    setPreferences(defaultPreferences);
    setOpeningId(null);
    setSavingPreference(null);
    setLoadingMore(false);
    setReadAllRemaining(0);
    setError(null);
    setLoading(!!uid);
    void load();
  }, [uid]); // only reload on actual identity changes, not preference edits

  const openItem = useCallback(async (item: NotificationItem) => {
    if (openingId || !uid) return;
    const isCurrent = operations.begin(uid, 'open');
    setOpeningId(item.id);
    try {
      if (!item.read) {
        await markNotificationRead(item.id, uid);
        if (!isCurrent()) return;
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      if (!isCurrent()) return;
      const route = notificationActionRoute(item.action);
      if (route) router.push(route as never);
    } catch {
      if (isCurrent()) setError(t('notifications_error'));
    } finally {
      if (isCurrent()) setOpeningId(null);
    }
  }, [openingId, operations, router, t, uid]);

  const markAll = useCallback(async () => {
    if (!unreadCount || !uid) return;
    const isCurrent = operations.begin(uid, 'markAll');
    try {
      const result = await markAllNotificationsRead(10, uid);
      if (!isCurrent()) return;
      if (!result.hasMore) setItems((current) => current.map((item) => ({ ...item, read: true })));
      setUnreadCount(result.remainingCount);
      setReadAllRemaining(result.hasMore ? result.remainingCount : 0);
      if (result.hasMore) await load();
    } catch { if (isCurrent()) setError(t('notifications_error')); }
  }, [load, operations, t, unreadCount, uid]);

  const togglePreference = useCallback(async (category: keyof NotificationPreferences) => {
    if (!uid || category === 'payment' || category === 'verification' || category === 'security' || savingPreference) return;
    const isCurrent = operations.begin(uid, 'preference');
    const next = { ...preferences, [category]: !preferences[category] };
    setPreferences(next);
    setSavingPreference(category);
    try {
      const saved = await updateNotificationPreferences(next, uid);
      if (!isCurrent()) return;
      setPreferences(saved);
    } catch {
      if (!isCurrent()) return;
      setPreferences(preferences);
      setError(t('notifications_error'));
    } finally {
      if (isCurrent()) setSavingPreference(null);
    }
  }, [operations, preferences, savingPreference, t, uid]);

  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => router.back()} style={styles.iconButton}>
          <ChevronLeft size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{t('notifications')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('mark_all_read')} onPress={markAll} style={styles.iconButton} disabled={!unreadCount}>
          <CheckCheck size={22} color={unreadCount ? Colors.gold : Colors.textMuted} />
        </Pressable>
      </View>
      <View style={[styles.preferenceBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={styles.preferenceText}>{t('notification_preferences')}</Text>
        <Text style={styles.preferenceValue}>{Object.values(preferences).filter(Boolean).length}/{Object.keys(preferences).length}</Text>
      </View>
      <View style={styles.preferenceList}>
        {(Object.keys(preferences) as Array<keyof NotificationPreferences>).map((category) => {
          const critical = category === 'payment' || category === 'verification' || category === 'security';
          return (
            <View key={category} style={[styles.preferenceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={styles.preferenceLabel}>{t(`notification_${category}` as never)}{critical ? ` (${t('required')})` : ''}</Text>
              <Switch
                accessibilityRole="switch"
                accessibilityLabel={t(`notification_${category}` as never)}
                accessibilityState={{ checked: preferences[category], disabled: critical || savingPreference !== null }}
                value={preferences[category]}
                disabled={critical || savingPreference !== null}
                onValueChange={() => void togglePreference(category)}
                trackColor={{ false: Colors.border, true: Colors.goldDark }}
                thumbColor={preferences[category] ? Colors.gold : Colors.textMuted}
              />
            </View>
          );
        })}
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
                disabled={openingId !== null}
                onPress={() => void openItem(item)}
                style={[styles.card, !item.read && styles.unreadCard, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              >
                <View style={styles.dot}>{!item.read && <View style={styles.dotInner} />}</View>
                <View style={styles.copy}>
                  <Text style={[styles.itemTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{localizedText(item.titleAr, item.titleEn)}</Text>
                  {item.bodyAr || item.bodyEn ? <Text style={[styles.itemBody, { textAlign: isRTL ? 'right' : 'left' }]}>{localizedText(item.bodyAr || '', item.bodyEn || '')}</Text> : null}
                  <Text style={[styles.date, { textAlign: isRTL ? 'right' : 'left' }]}>{new Date(item.createdAt).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US')}</Text>
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
  title: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },
  preferenceBar: { alignItems: 'center', justifyContent: 'space-between', margin: 16, padding: 14, borderRadius: 12, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  preferenceText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  preferenceValue: { color: Colors.gold, fontWeight: '700' },
  preferenceList: { marginHorizontal: 16, marginBottom: 8, gap: 2 },
  preferenceRow: { minHeight: 48, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.card },
  preferenceLabel: { color: Colors.textPrimary, fontSize: 13 },
  list: { padding: 16, gap: 10 },
  emptyList: { flexGrow: 1 },
  card: { minHeight: 92, alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  unreadCard: { borderColor: Colors.gold },
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
  inlineError: { color: Colors.error, textAlign: 'center', padding: 8 },
});