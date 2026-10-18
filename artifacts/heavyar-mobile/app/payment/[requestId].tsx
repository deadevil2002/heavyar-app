import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, CreditCard, Lock, Shield, ExternalLink, CheckCircle, XCircle } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRequestById } from '@/services/firestoreService';
import {
  createEquipmentPreServicePayment,
  createPayment,
  isAcceptedFixedDurationRental,
  isEquipmentPreServiceTestReady,
  prepareEquipmentPreServicePayment,
  preServicePaymentUnavailableCode,
  safeTapCheckoutUrl,
  verifyEquipmentPreServicePayment,
  verifyPayment,
} from '@/services/paymentService';
import type { CreateEquipmentPreServicePaymentResponse, PaymentLifecycleStatus, PaymentQuote } from '@/services/paymentService';
import { EquipmentRequest } from '@/types';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { getCheckoutGateways, type CheckoutGateway } from '@/services/workerClient';

type PaymentStep = 'summary' | 'processing' | 'redirecting' | 'verifying' | 'success' | 'failed';
type PreServiceReadiness = 'legacy' | 'checking' | 'ready' | 'existing' | 'unavailable' | 'error';

export default function PaymentScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { user } = useAuth();
  return <PaymentScreenContent key={`${user?.uid || 'guest'}:${requestId || ''}`} />;
}

