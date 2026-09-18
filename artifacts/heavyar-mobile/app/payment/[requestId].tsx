import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, CreditCard, Lock, Shield, ExternalLink, CheckCircle, XCircle } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchRequestById,
  fetchEquipmentById,
  tryBackfillRequestPublicSnapshots,
} from '@/services/firestoreService';
import { createPayment, verifyPayment } from '@/services/paymentService';
import type { PaymentLifecycleStatus, PaymentQuote } from '@/services/paymentService';
import { EquipmentRequest, PublicUserSnapshot } from '@/types';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { getCheckoutGateways, type CheckoutGateway } from '@/services/workerClient';

type PaymentStep = 'summary' | 'processing' | 'redirecting' | 'verifying' | 'success' | 'failed';

export default function PaymentScreen() {
  const { requestId, paymentId: callbackPaymentId } = useLocalSearchParams<{ requestId: string; paymentId?: string }>();
  const { isRTL, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const { dialog, hideDialog } = useAppDialog();

  const [request, setRequest] = useState<EquipmentRequest | null>(null);
  const [step, setStep] = useState<PaymentStep>('summary');
  const [paymentId, setPaymentId] = useState<string>('');
  const [paymentUrl, setPaymentUrl] = useState<string>('');
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [gateways, setGateways] = useState<CheckoutGateway[]>([]);
  const [gatewayLoading, setGatewayLoading] = useState<boolean>(true);
  const handledCallbackPayment = useRef<string | null>(null);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!requestId) return;
      try {
        const req = await fetchRequestById(requestId);
        if (req && user) {
          const updates: { customerPublic?: PublicUserSnapshot; providerPublic?: PublicUserSnapshot } = {};
          if (user.uid === req.customerUid && !req.customerPublic) {
            updates.customerPublic = {
              uid: user.uid,
              nameAr: user.nameAr,
              nameEn: user.nameEn,
              avatar: user.avatar,
            };
          }
          if (user.uid === req.providerUid && !req.providerPublic) {
            updates.providerPublic = {
              uid: user.uid,
              nameAr: user.nameAr,
              nameEn: user.nameEn,
              avatar: user.avatar,
            };
          }
          if (!req.providerPublic) {
            try {
              const eq = await fetchEquipmentById(req.equipmentId);
              if (eq?.ownerPublic && eq.ownerUid === req.providerUid) {
                updates.providerPublic = eq.ownerPublic;
              }
            } catch {}
          }
          if ((updates.customerPublic || updates.providerPublic) && req.id) {
            void tryBackfillRequestPublicSnapshots(req.id, updates);
          }
        }
        if (mounted) {
          setRequest(req);
          setLoading(false);
        }
      } catch (e) {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [requestId, user]);

  useEffect(() => {
    let mounted = true;
    void getCheckoutGateways().then(result => {
      if (mounted) setGateways(result.gateways);
    }).catch(() => {
      if (mounted) setGateways([]);
    }).finally(() => { if (mounted) setGatewayLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleVerifyRef = React.useRef<(cId?: string) => Promise<void>>(() => Promise.resolve());

  const handleCreatePayment = useCallback(async () => {
    if (!request || !requestId || !user) return;

    setStep('processing');
    try {

      const result = await createPayment({
        requestId,
        purpose: 'equipment_request',
      });

      if (!result.success || !result.paymentId) {
        setStep('failed');
        return;
      }

      // The backend quote is authoritative; do not display the request estimate
      // once a payment has been created.
      if (result.quote) setQuote(result.quote);
      setPaymentId(result.paymentId);

      const status = String(result.status || 'pending').toLowerCase() as PaymentLifecycleStatus;
      if (result.checkoutUrl && (status === 'pending' || status === 'requires_action')) {
        setPaymentUrl(result.checkoutUrl);
        setStep('redirecting');
      } else {
        void handleVerifyRef.current?.(result.paymentId);
      }
    } catch (e) {
      setStep('failed');
      try {
      } catch {}
    }
  }, [request, requestId, user]);

  const handleVerifyPayment = useCallback(async (cId?: string) => {
    const id = cId || paymentId;
    if (!id || !requestId) return;

    setStep('verifying');
    try {
      const result = await verifyPayment(id);

      const status = String(result.status || (result.success ? 'paid' : 'failed')).toLowerCase();
      if (result.quote) setQuote(result.quote);
      if (!result.success) {
        setStep('failed');
      } else if (status === 'paid') {
        setStep('success');
      } else if (status === 'pending' || status === 'requires_action') {
        setStep('redirecting');
      } else if (status === 'processing') {
        setStep('redirecting');
      } else if (status === 'cancelled' || status === 'expired' || status === 'failed') {
        setStep('failed');
      } else {
        setStep('failed');
      }
    } catch (e) {
      setStep('failed');
    }
  }, [paymentId, requestId]);

  handleVerifyRef.current = handleVerifyPayment;

  useEffect(() => {
    if (!request || !callbackPaymentId || !/^[A-Za-z0-9_-]{8,200}$/.test(String(callbackPaymentId))) return;
    const callbackId = String(callbackPaymentId);
    if (handledCallbackPayment.current === callbackId) return;
    handledCallbackPayment.current = callbackId;
    setPaymentId(callbackId);
    void handleVerifyPayment(callbackId);
  }, [request, callbackPaymentId, handleVerifyPayment]);

  const handleOpenPaymentUrl = useCallback(async () => {
    if (!paymentUrl) return;
    try {
      if (Platform.OS !== 'web') {
        await Linking.openURL(paymentUrl);
      } else {
        window.open(paymentUrl, '_blank');
      }
    } catch (e) {
    }
  }, [paymentUrl]);

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </SafeAreaView>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.centered}>
          <Text style={styles.errorText}>{t('error_occurred')}</Text>
        </SafeAreaView>
      </View>
    );
  }

  const snapshot = quote?.commercialSnapshot ?? request.finalCommercialSnapshot ??
    (request.commercialSnapshotStatus === 'finalized' ? request.commercialSnapshot : undefined);
  const minorScale = snapshot ? (['KWD', 'BHD', 'OMR'].includes(snapshot.currency) ? 1000 : 100) : 1;
  const subtotal = quote?.subtotal ?? (snapshot ? snapshot.baseAmountMinor / minorScale : null);
  const platformFee = quote?.platformFee ?? (snapshot ? snapshot.platformFeeMinor / minorScale : null);
  const vatAmount = quote?.tax ?? (snapshot?.taxAmountMinor !== null && snapshot?.taxAmountMinor !== undefined ? snapshot.taxAmountMinor / minorScale : null);
  const vatRatePercent = quote?.vatRate === undefined ? null : Math.round(quote.vatRate * 10000) / 100;
  const totalWithVat = quote?.total ?? quote?.amount ?? (snapshot ? snapshot.customerPayableMinor / minorScale : null);
  const quoteCurrency = quote?.currency ?? snapshot?.currency ?? request.currency;
  const money = (value: number | null) => value === null ? '—' : `${value.toLocaleString()} ${quoteCurrency}`;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <BackIcon size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('payment')}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>{t('total_amount')}</Text>
            <Text style={styles.amountValue}>{money(totalWithVat)}</Text>
            <View style={styles.feeBreakdown}>
              <View style={[styles.feeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.feeText}>{t('subtotal')}</Text>
                <Text style={styles.feeAmount}>{money(subtotal)}</Text>
              </View>
              <View style={[styles.feeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.feeText}>{t('vat')}{vatRatePercent === null ? '' : ` (${vatRatePercent}%)`}</Text>
                <Text style={styles.feeAmount}>{money(vatAmount)}</Text>
              </View>
              <View style={[styles.feeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.feeText}>{t('platform_fee')}</Text>
                <Text style={styles.feeAmount}>{money(platformFee)}</Text>
              </View>
            </View>
          </View>

      <View style={styles.secureRow}>
            <Shield size={16} color={Colors.success} />
        <Text style={styles.secureText}>
          {gateways.length ? gateways.map(gateway => `${gateway.provider === 'tap' ? 'Tap' : gateway.provider} (${gateway.environment})`).join(', ') : t('payment_gateway_unavailable')}
        </Text>
            <Lock size={14} color={Colors.success} />
          </View>

          {step === 'summary' && (
            <>
              <View style={styles.infoCard}>
                <CreditCard size={24} color={Colors.gold} />
                <Text style={[styles.infoText, { textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('tap_payment_info')}
                </Text>
              </View>

              <Pressable style={[styles.payButton, (gatewayLoading || gateways.length === 0) && styles.payButtonDisabled]} onPress={handleCreatePayment} disabled={gatewayLoading || gateways.length === 0}>
                <CreditCard size={20} color={Colors.primary} />
                <Text style={styles.payButtonText}>
                  {t('pay_now')}{totalWithVat === null ? '' : ` - ${money(totalWithVat)}`}
                </Text>
              </Pressable>
            </>
          )}

          {step === 'processing' && (
            <View style={styles.statusCard}>
              <ActivityIndicator size="large" color={Colors.gold} />
              <Text style={styles.statusText}>{t('processing')}</Text>
            </View>
          )}

          {step === 'redirecting' && (
            <View style={styles.statusCard}>
              <ExternalLink size={40} color={Colors.gold} />
              <Text style={styles.statusText}>{t('payment_redirecting')}</Text>
              <Text style={styles.statusSubText}>{t('payment_complete_in_browser')}</Text>

              <Pressable style={styles.openUrlButton} onPress={handleOpenPaymentUrl}>
                <ExternalLink size={18} color={Colors.primary} />
                <Text style={styles.openUrlText}>{t('open_payment_page')}</Text>
              </Pressable>

              <Pressable style={styles.verifyButton} onPress={() => handleVerifyPayment()}>
                <Text style={styles.verifyButtonText}>{t('verify_payment')}</Text>
              </Pressable>
            </View>
          )}

          {step === 'verifying' && (
            <View style={styles.statusCard}>
              <ActivityIndicator size="large" color={Colors.gold} />
              <Text style={styles.statusText}>{t('verifying_payment')}</Text>
            </View>
          )}

          {step === 'success' && (
            <View style={styles.statusCard}>
              <CheckCircle size={56} color={Colors.success} />
              <Text style={styles.successTitle}>{t('payment_success')}</Text>
              <Text style={styles.statusSubText}>{t('invoice_created')}</Text>

              <Pressable style={styles.doneButton} onPress={() => router.back()}>
                <Text style={styles.doneButtonText}>{t('back')}</Text>
              </Pressable>
            </View>
          )}

          {step === 'failed' && (
            <View style={styles.statusCard}>
              <XCircle size={56} color={Colors.error} />
              <Text style={styles.failedTitle}>{t('payment_failed')}</Text>
              <Text style={styles.statusSubText}>{t('payment_failed_message')}</Text>

              <Pressable style={styles.retryButton} onPress={() => setStep('summary')}>
                <Text style={styles.retryButtonText}>{t('try_again')}</Text>
              </Pressable>
            </View>
          )}

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
  scrollContent: { paddingHorizontal: 20, paddingTop: 12 },
  amountCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  amountLabel: { color: Colors.textSecondary, fontSize: 14, marginBottom: 4 },
  amountValue: { color: Colors.gold, fontSize: 36, fontWeight: '800' as const, marginBottom: 12 },
  feeBreakdown: { width: '100%', gap: 6 },
  feeRow: { justifyContent: 'space-between', width: '100%' },
  feeText: { color: Colors.textMuted, fontSize: 13 },
  feeAmount: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' as const },
  secureRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  secureText: { color: Colors.success, fontSize: 13, fontWeight: '600' as const },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  infoText: { flex: 1, color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  payButton: {
    backgroundColor: Colors.gold,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  payButtonDisabled: { opacity: 0.45 },
  payButtonText: { color: Colors.primary, fontSize: 18, fontWeight: '700' as const },
  statusCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  statusText: { color: Colors.textPrimary, fontSize: 18, fontWeight: '600' as const, textAlign: 'center' },
  statusSubText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  successTitle: { color: Colors.success, fontSize: 22, fontWeight: '700' as const },
  failedTitle: { color: Colors.error, fontSize: 22, fontWeight: '700' as const },
  openUrlButton: {
    flexDirection: 'row',
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  openUrlText: { color: Colors.primary, fontSize: 16, fontWeight: '700' as const },
  verifyButton: {
    borderWidth: 1,
    borderColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  verifyButtonText: { color: Colors.gold, fontSize: 15, fontWeight: '600' as const },
  doneButton: {
    backgroundColor: Colors.success,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 4,
  },
  doneButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' as const },
  retryButton: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 4,
  },
  retryButtonText: { color: Colors.primary, fontSize: 16, fontWeight: '700' as const },
});
