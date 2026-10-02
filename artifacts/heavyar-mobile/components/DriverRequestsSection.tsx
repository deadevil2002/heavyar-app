import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, CalendarDays, RefreshCw, ShieldAlert, UserRound } from 'lucide-react-native';
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

  if (!allowed) return <StateSurface
    icon="restricted"
    title={isRTL ? 'طلبات السائقين غير متاحة' : 'Driver requests unavailable'}
    message={isRTL
      ? 'حساب مراجعة المتجر لا يشارك في طلبات السائقين العامة.'
      : 'Store Review accounts do not participate in public driver requests.'}
    isRTL={isRTL}
  />;

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
    {mutationError ? <Text accessibilityRole="alert" style={[styles.inlineMessage, { textAlign: isRTL ? 'right' : 'left' }]}>{mutationError}</Text> : null}
    {query.isError ? <StateSurface
      icon="error"
      title={isRTL ? 'تعذر تحميل طلبات العمل' : 'Could not load job requests'}
      message={safeErrorMessage(query.error, isRTL ? 'ar' : 'en')}
      actionLabel={isRTL ? 'إعادة المحاولة' : 'Retry'}
      onAction={() => void query.refetch()}
      isRTL={isRTL}
    /> : query.isPending ? <View style={styles.loading}><ActivityIndicator color={Colors.gold} /></View> : <FlatList
      data={items}
      keyExtractor={item => item.id}
      contentContainerStyle={[styles.list, items.length === 0 && styles.emptyList]}
      refreshing={query.isRefetching}
      onRefresh={() => { if (!query.isFetching) void query.refetch(); }}
      ListEmptyComponent={<StateSurface
        icon="empty"
        title={isRTL ? 'لا توجد طلبات عمل حاليًا' : 'No job requests yet'}
        message={isRTL ? 'ستظهر الطلبات الجديدة هنا فور توفرها.' : 'New requests will appear here as soon as they are available.'}
        isRTL={isRTL}
      />}
      ListFooterComponent={query.hasNextPage ? <Pressable disabled={query.isFetching} onPress={() => void query.fetchNextPage()}>
        <Text style={styles.action}>{query.isFetchingNextPage ? '…' : isRTL ? 'تحميل المزيد' : 'Load more'}</Text>
      </Pressable> : null}
      renderItem={({ item }) => <View style={styles.card}>
        <View style={[styles.cardTop, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.statusPill}><Text style={styles.statusText}>{getRequestStatusLabel(item.status, isRTL)}</Text></View>
          <View style={styles.identityRow}><UserRound size={17} color={Colors.textSecondary} strokeWidth={2} /><Text style={styles.text}>{item.isRequester ? item.driver?.displayName || (isRTL ? 'سائق غير متاح' : 'Driver unavailable') : item.requesterName}</Text></View>
        </View>
        {item.notes ? <Text style={[styles.notes, { textAlign: isRTL ? 'right' : 'left' }]}>{item.notes}</Text> : null}
        <View style={[styles.dateRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><CalendarDays size={15} color={Colors.textSecondary} strokeWidth={2} /><Text style={styles.meta}>{new Date(item.createdAt).toLocaleDateString()}</Text></View>
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

function StateSurface({ icon, title, message, actionLabel, onAction, isRTL }: {
  icon: 'empty' | 'error' | 'restricted'; title: string; message: string; actionLabel?: string; onAction?: () => void; isRTL: boolean;
}) {
  const Icon = icon === 'empty' ? BriefcaseBusiness : ShieldAlert;
  return <View style={styles.stateViewport}>
    <View style={styles.stateSurface}>
      <View style={styles.stateIcon}><Icon size={28} color={Colors.gold} strokeWidth={2} /></View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text accessibilityRole={icon === 'error' ? 'alert' : undefined} style={styles.stateMessage}>{message}</Text>
      {actionLabel && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
        <View style={[styles.retryContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><RefreshCw size={17} color={Colors.primary} strokeWidth={2.2} /><Text style={styles.retryText}>{actionLabel}</Text></View>
      </Pressable> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  emptyList: { flexGrow: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, gap: 12, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cardTop: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  identityRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusPill: { borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { color: Colors.gold, fontSize: 12, fontWeight: '700' },
  text: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  notes: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
  dateRow: { alignItems: 'center', gap: 7 },
  meta: { color: Colors.textSecondary, fontSize: 12 },
  action: { padding: 8, color: Colors.gold, fontWeight: '700' },
  inlineMessage: { marginHorizontal: 20, marginBottom: 10, color: Colors.error, lineHeight: 21 },
  buttons: { flexDirection: 'row', gap: 20 },
  stateViewport: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 72 },
  stateSurface: { alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingVertical: 28, borderRadius: 22, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  stateIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  stateTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  stateMessage: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  retryButton: { marginTop: 6, minHeight: 46, minWidth: 148, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: Colors.gold, paddingHorizontal: 18 },
  retryContent: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  retryText: { color: Colors.primary, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
