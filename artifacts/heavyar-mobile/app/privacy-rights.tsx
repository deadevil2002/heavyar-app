import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SettingsHeader from '@/components/SettingsHeader';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchPersonalDataExport, submitPrivacyRequest, type PrivacyRequestType } from '@/services/workerClient';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

const types: PrivacyRequestType[] = ['access', 'correction', 'deletion', 'privacy_inquiry', 'objection_withdrawal'];

export default function PrivacyRightsScreen() {
  const { isRTL, language } = useLanguage();
  const tx = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [type, setType] = useState<PrivacyRequestType>('access');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const submit = async () => { setLoading(true); try { const result = await submitPrivacyRequest(type, details.trim()); showDialog(tx('تم استلام الطلب', 'Request received'), `${tx('رقم الطلب', 'Request ID')}: ${result.requestId}`, [{ text: tx('حسنًا', 'OK') }]); setDetails(''); } catch { showDialog(tx('تعذر إرسال الطلب', 'Could not submit request'), tx('حاول مرة أخرى لاحقًا.', 'Please try again later.'), [{ text: tx('حسنًا', 'OK') }]); } finally { setLoading(false); } };
  const exportData = async () => { setLoading(true); try { await fetchPersonalDataExport(); showDialog(tx('التصدير جاهز', 'Export ready'), tx('تم تجهيز نسخة آمنة ومحدودة من بيانات حسابك. تواصل مع الدعم لاستلامها عبر قناة موثقة.', 'A safe, limited account export has been prepared. Contact support to receive it through a verified channel.'), [{ text: tx('حسنًا', 'OK') }]); } catch { showDialog(tx('تعذر تجهيز التصدير', 'Could not prepare export'), tx('حاول مرة أخرى لاحقًا.', 'Please try again later.'), [{ text: tx('حسنًا', 'OK') }]); } finally { setLoading(false); } };
  return <View style={styles.container}><SafeAreaView edges={['top']} style={{ flex: 1 }}><SettingsHeader title={tx('حقوق الخصوصية', 'Privacy rights')} fallback="/settings" /><ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.intro, { textAlign: isRTL ? 'right' : 'left' }]}>{tx('قدّم طلب وصول أو تصحيح أو حذف أو استفسار خصوصية. يتم التحقق من الهوية ومراجعة الطلب دون كشف بيانات غير لازمة.', 'Submit an access, correction, deletion, or privacy inquiry. Identity is verified and the request is reviewed without exposing unnecessary data.')}</Text>
    <View style={styles.chips}>{types.map(item => <Pressable key={item} onPress={() => setType(item)} style={[styles.chip, type === item && styles.chipActive]}><Text style={[styles.chipText, type === item && styles.chipTextActive]}>{item.replaceAll('_', ' ')}</Text></Pressable>)}</View>
    <TextInput value={details} onChangeText={setDetails} placeholder={tx('تفاصيل اختيارية تساعدنا على معالجة الطلب', 'Optional details to help process the request')} placeholderTextColor={Colors.textMuted} multiline maxLength={2000} style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} />
    <Pressable disabled={loading} onPress={submit} style={styles.primary}>{loading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.primaryText}>{tx('إرسال الطلب', 'Submit request')}</Text>}</Pressable>
    <Pressable disabled={loading} onPress={exportData} style={styles.secondary}><Text style={styles.secondaryText}>{tx('تجهيز نسخة من بياناتي', 'Prepare my data export')}</Text></Pressable>
  </ScrollView></SafeAreaView><AppDialog visible={dialog.visible} title={dialog.title} message={dialog.message} buttons={dialog.buttons} onClose={hideDialog} /></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: Colors.primary }, content: { padding: 20, gap: 18 }, intro: { color: Colors.textSecondary, fontSize: 14, lineHeight: 23 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: Colors.card }, chipActive: { borderColor: Colors.gold, backgroundColor: Colors.surface }, chipText: { color: Colors.textSecondary, fontSize: 12 }, chipTextActive: { color: Colors.gold, fontWeight: '700' }, input: { minHeight: 150, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, color: Colors.textPrimary, backgroundColor: Colors.card, textAlignVertical: 'top' }, primary: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gold }, primaryText: { color: Colors.primary, fontWeight: '800', fontSize: 15 }, secondary: { minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }, secondaryText: { color: Colors.textPrimary, fontWeight: '700' } });
