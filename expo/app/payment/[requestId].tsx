import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, CreditCard, Lock, Shield } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchRequestById, updatePaymentStatus } from '@/services/firestoreService';
import { EquipmentRequest } from '@/types';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export default function PaymentScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { isRTL, t } = useLanguage();
  const router = useRouter();
  const [cardNumber, setCardNumber] = useState<string>('');
  const [expiry, setExpiry] = useState<string>('');
  const [cvv, setCvv] = useState<string>('');
  const [cardHolder, setCardHolder] = useState<string>('');
  const [processing, setProcessing] = useState<boolean>(false);
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const [request, setRequest] = useState<EquipmentRequest | null>(null);
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!requestId) return;
      try {
        const req = await fetchRequestById(requestId);
        if (mounted) setRequest(req);
      } catch (e) {
        console.log('[Payment] Error loading request:', e);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [requestId]);

  const handlePay = useCallback(async () => {
    if (!cardNumber || !expiry || !cvv || !cardHolder || !requestId) {
      showDialog(t('error_title'), t('error_generic_message'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    setProcessing(true);
    try {
      await updatePaymentStatus(requestId, 'pending_payment');
      await new Promise(resolve => setTimeout(resolve, 2000));
      const mockPaymentId = `tap_${Date.now()}`;
      await updatePaymentStatus(requestId, 'paid', mockPaymentId);
      setProcessing(false);
      showDialog(t('payment_success'), '', [
        { text: t('confirm'), style: 'default', onPress: () => router.back() },
      ]);
    } catch (e) {
      console.error('[Payment] Error:', e);
      setProcessing(false);
      showDialog(t('error_title'), t('error_generic_message'), [{ text: t('ok'), style: 'default' }]);
    }
  }, [cardNumber, expiry, cvv, cardHolder, requestId, t, router, showDialog]);

  if (!request) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.centered}>
          <Text style={styles.errorText}>{t('error_occurred')}</Text>
        </SafeAreaView>
      </View>
    );
  }

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
            <Text style={styles.amountValue}>{request.amount.toLocaleString()} {t('sar')}</Text>
            <View style={styles.feeRow}>
              <Text style={styles.feeText}>{t('platform_fee')}: {request.platformFee.toLocaleString()} {t('sar')}</Text>
            </View>
          </View>

          <View style={styles.secureRow}>
            <Shield size={16} color={Colors.success} />
            <Text style={styles.secureText}>Tap Payment Gateway</Text>
            <Lock size={14} color={Colors.success} />
          </View>

          <View style={styles.formCard}>
            <Text style={[styles.formTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('credit_card')}</Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('card_number')}</Text>
              <View style={[styles.cardInput, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <CreditCard size={20} color={Colors.textMuted} />
                <TextInput
                  style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder="0000 0000 0000 0000"
                  placeholderTextColor={Colors.textMuted}
                  value={cardNumber}
                  onChangeText={setCardNumber}
                  keyboardType="numeric"
                  maxLength={19}
                />
              </View>
            </View>

            <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('expiry')}</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="MM/YY"
                  placeholderTextColor={Colors.textMuted}
                  value={expiry}
                  onChangeText={setExpiry}
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('cvv')}</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="000"
                  placeholderTextColor={Colors.textMuted}
                  value={cvv}
                  onChangeText={setCvv}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('card_holder')}</Text>
              <TextInput
                style={[styles.textInput, { textAlign: isRTL ? 'right' : 'left' }]}
                placeholder={t('card_holder')}
                placeholderTextColor={Colors.textMuted}
                value={cardHolder}
                onChangeText={setCardHolder}
              />
            </View>
          </View>

          <Pressable
            style={[styles.payButton, processing && styles.payButtonDisabled]}
            onPress={handlePay}
            disabled={processing}
          >
            <Text style={styles.payButtonText}>
              {processing ? t('processing') : `${t('pay_now')} - ${request.amount.toLocaleString()} ${t('sar')}`}
            </Text>
          </Pressable>
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
  amountValue: { color: Colors.gold, fontSize: 36, fontWeight: '800' as const },
  feeRow: { marginTop: 8 },
  feeText: { color: Colors.textMuted, fontSize: 13 },
  secureRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  secureText: { color: Colors.success, fontSize: 13, fontWeight: '600' as const },
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  formTitle: { fontSize: 17, fontWeight: '700' as const, color: Colors.textPrimary },
  inputGroup: { gap: 6 },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' as const },
  cardInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 16 },
  textInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlign: 'center',
  },
  row: { gap: 12 },
  payButton: {
    backgroundColor: Colors.gold,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 80,
  },
  payButtonDisabled: { opacity: 0.6 },
  payButtonText: { color: Colors.primary, fontSize: 18, fontWeight: '700' as const },
});
