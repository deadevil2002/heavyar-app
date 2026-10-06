import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SettingsHeader from '@/components/SettingsHeader';
import AppDialog from '@/components/AppDialog';
import Colors from '@/constants/colors';
import { SUPPORT_EMAIL } from '@/constants/support';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAppDialog } from '@/hooks/useAppDialog';
import { submitRequestComplaint } from '@/services/workerClient';
import { useBlockedUsers } from '@/services/blockedUsers';

type ReportReason = 'harassment' | 'inappropriate_content' | 'fraud_or_spam' | 'safety' | 'other';
const reasons: { id: ReportReason; ar: string; en: string }[] = [
  { id: 'harassment', ar: 'إساءة أو تحرش', en: 'Harassment or abuse' },
  { id: 'inappropriate_content', ar: 'محتوى غير لائق', en: 'Inappropriate content' },
  { id: 'fraud_or_spam', ar: 'احتيال أو رسائل مزعجة', en: 'Fraud or spam' },
  { id: 'safety', ar: 'خطر على السلامة', en: 'Safety concern' },
  { id: 'other', ar: 'سبب آخر', en: 'Other' },
];

/**
 * Report a conversation/user (tied to a rental request) or a public listing.
 * Request-scoped reports go to the Worker complaint queue; listing reports go to
 * the published support mailbox because they have no rental context.
 */
