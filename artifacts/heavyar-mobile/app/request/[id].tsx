import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, ArrowRight, MessageCircle, CreditCard, Star, Calendar, Receipt } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToRequest, fetchEquipmentById, tryBackfillRequestPublicSnapshots } from '@/services/firestoreService';
import { Equipment, EquipmentRequest, PublicUserSnapshot, RentalSummary } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { getFirstImageUrl } from '@/utils/imageHelpers';
import { getRentalSummary, transitionRentalRequest } from '@/services/workerClient';
import { formatMinorAmount, prorateHourlyMinor } from '@/services/rentalV2';
import { safeErrorMessage } from '@/services/errorMessages';

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isRTL, t, localizedText } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();

  const [request, setRequest] = useState<EquipmentRequest | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [otherUserPublic, setOtherUserPublic] = useState<PublicUserSnapshot | null>(null);
  const [rentalSummary, setRentalSummary] = useState<RentalSummary | null>(null);
  const [displayNow, setDisplayNow] = useState(0);
  const [cancelReason, setCancelReason] = useState('');
  const [_loading, setLoading] = useState<boolean>(true);
  const equipmentRef = useRef<Equipment | null>(null);
  const serverClockRef = useRef<{ serverNowMs: number; monotonicAtSync: number } | null>(null);
  const fetchedEquipmentIdRef = useRef<string | null>(null);
  const currentUid = user?.uid || '';
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToRequest(id, async (req) => {
      setRequest(req);
      if (req) {
        try {
          let eq = equipmentRef.current;
          if (fetchedEquipmentIdRef.current !== req.equipmentId) {
            fetchedEquipmentIdRef.current = req.equipmentId;
            eq = await fetchEquipmentById(req.equipmentId);
            equipmentRef.current = eq;
            setEquipment(eq);
          }
          const updates: { customerPublic?: PublicUserSnapshot; providerPublic?: PublicUserSnapshot } = {};

          if (user && currentUid === req.customerUid && !req.customerPublic) {
            updates.customerPublic = {
              uid: user.uid,
              nameAr: user.nameAr,
              nameEn: user.nameEn,
              avatar: user.avatar,
            };
          }

          if (user && currentUid === req.providerUid && !req.providerPublic) {
            updates.providerPublic = {
              uid: user.uid,
              nameAr: user.nameAr,
              nameEn: user.nameEn,
              avatar: user.avatar,
            };
          }

          if (!req.providerPublic && eq?.ownerPublic && eq.ownerUid === req.providerUid) {
            updates.providerPublic = eq.ownerPublic;
          }

          if ((updates.customerPublic || updates.providerPublic) && req.id) {
            void tryBackfillRequestPublicSnapshots(req.id, updates);
          }
          const effectiveCustomer = req.customerPublic || updates.customerPublic || null;
          const effectiveProvider = req.providerPublic || updates.providerPublic || null;
          const other = req.providerUid === currentUid ? effectiveCustomer : effectiveProvider;
          setOtherUserPublic(other);
        } catch (e) {
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id, currentUid, user]);

  useEffect(() => {
    if (!id || request?.pricingModelVersion !== 2) return;
    let mounted = true;
    getRentalSummary(id).then(summary => {
      if (mounted) {
        setRentalSummary(summary);
        serverClockRef.current = {
          serverNowMs: Date.parse(summary.serverNow || summary.currentEstimate?.asOf || ''),
          monotonicAtSync: typeof performance !== 'undefined' ? performance.now() : 0,
        };
        setDisplayNow(value => value + 1);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [id, request?.pricingModelVersion, request?.status, request?.updatedAt]);

  useEffect(() => {
    if (!rentalSummary?.actualStartAt || rentalSummary.actualEndAt || request?.status !== 'in_progress') return;
    const timer = setInterval(() => setDisplayNow(value => value + 1), 30_000);
    return () => clearInterval(timer);
  }, [rentalSummary?.actualEndAt, rentalSummary?.actualStartAt, request?.status]);

  if (_loading || !request || !equipment) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.centered}>
          <Text style={styles.errorText}>{t('error_occurred')}</Text>
        </SafeAreaView>
      </View>
    );
  }

  const isProvider = request.providerUid === currentUid;
  const title = localizedText(equipment.titleAr, equipment.titleEn);
  const otherUser = otherUserPublic;
  const otherUserName = otherUser ? localizedText(otherUser.nameAr, otherUser.nameEn) : '';
  const requestMode = request.requestMode || 'fixed_days';
  const isOpenEnded = requestMode === 'open_ended';
  const isV2 = request.pricingModelVersion === 2;

  const canChat = request.allowChat && ['accepted', 'in_progress'].includes(request.status);
  const canPay = !isProvider && request.status === 'completed' && request.paymentStatus === 'unpaid';
  const canRate = !isProvider && request.status === 'completed';
  const canAccept = isProvider && request.status === 'pending';
  const canStart = isProvider && request.status === 'accepted';
  const canCancelCustomer = (!isProvider && request.status === 'pending')
    || (request.status === 'accepted' && !(request.actualStartAt || request.startedAt));
  const canRequestCompletion = request.status === 'in_progress';
  const canConfirmCompletion = request.status === 'completion_requested'
    && (!request.completionRequestedBy || request.completionRequestedBy !== currentUid);
  const showInvoice = request.paymentStatus === 'paid';

  const handleAction = (action: 'accept' | 'reject' | 'start' | 'request_completion' | 'complete' | 'cancel') => {
    showDialog(t('confirm'), t('confirm_action'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'default',
        onPress: async () => {
          try {
            await transitionRentalRequest(request.id, action, action === 'cancel' ? cancelReason : undefined);
          } catch (error) {
            showDialog(t('error_title'), safeErrorMessage(error, isRTL ? 'ar' : 'en'), [{ text: t('ok'), style: 'default' }]);
          }
        },
      },
    ]);
  };

  const computedDays = (() => {
    if (!request.startDate || !request.endDate) return undefined;
    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
    const diff = endDate.getTime() - startDate.getTime();
    if (diff <= 0) return undefined;
    return Math.max(1, Math.ceil(diff / 86400000));
  })();
  const days = request.numberOfDays || computedDays;
  const dateTime = (value: string | null | undefined, includeTime = true) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(isRTL ? 'ar-SA' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      timeZone: request.pricingSnapshot?.marketTimezone,
    }).format(parsed);
  };
  const liveElapsedMinutes = (() => {
    void displayNow;
    if (!rentalSummary?.actualStartAt) return rentalSummary?.duration.elapsedMinutes ?? undefined;
    const anchor = serverClockRef.current;
    const serverReference = anchor?.serverNowMs ?? NaN;
    const actualStart = Date.parse(rentalSummary.actualStartAt);
    if (!Number.isFinite(serverReference) || !Number.isFinite(actualStart)) return rentalSummary.duration.elapsedMinutes ?? undefined;
    const locallyElapsed = Math.max(0, (typeof performance !== 'undefined' ? performance.now() : anchor!.monotonicAtSync) - anchor!.monotonicAtSync);
    return Math.max(1, Math.ceil((serverReference + locallyElapsed - actualStart) / 60_000));
  })();
  const liveEstimatedMinor = (() => {
    if (!rentalSummary || !liveElapsedMinutes || rentalSummary.actualEndAt) return rentalSummary?.currentEstimate?.baseAmountMinor ?? rentalSummary?.final?.baseAmountMinor;
    const snapshot = rentalSummary.pricingSnapshot;
    if (snapshot.rateUnit === 'hourly') return prorateHourlyMinor(snapshot.rateAmountMinor, liveElapsedMinutes);
    return Number(BigInt(snapshot.rateAmountMinor) * BigInt(Math.ceil(liveElapsedMinutes / 1440)));
  })();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <BackIcon size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('request_detail')}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={[styles.equipmentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Image source={{ uri: getFirstImageUrl(equipment.images) }} style={styles.equipmentImage} contentFit="cover" />
            <View style={[styles.equipmentInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.equipmentTitle, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>{title}</Text>
              <StatusBadge status={request.status} />
            </View>
          </View>

          <View style={styles.card}>
            <View style={[styles.infoRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.infoItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Calendar size={16} color={Colors.gold} />
                <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                  <Text style={styles.infoLabel}>{t('start_date')}</Text>
                   <Text style={styles.infoValue}>{dateTime(request.requestedStartAt || request.startDate, request.rentalMode !== 'daily')}</Text>
                </View>
              </View>
              <View style={[styles.infoItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Calendar size={16} color={Colors.gold} />
                <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                  <Text style={styles.infoLabel}>{t('end_date')}</Text>
                   <Text style={styles.infoValue}>{isOpenEnded ? t('until_work_completion') : dateTime(request.requestedEndAt || request.endDate, request.rentalMode !== 'daily')}</Text>
                </View>
              </View>
            </View>
            <Text style={[styles.daysText, { textAlign: isRTL ? 'right' : 'left' }]}>
               {isV2
                 ? (request.rentalMode === 'hourly' ? (isRTL ? 'إيجار بالساعة' : 'Hourly rental') : request.rentalMode === 'daily' ? `${days || rentalSummary?.duration.billableUnits || 0} ${t('days')}` : t('until_work_completion'))
                 : (isOpenEnded ? t('until_work_completion') : `${days || 0} ${t('days')}`)}
            </Text>
          </View>

           {isV2 && request.pricingSnapshot ? (
             <View style={styles.card}>
               <Text style={[styles.cardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('locked_pricing')}</Text>
               <View style={styles.paymentRows}>
                 <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                   <Text style={styles.paymentLabel}>{isRTL ? 'أساس الحساب' : 'Billing basis'}</Text>
                   <Text style={styles.paymentValue}>{request.pricingSnapshot.rateUnit === 'hourly' ? (isRTL ? 'بالساعة' : 'Hourly') : (isRTL ? 'باليوم' : 'Daily')}</Text>
                 </View>
                 <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                   <Text style={styles.paymentLabel}>{t('locked_rate')}</Text>
                   <Text style={styles.paymentValue}>{formatMinorAmount(request.pricingSnapshot.rateAmountMinor, request.pricingSnapshot.currency, isRTL ? 'ar' : 'en')}</Text>
                 </View>
                 {rentalSummary?.actualStartAt && <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                   <Text style={styles.paymentLabel}>{isRTL ? 'البدء الفعلي' : 'Actual start'}</Text>
                   <Text style={styles.paymentValue}>{dateTime(rentalSummary.actualStartAt)}</Text>
                  </View>}
                 {rentalSummary?.actualEndAt && <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                   <Text style={styles.paymentLabel}>{isRTL ? 'الانتهاء الفعلي' : 'Actual end'}</Text>
                   <Text style={styles.paymentValue}>{dateTime(rentalSummary.actualEndAt)}</Text>
                 </View>}
                 {!!liveElapsedMinutes && <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                   <Text style={styles.paymentLabel}>{t('current_elapsed')}</Text>
                   <Text style={styles.paymentValue}>{Math.floor(liveElapsedMinutes / 60)}:{String(liveElapsedMinutes % 60).padStart(2, '0')}</Text>
                  </View>}
                 {liveEstimatedMinor !== undefined && <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                   <Text style={styles.paymentLabel}>{t('current_estimated_cost')}</Text>
                   <Text style={styles.paymentTotal}>{formatMinorAmount(liveEstimatedMinor, request.pricingSnapshot.currency, isRTL ? 'ar' : 'en')}</Text>
                 </View>}
                 {request.finalRentalSnapshot && <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                   <Text style={styles.paymentTotalLabel}>{isRTL ? 'المبلغ النهائي' : 'Final amount'}</Text>
                   <Text style={styles.paymentTotal}>{formatMinorAmount(request.finalRentalSnapshot.amountMinor, request.pricingSnapshot.currency, isRTL ? 'ar' : 'en')}</Text>
                 </View>}
                 {!request.finalRentalSnapshot && rentalSummary?.final && <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                   <Text style={styles.paymentTotalLabel}>{isRTL ? 'المبلغ النهائي' : 'Final amount'}</Text>
                   <Text style={styles.paymentTotal}>{formatMinorAmount(rentalSummary.final.baseAmountMinor, request.pricingSnapshot.currency, isRTL ? 'ar' : 'en')}</Text>
                 </View>}
               </View>
             </View>
           ) : <View style={styles.card}>
            <Text style={[styles.cardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('payment_summary')}</Text>
            <View style={styles.paymentRows}>
              <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.paymentLabel}>{t('total_amount')}</Text>
                <Text style={styles.paymentValue}>{request.amount.toLocaleString()} {t('sar')}</Text>
               </View>
              <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.paymentLabel}>{t('platform_fee')}</Text>
                <Text style={styles.paymentFee}>{request.platformFee.toLocaleString()} {t('sar')}</Text>
              </View>
              <View style={styles.paymentDivider} />
              <View style={[styles.paymentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.paymentTotalLabel}>{t('total')}</Text>
                <Text style={styles.paymentTotal}>{request.amount.toLocaleString()} {t('sar')}</Text>
              </View>
            </View>
            <StatusBadge status={request.paymentStatus} />
          </View>}

          {otherUser && (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{isProvider ? t('as_customer') : t('owner')}</Text>
              <View style={[styles.userRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Image source={otherUser.avatar ? { uri: otherUser.avatar } : require('@/assets/images/logo.png')} style={styles.userAvatar} contentFit="cover" />
                <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start', flex: 1 }}>
                  <Text style={styles.userName}>{otherUserName}</Text>
                </View>
              </View>
            </View>
          )}

          {request.notes ? (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('notes')}</Text>
              <Text style={[styles.notesText, { textAlign: isRTL ? 'right' : 'left' }]}>{request.notes}</Text>
            </View>
          ) : null}

          <View style={styles.actionsContainer}>
            {canChat && (
              <Pressable style={styles.chatButton} onPress={() => router.push(`/chat/${request.id}`)}>
                <MessageCircle size={20} color={Colors.primary} />
                <Text style={styles.chatButtonText}>{t('open_chat')}</Text>
              </Pressable>
            )}
            {canPay && (
              <Pressable style={styles.payButton} onPress={() => router.push(`/payment/${request.id}`)}>
                <CreditCard size={20} color={Colors.primary} />
                <Text style={styles.payButtonText}>{t('pay_now')}</Text>
              </Pressable>
            )}
            {canRate && (
              <Pressable style={styles.rateButton} onPress={() => router.push(`/rating/${request.id}`)}>
                <Star size={20} color={Colors.primary} />
                <Text style={styles.rateButtonText}>{t('rate_provider')}</Text>
              </Pressable>
            )}
            {canAccept && (
              <View style={styles.providerActions}>
                <Pressable style={styles.acceptButton} onPress={() => handleAction('accept')}>
                  <Text style={styles.acceptText}>{t('accept')}</Text>
                </Pressable>
                <Pressable style={styles.rejectButton} onPress={() => handleAction('reject')}>
                  <Text style={styles.rejectText}>{t('reject')}</Text>
                </Pressable>
              </View>
            )}
            {canCancelCustomer && (
               <>
                 <TextInput
                   style={[styles.reasonInput, { textAlign: isRTL ? 'right' : 'left' }]}
                   value={cancelReason}
                   onChangeText={setCancelReason}
                   maxLength={300}
                   placeholder={t('cancellation_reason_required')}
                   placeholderTextColor={Colors.textMuted}
                 />
                 <Pressable style={[styles.rejectButton, !cancelReason.trim() && styles.disabledButton]} onPress={() => handleAction('cancel')} disabled={!cancelReason.trim()}>
                   <Text style={styles.rejectText}>{t('cancel')}</Text>
                 </Pressable>
               </>
            )}
            {canStart && (
              <Pressable style={styles.acceptButton} onPress={() => handleAction('start')}>
                <Text style={styles.acceptText}>{t('start_work')}</Text>
              </Pressable>
            )}
            {canRequestCompletion && (
              <Pressable style={styles.completeButton} onPress={() => handleAction('request_completion')}>
                <Text style={styles.completeText}>{t('end_work')}</Text>
              </Pressable>
            )}
            {canConfirmCompletion && (
               <Pressable style={styles.completeButton} onPress={() => handleAction('complete')}>
                <Text style={styles.completeText}>{t('confirm')}</Text>
              </Pressable>
            )}
            {showInvoice && (
              <Pressable style={styles.invoiceButton} onPress={() => router.push('/invoices')}>
                <Receipt size={20} color={Colors.primary} />
                <Text style={styles.invoiceButtonText}>{t('view_invoice')}</Text>
              </Pressable>
            )}
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>

      <AppDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: Colors.textSecondary, fontSize: 16 },
  header: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 18, fontWeight: '700' as const, color: Colors.textPrimary },
  scrollContent: { paddingHorizontal: 20 },
  equipmentRow: { alignItems: 'center', gap: 14, marginBottom: 20, backgroundColor: Colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border },
  equipmentImage: { width: 80, height: 80, borderRadius: 14 },
  equipmentInfo: { flex: 1, gap: 8 },
  equipmentTitle: { fontSize: 17, fontWeight: '600' as const, color: Colors.textPrimary },
  card: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontSize: 16, fontWeight: '700' as const, color: Colors.textPrimary, marginBottom: 12 },
  infoRow: { justifyContent: 'space-between', marginBottom: 8 },
  infoItem: { alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 12, color: Colors.textMuted },
  infoValue: { fontSize: 14, fontWeight: '600' as const, color: Colors.textPrimary },
  daysText: { color: Colors.gold, fontSize: 14, fontWeight: '600' as const },
  paymentRows: { gap: 10, marginBottom: 12 },
  paymentRow: { justifyContent: 'space-between' },
  paymentLabel: { color: Colors.textSecondary, fontSize: 14 },
  paymentValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' as const },
  paymentFee: { color: Colors.warning, fontSize: 14, fontWeight: '600' as const },
  paymentDivider: { height: 1, backgroundColor: Colors.divider },
  paymentTotalLabel: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' as const },
  paymentTotal: { color: Colors.gold, fontSize: 18, fontWeight: '800' as const },
  userRow: { alignItems: 'center', gap: 12 },
  userAvatar: { width: 48, height: 48, borderRadius: 14 },
  userName: { fontSize: 15, fontWeight: '600' as const, color: Colors.textPrimary },
  ratingRow: { alignItems: 'center', gap: 4, marginTop: 2 },
  ratingText: { color: Colors.gold, fontSize: 13, fontWeight: '600' as const },
  notesText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
  actionsContainer: { gap: 12, marginTop: 8 },
  chatButton: { flexDirection: 'row', backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', gap: 8 },
  chatButtonText: { color: Colors.primary, fontSize: 16, fontWeight: '700' as const },
  payButton: { flexDirection: 'row', backgroundColor: Colors.success, borderRadius: 14, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', gap: 8 },
  payButtonText: { color: Colors.primary, fontSize: 16, fontWeight: '700' as const },
  rateButton: { flexDirection: 'row', backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', gap: 8 },
  rateButtonText: { color: Colors.primary, fontSize: 16, fontWeight: '700' as const },
  providerActions: { flexDirection: 'row', gap: 12 },
  acceptButton: { flex: 1, backgroundColor: Colors.success, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  acceptText: { color: Colors.white, fontSize: 16, fontWeight: '700' as const },
  rejectButton: { flex: 1, backgroundColor: Colors.error, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  rejectText: { color: Colors.white, fontSize: 16, fontWeight: '700' as const },
  completeButton: { backgroundColor: Colors.success, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  completeText: { color: Colors.white, fontSize: 16, fontWeight: '700' as const },
  invoiceButton: { flexDirection: 'row' as const, backgroundColor: Colors.info, borderRadius: 14, paddingVertical: 14, justifyContent: 'center' as const, alignItems: 'center' as const, gap: 8 },
  invoiceButtonText: { color: Colors.primary, fontSize: 16, fontWeight: '700' as const },
  reasonInput: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.inputBg, color: Colors.textPrimary, paddingHorizontal: 12 },
  disabledButton: { opacity: 0.5 },
});
