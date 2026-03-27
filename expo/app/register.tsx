import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Mail, Lock, Eye, EyeOff, User, Phone, Briefcase, ShoppingCart, FileText } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { UserRole } from '@/types';

export default function RegisterScreen() {
  const { isRTL, t } = useLanguage();
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [role, setRole] = useState<UserRole>('customer');
  const [crNumber, setCrNumber] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const handleRegister = useCallback(async () => {
    if (!name.trim()) {
      showDialog(t('validation_error'), t('validation_name_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!email.trim()) {
      showDialog(t('validation_error'), t('email'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!phone.trim()) {
      showDialog(t('validation_error'), t('validation_phone_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!password) {
      showDialog(t('validation_error'), t('password'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (password !== confirmPassword) {
      showDialog(t('validation_error'), t('confirm_password'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (role === 'provider' && crNumber.trim() && crNumber.trim().length !== 10) {
      showDialog(t('validation_error'), t('cr_validation_error'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (role === 'provider' && crNumber.trim() && !/^\d{10}$/.test(crNumber.trim())) {
      showDialog(t('validation_error'), t('cr_validation_error'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    setLoading(true);
    try {
      await register(name, email, phone, password, role, role === 'provider' ? crNumber.trim() : undefined);
      router.back();
    } catch (e) {
      console.log('Register error:', e);
      const errorMsg = e instanceof Error ? e.message : t('unexpected_error');
      showDialog(t('error_title'), errorMsg, [{ text: t('ok'), style: 'default' }]);
    } finally {
      setLoading(false);
    }
  }, [name, email, phone, password, confirmPassword, role, crNumber, register, router, t, showDialog]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.brandSection}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
              <Text style={styles.appName}>{t('app_name')}</Text>
            </View>

            <View style={styles.formSection}>
              <Text style={[styles.formTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('register')}</Text>

              <Text style={[styles.roleLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_role')}</Text>
              <View style={[styles.roleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Pressable
                  style={[styles.roleCard, role === 'customer' && styles.roleCardActive]}
                  onPress={() => setRole('customer')}
                  testID="role-customer"
                >
                  <ShoppingCart size={24} color={role === 'customer' ? Colors.primary : Colors.textMuted} />
                  <Text style={[styles.roleCardTitle, role === 'customer' && styles.roleCardTitleActive]}>{t('role_customer')}</Text>
                  <Text style={[styles.roleCardDesc, role === 'customer' && styles.roleCardDescActive]} numberOfLines={2}>{t('role_customer_desc')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.roleCard, role === 'provider' && styles.roleCardActive]}
                  onPress={() => setRole('provider')}
                  testID="role-provider"
                >
                  <Briefcase size={24} color={role === 'provider' ? Colors.primary : Colors.textMuted} />
                  <Text style={[styles.roleCardTitle, role === 'provider' && styles.roleCardTitleActive]}>{t('role_provider')}</Text>
                  <Text style={[styles.roleCardDesc, role === 'provider' && styles.roleCardDescActive]} numberOfLines={2}>{t('role_provider_desc')}</Text>
                </Pressable>
              </View>

              <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <User size={20} color={Colors.textMuted} />
                <TextInput
                  style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t('full_name')}
                  placeholderTextColor={Colors.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>

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

              <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Phone size={20} color={Colors.textMuted} />
                <TextInput
                  style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t('phone')}
                  placeholderTextColor={Colors.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>

              {role === 'provider' && (
                <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <FileText size={20} color={Colors.textMuted} />
                  <TextInput
                    style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                    placeholder={t('cr_number_placeholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={crNumber}
                    onChangeText={setCrNumber}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>
              )}

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

              <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Lock size={20} color={Colors.textMuted} />
                <TextInput
                  style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t('confirm_password')}
                  placeholderTextColor={Colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </View>

              <Pressable
                style={[styles.registerButton, loading && styles.registerDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                <Text style={styles.registerButtonText}>{loading ? t('loading') : t('register')}</Text>
              </Pressable>

              <Pressable style={styles.loginRow} onPress={() => { router.back(); router.push('/login'); }}>
                <Text style={styles.loginText}>
                  {t('already_have_account')} <Text style={styles.loginHighlight}>{t('login')}</Text>
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
  brandSection: { alignItems: 'center', paddingTop: 24, paddingBottom: 16 },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 8 },
  appName: { fontSize: 24, fontWeight: '800' as const, color: Colors.gold },
  formSection: { gap: 14 },
  formTitle: { fontSize: 22, fontWeight: '700' as const, color: Colors.textPrimary, marginBottom: 2 },
  roleLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  roleRow: {
    gap: 12,
  },
  roleCard: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  roleCardActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.gold,
  },
  roleCardTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  roleCardTitleActive: {
    color: Colors.primary,
  },
  roleCardDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 15,
  },
  roleCardDescActive: {
    color: Colors.primary,
    opacity: 0.7,
  },
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
  registerButton: { backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  registerDisabled: { opacity: 0.6 },
  registerButtonText: { color: Colors.primary, fontSize: 17, fontWeight: '700' as const },
  loginRow: { alignItems: 'center', paddingVertical: 16 },
  loginText: { color: Colors.textSecondary, fontSize: 14 },
  loginHighlight: { color: Colors.gold, fontWeight: '600' as const },
});