export default function ReportScreen() {
  const params = useLocalSearchParams<{ requestId?: string; listingId?: string; subjectUid?: string; subjectName?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';
  const listingId = typeof params.listingId === 'string' ? params.listingId : '';
  const subjectUid = typeof params.subjectUid === 'string' ? params.subjectUid : '';
  const subjectName = typeof params.subjectName === 'string' ? params.subjectName : '';
  const router = useRouter();
  const { isRTL, language } = useLanguage();
  const { user } = useAuth();
  const tx = (ar: string, en: string) => language === 'ar' ? ar : en;
  const { isBlocked, block, unblock } = useBlockedUsers(user?.uid);
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const textAlign = isRTL ? 'right' : 'left';
  const canBlock = Boolean(user && subjectUid && subjectUid !== user.uid);
  const blocked = isBlocked(subjectUid);
  const reasonLabel = reasons.find(item => item.id === reason)?.en || reason;
  const narrative = details.trim();
  const canSubmit = !loading && (requestId ? narrative.length >= 5 : true);

  const done = (message: string) => showDialog(tx('تم استلام البلاغ', 'Report received'), message, [{ text: tx('حسنًا', 'OK'), onPress: () => { if (router.canGoBack()) router.back(); } }]);

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      if (requestId) {
        const result = await submitRequestComplaint(requestId, `user_report:${reason}`, narrative);
        done(`${tx('سيراجع فريق Heavyar البلاغ ويتخذ الإجراء المناسب خلال 24 ساعة.', 'The Heavyar team will review this report and act within 24 hours.')}\n${tx('رقم البلاغ', 'Report ID')}: ${result.complaintId}`);
      } else {
        const subject = encodeURIComponent(`Heavyar report: listing ${listingId || '-'}`);
        const body = encodeURIComponent([
          `Listing ID: ${listingId || '-'}`,
          `Reported account: ${subjectUid || '-'}`,
          `Reporter account: ${user?.uid || 'guest'}`,
          `Reason: ${reasonLabel}`,
          '',
          narrative,
        ].join('\n'));
        await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
        done(tx('أكمل إرسال الرسالة من تطبيق البريد. سيراجع فريق Heavyar البلاغ خلال 24 ساعة.', 'Finish sending the email from your mail app. The Heavyar team will review it within 24 hours.'));
      }
    } catch {
      showDialog(
        tx('تعذر إرسال البلاغ', 'Could not send report'),
        tx(`حاول مرة أخرى أو راسلنا على ${SUPPORT_EMAIL}`, `Please try again or email ${SUPPORT_EMAIL}`),
        [{ text: tx('حسنًا', 'OK') }],
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = () => {
    if (!canBlock) return;
    if (blocked) { void unblock(subjectUid); return; }
    showDialog(
      tx('حظر هذا المستخدم؟', 'Block this user?'),
      tx('لن تظهر لك رسائله أو إعلاناته على هذا الحساب، ويمكنك إلغاء الحظر لاحقًا.', 'You will no longer see their messages or listings on this account. You can unblock them later.'),
      [
        { text: tx('إلغاء', 'Cancel'), style: 'cancel' },
        { text: tx('حظر', 'Block'), style: 'danger', onPress: () => { void block(subjectUid); } },
      ],
    );
  };

  return <View style={styles.container}><SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
    <SettingsHeader title={listingId && !requestId ? tx('الإبلاغ عن إعلان', 'Report listing') : tx('الإبلاغ عن مستخدم', 'Report user')} fallback="/(tabs)/profile" />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!!subjectName && <Text style={[styles.subject, { textAlign }]}>{subjectName}</Text>}
      <Text style={[styles.intro, { textAlign }]}>{tx('ساعدنا في إبقاء Heavyar آمنًا. اختر سبب البلاغ وأضف التفاصيل، وسيراجعه فريقنا ويزيل المحتوى المخالف ويتخذ إجراءً بحق الحساب عند الحاجة.', 'Help keep Heavyar safe. Choose a reason and add details; our team reviews every report, removes violating content, and acts on the account when needed.')}</Text>
      <View style={[styles.chips, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>{reasons.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: reason === item.id }} onPress={() => setReason(item.id)} style={[styles.chip, reason === item.id && styles.chipActive]}>
        <Text style={[styles.chipText, reason === item.id && styles.chipTextActive]}>{tx(item.ar, item.en)}</Text>
      </Pressable>)}</View>
      <TextInput value={details} onChangeText={setDetails} placeholder={requestId ? tx('صف ما حدث (5 أحرف على الأقل)', 'Describe what happened (at least 5 characters)') : tx('تفاصيل اختيارية', 'Optional details')} placeholderTextColor={Colors.textMuted} multiline maxLength={2000} style={[styles.input, { textAlign }]} />
      <Pressable accessibilityRole="button" disabled={!canSubmit} onPress={submit} style={[styles.primary, !canSubmit && styles.disabled]}>
        {loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.primaryText}>{tx('إرسال البلاغ', 'Send report')}</Text>}
      </Pressable>
      {canBlock && <Pressable accessibilityRole="button" onPress={toggleBlock} style={styles.secondary}>
        <Text style={[styles.secondaryText, !blocked && styles.dangerText]}>{blocked ? tx('إلغاء حظر المستخدم', 'Unblock user') : tx('حظر المستخدم', 'Block user')}</Text>
      </Pressable>}
      <Text style={[styles.note, { textAlign }]}>{tx(`للحالات العاجلة راسلنا على ${SUPPORT_EMAIL}`, `For urgent cases email ${SUPPORT_EMAIL}`)}</Text>
    </ScrollView>
  </SafeAreaView><AppDialog visible={dialog.visible} title={dialog.title} message={dialog.message} buttons={dialog.buttons} onClose={hideDialog} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  content: { padding: 20, gap: 18 },
  subject: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  intro: { color: Colors.textSecondary, fontSize: 14, lineHeight: 23 },
  chips: { flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.card },
  chipActive: { borderColor: Colors.gold, backgroundColor: Colors.surface },
  chipText: { color: Colors.textSecondary, fontSize: 12 },
  chipTextActive: { color: Colors.gold, fontWeight: '700' },
  input: { minHeight: 140, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, color: Colors.textPrimary, backgroundColor: Colors.card, textAlignVertical: 'top' },
  primary: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gold },
  disabled: { opacity: 0.5 },
  primaryText: { color: Colors.primary, fontWeight: '800', fontSize: 15 },
  secondary: { minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  secondaryText: { color: Colors.textPrimary, fontWeight: '700' },
  dangerText: { color: Colors.error },
  note: { color: Colors.textMuted, fontSize: 12, lineHeight: 19 },
});
