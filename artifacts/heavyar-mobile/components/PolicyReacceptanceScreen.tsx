import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ExternalLink, ShieldCheck } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { HeavyarButton, HeavyarButtonText, HeavyarSurface } from '@/components/ui/heavyar';
import {
  localizedPolicyLink,
  policyConfirmationComplete,
  requiredPolicyConfirmations,
  type PolicyConfirmationKey,
  type PolicyRole,
} from '@/services/policyAcceptanceTransition';

const labels: Record<PolicyConfirmationKey, { ar: string; en: string }> = {
  terms: { ar: 'أوافق على شروط الاستخدام الحالية', en: 'I accept the current Terms of Use' },
  privacy: { ar: 'قرأت سياسة الخصوصية الحالية', en: 'I have read the current Privacy Policy' },
  acceptableUse: { ar: 'أوافق على سياسة الاستخدام المقبول والأنشطة المقيدة', en: 'I accept the Acceptable Use and Restricted Activities Policy' },
  refundPolicy: { ar: 'أوافق على سياسة الاسترداد الحالية', en: 'I accept the current Refund Policy' },
  providerTerms: { ar: 'أوافق على شروط مقدم الخدمة الحالية', en: 'I accept the current Provider Terms' },
  driverTerms: { ar: 'أوافق على شروط السائق الحالية', en: 'I accept the current Driver Terms' },
  legalCapacity: { ar: 'أؤكد تمتعي بالأهلية النظامية لإبرام هذه الاتفاقية', en: 'I confirm that I have legal capacity to enter this agreement' },
  businessAuthority: { ar: 'أؤكد أن لدي الصلاحية للتصرف نيابةً عن النشاط', en: 'I confirm that I am authorized to act for the business' },
};

export default function PolicyReacceptanceScreen({ role, onAccept }: { role: PolicyRole; onAccept: () => Promise<void> }) {
  const { isRTL, language } = useLanguage();
  const [confirmed, setConfirmed] = useState<Partial<Record<PolicyConfirmationKey, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const required = useMemo(() => requiredPolicyConfirmations(role), [role]);
  const complete = policyConfirmationComplete(role, confirmed);
  const direction = isRTL ? 'row-reverse' : 'row';

  const submit = async () => {
    if (!complete || submitting) return;
    setSubmitting(true);
    setError(false);
    try { await onAccept(); } catch { setError(true); } finally { setSubmitting(false); }
  };

  return <View style={styles.screen} testID="policy-reacceptance-screen">
    <ScrollView contentContainerStyle={styles.content}>
      <HeavyarSurface tone="raised" density="spacious" style={styles.card}>
        <View style={styles.icon}><ShieldCheck size={30} color={Colors.gold} strokeWidth={1.9} /></View>
        <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'تحديث الموافقات' : 'Review current policies'}</Text>
        <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>
          {isRTL ? 'استمر باستخدام HEAVYAR بعد مراجعة السياسات الحالية وتأكيد البنود المناسبة لحسابك. سيبقى سجل موافقتك السابق محفوظًا.' : 'Continue using HEAVYAR after reviewing the current policies and confirming the items required for your account. Your previous acceptance record remains preserved.'}
        </Text>

        <View style={styles.items}>
          {required.map(key => {
            const link = localizedPolicyLink(key, language);
            return <View key={key} style={[styles.item, { flexDirection: direction }]}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: confirmed[key] === true }}
                onPress={() => setConfirmed(value => ({ ...value, [key]: value[key] !== true }))}
                style={[styles.checkbox, confirmed[key] && styles.checkboxChecked]}
                testID={`policy-confirm-${key}`}
              >{confirmed[key] ? <Check size={16} color={Colors.primary} strokeWidth={3} /> : null}</Pressable>
              <View style={styles.itemText}>
                <Pressable onPress={() => setConfirmed(value => ({ ...value, [key]: value[key] !== true }))}>
                  <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{labels[key][language]}</Text>
                </Pressable>
                {link ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(link)} style={[styles.linkRow, { flexDirection: direction }]}>
                  <Text style={styles.link}>{isRTL ? 'عرض السياسة' : 'View policy'}</Text>
                  <ExternalLink size={13} color={Colors.gold} />
                </Pressable> : null}
              </View>
            </View>;
          })}
        </View>

        {error ? <Text role="alert" style={[styles.error, { textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'تعذر حفظ الموافقة. لم تتغير حالة حسابك، حاول مرة أخرى.' : 'Acceptance could not be saved. Your account state is unchanged; try again.'}</Text> : null}
        <HeavyarButton fullWidth disabled={!complete || submitting} opacity={!complete || submitting ? 0.5 : 1} onPress={() => void submit()} testID="policy-reaccept-submit">
          <HeavyarButtonText>{submitting ? (isRTL ? 'جارٍ الحفظ…' : 'Saving…') : (isRTL ? 'تأكيد ومتابعة' : 'Confirm and continue')}</HeavyarButtonText>
        </HeavyarButton>
      </HeavyarSurface>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.primary },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  icon: { width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(241,182,29,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: Colors.white, fontSize: 26, lineHeight: 34, fontWeight: '800' },
  body: { color: Colors.textSecondary, fontSize: 14, lineHeight: 23, marginTop: 8 },
  items: { gap: 10, marginVertical: 22 },
  item: { alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 12, backgroundColor: Colors.inputBg },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.borderLight, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { borderColor: Colors.gold, backgroundColor: Colors.gold },
  itemText: { flex: 1, gap: 5 },
  label: { color: Colors.white, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  linkRow: { alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  link: { color: Colors.gold, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  error: { color: Colors.error, fontSize: 13, lineHeight: 20, marginBottom: 12 },
});
