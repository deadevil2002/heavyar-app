import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchEquipmentByIds,
  fetchUserRequests,
  FirestoreCursor,
  subscribeToUserRequests,
} from '@/services/firestoreService';
import RequestCard from '@/components/RequestCard';
import EmptyState from '@/components/EmptyState';
import { Equipment, EquipmentRequest } from '@/types';
import { mobilePerformance } from '@/utils/mobilePerformance';
import DriverRequestsSection from '@/components/DriverRequestsSection';
import { requestSections, resolveRequestSection } from '@/services/requestSections';
import { safeErrorMessage } from '@/services/errorMessages';

export default function RequestsScreen() {
  const { user } = useAuth();
  const { isRTL, t } = useLanguage();
  const router = useRouter();
  const { section, status } = useLocalSearchParams<{ section?: string; status?: string }>();
  const selected = resolveRequestSection(user?.role, section, status);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  if (!user) return <EquipmentRequestsSection />;
  return <View style={styles.container}>
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.headerRow}><Text style={styles.title}>{t('my_requests')}</Text></View>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap' }}>
        {requestSections(user.role).map(value => <Pressable key={value} accessibilityRole="tab"
          accessibilityState={{ selected: selected === value }}
          style={[styles.driverRequestsLink, selected === value && { borderColor: Colors.gold }]}
          onPress={() => router.setParams({ section: value, status: '' })}>
          <Text style={styles.driverRequestsText}>{value === 'drivers' ? (isRTL ? 'طلبات السائقين' : 'Driver requests')
            : value === 'active' ? (isRTL ? 'الإيجارات النشطة' : 'Active rentals') : (isRTL ? 'طلبات المعدات' : 'Equipment requests')}</Text>
        </Pressable>)}
      </View>
      {focused ? selected === 'drivers'
        ? <DriverRequestsSection key={`${user.uid}:${user.role}`} />
        : <EquipmentRequestsSection key={`${user.uid}:${user.role}`} activeOnly={selected === 'active'} /> : null}
    </SafeAreaView>
  </View>;
}