function PaymentScreenContent() {
  const { requestId, paymentId: callbackPaymentId } = useLocalSearchParams<{ requestId: string; paymentId?: string }>();
  const { isRTL, t } = useLanguage();
  const { user } = useAuth();
  const expectedUid = user?.uid || '';
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
  const [preServiceMode, setPreServiceMode] = useState(false);
  const [preServiceReadiness, setPreServiceReadiness] = useState<PreServiceReadiness>('legacy');
  const [preServiceUnavailable, setPreServiceUnavailable] = useState('');
  const handledCallbackPayment = useRef<string | null>(null);
  const paymentCreationInFlight = useRef(false);
  const paymentVerificationInFlight = useRef(false);
  const mountedRef = useRef(true);
  const preparationAbortRef = useRef<AbortController | null>(null);
  const paymentAbortRef = useRef<AbortController | null>(null);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const isCurrentScope = useCallback(() => mountedRef.current && !!expectedUid, [expectedUid]);

  const unavailableCopy = useCallback((code: string) => {
    if (code === 'PRE_SERVICE_PAYMENT_NOT_ACTIVATED') {
      return isRTL
        ? 'الدفع التجريبي المسبق لتأجير المعدات غير متاح حاليًا.'
        : 'Equipment pre-service TEST checkout is not available yet.';
    }
    if (code === 'TAP_DESTINATION_UNAVAILABLE' || code === 'TAP_DESTINATION_NOT_APPROVED') {
      return isRTL
        ? 'وجهة Tap الخاصة بمقدم المعدة غير متاحة أو غير معتمدة للاختبار.'
        : 'The equipment provider Tap destination is unavailable or not approved for TEST.';
    }
    if (code === 'RENTAL_PAYMENT_PREREQUISITES_NOT_MET' || code === 'RENTAL_PAYMENT_QUOTE_NOT_LOCKED') {
      return isRTL
        ? 'طلب التأجير غير مؤهل حاليًا للدفع المسبق الآمن.'
        : 'This rental is not currently eligible for secure pre-service checkout.';
    }
    return isRTL
      ? 'تعذر التحقق من جاهزية الدفع التجريبي. حاول مرة أخرى لاحقًا.'
      : 'TEST checkout readiness could not be verified. Please try again later.';
  }, [isRTL]);

  const runPreServicePreparation = useCallback(async (
    rental: EquipmentRequest,
    discoveredGateways: CheckoutGateway[],
    controller = new AbortController(),
  ) => {
    if (!requestId || !expectedUid || (preparationAbortRef.current && !preparationAbortRef.current.signal.aborted)) return;
    preparationAbortRef.current?.abort();
    preparationAbortRef.current = controller;
    setPreServiceReadiness('checking');
    setPreServiceUnavailable('');
    try {
      const result = await prepareEquipmentPreServicePayment(requestId, {
        signal: controller.signal,
        expectedUid,
      });
      if (!isCurrentScope() || controller.signal.aborted || rental.customerUid !== expectedUid) return;
      if (!isEquipmentPreServiceTestReady(result, discoveredGateways, requestId)) {
        setPreServiceReadiness('unavailable');
        setPreServiceUnavailable(unavailableCopy('PRE_SERVICE_PAYMENT_UNAVAILABLE'));
        return;
      }
      setQuote({
        amount: result.plan.customerPayableMinor / 100,
        total: result.plan.customerPayableMinor / 100,
        currency: result.plan.currency,
      });
      setPreServiceReadiness('ready');
    } catch (error) {
      if (!isCurrentScope() || controller.signal.aborted) return;
      const code = preServicePaymentUnavailableCode(error);
      setPreServiceReadiness(code === 'PRE_SERVICE_PAYMENT_UNAVAILABLE' ? 'error' : 'unavailable');
      setPreServiceUnavailable(unavailableCopy(code));
    } finally {
      if (preparationAbortRef.current === controller) preparationAbortRef.current = null;
    }
  }, [expectedUid, isCurrentScope, requestId, unavailableCopy]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const load = async () => {
      if (!requestId || !expectedUid) {
        setLoading(false);
        setGatewayLoading(false);
        return;
      }
      try {
        const [rental, gatewayResult] = await Promise.all([
          fetchRequestById(requestId),
          getCheckoutGateways(controller.signal, expectedUid),
        ]);
        if (!isCurrentScope() || controller.signal.aborted) return;
        if (!rental || rental.customerUid !== expectedUid) {
          setRequest(null);
          return;
        }
        setRequest(rental);
        setGateways(gatewayResult.gateways);
        const equipmentPreService = isAcceptedFixedDurationRental(rental, expectedUid) &&
          ['unpaid', 'pending_payment'].includes(String(rental.paymentStatus));
        setPreServiceMode(equipmentPreService);
        if (equipmentPreService && rental.paymentStatus === 'unpaid') {
          await runPreServicePreparation(rental, gatewayResult.gateways, controller);
        } else if (equipmentPreService && /^[A-Za-z0-9_-]{8,200}$/.test(String(rental.paymentId || ''))) {
          setPaymentId(String(rental.paymentId));
          setPreServiceReadiness('existing');
          setStep('redirecting');
        } else {
          setPreServiceReadiness(equipmentPreService ? 'unavailable' : 'legacy');
          if (equipmentPreService) {
            setPreServiceUnavailable(unavailableCopy('PRE_SERVICE_PAYMENT_UNAVAILABLE'));
          }
        }
      } catch {
        if (isCurrentScope() && !controller.signal.aborted) setRequest(null);
      } finally {
        if (isCurrentScope() && !controller.signal.aborted) {
          setLoading(false);
          setGatewayLoading(false);
        }
      }
    };
    void load();
    return () => {
      mountedRef.current = false;
      controller.abort();
      preparationAbortRef.current?.abort();
      paymentAbortRef.current?.abort();
    };
  }, [expectedUid, isCurrentScope, requestId, runPreServicePreparation, unavailableCopy]);

  const handleVerifyRef = React.useRef<(cId?: string) => Promise<void>>(() => Promise.resolve());

  const handleCreatePayment = useCallback(async () => {
    if (!request || !requestId || !user || request.customerUid !== expectedUid) return;
    if (paymentCreationInFlight.current) return;
    if (preServiceMode && preServiceReadiness !== 'ready') return;

    paymentCreationInFlight.current = true;
    const controller = new AbortController();
    paymentAbortRef.current?.abort();
    paymentAbortRef.current = controller;
    setStep('processing');
    try {
      const result = preServiceMode
        ? await createEquipmentPreServicePayment(requestId, { signal: controller.signal, expectedUid })
        : await createPayment({ requestId, purpose: 'equipment_request' }, { signal: controller.signal, expectedUid });

      if (!isCurrentScope() || controller.signal.aborted) return;

      if (!result.success || !result.paymentId) {
        setStep('failed');
        return;
      }
      const returnedPlan = preServiceMode ? (result as CreateEquipmentPreServicePaymentResponse).plan : undefined;
      if (preServiceMode && (!returnedPlan || !isEquipmentPreServiceTestReady(
        { success: true, plan: returnedPlan },
        gateways,
        requestId,
      ))) {
        setPreServiceReadiness('unavailable');
        setPreServiceUnavailable(unavailableCopy('PRE_SERVICE_PAYMENT_UNAVAILABLE'));
        setStep('summary');
        return;
      }

      // The backend quote is authoritative; do not display the request estimate
      // once a payment has been created.
      if (result.quote) setQuote(result.quote);
      setPaymentId(result.paymentId);

      const status = String(result.status || 'pending').toLowerCase() as PaymentLifecycleStatus;
      const checkoutUrl = safeTapCheckoutUrl(result.checkoutUrl);
      if (checkoutUrl && (status === 'pending' || status === 'requires_action')) {
        setPaymentUrl(checkoutUrl);
        setStep('redirecting');
      } else {
        void handleVerifyRef.current?.(result.paymentId);
      }
    } catch (error) {
      if (!isCurrentScope() || controller.signal.aborted) return;
      if (preServiceMode) {
        setPreServiceReadiness('unavailable');
        setPreServiceUnavailable(unavailableCopy(preServicePaymentUnavailableCode(error)));
        setStep('summary');
      } else {
        setStep('failed');
      }
    } finally {
      if (paymentAbortRef.current === controller) paymentAbortRef.current = null;
      paymentCreationInFlight.current = false;
    }
  }, [expectedUid, gateways, isCurrentScope, preServiceMode, preServiceReadiness, request, requestId, unavailableCopy, user]);

  const handleVerifyPayment = useCallback(async (cId?: string) => {
    const id = cId || paymentId;
    if (!id || !requestId || !expectedUid || paymentVerificationInFlight.current) return;

    paymentVerificationInFlight.current = true;
    const controller = new AbortController();
    paymentAbortRef.current?.abort();
    paymentAbortRef.current = controller;
    setStep('verifying');
    try {
      const result = preServiceMode
        ? await verifyEquipmentPreServicePayment(id, { signal: controller.signal, expectedUid })
        : await verifyPayment(id, { signal: controller.signal, expectedUid });

      if (!isCurrentScope() || controller.signal.aborted) return;

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
    } catch {
      if (isCurrentScope() && !controller.signal.aborted) setStep('failed');
    } finally {
      if (paymentAbortRef.current === controller) paymentAbortRef.current = null;
      paymentVerificationInFlight.current = false;
    }
  }, [expectedUid, isCurrentScope, paymentId, preServiceMode, requestId]);

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
    const checkoutUrl = safeTapCheckoutUrl(paymentUrl);
    if (!checkoutUrl) return;
    try {
      if (Platform.OS !== 'web') {
        await Linking.openURL(checkoutUrl);
      } else {
        window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {}
  }, [paymentUrl]);

  const handleRetryPreparation = useCallback(() => {
    if (!request || !preServiceMode || preServiceReadiness === 'checking') return;
    void runPreServicePreparation(request, gateways);
  }, [gateways, preServiceMode, preServiceReadiness, request, runPreServicePreparation]);

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
  const testMode = gateways.some((gateway) => !['LIVE', 'PRODUCTION'].includes(gateway.environment.toUpperCase()));
  const payDisabled = gatewayLoading || gateways.length === 0 || paymentCreationInFlight.current ||
    (preServiceMode && preServiceReadiness !== 'ready');

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <BackIcon size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('payment')}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {testMode && (
            <View style={styles.testModeBanner}>
              <Text style={styles.testModeTitle}>{isRTL ? 'وضع اختبار الدفع' : 'PAYMENT TEST MODE'}</Text>
              <Text style={styles.testModeText}>
                {isRTL ? 'لا يتم تحصيل دفعة إنتاجية حقيقية.' : 'No live production payment is collected.'}
              </Text>
            </View>
          )}
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

          {preServiceMode && preServiceReadiness === 'checking' && (
            <View style={styles.statusCard} accessibilityLiveRegion="polite">
              <ActivityIndicator size="large" color={Colors.gold} />
              <Text style={styles.statusText}>
                {isRTL ? 'جارٍ التحقق من جاهزية الدفع التجريبي…' : 'Checking TEST checkout readiness…'}
              </Text>
            </View>
          )}

          {preServiceMode && ['unavailable', 'error'].includes(preServiceReadiness) && (
            <View style={styles.statusCard} accessibilityRole="alert">
              <XCircle size={48} color={Colors.error} />
              <Text style={styles.failedTitle}>
                {isRTL ? 'الدفع غير متاح' : 'Checkout unavailable'}
              </Text>
              <Text style={styles.statusSubText}>{preServiceUnavailable}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={handleRetryPreparation}
                accessibilityRole="button"
                accessibilityLabel={isRTL ? 'إعادة التحقق من جاهزية الدفع' : 'Retry checkout readiness'}
              >
                <Text style={styles.retryButtonText}>{t('try_again')}</Text>
              </Pressable>
            </View>
          )}

          {step === 'summary' && (!preServiceMode || preServiceReadiness === 'ready') && (
            <>
              <View style={styles.infoCard}>
                <CreditCard size={24} color={Colors.gold} />
                <Text style={[styles.infoText, { textAlign: isRTL ? 'right' : 'left' }]}>
                  {t('tap_payment_info')}
                </Text>
              </View>

              <Pressable
                style={[styles.payButton, payDisabled && styles.payButtonDisabled]}
                onPress={handleCreatePayment}
                disabled={payDisabled}
                accessibilityRole="button"
                accessibilityState={{ disabled: payDisabled, busy: paymentCreationInFlight.current }}
                accessibilityLabel={isRTL ? 'المتابعة إلى دفع Tap التجريبي' : 'Continue to Tap TEST checkout'}
              >
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

              {!!paymentUrl && (
                <Pressable style={styles.openUrlButton} onPress={handleOpenPaymentUrl} accessibilityRole="link">
                  <ExternalLink size={18} color={Colors.primary} />
                  <Text style={styles.openUrlText}>{t('open_payment_page')}</Text>
                </Pressable>
              )}

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
  testModeBanner: {
    backgroundColor: 'rgba(212, 168, 67, 0.16)',
    borderColor: Colors.gold,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  testModeTitle: { color: Colors.gold, fontSize: 13, fontWeight: '800' as const, letterSpacing: 0.4 },
  testModeText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
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
