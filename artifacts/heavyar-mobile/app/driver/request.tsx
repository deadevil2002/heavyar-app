import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { createDriverRequest, getPublicDriverProfile } from '@/services/workerClient';
import { useAppDialog } from '@/hooks/useAppDialog';
import AppDialog from '@/components/AppDialog';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { canRequestDriver } from '@/services/driverUtils';
import { LatestRequestGuard } from '@/services/driverLiveSync';
import { useQueryClient } from '@tanstack/react-query';
import { DRIVER_REQUESTS_ROUTE, driverRequestsKey } from '@/services/requestSections';

export default function DriverRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isRTL, t } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const { user, isAuthenticated } = useAuth();
  const accountStatus = (user as (typeof user & { accountStatus?: string }))?.accountStatus;
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [targetReady, setTargetReady] = useState(false);
  const [validating, setValidating] = useState(true);
  const [targetError, setTargetError] = useState(false);
  const guardRef = useRef(new LatestRequestGuard());

  const validateTarget = useCallback(async (silent = false) => {
    if (!id) {
      setTargetReady(false);
      setTargetError(true);
      setValidating(false);
      return;
    }
    const request = guardRef.current.begin();
    if (!silent) setValidating(true);
    try {
      await getPublicDriverProfile(id, request.signal);
      if (!guardRef.current.isCurrent(request.generation)) return;
      setTargetReady(true);
      setTargetError(false);
    } catch {
      if (!guardRef.current.isCurrent(request.generation)) return;
      setTargetReady(false);
      setTargetError(true);
    } finally {
      if (guardRef.current.isCurrent(request.generation)) setValidating(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void validateTarget();
    const interval = setInterval(() => void validateTarget(true), 15000);
    return () => {
      clearInterval(interval);
      guardRef.current.cancel();
    };
  }, [validateTarget, isAuthenticated, user?.uid, user?.role, accountStatus]));

  const handleSubmit = async () => {
    if (!isAuthenticated || !canRequestDriver(isAuthenticated, user?.role, accountStatus)) {
      showDialog(t('error_title'), isRTL ? 'حسابك غير مؤهل لطلب سائق' : 'Your account is not eligible to request a driver', [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!targetReady || targetError || !id) {
      showDialog(t('error_title'), t('error_generic_message'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!notes.trim()) {
      showDialog(t('error_title'), isRTL ? 'يرجى إدخال تفاصيل الطلب' : 'Please enter request details', [{ text: t('ok'), style: 'default' }]);
      return;
    }
    setSubmitting(true);
    try {
      await createDriverRequest({ driverId: id, notes: notes.trim() });
      if (user) void queryClient.invalidateQueries({ queryKey: driverRequestsKey(user.uid, user.role), exact: true });
      showDialog(t('success'), isRTL ? 'تم إرسال الطلب بنجاح' : 'Request sent successfully', [
        { text: t('ok'), style: 'default', onPress: () => { hideDialog(); router.replace(DRIVER_REQUESTS_ROUTE); } }
      ]);
    } catch {
      showDialog(t('error_title'), t('error_generic_message'), [{ text: t('ok'), style: 'default' }]);
    } finally {
      setSubmitting(false);
    }
  };

  const hint = isRTL
    ? 'يرجى تضمين التاريخ، الوقت، نوع المعدة، وموقع العمل...'
    : 'Please include date, time, equipment type, and job location...';

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            {isRTL ? <ChevronRight color={Colors.textPrimary} /> : <ChevronLeft color={Colors.textPrimary} />}
          </Pressable>
          <Text style={styles.headerTitle}>{isRTL ? 'طلب سائق' : 'Request Driver'}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.content}>
          {validating ? <ActivityIndicator color={Colors.gold} /> : targetError ? (
            <View style={styles.targetError}>
              <Text style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>
                {isRTL ? 'تعذر التحقق من توفر السائق.' : 'Unable to verify this driver is available.'}
              </Text>
              <View style={[styles.errorActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Pressable onPress={() => void validateTarget()}><Text style={styles.retryText}>{isRTL ? 'إعادة المحاولة' : 'Retry'}</Text></Pressable>
                <Pressable onPress={() => router.back()}><Text style={styles.backText}>{isRTL ? 'رجوع' : 'Back'}</Text></Pressable>
              </View>
            </View>
          ) : null}
          <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'تفاصيل الطلب' : 'Request Details'}</Text>
          <TextInput
            style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={hint}
            placeholderTextColor={Colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
          />
          <Pressable
            style={[styles.button, (submitting || validating || targetError || !targetReady || !canRequestDriver(isAuthenticated, user?.role, accountStatus)) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting || validating || targetError || !targetReady || !canRequestDriver(isAuthenticated, user?.role, accountStatus)}
          >
            <Text style={styles.buttonText}>{submitting ? t('saving') : (isRTL ? 'إرسال الطلب' : 'Send Request')}</Text>
          </Pressable>
        </View>
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
  content: { padding: 20, gap: 16 },
  label: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  input: { backgroundColor: Colors.inputBg, color: Colors.textPrimary, borderColor: Colors.border, borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 150, fontSize: 15 },
  button: { backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: Colors.primary, fontWeight: '700', fontSize: 16 },
  targetError: { backgroundColor: Colors.surface, borderColor: Colors.error, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  errorText: { color: Colors.error, fontSize: 14 },
  errorActions: { gap: 20 },
  retryText: { color: Colors.gold, fontWeight: '700' },
  backText: { color: Colors.textSecondary, fontWeight: '600' },
});
