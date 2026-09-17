import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { getVerificationProfile, startVerification, type TrustStatus, type VerificationProfile } from '@/services/verificationService';

const labels: Record<TrustStatus, [string, string]> = {
  unverified: ['غير موثق', 'Unverified'],
  pending: ['جاري التحقق', 'Verification pending'],
  verified: ['موثق', 'Verified'],
  rejected: ['تعذر التحقق', 'Verification failed'],
  expired: ['انتهت صلاحية التحقق', 'Verification expired'],
  manual_review: ['تحت المراجعة', 'Under manual review'],
  restricted: ['مقيّد', 'Restricted'],
};
const statusColors: Record<TrustStatus, string> = {
  verified: Colors.success, pending: Colors.warning, rejected: Colors.error, expired: Colors.textMuted,
  manual_review: Colors.info, restricted: Colors.error, unverified: Colors.textMuted,
};

export default function VerificationScreen() {
  const { isRTL } = useLanguage();
  const router = useRouter();
  const tx = useCallback((ar: string, en: string) => isRTL ? ar : en, [isRTL]);
  const [profile, setProfile] = useState<VerificationProfile | null>(null);
  const [busy, setBusy] = useState<boolean>(true);
  const [starting, setStarting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setProfile(await getVerificationProfile());
      setError('');
    } catch {
      setError(tx('تعذر تحميل حالة التحقق. سجّل الدخول ثم حاول مجدداً.', 'Unable to load verification status. Sign in and try again.'));
    } finally {
      setBusy(false);
    }
  }, [tx]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = useCallback(async () => {
    setStarting(true);
    setError('');
    try {
      await startVerification();
      await load();
    } catch {
      setError(tx('تعذر بدء طلب التحقق الآن. يرجى المحاولة لاحقاً.', 'Verification cannot be started right now. Please try again later.'));
    } finally {
      setStarting(false);
    }
  }, [load, tx]);

  const status = (value?: TrustStatus) => labels[value || 'unverified'][isRTL ? 0 : 1];
  const identityStatus = profile?.identity.status || 'unverified';
  const components = useMemo(() => profile ? [
    [tx('حالة الهوية', 'Identity'), profile.identity.status],
    [tx('المراجعة اليدوية', 'Manual review'), profile.manualReview.status],
    [tx('الثقة العامة', 'Overall trust'), profile.overallTrust.status],
  ] as [string, TrustStatus][] : [], [profile, tx]);
  const canStart = identityStatus !== 'verified' && identityStatus !== 'pending' && identityStatus !== 'manual_review';
  const webInsets = Platform.OS === 'web' ? { paddingTop: 67, paddingBottom: 34 } : undefined;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={[styles.content, webInsets]}
          refreshControl={<RefreshControl refreshing={busy && !!profile} onRefresh={() => void load()} tintColor={Colors.gold} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.topBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable onPress={() => router.back()} style={[styles.back, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} testID="button-back-profile">
              {isRTL ? <ChevronRight color={Colors.gold} size={20} /> : <ChevronLeft color={Colors.gold} size={20} />}
              <Text style={styles.backText}>{tx('الملف الشخصي', 'Profile')}</Text>
            </Pressable>
            <Pressable onPress={() => void load()} style={styles.iconButton} accessibilityLabel={tx('تحديث الحالة', 'Refresh status')} testID="button-refresh-verification">
              <RefreshCw color={Colors.gold} size={19} />
            </Pressable>
          </View>

          <View style={[styles.hero, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <View style={styles.heroIcon}><ShieldCheck size={29} color={Colors.gold} /></View>
            <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{tx('التحقق والموثوقية', 'Verification & trust')}</Text>
            <Text style={[styles.subtitle, { textAlign: isRTL ? 'right' : 'left' }]}>{tx('تعرض هذه الصفحة فقط الحالة التي يقررها خادم هيفيار الموثوق.', 'This screen only displays status determined by the trusted Heavyar server.')}</Text>
          </View>

          {busy && !profile ? <View style={styles.loading}><ActivityIndicator color={Colors.gold} /><Text style={styles.loadingText}>{tx('جاري تحميل حالتك…', 'Loading your status…')}</Text></View> : (
            <>
              <View style={[styles.primaryCard, { borderColor: statusColors[identityStatus] }]}>
                <Text style={styles.primaryLabel}>{tx('حالة التحقق', 'Verification status')}</Text>
                <View style={[styles.statusRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColors[identityStatus] }]} />
                  <Text style={[styles.primaryStatus, { color: statusColors[identityStatus] }]} testID={`status-verification-${identityStatus}`}>{status(identityStatus)}</Text>
                </View>
                {profile?.identity.expiresAt ? <Text style={styles.expiry}>{tx('تنتهي في', 'Expires')} {new Intl.DateTimeFormat(isRTL ? 'ar-SA' : 'en-GB', { dateStyle: 'medium' }).format(new Date(profile.identity.expiresAt))}</Text> : null}
              </View>
              <View style={styles.section}>
                {components.map(([name, value]) => <View key={name} style={[styles.componentRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><Text style={styles.componentName}>{name}</Text><View style={[styles.componentState, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><View style={[styles.smallDot, { backgroundColor: statusColors[value] }]} /><Text style={[styles.componentValue, { color: statusColors[value] }]}>{status(value)}</Text></View></View>)}
              </View>
              {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}
              <Pressable disabled={starting || !canStart} onPress={() => void start()} style={[styles.button, (starting || !canStart) && styles.disabled]} testID="button-start-verification">
                {starting ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.buttonText}>{tx('طلب مراجعة التحقق', 'Request verification review')}</Text>}
              </Pressable>
              {!canStart && identityStatus !== 'verified' ? <Text style={styles.helper}>{tx('لديك طلب تحقق قيد المعالجة. سيتم تحديث الحالة عند اكتمال المراجعة.', 'Your verification request is being processed. Status updates when review is complete.')}</Text> : null}
              <View style={styles.notice}><Text style={styles.noticeText}>{tx('لا يظهر أي اعتماد رسمي لِنفاذ ما لم يتلقَّ خادم هيفيار نتيجة رسمية متحققاً منها.', 'No official Nafath verification is shown unless the Heavyar server receives and validates an official result.')}</Text></View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 28, gap: 14 },
  topBar: { alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 },
  back: { alignItems: 'center', gap: 4, minHeight: 40 },
  backText: { color: Colors.gold, fontWeight: '700' as const, fontSize: 14 },
  iconButton: { minHeight: 40, minWidth: 40, justifyContent: 'center', alignItems: 'center' },
  hero: { marginTop: 9, gap: 8 },
  heroIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderRadius: 16, borderColor: Colors.border, borderWidth: 1 },
  title: { fontSize: 25, fontWeight: '700' as const, color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, lineHeight: 21, fontSize: 14 },
  loading: { minHeight: 280, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  primaryCard: { backgroundColor: Colors.card, borderWidth: 1, borderRadius: 18, padding: 18, gap: 8, marginTop: 6 },
  primaryLabel: { color: Colors.textSecondary, fontSize: 13 },
  statusRow: { alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  primaryStatus: { fontSize: 22, fontWeight: '700' as const },
  expiry: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  section: { backgroundColor: Colors.card, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  componentRow: { minHeight: 60, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Colors.divider },
  componentName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '500' as const },
  componentState: { alignItems: 'center', gap: 6 },
  smallDot: { width: 7, height: 7, borderRadius: 4 },
  componentValue: { fontSize: 13, fontWeight: '600' as const },
  button: { backgroundColor: Colors.gold, borderRadius: 13, minHeight: 52, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  buttonText: { color: Colors.primary, fontSize: 16, fontWeight: '700' as const },
  disabled: { opacity: 0.52 },
  helper: { color: Colors.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  errorBox: { backgroundColor: 'rgba(231, 76, 60, 0.12)', borderColor: Colors.error, borderWidth: 1, borderRadius: 12, padding: 12 },
  error: { color: Colors.error, textAlign: 'center', fontSize: 13, lineHeight: 18 },
  notice: { backgroundColor: Colors.surface, borderRadius: 12, padding: 13, borderLeftWidth: 3, borderLeftColor: Colors.gold },
  noticeText: { color: Colors.textSecondary, textAlign: 'center', fontSize: 12, lineHeight: 18 },
});