function EquipmentRequestsSection({ activeOnly = false }: { activeOnly?: boolean }) {
  mobilePerformance.countRender('Requests');
  const { isRTL, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<EquipmentRequest[]>([]);
  const [equipmentById, setEquipmentById] = useState<Map<string, Equipment>>(new Map());
  const [cursor, setCursor] = useState<FirestoreCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasOlderPages, setHasOlderPages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const subscriptionIdentity = useRef('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const firstPageCursorRef = useRef<FirestoreCursor | null>(null);
  const firstPageHasMoreRef = useRef(false);
  const hasOlderPagesRef = useRef(false);
  const visibleRequests = useMemo(() => activeOnly
    ? requests.filter(item => ['accepted', 'in_progress', 'completion_requested'].includes(item.status))
    : requests, [requests, activeOnly]);
  useEffect(() => { mobilePerformance.markContextCommit('Requests:auth'); }, [user]);
  useEffect(() => { mobilePerformance.markContextCommit('Requests:language'); }, [t, isRTL]);

  const currentUid = user?.uid || '';
  const requestPerspective = user?.role === 'provider' ? 'provider' : 'customer';
  const identity = `${currentUid}:${requestPerspective}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;

  useEffect(() => {
    // Never merge a previous identity's older pages into the next account.
    let active = true;
    if (subscriptionIdentity.current !== identity) {
      subscriptionIdentity.current = identity;
      setRequests([]);
      setEquipmentById(new Map());
      setCursor(null);
      setHasMore(false);
      setHasOlderPages(false);
      setLoadingMore(false);
      hasOlderPagesRef.current = false;
      firstPageCursorRef.current = null;
      firstPageHasMoreRef.current = false;
    }
    setLoadError('');
    if (!currentUid) {
      setRequests([]);
      return;
    }
    const unsub = subscribeToUserRequests(currentUid, requestPerspective, (page) => {
      if (!active || identityRef.current !== identity) return;
      setLoadError('');
      mobilePerformance.markRefetch('Requests:bounded-live-page');
      setRequests((previous) => {
        const older = previous.slice(20);
        const liveIds = new Set(page.items.map(item => item.id));
        return [...page.items, ...older.filter(item => !liveIds.has(item.id))];
      });
      firstPageCursorRef.current = page.cursor;
      firstPageHasMoreRef.current = page.hasMore;
      if (!hasOlderPagesRef.current) {
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      }
      void fetchEquipmentByIds(page.items.map(item => item.equipmentId)).then((equipment) => {
        if (!active || identityRef.current !== identity) return;
        setEquipmentById(previous => new Map([...previous, ...equipment]));
      }).catch(error => { if (active && identityRef.current === identity) setLoadError(safeErrorMessage(error, isRTL ? 'ar' : 'en')); });
    }, error => {
      if (active && identityRef.current === identity) setLoadError(safeErrorMessage(error, isRTL ? 'ar' : 'en'));
    });
    return () => { active = false; unsub(); };
  }, [currentUid, requestPerspective, identity, subscriptionAttempt]);

  const renderItem = useCallback(({ item }: { item: EquipmentRequest }) => (
    <RequestCard request={item} equipment={equipmentById.get(item.equipmentId)} />
  ), [equipmentById]);

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchUserRequests(currentUid, requestPerspective, cursor);
      const equipment = await fetchEquipmentByIds(page.items.map(item => item.equipmentId));
      if (!mounted.current || identityRef.current !== identity) return;
      setEquipmentById(previous => new Map([...previous, ...equipment]));
      setRequests(previous => {
        const seen = new Set(previous.map(item => item.id));
        return [...previous, ...page.items.filter(item => !seen.has(item.id))];
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setHasOlderPages(true);
      hasOlderPagesRef.current = true;
    } catch (error) {
      if (mounted.current) setLoadError(safeErrorMessage(error, isRTL ? 'ar' : 'en'));
    } finally {
      if (mounted.current && identityRef.current === identity) setLoadingMore(false);
    }
  }, [cursor, currentUid, hasMore, identity, loadingMore, requestPerspective]);

  const refreshOlder = useCallback(() => {
    setRequests(previous => previous.slice(0, 20));
    setHasOlderPages(false);
    hasOlderPagesRef.current = false;
    setCursor(firstPageCursorRef.current);
    setHasMore(firstPageHasMoreRef.current);
  }, []);

  const refresh = async () => {
    if (refreshing || loadingMore) return;
    setRefreshing(true);
    setLoadError('');
    try {
      const page = await fetchUserRequests(currentUid, requestPerspective);
      const equipment = await fetchEquipmentByIds(page.items.map(item => item.equipmentId));
      if (!mounted.current) return;
      setRequests(page.items);
      setEquipmentById(equipment);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      firstPageCursorRef.current = page.cursor;
      firstPageHasMoreRef.current = page.hasMore;
      hasOlderPagesRef.current = false;
      setHasOlderPages(false);
    } catch (error) {
      if (mounted.current) setLoadError(safeErrorMessage(error, isRTL ? 'ar' : 'en'));
    } finally { if (mounted.current) setRefreshing(false); }
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.guestContainer}>
            <Lock size={48} color={Colors.textMuted} />
            <Text style={[styles.guestTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('login_required')}</Text>
            <Text style={[styles.guestDesc, { textAlign: isRTL ? 'right' : 'left' }]}>{t('login_required_message')}</Text>
            <View style={[styles.guestActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable style={styles.guestPrimary} onPress={() => router.push('/login')}>
                <Text style={styles.guestPrimaryText}>{t('go_to_login')}</Text>
              </Pressable>
              <Pressable style={styles.guestSecondary} onPress={() => router.push('/register')}>
                <Text style={styles.guestSecondaryText}>{t('register')}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={[]} style={styles.safeArea}>
        <FlatList
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          ListHeaderComponent={loadError ? <View>
            <Text accessibilityRole="alert" style={styles.staleText}>{loadError}</Text>
            <Pressable accessibilityRole="button" onPress={() => setSubscriptionAttempt(value => value + 1)}>
              <Text style={styles.driverRequestsText}>{isRTL ? 'إعادة المحاولة' : 'Retry'}</Text>
            </Pressable>
          </View> : null}
          data={visibleRequests}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState title={t('no_requests')} />}
          ListFooterComponent={requests.length || hasMore ? (
            <View style={styles.paginationFooter}>
              {hasOlderPages ? (
                <Pressable onPress={refreshOlder}>
                  <Text style={styles.staleText}>
                    {isRTL ? 'الطلبات الأقدم ليست مباشرة — تجاهل وإعادة تحميل' : 'Older requests are not live — discard and reload'}
                  </Text>
                </Pressable>
              ) : null}
              {hasMore ? (
                <Pressable style={styles.loadMoreButton} onPress={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Text style={styles.loadMoreText}>{isRTL ? 'تحميل المزيد' : 'Load more'}</Text>}
                </Pressable>
              ) : null}
            </View>
          ) : null}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  safeArea: {
    flex: 1,
  },
  guestContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guestTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  guestDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  guestActions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  guestPrimary: {
    flex: 1,
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestPrimaryText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  guestSecondary: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guestSecondaryText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  driverRequestsLink: {
    marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center',
  },
  driverRequestsText: { color: Colors.gold, fontSize: 14, fontWeight: '700' },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  tabBar: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.gold,
  },
  tabText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  paginationFooter: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  staleText: { color: Colors.textMuted, fontSize: 12, textDecorationLine: 'underline' },
  loadMoreButton: { backgroundColor: Colors.gold, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 11 },
  loadMoreText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
