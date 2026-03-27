import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, CreditCard, Lock, Shield, ExternalLink, CheckCircle, XCircle } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchRequestById,
  updatePaymentStatus,
  createInvoice,
  generateInvoiceNumber,
  fetchEquipmentById,
  fetchUserById,
  updateRequestInvoiceId,
} from '@/services/firestoreService';
import { createPayment, verifyPayment } from '@/services/paymentService';
import { EquipmentRequest } from '@/types';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

type PaymentStep = 'summary' | 'processing' | 'redirecting' | 'verifying' | 'success' | 'failed';

export default function PaymentScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { isRTL, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const [request, setRequest] = useState<EquipmentRequest | null>(null);
  const [step, setStep] = useState<PaymentStep>('summary');
  const [chargeId, setChargeId] = useState<string>('');
  const [paymentUrl, setPaymentUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!requestId) return;
      try {
        const req = await fetchRequestById(requestId);
        if (mounted) {
          setRequest(req);
          setLoading(false);
        }
      } catch (e) {
        console.log('[Payment] Error loading request:', e);
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [requestId]);

  const handleVerifyRef = React.useRef<(cId?: string) => Promise<void>>(() => Promise.resolve());

  const handleCreatePayment = useCallback(async () => {
    if (!request || !requestId || !user) return;

    setStep('processing');
    try {
      await updatePaymentStatus(requestId, 'pending_payment');

      const result = await createPayment({
        amount: request.amount,
        currency: request.currency || 'SAR',
        requestId,
        customerName: user.nameEn || user.nameAr,
        customerEmail: user.email,
        customerPhone: user.phone,
      });

      if (!result.success || !result.chargeId) {
        console.log('[Payment] Create payment failed:', result.error);
        setStep('failed');
        await updatePaymentStatus(requestId, 'failed');
        return;
      }

      setChargeId(result.chargeId);

      if (result.paymentUrl) {
        setPaymentUrl(result.paymentUrl);
        setStep('redirecting');

        if (Platform.OS !== 'web') {
          try {
            await Linking.openURL(result.paymentUrl);
          } catch (linkErr) {
            console.log('[Payment] Could not open URL:', linkErr);
          }
        } else {
          try {
            window.open(result.paymentUrl, '_blank');
          } catch (webErr) {
            console.log('[Payment] Could not open web URL:', webErr);
          }
        }
      } else {
        void handleVerifyRef.current?.(result.chargeId);
      }
    } catch (e) {
      console.error('[Payment] Error:', e);
      setStep('failed');
      try {
        await updatePaymentStatus(requestId, 'failed');
      } catch {}
    }
  }, [request, requestId, user]);

  const handleVerifyPayment = useCallback(async (cId?: string) => {
    const id = cId || chargeId;
    if (!id || !requestId) return;

    setStep('verifying');
    try {
      const result = await verifyPayment(id);

      if (result.success && result.isPaid) {
        await updatePaymentStatus(requestId, 'paid', id);

        try {
          const req = await fetchRequestById(requestId);
          if (req) {
            const _equipment = await fetchEquipmentById(req.equipmentId);
            const provider = await fetchUserById(req.providerUid);
            const customer = await fetchUserById(req.customerUid);

            const invoiceNumber = await generateInvoiceNumber();
            const subtotal = req.amount;
            const vatRate = 0.15;
            const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
            const totalAmount = Math.round((subtotal + vatAmount) * 100) / 100;

            const invoiceId = await createInvoice({
              invoiceNumber,
              requestId,
              equipmentId: req.equipmentId,
              providerId: req.providerUid,
              customerId: req.customerUid,
              sellerName: provider ? (provider.nameAr || provider.nameEn) : '',
              buyerName: customer ? (customer.nameAr || customer.nameEn) : '',
              subtotal,
              vatRate,
              vatAmount,
              totalAmount,
              currency: req.currency || 'SAR',
              status: 'paid',
              paidAt: new Date().toISOString(),
              paymentReference: id,
            });

            await updateRequestInvoiceId(requestId, invoiceId);
            console.log('[Payment] Invoice created:', invoiceId, invoiceNumber);
          }
        } catch (invoiceErr) {
          console.error('[Payment] Invoice creation error (payment still succeeded):', invoiceErr);
        }

        setStep('success');
      } else {
        console.log('[Payment] Payment not captured yet, status:', result.status);
        if (result.status === 'INITIATED' || result.status === 'IN_PROGRESS') {
          showDialog(
            t('payment'),
            t('payment_pending_message'),
            [
              { text: t('verify_again'), style: 'default', onPress: () => handleVerifyPayment(id) },
              { text: t('cancel'), style: 'cancel' },
            ]
          );
          setStep('redirecting');
        } else {
          await updatePaymentStatus(requestId, 'failed');
          setStep('failed');
        }
      }
    } catch (e) {
      console.error('[Payment] Verify error:', e);
      setStep('failed');
    }
  }, [chargeId, requestId, t, showDialog]);

  handleVerifyRef.current = handleVerifyPayment;

  const handleOpenPaymentUrl = useCallback(async () => {
    if (!paymentUrl) return;
    try {
      if (Platform.OS !== 'web') {
        await Linking.openURL(paymentUrl);
      } else {
        window.open(paymentUrl, '_blank');
      }
    } catch (e) {
      console.log('[Payment] Open URL error:', e);
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

  const vatAmount = Math.round(request.amount * 0.15 * 100) / 100;
  const totalWithVat = Math.round((request.amount + vatAmount) * 100) / 100;

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
            <Text style={styles.amountValue}>{totalWithVat.toLocaleString()} {t('sar')}</Text>
            <View style={styles.feeBreakdown}>
              <View style={[styles.feeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.feeText}>{t('subtotal')}</Text>
                <Text style={styles.feeAmount}>{request.amount.toLocaleString()} {t('sar')}</Text>
              </View>
              <View style={[styles.feeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.feeText}>{t('vat')} (15%)</Text>
                <Text style={styles.feeAmount}>{vatAmount.toLocaleString()} {t('sar')}</Text>
              </View>
              <View style={[styles.feeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.feeText}>{t('platform_fee')}</Text>
                <Text style={styles.feeAmount}>{request.platformFee.toLocaleString()} {t('sar')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.secureRow}>
            <Shield size={16} color={Colors.success} />
            <Text style={styles.secureText}>Tap Payment Gateway</Text>
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

              <Pressable style={styles.payButton} onPress={handleCreatePayment}>
                <CreditCard size={20} color={Colors.primary} />
                <Text style={styles.payButtonText}>
                  {t('pay_now')} - {totalWithVat.toLocaleString()} {t('sar')}
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
