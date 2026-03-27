import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Mail, Lock, Eye, EyeOff, Chrome, Smartphone } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export default function LoginScreen() {
  const { isRTL, t } = useLanguage();
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const handleLogin = useCallback(async () => {
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      router.back();
    } catch (e) {
      console.log('Login error:', e);
      const errorMsg = e instanceof Error ? e.message : t('unexpected_error');
      showDialog(t('error_title'), errorMsg, [{ text: t('ok'), style: 'default' }]);
    } finally {
      setLoading(false);
    }
  }, [email, password, login, router, t, showDialog]);

  const handleSocialLogin = useCallback((provider: string) => {
    console.log('[Login] Social login tapped:', provider);
    showDialog(t('coming_soon'), t('social_login_coming_soon'), [{ text: t('ok'), style: 'default' }]);
  }, [t, showDialog]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.brandSection}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
              <Text style={styles.appName}>{t('app_name')}</Text>
              <Text style={styles.tagline}>{t('browse_equipment')}</Text>
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('login')}</Text>

              <View style={styles.inputGroup}>
                <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Mail size={20} color={Colors.textMuted} />
                  <TextInput
                    style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                    placeholder={t('email')}
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

              <Pressable style={[styles.forgotRow, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}>
                <Text style={styles.forgotText}>{t('forgot_password')}</Text>
              </Pressable>

              <Pressable
                style={[styles.loginButton, loading && styles.loginDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                <Text style={styles.loginText}>{loading ? t('loading') : t('login')}</Text>
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('or_continue_with')}</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.socialColumn}>
                <Pressable style={[styles.socialButton, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => handleSocialLogin('google')}>
                  <View style={styles.socialIconWrap}>
                    <Chrome size={20} color="#DB4437" />
                  </View>
                  <Text style={styles.socialLabel}>{t('continue_with_google')}</Text>
                </Pressable>
                <Pressable style={[styles.socialButton, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => handleSocialLogin('apple')}>
                  <View style={styles.socialIconWrap}>
                    <Smartphone size={20} color={Colors.textPrimary} />
                  </View>
                  <Text style={styles.socialLabel}>{t('continue_with_apple')}</Text>
                </Pressable>
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
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  brandSection: { alignItems: 'center', paddingTop: 40, paddingBottom: 32 },
  logo: { width: 88, height: 88, borderRadius: 22, marginBottom: 16 },
  appName: { fontSize: 30, fontWeight: '800' as const, color: Colors.gold },
  tagline: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  formSection: { gap: 16 },
  formTitle: { fontSize: 24, fontWeight: '700' as const, color: Colors.textPrimary, marginBottom: 4 },
  inputGroup: {},
  inputRow: {
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 16 },
  forgotRow: { marginTop: -4 },
  forgotText: { color: Colors.gold, fontSize: 13, fontWeight: '600' as const },
  loginButton: { backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  loginDisabled: { opacity: 0.6 },
  loginText: { color: Colors.primary, fontSize: 17, fontWeight: '700' as const },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
  dividerText: { color: Colors.textMuted, fontSize: 13 },
  socialColumn: { gap: 10 },
  socialButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  socialIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  registerRow: { alignItems: 'center', paddingVertical: 16 },
  registerText: { color: Colors.textSecondary, fontSize: 14 },
  registerHighlight: { color: Colors.gold, fontWeight: '600' as const },
});
