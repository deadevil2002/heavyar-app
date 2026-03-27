import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, ArrowRight, MessageCircle, CreditCard, Star, Calendar, Receipt, Clock } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToRequest, fetchEquipmentById, fetchUserById, updateRequestStatus } from '@/services/firestoreService';
import { Equipment, User, EquipmentRequest } from '@/types';
import StatusBadge from '@/components/StatusBadge';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { getFirstImageUrl } from '@/utils/imageHelpers';

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isRTL, t, localizedText } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();

  const [request, setRequest] = useState<EquipmentRequest | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [otherUserData, setOtherUserData] = useState<User | null>(null);
  const [_loading, setLoading] = useState<boolean>(true);
  const currentUid = user?.uid || '';
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToRequest(id, async (req) => {
      setRequest(req);
      if (req) {
        try {
          const eq = await fetchEquipmentById(req.equipmentId);
          setEquipment(eq);
          const otherUid = req.providerUid === currentUid ? req.customerUid : req.providerUid;
          const otherU = await fetchUserById(otherUid);
          setOtherUserData(otherU);
        } catch (e) {
          console.log('[RequestDetail] Error loading related data:', e);
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, [id, currentUid]);

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
  const otherUser = otherUserData;
  const otherUserName = otherUser ? localizedText(otherUser.nameAr, otherUser.nameEn) : '';

  const canChat = request.allowChat && ['accepted', 'in_progress'].includes(request.status);
  const canPay = !isProvider && request.status === 'accepted' && request.paymentStatus === 'unpaid';
  const canRate = !isProvider && request.status === 'completed';
  const canAccept = isProvider && request.status === 'pending';
  const canComplete = isProvider && request.status === 'in_progress';
  const showInvoice = request.paymentStatus === 'paid';

  const handleAction = (action: string) => {
    showDialog(t('confirm'), t('confirm_action'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'default',
        onPress: async () => {
          try {
            let newStatus: EquipmentRequest['status'] = 'pending';
            if (action === 'accept') newStatus = 'accepted';
            else if (action === 'reject') newStatus = 'rejected';
            else if (action === 'complete') newStatus = 'completed';
            else if (action === 'cancel') newStatus = 'cancelled';
            await updateRequestStatus(request.id, newStatus, currentUid);
            console.log('[RequestDetail] Status updated to:', newStatus);
          } catch (e) {
            console.error('[RequestDetail] Action error:', e);
            showDialog(t('error_title'), t('error_generic_message'), [{ text: t('ok'), style: 'default' }]);
          }
        },
      },
    ]);
  };

  const isOpenEnded = request.requestMode === 'open_ended';
  const startDate = new Date(request.startDate);
  const endDate = request.endDate ? new Date(request.endDate) : null;
  const days = isOpenEnded ? null : (request.numberOfDays || (endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : 0));

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
            {isOpenEnded ? (
              <View style={[styles.openEndedBanner, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Clock size={18} color={Colors.gold} />
                <Text style={styles.openEndedBannerText}>{t('until_work_completion')}</Text>
              </View>
            ) : (
              <>
                <View style={[styles.infoRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.infoItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Calendar size={16} color={Colors.gold} />
                    <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                      <Text style={styles.infoLabel}>{t('start_date')}</Text>
                      <Text style={styles.infoValue}>{request.startDate}</Text>
                    </View>
                  </View>
                  {endDate && (
                    <View style={[styles.infoItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <Calendar size={16} color={Colors.gold} />
                      <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                        <Text style={styles.infoLabel}>{t('end_date')}</Text>
                        <Text style={styles.infoValue}>{request.endDate}</Text>
                      </View>
                    </View>
                  )}
                </View>
                {days !== null && days > 0 && (
                  <Text style={[styles.daysText, { textAlign: isRTL ? 'right' : 'left' }]}>{days} {t('days')}</Text>
                )}
              </>
            )}
          </View>

          <View style={styles.card}>
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
          </View>

          {otherUser && (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{isProvider ? t('as_customer') : t('owner')}</Text>
              <View style={[styles.userRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Image source={{ uri: otherUser.avatar }} style={styles.userAvatar} contentFit="cover" />
                <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start', flex: 1 }}>
                  <Text style={styles.userName}>{otherUserName}</Text>
                  <View style={[styles.ratingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Star size={14} color={Colors.gold} fill={Colors.gold} />
                    <Text style={styles.ratingText}>{otherUser.rating}</Text>
                  </View>
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
            {canComplete && (
              <Pressable style={styles.completeButton} onPress={() => handleAction('complete')}>
                <Text style={styles.completeText}>{t('complete')}</Text>
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
  openEndedBanner: { alignItems: 'center' as const, gap: 10, backgroundColor: 'rgba(212, 168, 67, 0.08)', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(212, 168, 67, 0.2)' },
  openEndedBannerText: { color: Colors.gold, fontSize: 15, fontWeight: '600' as const },
});
