import React, { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDriverRequests, transitionDriverRequestAction, type DriverRequest } from '@/services/workerClient';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { getRequestStatusLabel } from '@/services/driverUtils';
import EmptyState from '@/components/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { LatestRequestGuard, mergeUniqueById, refreshLoadedPages } from '@/services/driverLiveSync';
import { safeErrorMessage } from '@/services/errorMessages';

export default function DriverRequestsScreen() {
  const { isRTL, t } = useLanguage();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const [requests, setRequests] = useState<DriverRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const nextCursorRef = useRef<string | undefined>(undefined);
  const loadedPagesRef = useRef(1);
  const authKeyRef = useRef('');
  const loadingMoreRef = useRef(false);
  const guardRef = useRef(new LatestRequestGuard());
  const wrongRole = isAuthenticated && user?.role !== 'driver';

  const fetchRequests = useCallback(async (append = false, silent = false) => {
    if (authLoading) {
      guardRef.current.cancel();
      setRequests([]);
      setError(false);
      setLoading(true);
      return;
    }
    if (!isAuthenticated || wrongRole) {
      guardRef.current.cancel();
      setRequests([]);
      setError(false);
      setLoading(false);
      setLoadingMore(false);
      nextCursorRef.current = undefined;
      setNextCursor(undefined);
      loadedPagesRef.current = 1;
      return;
    }
    if (append && (!nextCursorRef.current || loadingMoreRef.current)) return;
    const request = guardRef.current.begin();
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      loadingMoreRef.current = false;
      setLoadingMore(false);
      if (!silent) setLoading(true);
    }
    setError(false);
    try {
      if (append) {
        const res = await getDriverRequests({ cursor: nextCursorRef.current, limit: 20 }, request.signal);
        if (!guardRef.current.isCurrent(request.generation)) return;
        setRequests(previous => mergeUniqueById(previous, res.requests));
        loadedPagesRef.current += 1;
        nextCursorRef.current = res.nextCursor;
        setNextCursor(res.nextCursor);
      } else {
        const authKey = user?.uid || '';
        const pagesToRefresh = authKeyRef.current === authKey ? loadedPagesRef.current : 1;
        const result = await refreshLoadedPages(pagesToRefresh, async cursor => {
          const page = await getDriverRequests({ cursor, limit: 20 }, request.signal);
          return { items: page.requests, nextCursor: page.nextCursor };
        });
        if (!guardRef.current.isCurrent(request.generation)) return;
        setRequests(mergeUniqueById([], result.items));
        authKeyRef.current = authKey;
        loadedPagesRef.current = result.pagesFetched;
        nextCursorRef.current = result.nextCursor;
        setNextCursor(result.nextCursor);
      }
    } catch {
      if (!guardRef.current.isCurrent(request.generation)) return;
      setError(true);
      setRequests([]);
      nextCursorRef.current = undefined;
      setNextCursor(undefined);
      loadedPagesRef.current = 1;
    } finally {
      if (guardRef.current.isCurrent(request.generation)) {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, [authLoading, isAuthenticated, user?.uid, wrongRole]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const doFetch = () => { if (active) void fetchRequests(); };
      doFetch();
       const interval = setInterval(() => {
         if (active) void fetchRequests(false, true);
       }, 15000);
       return () => {
         active = false;
         clearInterval(interval);
         guardRef.current.cancel();
         loadingMoreRef.current = false;
       };
    }, [fetchRequests])
  );

  const handleAction = (id: string, action: 'accept' | 'decline' | 'close') => {
    const actionName = action === 'accept' ? (isRTL ? 'قبول' : 'Accept') : action === 'decline' ? (isRTL ? 'رفض' : 'Decline') : (isRTL ? 'إغلاق' : 'Close');
    showDialog(
      isRTL ? 'تأكيد' : 'Confirm',
      isRTL ? `هل أنت متأكد أنك تريد ${actionName} هذا الطلب؟` : `Are you sure you want to ${actionName} this request?`,
      [
        { text: isRTL ? 'إلغاء' : 'Cancel', style: 'cancel' },
        { text: actionName, style: 'default', onPress: async () => {
            hideDialog();
            try {
              await transitionDriverRequestAction(id, action);
              void fetchRequests();
            } catch (e: any) {
              setTimeout(() => {
                showDialog(t('error_title'), safeErrorMessage(e, isRTL ? 'ar' : 'en'), [{ text: t('ok'), style: 'default' }]);
              }, 500);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: DriverRequest }) => {
    return (
      <View style={styles.card}>
        <View style={[styles.cardHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.status, item.status === 'accepted' ? styles.statusAccepted : item.status === 'declined' ? styles.statusDeclined : item.status === 'closed' ? styles.statusClosed : {}]}>
            {getRequestStatusLabel(item.status, isRTL)}
          </Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <Text style={[styles.name, { textAlign: isRTL ? 'right' : 'left' }]}>
          {item.isRequester ? (isRTL ? `إلى: ${item.driver?.displayName || 'سائق'}` : `To: ${item.driver?.displayName || 'Driver'}`) : (isRTL ? `من: ${item.requesterName}` : `From: ${item.requesterName}`)}
        </Text>
        <Text style={[styles.notes, { textAlign: isRTL ? 'right' : 'left' }]}>{item.notes}</Text>

        {item.status === 'open' && !item.isRequester && (
          <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable style={[styles.btn, styles.acceptBtn]} onPress={() => handleAction(item.id, 'accept')}>
              <Text style={styles.btnTextAccept}>{isRTL ? 'قبول' : 'Accept'}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.declineBtn]} onPress={() => handleAction(item.id, 'decline')}>
              <Text style={styles.btnTextDecline}>{isRTL ? 'رفض' : 'Decline'}</Text>
            </Pressable>
          </View>
        )}
        {(item.status === 'accepted' || item.status === 'open') && item.isRequester && (
          <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable style={[styles.btn, styles.closeBtn]} onPress={() => handleAction(item.id, 'close')}>
              <Text style={styles.btnTextClose}>{isRTL ? 'إغلاق الطلب' : 'Close Request'}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (wrongRole) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.roleDenied}>
            <Text style={styles.roleDeniedText}>
              {isRTL ? 'هذه الصفحة متاحة لحسابات السائقين فقط.' : 'This page is available to driver accounts only.'}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            {isRTL ? <ChevronRight color={Colors.textPrimary} /> : <ChevronLeft color={Colors.textPrimary} />}
          </Pressable>
          <Text style={styles.headerTitle}>{isRTL ? 'طلبات السائقين' : 'Driver Requests'}</Text>
          <View style={{ width: 24 }} />
        </View>
        {loading ? <ActivityIndicator style={{marginTop: 40}} color={Colors.gold} /> :
         error ? (
           <View style={{marginTop: 40}}>
             <EmptyState title={isRTL ? 'حدث خطأ أثناء تحميل الطلبات' : 'Failed to load requests'} />
             <Pressable onPress={() => void fetchRequests()} style={styles.clearButton}><Text style={styles.clearText}>{isRTL ? 'إعادة المحاولة' : 'Retry'}</Text></Pressable>
           </View>
         ) : (
          <FlatList
            showsVerticalScrollIndicator={false}
            data={requests}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={renderItem}
            onEndReached={() => { if (requests.length > 0) void fetchRequests(true); }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loadingMore
              ? <ActivityIndicator size="small" color={Colors.gold} style={{marginVertical: 20}} />
              : nextCursor
                ? <Pressable onPress={() => void fetchRequests(true)} style={styles.loadMoreButton}><Text style={styles.loadMoreText}>{isRTL ? 'تحميل المزيد' : 'Load more'}</Text></Pressable>
                : null}
            ListEmptyComponent={<Text style={[styles.empty, {textAlign: isRTL ? 'right' : 'left'}]}>{isRTL ? 'لا توجد طلبات' : 'No requests found'}</Text>}
          />
        )}
      </SafeAreaView>
      <AppDialog visible={dialog.visible} title={dialog.title} message={dialog.message} buttons={dialog.buttons} onClose={hideDialog} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  list: { padding: 20, gap: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  cardHeader: { justifyContent: 'space-between', alignItems: 'center' },
  status: { fontSize: 12, fontWeight: '700', color: Colors.gold, backgroundColor: Colors.inputBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusAccepted: { color: '#2ecc71' },
  statusDeclined: { color: Colors.error },
  statusClosed: { color: Colors.textMuted },
  date: { color: Colors.textMuted, fontSize: 12 },
  name: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  notes: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  actions: { gap: 10, marginTop: 8 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  acceptBtn: { backgroundColor: '#2ecc71', borderColor: '#2ecc71' },
  declineBtn: { backgroundColor: 'transparent', borderColor: Colors.error },
  closeBtn: { backgroundColor: 'transparent', borderColor: Colors.textMuted },
  btnTextAccept: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  btnTextDecline: { color: Colors.error, fontWeight: '700', fontSize: 14 },
  btnTextClose: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  empty: { color: Colors.textMuted, marginTop: 40, fontSize: 15 },
  clearButton: { alignSelf: 'center', paddingVertical: 6, marginTop: 10 },
  clearText: { color: Colors.error, fontSize: 13, fontWeight: '600' },
  loadMoreButton: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, marginVertical: 12 },
  loadMoreText: { color: Colors.gold, fontSize: 14, fontWeight: '700' },
  roleDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  roleDeniedText: { color: Colors.textPrimary, fontSize: 16, textAlign: 'center' },
});
