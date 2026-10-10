import React, { Suspense, useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { InteractionManager, View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, ShieldAlert } from 'lucide-react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import type { RequestFirestoreCursor } from '@/services/requestRealtimeService';
import RequestCard from '@/components/RequestCard';
import EmptyState from '@/components/EmptyState';
import type { Equipment, EquipmentRequest } from '@/types';
import { mobilePerformance } from '@/utils/mobilePerformance';
import { driverRequestsAllowed, requestSections, resolveRequestSection } from '@/services/requestSections';
import { safeErrorMessage } from '@/services/errorMessages';
import { HeavyarSegment, HeavyarSegmentedControl, HeavyarSegmentText } from '@/components/ui/heavyar';
import { markRouteStage, startRouteModuleEvaluation } from '@/utils/routePerformance';

const requestsModuleEvaluation = startRouteModuleEvaluation('requests');
const DriverRequestsSection = React.lazy(() => import('@/components/DriverRequestsSection'));
const INITIAL_REQUESTS_TIMEOUT_MS = 15_000;

export default function RequestsScreen() {
  markRouteStage('requests', 'component_first_execute');
  const { user } = useAuth();
  const { isRTL, t } = useLanguage();
  const router = useRouter();
  const { section, status } = useLocalSearchParams<{ section?: string; status?: string }>();
  const selected = resolveRequestSection(user?.role, section, status, user?.accountPurpose);
  const restrictedDriverDeepLink = section === 'drivers' && !driverRequestsAllowed(user);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useLayoutEffect(() => {
    markRouteStage('requests', 'react_commit');
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => markRouteStage('requests', 'visible_shell'));
    return () => cancelAnimationFrame(frame);
  });
  if (!user) return <EquipmentRequestsSection />;
  return <View style={styles.container}>
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.headerRow}><Text style={styles.title}>{t('my_requests')}</Text></View>
      <HeavyarSegmentedControl mx="$md" mb="$md" flexDirection={isRTL ? 'row-reverse' : 'row'}>
        {requestSections(user.role, user.accountPurpose).map(value => <HeavyarSegment key={value} accessibilityRole="tab"
          accessibilityState={{ selected: selected === value }}
          selected={selected === value}
          onPress={() => router.setParams({ section: value, status: '' })}>
          <HeavyarSegmentText selected={selected === value} fontSize={11}>{value === 'drivers' ? t(user.role === 'driver' ? 'driver_job_requests' : 'driver_requests')
            : value === 'active' ? (isRTL ? 'الإيجارات النشطة' : 'Active rentals') : (isRTL ? 'طلبات المعدات' : 'Equipment requests')}</HeavyarSegmentText>
        </HeavyarSegment>)}
      </HeavyarSegmentedControl>
      {restrictedDriverDeepLink ? <View accessibilityRole="alert" style={[styles.restrictedMessage, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.restrictedIcon}><ShieldAlert size={18} color={Colors.gold} strokeWidth={2} /></View>
        <Text style={[styles.restrictedText, { textAlign: isRTL ? 'right' : 'left' }]}>
          {isRTL ? 'طلبات السائقين غير متاحة لحساب مراجعة المتجر.' : 'Driver requests are unavailable for this Store Review account.'}
        </Text>
      </View> : null}
      {focused ? selected === 'drivers'
        ? <Suspense fallback={<View style={styles.sectionLoading}><ActivityIndicator color={Colors.gold} /></View>}>
          <DriverRequestsSection key={`${user.uid}:${user.role}`} />
        </Suspense>
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
  const [cursor, setCursor] = useState<RequestFirestoreCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasOlderPages, setHasOlderPages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [initialDataPending, setInitialDataPending] = useState(true);
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);
  const subscriptionIdentity = useRef('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const firstPageCursorRef = useRef<RequestFirestoreCursor | null>(null);
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
      setInitialDataPending(true);
    }
    setLoadError('');
    if (!currentUid) {
      setRequests([]);
      return;
    }
    let unsubscribe: () => void = () => {};
    let firstFrame = 0;
    let secondFrame = 0;
    let dataTimer: ReturnType<typeof setTimeout> | undefined;
    let initialDataTimer: ReturnType<typeof setTimeout> | undefined;
    let dataInteraction: { cancel(): void } | undefined;
    initialDataTimer = setTimeout(() => {
      if (!active || identityRef.current !== identity) return;
      setInitialDataPending(false);
      setLoadError(safeErrorMessage(new Error('REQUESTS_TIMEOUT'), isRTL ? 'ar' : 'en'));
      markRouteStage('requests', 'fresh_data_complete');
    }, INITIAL_REQUESTS_TIMEOUT_MS);
    const startData = () => void import('@/services/requestRealtimeService').then(service => {
      if (!active || identityRef.current !== identity) return;
      unsubscribe = service.subscribeToRequestPage(currentUid, requestPerspective, (page) => {
        if (!active || identityRef.current !== identity) return;
        if (initialDataTimer) clearTimeout(initialDataTimer);
        setLoadError('');
        setInitialDataPending(false);
        markRouteStage('requests', 'data_available');
        markRouteStage('requests', 'fresh_data_complete');
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
        void service.fetchRequestEquipmentByIds(service.requestEquipmentIdsNeedingHydration(page.items)).then((equipment) => {
          if (!active || identityRef.current !== identity) return;
          setEquipmentById(previous => new Map([...previous, ...equipment]));
        }).catch(error => { if (active && identityRef.current === identity) setLoadError(safeErrorMessage(error, isRTL ? 'ar' : 'en')); });
      }, error => {
        if (active && identityRef.current === identity) {
          if (initialDataTimer) clearTimeout(initialDataTimer);
          setInitialDataPending(false);
          setLoadError(safeErrorMessage(error, isRTL ? 'ar' : 'en'));
          markRouteStage('requests', 'fresh_data_complete');
        }
      });
    }).catch(error => {
      if (active && identityRef.current === identity) {
        if (initialDataTimer) clearTimeout(initialDataTimer);
        setInitialDataPending(false);
        setLoadError(safeErrorMessage(error, isRTL ? 'ar' : 'en'));
        markRouteStage('requests', 'fresh_data_complete');
      }
    });
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        dataInteraction = InteractionManager.runAfterInteractions(() => {
          dataTimer = setTimeout(startData, 100);
        });
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      dataInteraction?.cancel();
      if (dataTimer) clearTimeout(dataTimer);
      if (initialDataTimer) clearTimeout(initialDataTimer);
      unsubscribe();
    };
  }, [currentUid, requestPerspective, identity, subscriptionAttempt]);

  const renderItem = useCallback(({ item }: { item: EquipmentRequest }) => (
    <RequestCard request={item} equipment={equipmentById.get(item.equipmentId)} />
  ), [equipmentById]);

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const service = await import('@/services/requestRealtimeService');
      const page = await service.fetchRequestPage(currentUid, requestPerspective, cursor);
      const equipment = await service.fetchRequestEquipmentByIds(service.requestEquipmentIdsNeedingHydration(page.items));
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
      const service = await import('@/services/requestRealtimeService');
      const page = await service.fetchRequestPage(currentUid, requestPerspective);
      const equipment = await service.fetchRequestEquipmentByIds(service.requestEquipmentIdsNeedingHydration(page.items));
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
          <View style={styles.guestViewport}>
            <View style={styles.guestContainer}>
              <View style={styles.guestIconSurface}>
                <Lock size={28} color={Colors.gold} strokeWidth={2} />
              </View>
              <Text style={styles.guestTitle}>{t('login_required')}</Text>
              <Text style={styles.guestDesc}>{t('login_required_message')}</Text>
              <View style={[styles.guestActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Pressable style={styles.guestPrimary} onPress={() => router.push('/login')}>
                  <Text style={styles.guestPrimaryText}>{t('go_to_login')}</Text>
                </Pressable>
                <Pressable style={styles.guestSecondary} onPress={() => router.push('/register')}>
                  <Text style={styles.guestSecondaryText}>{t('register')}</Text>
                </Pressable>
              </View>
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
          contentContainerStyle={[styles.listContent, visibleRequests.length === 0 && styles.emptyListContent]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={initialDataPending
            ? <View style={styles.sectionLoading}><ActivityIndicator color={Colors.gold} /></View>
            : <EmptyState title={t('no_requests')} />}
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
  restrictedMessage: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  restrictedIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card },
  restrictedText: { flex: 1, color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  guestViewport: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  guestContainer: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: Colors.card,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guestIconSurface: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 2,
  },
  guestTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  guestDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 300,
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
    flex: 1, marginHorizontal: 4, marginBottom: 14, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center',
  },
  driverRequestsText: { color: Colors.gold, fontSize: 14, fontWeight: '700' },
  title: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800' as const,
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
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  paginationFooter: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  staleText: { color: Colors.textMuted, fontSize: 12, textDecorationLine: 'underline' },
  loadMoreButton: { backgroundColor: Colors.gold, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 11 },
  loadMoreText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  sectionLoading: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center' },
});

requestsModuleEvaluation.complete();
