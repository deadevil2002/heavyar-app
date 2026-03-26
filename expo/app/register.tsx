import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Mail, Lock, Eye, EyeOff, User, Phone } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

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
  const [loading, setLoading] = useState<boolean>(false);

  const handleRegister = useCallback(async () => {
    if (!name || !email || !phone || !password || !confirmPassword) return;
    if (password !== confirmPassword) return;
    setLoading(true);
    try {
      await register(name, email, phone, password);
      router.back();
    } catch (e) {
      console.log('Register error:', e);
    } finally {
      setLoading(false);
    }
  }, [name, email, phone, password, confirmPassword, register, router]);

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  brandSection: { alignItems: 'center', paddingTop: 32, paddingBottom: 24 },
  logo: { width: 72, height: 72, borderRadius: 18, marginBottom: 12 },
  appName: { fontSize: 26, fontWeight: '800' as const, color: Colors.gold },
  formSection: { gap: 14 },
  formTitle: { fontSize: 24, fontWeight: '700' as const, color: Colors.textPrimary, marginBottom: 4 },
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
