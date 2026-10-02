import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Mail, Lock, Eye, EyeOff, Phone } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeErrorMessage } from '@/services/errorMessages';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { fetchAuthPolicy, requestPasswordReset } from '@/services/authService';
import { isGccPhone } from '@/constants/gcc';
import { canLeaveLoginAfterResolution } from '@/services/authSessionTransition';

export default function LoginScreen() {
  const { isRTL, t, language } = useLanguage();
  const { login, isAuthenticated, accountState, sessionReady } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [loginAccepted, setLoginAccepted] = useState(false);
  const [allowPhoneLogin, setAllowPhoneLogin] = useState(false);
  const [phoneRecoveryReady, setPhoneRecoveryReady] = useState(false);
  const { dialog, showDialog, hideDialog } = useAppDialog();

  React.useEffect(() => {
    void fetchAuthPolicy().then(policy => {
      setAllowPhoneLogin(policy.allowPhoneLogin);
      setPhoneRecoveryReady(policy.phoneRecoveryReady);
    });
  }, []);

  useEffect(() => {
    if (!loginAccepted || !canLeaveLoginAfterResolution({ sessionReady, isAuthenticated, accountState })) return;
    setLoading(false);
    setLoginAccepted(false);
    router.back();
  }, [accountState, isAuthenticated, loginAccepted, router, sessionReady]);

  const handleLogin = useCallback(async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      setLoginAccepted(true);
    } catch (e) {
      const errorMsg = safeErrorMessage(e, language);
      showDialog(t('error_title'), errorMsg, [{ text: t('ok'), style: 'default' }]);
      setLoading(false);
    }
  }, [email, password, login, language, t, showDialog]);

  const handleForgotPassword = useCallback(async () => {
    const normalized = email.trim().toLowerCase();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    const isPhone = phoneRecoveryReady && isGccPhone(normalized);
    if (!isEmail && !isPhone) {
      showDialog(t('error_title'), t('invalid_email'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    const last = Number(await AsyncStorage.getItem('heavyar_password_reset_at') || 0);
    if (Date.now() - last < 60_000) {
      showDialog(t('error_title'), t('password_reset_rate_limited'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    await AsyncStorage.setItem('heavyar_password_reset_at', String(Date.now()));
    const result = await requestPasswordReset(normalized, language);
    showDialog(t('success'), result === 'sent' ? t('password_reset_sent') : t('password_reset_unavailable'), [{ text: t('ok'), style: 'default' }]);
  }, [email, language, phoneRecoveryReady, showDialog, t]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.brandSection}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
              <Text style={styles.appName}>{t('app_name')}</Text>
              <Text style={styles.tagline}>{t('heavyar_tagline')}</Text>
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('login')}</Text>

              <View style={styles.inputGroup}>
                <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Mail size={20} color={Colors.textMuted} />
                  <TextInput
                    style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                    placeholder={t('email_or_phone')}
                    placeholderTextColor={Colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Lock size={20} color={Colors.textMuted} />
                  <TextInput
                    style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                    placeholder={t('password')}
                    placeholderTextColor={Colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={20} color={Colors.textMuted} /> : <Eye size={20} color={Colors.textMuted} />}
                  </Pressable>
                </View>
              </View>

              <Pressable onPress={() => void handleForgotPassword()} style={[styles.forgotRow, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
                <Text style={styles.forgotText}>{t('forgot_password')}</Text>
              </Pressable>

              <Pressable
                style={[styles.loginButton, loading && styles.loginDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                <Text style={styles.loginText}>{loading ? t('loading') : t('login')}</Text>
              </Pressable>

              <View style={styles.phoneOption}>
                <Phone size={18} color={allowPhoneLogin ? Colors.textSecondary : Colors.textMuted} />
                <Text style={styles.phoneOptionText}>{t('phone_login')}</Text>
                <Text style={styles.phoneStatus}>{allowPhoneLogin ? t('phone_login_available') : t('phone_login_unavailable')}</Text>
              </View>

              <Pressable style={styles.registerRow} onPress={() => { router.back(); router.push('/register'); }}>
                <Text style={styles.registerText}>
                  {t('dont_have_account')} <Text style={styles.registerHighlight}>{t('register')}</Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  brandSection: { alignItems: 'center', paddingTop: 4, paddingBottom: 14 },
  logo: { width: 62, height: 62, borderRadius: 17, marginBottom: 8 },
  appName: { fontSize: 25, lineHeight: 33, fontWeight: '800' as const, color: Colors.textPrimary },
  tagline: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  formSection: { gap: 12, backgroundColor: Colors.card, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 16 },
  formTitle: { width: '100%', fontSize: 20, lineHeight: 27, fontWeight: '800' as const, color: Colors.textPrimary, marginBottom: 2 },
  inputGroup: {},
  inputRow: {
    backgroundColor: Colors.inputBg,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 0,
    minHeight: 54,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 16 },
  forgotRow: { marginTop: -4 },
  forgotText: { color: Colors.gold, fontSize: 13, fontWeight: '600' as const },
  phoneOption: { flexDirection: 'row' as const, alignItems: 'center', gap: 8, paddingVertical: 6, opacity: 0.9 },
  phoneOptionText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' as const },
  phoneStatus: { color: Colors.textMuted, fontSize: 12, flex: 1, textAlign: 'right' as const },
  loginButton: { minHeight: 52, backgroundColor: Colors.gold, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  loginDisabled: { opacity: 0.6 },
  loginText: { color: Colors.primary, fontSize: 17, fontWeight: '700' as const },
  registerRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  registerText: { color: Colors.textSecondary, fontSize: 14 },
  registerHighlight: { color: Colors.gold, fontWeight: '600' as const },
});
