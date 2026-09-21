import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { hasCapability } from '@/services/roleCapabilities';
import { mobilePerformance } from '@/utils/mobilePerformance';

export default function RequestsScreen() {
  mobilePerformance.countRender('Requests');
  const { isRTL, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status?: string }>();
  const [requests, setRequests] = useState<EquipmentRequest[]>([]);
  const [equipmentById, setEquipmentById] = useState<Map<string, Equipment>>(new Map());
  const [cursor, setCursor] = useState<FirestoreCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasOlderPages, setHasOlderPages] = useState(false);
  const firstPageCursorRef = useRef<FirestoreCursor | null>(null);
  const firstPageHasMoreRef = useRef(false);
  const hasOlderPagesRef = useRef(false);
  const visibleRequests = useMemo(() => status === 'active'
    ? requests.filter(item => ['accepted', 'in_progress', 'completion_requested'].includes(item.status))
    : requests, [requests, status]);
  useEffect(() => { mobilePerformance.markContextCommit('Requests:auth'); }, [user]);
  useEffect(() => { mobilePerformance.markContextCommit('Requests:language'); }, [t, isRTL]);

  const currentUid = user?.uid || '';
  const requestPerspective = user?.role === 'provider' ? 'provider' : 'customer';
  const identity = `${currentUid}:${requestPerspective}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const canViewDriverRequests = hasCapability(user?.role, 'driverRequests');

  useEffect(() => {
    // Never merge a previous identity's older pages into the next account.
    let active = true;
    setRequests([]);
    setEquipmentById(new Map());
    setCursor(null);
    setHasMore(false);
    setHasOlderPages(false);
    setLoadingMore(false);
    hasOlderPagesRef.current = false;
    firstPageCursorRef.current = null;
    firstPageHasMoreRef.current = false;
    if (!currentUid) {
      setRequests([]);
      return;
    }
    if (canViewDriverRequests) {
      setRequests([]);
      return;
    }
    const unsub = subscribeToUserRequests(currentUid, requestPerspective, (page) => {
      if (!active) return;
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
        if (!active) return;
        setEquipmentById(previous => new Map([...previous, ...equipment]));
      });
    });
    return () => { active = false; unsub(); };
  }, [canViewDriverRequests, currentUid, requestPerspective]);

  const renderItem = useCallback(({ item }: { item: EquipmentRequest }) => (
    <RequestCard request={item} equipment={equipmentById.get(item.equipmentId)} />
  ), [equipmentById]);

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchUserRequests(currentUid, requestPerspective, cursor);
      const equipment = await fetchEquipmentByIds(page.items.map(item => item.equipmentId));
      if (identityRef.current !== identity) return;
      setEquipmentById(previous => new Map([...previous, ...equipment]));
      setRequests(previous => {
        const seen = new Set(previous.map(item => item.id));
        return [...previous, ...page.items.filter(item => !seen.has(item.id))];
      });
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setHasOlderPages(true);
      hasOlderPagesRef.current = true;
    } finally {
      if (identityRef.current === identity) setLoadingMore(false);
    }
  }, [cursor, currentUid, hasMore, identity, loadingMore, requestPerspective]);

  const refreshOlder = useCallback(() => {
    setRequests(previous => previous.slice(0, 20));
    setHasOlderPages(false);
    hasOlderPagesRef.current = false;
    setCursor(firstPageCursorRef.current);
    setHasMore(firstPageHasMoreRef.current);
  }, []);

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
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('my_requests')}</Text>
        </View>
        {canViewDriverRequests ? (
          <Pressable accessibilityRole="button" testID="driver-requests-link" style={styles.driverRequestsLink} onPress={() => router.push('/driver/requests')}>
            <Text style={styles.driverRequestsText}>{isRTL ? 'طلبات السائقين' : 'Driver Requests'}</Text>
          </Pressable>
        ) : <FlatList
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
        />}
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
