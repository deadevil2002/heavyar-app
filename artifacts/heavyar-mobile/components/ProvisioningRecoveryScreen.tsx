import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import type { AccountState } from '@/types';

export default function ProvisioningRecoveryScreen({ state = 'provisioning_incomplete' }: { state?: AccountState }) {
  const { isRTL, localizedText } = useLanguage();
  const { identityEmail, logout, deleteIncompleteAccount, beginRecoveryRegistration } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const copy = (ar: string, en: string) => localizedText(ar, en);
  const incomplete = state === 'provisioning_incomplete';
  const remove = () => {
    setBusy(true);
    void deleteIncompleteAccount().catch(() => undefined).finally(() => setBusy(false));
  };
  return <View style={styles.container}><SafeAreaView style={styles.safe}>
    <View style={[styles.card, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
      <Text style={styles.eyebrow}>{copy('حالة الحساب', 'Account status')}</Text>
      <Text style={styles.title}>{incomplete ? copy('لم يكتمل إنشاء حسابك', 'Your account setup is incomplete') : copy('حسابك مقيّد مؤقتاً', 'Your account is temporarily restricted')}</Text>
      <Text style={styles.body}>{incomplete ? copy('تم إنشاء بيانات تسجيل الدخول، لكن إعداد حساب Heavyar لم يكتمل. يمكنك استكمال التسجيل باستخدام نفس الهوية دون إنشاء حساب جديد.', 'Your sign-in identity was created, but your Heavyar profile was not completed. You can resume registration with this same identity without creating a second account.') : copy('لا يمكن استخدام ميزات الحساب حالياً. تواصل مع الدعم لمراجعة الحالة.', 'Account features are unavailable right now. Contact support to review the account status.')}</Text>
      {!!identityEmail && <Text style={styles.email}>{identityEmail}</Text>}
      {incomplete && <Pressable style={styles.primary} onPress={() => { beginRecoveryRegistration(); router.push('/register?recovery=1'); }}><Text style={styles.primaryText}>{copy('استكمال إنشاء الحساب', 'Resume registration')}</Text></Pressable>}
      <Pressable style={styles.secondary} onPress={() => router.push('/settings')}><Text style={styles.secondaryText}>{copy('التواصل مع الدعم', 'Contact support')}</Text></Pressable>
      <Pressable style={styles.link} onPress={() => void logout()}><Text style={styles.linkText}>{copy('تسجيل الخروج', 'Sign out')}</Text></Pressable>
      {incomplete && <Pressable style={styles.link} onPress={remove} disabled={busy}>{busy ? <ActivityIndicator color={Colors.error} /> : <Text style={styles.deleteText}>{copy('حذف الحساب غير المكتمل', 'Delete incomplete account')}</Text>}</Pressable>}
    </View>
  </SafeAreaView></View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary }, safe: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.card, borderRadius: 22, padding: 24, gap: 16 }, eyebrow: { color: Colors.gold, fontSize: 13, fontWeight: '700' },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: '800', lineHeight: 34 }, body: { color: Colors.textMuted, fontSize: 16, lineHeight: 25 },
  email: { color: Colors.textPrimary, fontSize: 14 }, primary: { width: '100%', padding: 16, borderRadius: 14, backgroundColor: Colors.gold, alignItems: 'center' },
  primaryText: { color: Colors.primary, fontWeight: '800', fontSize: 16 }, secondary: { width: '100%', padding: 15, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  secondaryText: { color: Colors.textPrimary, fontWeight: '700' }, link: { padding: 8, alignSelf: 'center' }, linkText: { color: Colors.textMuted, fontWeight: '700' }, deleteText: { color: Colors.error, fontWeight: '700' },
});