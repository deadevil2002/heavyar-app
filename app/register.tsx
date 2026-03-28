import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Mail, Lock, Eye, EyeOff, User, Phone, Briefcase, ShoppingCart, FileText, ChevronDown, MapPin, CheckCircle, ArrowLeft, ArrowRight, Search } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { UserRole } from '@/types';
import { sendEmailOtp, verifyEmailOtp } from '@/services/otpService';
import { saudiRegions, getCitiesByRegion } from '@/mocks/saudiRegions';

type RegistrationStep = 'email' | 'info' | 'role';

export default function RegisterScreen() {
  const { isRTL, t, localizedText } = useLanguage();
  const { register } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<RegistrationStep>('email');

  const [email, setEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [sendingOtp, setSendingOtp] = useState<boolean>(false);
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);

  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [role, setRole] = useState<UserRole>('customer');
  const [crNumber, setCrNumber] = useState<string>('');
  const [region, setRegion] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [customCity, setCustomCity] = useState<string>('');
  const [showRegionPicker, setShowRegionPicker] = useState<boolean>(false);
  const [showCityPicker, setShowCityPicker] = useState<boolean>(false);
  const [citySearch, setCitySearch] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const selectedRegion = useMemo(() => saudiRegions.find(r => r.id === region), [region]);
  const regionCities = useMemo(() => getCitiesByRegion(region), [region]);
  const filteredCities = useMemo(() => {
    if (!citySearch.trim()) return regionCities;
    const q = citySearch.toLowerCase();
    return regionCities.filter(c =>
      c.nameAr.includes(q) || c.nameEn.toLowerCase().includes(q)
    );
  }, [regionCities, citySearch]);
  const selectedCity = useMemo(() => regionCities.find(c => c.id === city), [regionCities, city]);

  const isValidEmail = useCallback((e: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  }, []);

  const handleSendOtp = useCallback(async () => {
    if (!email.trim()) {
      showDialog(t('validation_error'), t('email'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!isValidEmail(email)) {
      showDialog(t('validation_error'), t('invalid_email'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    setSendingOtp(true);
    try {
      const result = await sendEmailOtp(email.trim());
      if (result.success) {
        setOtpSent(true);
        showDialog(t('success'), t('otp_sent'), [{ text: t('ok'), style: 'default' }]);
      } else {
        showDialog(t('error_title'), result.error || t('unexpected_error'), [{ text: t('ok'), style: 'default' }]);
      }
    } catch {
      showDialog(t('error_title'), t('unexpected_error'), [{ text: t('ok'), style: 'default' }]);
    } finally {
      setSendingOtp(false);
    }
  }, [email, isValidEmail, t, showDialog]);

  const handleVerifyOtp = useCallback(async () => {
    if (!otpCode.trim()) {
      showDialog(t('validation_error'), t('otp_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    setVerifyingOtp(true);
    try {
      const result = await verifyEmailOtp(email.trim(), otpCode.trim());
      if (result.success && result.verified) {
        setEmailVerified(true);
        setStep('info');
        showDialog(t('success'), t('email_verified'), [{ text: t('ok'), style: 'default' }]);
      } else {
        const errorCode = result.errorCode;
        let msg = result.error || t('otp_invalid');
        if (errorCode === 'OTP_EXPIRED') msg = t('otp_expired');
        else if (errorCode === 'OTP_INVALID') msg = t('otp_invalid');
        else if (errorCode === 'OTP_NOT_FOUND') msg = t('otp_expired');
        showDialog(t('error_title'), msg, [{ text: t('ok'), style: 'default' }]);
      }
    } catch {
      showDialog(t('error_title'), t('unexpected_error'), [{ text: t('ok'), style: 'default' }]);
    } finally {
      setVerifyingOtp(false);
    }
  }, [email, otpCode, t, showDialog]);

  const handleNextToRole = useCallback(() => {
    if (!name.trim()) {
      showDialog(t('validation_error'), t('validation_name_required'), [{ text: t('ok'), style: 'default' }]);
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
    setStep('role');
  }, [name, phone, password, confirmPassword, t, showDialog]);

  const handleRegister = useCallback(async () => {
    if (!emailVerified) {
      showDialog(t('validation_error'), t('email_not_verified'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (role === 'provider' && crNumber.trim() && !/^\d{10}$/.test(crNumber.trim())) {
      showDialog(t('validation_error'), t('cr_validation_error'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    setLoading(true);
    try {
      await register(
        name,
        email,
        phone,
        password,
        role,
        role === 'provider' ? crNumber.trim() : undefined,
        region,
        city,
        customCity
      );
      router.back();
    } catch (e) {
      console.log('Register error:', e);
      const errorMsg = e instanceof Error ? e.message : t('unexpected_error');
      showDialog(t('error_title'), errorMsg, [{ text: t('ok'), style: 'default' }]);
    } finally {
      setLoading(false);
    }
  }, [emailVerified, name, email, phone, password, role, crNumber, region, city, customCity, register, router, t, showDialog]);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const stepIndicator = (
    <View style={styles.stepRow}>
      {(['email', 'info', 'role'] as const).map((s, i) => {
        const isActive = s === step;
        const isDone = (s === 'email' && (step === 'info' || step === 'role')) ||
                       (s === 'info' && step === 'role');
        const label = s === 'email' ? t('step_email') : s === 'info' ? t('step_info') : t('step_role');
        return (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, isActive && styles.stepDotActive, isDone && styles.stepDotDone]}>
              {isDone ? (
                <CheckCircle size={16} color={Colors.primary} />
              ) : (
                <Text style={[styles.stepDotText, (isActive || isDone) && styles.stepDotTextActive]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );

  const renderEmailStep = () => (
    <View style={styles.formSection}>
      <Text style={[styles.formTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('email_verification')}</Text>

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
          editable={!emailVerified}
        />
        {emailVerified && <CheckCircle size={20} color={Colors.success} />}
      </View>

      {!emailVerified && !otpSent && (
        <Pressable
          style={[styles.primaryButton, sendingOtp && styles.buttonDisabled]}
          onPress={handleSendOtp}
          disabled={sendingOtp}
        >
          <Text style={styles.primaryButtonText}>
            {sendingOtp ? t('sending_otp') : t('send_otp')}
          </Text>
        </Pressable>
      )}

      {otpSent && !emailVerified && (
        <>
          <Text style={[styles.otpHint, { textAlign: isRTL ? 'right' : 'left' }]}>
            {t('otp_sent_to')} {email}
          </Text>
          <TextInput
            style={[styles.otpInput, { textAlign: 'center' }]}
            placeholder={t('enter_otp')}
            placeholderTextColor={Colors.textMuted}
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable
            style={[styles.primaryButton, verifyingOtp && styles.buttonDisabled]}
            onPress={handleVerifyOtp}
            disabled={verifyingOtp}
          >
            {verifyingOtp ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.primaryButtonText}>{t('verify_otp')}</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.resendRow}
            onPress={handleSendOtp}
            disabled={sendingOtp}
          >
            <Text style={styles.resendText}>{t('resend_otp')}</Text>
          </Pressable>
        </>
      )}

      {emailVerified && (
        <View style={styles.verifiedBanner}>
          <CheckCircle size={18} color={Colors.success} />
          <Text style={styles.verifiedText}>{t('email_verified')}</Text>
        </View>
      )}
    </View>
  );

  const renderInfoStep = () => (
    <View style={styles.formSection}>
      <View style={[styles.stepBackRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable onPress={() => setStep('email')}>
          <BackIcon size={20} color={Colors.textMuted} />
        </Pressable>
        <Text style={[styles.formTitle, { flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>{t('step_info')}</Text>
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

      <Pressable style={styles.primaryButton} onPress={handleNextToRole}>
        <Text style={styles.primaryButtonText}>{t('next')}</Text>
      </Pressable>
    </View>
  );

  const renderRoleStep = () => (
    <View style={styles.formSection}>
      <View style={[styles.stepBackRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable onPress={() => setStep('info')}>
          <BackIcon size={20} color={Colors.textMuted} />
        </Pressable>
        <Text style={[styles.formTitle, { flex: 1, textAlign: isRTL ? 'right' : 'left' }]}>{t('select_role')}</Text>
      </View>

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

      <View style={styles.locationSection}>
        <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left' }]}>
          <MapPin size={14} color={Colors.gold} /> {t('select_region')}
        </Text>
        <Pressable
          style={[styles.picker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
          onPress={() => { setShowRegionPicker(!showRegionPicker); setShowCityPicker(false); }}
        >
          <Text style={[styles.pickerText, !region && styles.pickerPlaceholder]}>
            {selectedRegion ? localizedText(selectedRegion.nameAr, selectedRegion.nameEn) : t('select_region')}
          </Text>
          <ChevronDown size={20} color={Colors.textMuted} />
        </Pressable>
        {showRegionPicker && (
          <ScrollView style={styles.pickerDropdown} nestedScrollEnabled>
            {saudiRegions.map(r => (
              <Pressable
                key={r.id}
                style={[styles.pickerItem, region === r.id && styles.pickerItemSelected]}
                onPress={() => {
                  setRegion(r.id);
                  setCity('');
                  setCustomCity('');
                  setCitySearch('');
                  setShowRegionPicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, region === r.id && styles.pickerItemTextSelected]}>
                  {localizedText(r.nameAr, r.nameEn)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {region ? (
        <View style={styles.locationSection}>
          <Text style={[styles.sectionLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_city')}</Text>
          <Pressable
            style={[styles.picker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            onPress={() => { setShowCityPicker(!showCityPicker); setShowRegionPicker(false); }}
          >
            <Text style={[styles.pickerText, !city && styles.pickerPlaceholder]}>
              {selectedCity ? localizedText(selectedCity.nameAr, selectedCity.nameEn) : t('select_city')}
            </Text>
            <ChevronDown size={20} color={Colors.textMuted} />
          </Pressable>
          {showCityPicker && (
            <View style={styles.cityPickerContainer}>
              <View style={[styles.citySearchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Search size={16} color={Colors.textMuted} />
                <TextInput
                  style={[styles.citySearchInput, { textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t('search_city')}
                  placeholderTextColor={Colors.textMuted}
                  value={citySearch}
                  onChangeText={setCitySearch}
                />
              </View>
              <ScrollView style={styles.cityList} nestedScrollEnabled>
                {filteredCities.map(c => (
                  <Pressable
                    key={c.id}
                    style={[styles.pickerItem, city === c.id && styles.pickerItemSelected]}
                    onPress={() => { setCity(c.id); setCustomCity(''); setShowCityPicker(false); setCitySearch(''); }}
                  >
                    <Text style={[styles.pickerItemText, city === c.id && styles.pickerItemTextSelected]}>
                      {localizedText(c.nameAr, c.nameEn)}
                    </Text>
                  </Pressable>
                ))}
                {filteredCities.length === 0 && (
                  <Text style={styles.noCitiesText}>{t('no_cities_found')}</Text>
                )}
              </ScrollView>
            </View>
          )}
          <TextInput
            style={[styles.customCityInput, { textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('custom_city_placeholder')}
            placeholderTextColor={Colors.textMuted}
            value={customCity}
            onChangeText={(text) => { setCustomCity(text); if (text.trim()) setCity(''); }}
          />
        </View>
      ) : null}

      <Pressable
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}
      >
        <Text style={styles.primaryButtonText}>{loading ? t('loading') : t('register')}</Text>
      </Pressable>

      <Pressable style={styles.loginRow} onPress={() => { router.back(); router.push('/login'); }}>
        <Text style={styles.loginText}>
          {t('already_have_account')} <Text style={styles.loginHighlight}>{t('login')}</Text>
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.brandSection}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
              <Text style={styles.appName}>{t('app_name')}</Text>
            </View>

            {stepIndicator}

            {step === 'email' && renderEmailStep()}
            {step === 'info' && renderInfoStep()}
            {step === 'role' && renderRoleStep()}
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
  brandSection: { alignItems: 'center', paddingTop: 24, paddingBottom: 12 },
  logo: { width: 56, height: 56, borderRadius: 14, marginBottom: 8 },
  appName: { fontSize: 22, fontWeight: '800' as const, color: Colors.gold },
  stepRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    marginBottom: 20,
    paddingVertical: 8,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: { borderColor: Colors.gold, backgroundColor: Colors.gold },
  stepDotDone: { borderColor: Colors.success, backgroundColor: Colors.success },
  stepDotText: { fontSize: 12, fontWeight: '700' as const, color: Colors.textMuted },
  stepDotTextActive: { color: Colors.primary },
  stepLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' as const },
  stepLabelActive: { color: Colors.gold, fontWeight: '700' as const },
  formSection: { gap: 14 },
  formTitle: { fontSize: 20, fontWeight: '700' as const, color: Colors.textPrimary, marginBottom: 2 },
  stepBackRow: { alignItems: 'center', gap: 8, marginBottom: 4 },
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
  primaryButton: { backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: Colors.primary, fontSize: 17, fontWeight: '700' as const },
  otpHint: { fontSize: 13, color: Colors.textSecondary, marginTop: -4 },
  otpInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    color: Colors.gold,
    fontSize: 24,
    fontWeight: '700' as const,
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  resendRow: { alignItems: 'center', paddingVertical: 4 },
  resendText: { color: Colors.gold, fontSize: 14, fontWeight: '600' as const },
  verifiedBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(46, 204, 113, 0.12)',
    borderRadius: 12,
    paddingVertical: 10,
  },
  verifiedText: { color: Colors.success, fontSize: 14, fontWeight: '600' as const },
  roleRow: { gap: 12 },
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
  roleCardActive: { borderColor: Colors.gold, backgroundColor: Colors.gold },
  roleCardTitle: { fontSize: 14, fontWeight: '700' as const, color: Colors.textPrimary },
  roleCardTitleActive: { color: Colors.primary },
  roleCardDesc: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' as const, lineHeight: 15 },
  roleCardDescActive: { color: Colors.primary, opacity: 0.7 },
  locationSection: { gap: 8 },
  sectionLabel: { fontSize: 14, fontWeight: '600' as const, color: Colors.textSecondary },
  picker: {
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerText: { color: Colors.textPrimary, fontSize: 15 },
  pickerPlaceholder: { color: Colors.textMuted },
  pickerDropdown: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 200,
  },
  pickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pickerItemSelected: { backgroundColor: Colors.surface },
  pickerItemText: { color: Colors.textPrimary, fontSize: 14 },
  pickerItemTextSelected: { color: Colors.gold, fontWeight: '600' as const },
  cityPickerContainer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden' as const,
  },
  citySearchRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    alignItems: 'center',
    gap: 8,
  },
  citySearchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  cityList: { maxHeight: 180 },
  noCitiesText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' as const, paddingVertical: 16 },
  customCityInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loginRow: { alignItems: 'center', paddingVertical: 16 },
  loginText: { color: Colors.textSecondary, fontSize: 14 },
  loginHighlight: { color: Colors.gold, fontWeight: '600' as const },
});
