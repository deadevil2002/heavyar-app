import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import Colors from '@/constants/colors';
import { getDriverRequests, transitionDriverRequestAction } from '@/services/workerClient';
import { DRIVER_REQUEST_STALE_MS, driverRequestsAllowed, driverRequestsKey } from '@/services/requestSections';
import { getRequestStatusLabel } from '@/services/driverUtils';
import { safeErrorMessage } from '@/services/errorMessages';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

/** Mounted only for the visible, focused section; no background polling. */
export default function DriverRequestsSection() {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const client = useQueryClient();
  const [mutationError, setMutationError] = useState('');
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const key = driverRequestsKey(user!.uid, user!.role);
  const allowed = driverRequestsAllowed(user);
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getDriverRequests({ cursor: pageParam, limit: 20 }, signal),
    getNextPageParam: page => page.nextCursor,
    enabled: allowed,
    staleTime: DRIVER_REQUEST_STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: false,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void client.cancelQueries({ queryKey: driverRequestsKey(user!.uid, user!.role), exact: true });
    };
  }, [client, user!.uid, user!.role]);

  if (!allowed) return <Text style={styles.message}>{isRTL
    ? 'طلبات السائقين غير متاحة لحسابات مراجعة المتجر. هذا الحساب لا يشارك في طلبات السائقين العامة.'
    : 'Driver requests are unavailable for Store Review accounts. This account does not participate in public driver requests.'}</Text>;

  const act = async (id: string, action: 'accept' | 'decline' | 'close') => {
    setPending(true);
    setMutationError('');
    try {
      await transitionDriverRequestAction(id, action);
      await client.invalidateQueries({ queryKey: key, exact: true });
    } catch (error) {
      if (mounted.current) setMutationError(safeErrorMessage(error, isRTL ? 'ar' : 'en'));
    } finally { if (mounted.current) setPending(false); }
  };
  const confirm = (id: string, action: 'accept' | 'decline' | 'close') => {
    showDialog(isRTL ? 'تأكيد' : 'Confirm', isRTL ? 'هل تريد تحديث هذا الطلب؟' : 'Update this request?', [
      { text: isRTL ? 'إلغاء' : 'Cancel', style: 'cancel' },
      { text: isRTL ? 'تأكيد' : 'Confirm', onPress: () => { hideDialog(); void act(id, action); } },
    ]);
  };
  const items = [...new Map((query.data?.pages.flatMap(page => page.requests) || []).map(item => [item.id, item])).values()];
  return <View style={styles.root}>
    {mutationError ? <Text accessibilityRole="alert" style={styles.message}>{mutationError}</Text> : null}
    {query.isError ? <Pressable onPress={() => void query.refetch()}><Text accessibilityRole="alert" style={styles.message}>
      {safeErrorMessage(query.error, isRTL ? 'ar' : 'en')} — {isRTL ? 'إعادة المحاولة' : 'Retry'}
    </Text></Pressable> : null}
    {query.isPending ? <ActivityIndicator color={Colors.gold} /> : <FlatList
      data={items}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.list}
      refreshing={query.isRefetching}
      onRefresh={() => { if (!query.isFetching) void query.refetch(); }}
      ListEmptyComponent={<Text style={styles.message}>{isRTL ? 'لا توجد طلبات' : 'No requests found'}</Text>}
      ListFooterComponent={query.hasNextPage ? <Pressable disabled={query.isFetching} onPress={() => void query.fetchNextPage()}>
        <Text style={styles.action}>{query.isFetchingNextPage ? '…' : isRTL ? 'تحميل المزيد' : 'Load more'}</Text>
      </Pressable> : null}
      renderItem={({ item }) => <View style={styles.card}>
        <Text style={styles.action}>{getRequestStatusLabel(item.status, isRTL)}</Text>
        <Text style={styles.text}>{item.isRequester ? item.driver?.displayName || (isRTL ? 'سائق غير متاح' : 'Driver unavailable') : item.requesterName}</Text>
        <Text style={styles.text}>{item.notes}</Text>
        <Text style={styles.text}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        {item.status === 'open' && !item.isRequester ? <View style={styles.buttons}>
          <Pressable disabled={pending} onPress={() => confirm(item.id, 'accept')}><Text style={styles.action}>{isRTL ? 'قبول' : 'Accept'}</Text></Pressable>
          <Pressable disabled={pending} onPress={() => confirm(item.id, 'decline')}><Text style={styles.action}>{isRTL ? 'رفض' : 'Decline'}</Text></Pressable>
        </View> : null}
        {item.isRequester && ['open', 'accepted'].includes(item.status) ? <Pressable disabled={pending} onPress={() => confirm(item.id, 'close')}><Text style={styles.action}>{isRTL ? 'إغلاق الطلب' : 'Close request'}</Text></Pressable> : null}
      </View>}
    />}
    <AppDialog visible={dialog.visible} title={dialog.title} message={dialog.message} buttons={dialog.buttons} onClose={hideDialog} />
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, list: { padding: 20, gap: 12 },
  card: { padding: 16, gap: 10, borderRadius: 14, backgroundColor: Colors.surface },
  text: { color: Colors.textPrimary }, action: { padding: 8, color: Colors.gold },
  message: { padding: 20, color: Colors.textSecondary }, buttons: { flexDirection: 'row', gap: 20 },
});