import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Mail, Lock, Eye, EyeOff, User, Phone, Briefcase, ShoppingCart, Truck, FileText, ChevronDown, MapPin, CheckCircle, ArrowLeft, ArrowRight, Search } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAuthPolicy, fetchMarketConfig, type MarketConfig } from '@/services/authService';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { UserRole } from '@/types';
import { saudiRegions, getCitiesByRegion } from '@/mocks/saudiRegions';
import { GCC_COUNTRIES, countryFor, normalizePhoneForCountry, type GccCountryCode } from '@/constants/gcc';
import { registrationErrorMessage } from '@/services/registrationErrors';
import { registrationFieldForCode } from '@/services/registrationState';

type RegistrationStep = 'email' | 'info' | 'role';
const crRules: Record<GccCountryCode, { maxLength: number; placeholder: string }> = {
  SA: { maxLength: 10, placeholder: 'CR number (10 digits) / رقم السجل (10 أرقام)' },
  AE: { maxLength: 10, placeholder: 'Trade licence / رقم الرخصة التجارية' },
  KW: { maxLength: 8, placeholder: 'Commercial licence / رقم الرخصة التجارية' },
  QA: { maxLength: 10, placeholder: 'CR number / رقم السجل التجاري' },
  BH: { maxLength: 10, placeholder: 'CR number / رقم السجل التجاري' },
  OM: { maxLength: 10, placeholder: 'CR number / رقم السجل التجاري' },
};

export default function RegisterScreen() {
  const { isRTL, t, localizedText, language } = useLanguage();
  const { register, identityEmail } = useAuth();
  const router = useRouter();
  const { recovery } = useLocalSearchParams<{ recovery?: string }>();
  const [step, setStep] = useState<RegistrationStep>('email');

  const [email, setEmail] = useState<string>('');
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  useEffect(() => {
    if (recovery === '1' && identityEmail && !email) {
      setEmail(identityEmail);
      setEmailVerified(true);
      setStep('info');
    }
  }, [email, identityEmail, recovery]);

  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [countryCode, setCountryCode] = useState<GccCountryCode>('SA');
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [allowPhoneLogin, setAllowPhoneLogin] = useState(false);
  const [markets, setMarkets] = useState<MarketConfig[]>(GCC_COUNTRIES.map(country => ({ code: country.code, enabled: country.code === 'SA' })));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [role, setRole] = useState<UserRole>('customer');
  const [providerType, setProviderType] = useState<'individual' | 'company'>('individual');
  const [crNumber, setCrNumber] = useState<string>('');
  const [region, setRegion] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [customCity, setCustomCity] = useState<string>('');
  const [showRegionPicker, setShowRegionPicker] = useState<boolean>(false);
  const [showCityPicker, setShowCityPicker] = useState<boolean>(false);
  const [citySearch, setCitySearch] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; phone?: string }>({});
  const [showEmailLoginAction, setShowEmailLoginAction] = useState(false);
  const { dialog, showDialog, hideDialog } = useAppDialog();

  React.useEffect(() => {
    void Promise.all([fetchAuthPolicy(), fetchMarketConfig()]).then(([policy, effectiveMarkets]) => {
      setPhoneRequired(policy.phoneRequired);
      setAllowPhoneLogin(policy.allowPhoneLogin);
      setMarkets(effectiveMarkets);
    });
  }, []);

  const country = useMemo(() => countryFor(countryCode), [countryCode]);
  const countryRegions = useMemo(() => countryCode === 'SA' ? saudiRegions : country.regions, [country, countryCode]);
  const selectedRegion = useMemo(() => countryRegions.find(r => r.id === region), [countryRegions, region]);
  const regionCities = useMemo(() => countryCode === 'SA' ? getCitiesByRegion(region) : (selectedRegion?.cities || []), [countryCode, region, selectedRegion]);
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

  const handleContinueEmail = useCallback(() => {
    if (!email.trim()) {
      showDialog(t('validation_error'), t('email'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!isValidEmail(email)) {
      showDialog(t('validation_error'), t('invalid_email'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    setEmailVerified(true);
    setStep('info');
  }, [email, isValidEmail, showDialog, t]);

  const handleNextToRole = useCallback(() => {
    if (!name.trim()) {
      showDialog(t('validation_error'), t('validation_name_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (phoneRequired && !phone.trim()) {
      showDialog(t('validation_error'), t('validation_phone_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (phone.trim() && !normalizePhoneForCountry(phone, countryCode)) {
      showDialog(t('validation_error'), t('invalid_phone'), [{ text: t('ok'), style: 'default' }]);
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
  }, [name, phone, countryCode, phoneRequired, password, confirmPassword, t, showDialog]);

  const handleRegister = useCallback(async () => {
    if (!termsAccepted) {
      showDialog(t('validation_error'), t('terms_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!region || (!city && !customCity.trim())) {
      showDialog(t('validation_error'), t('city_required_message'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (role === 'provider' && providerType === 'company' && countryCode === 'SA' && !/^\d{10}$/.test(crNumber.trim())) {
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
        customCity,
        countryCode,
        role === 'provider' ? providerType : undefined,
      );
       router.replace(role === 'driver' ? '/driver-profile' : '/');
    } catch (e) {
      const code = (e as { errorCode?: string }).errorCode;
      const errorMsg = registrationErrorMessage(e, language);
      const field = registrationFieldForCode(code);
      if (field === 'phone') {
        setStep('info');
        setFieldErrors({ phone: errorMsg });
      } else if (field === 'email') {
        setStep('email');
        setFieldErrors({ email: errorMsg });
        setShowEmailLoginAction(true);
      } else {
        showDialog(t('error_title'), errorMsg, [{ text: t('ok'), style: 'default' }]);
      }
    } finally {
      setLoading(false);
    }
  }, [emailVerified, name, email, phone, password, role, providerType, crNumber, region, city, customCity, countryCode, termsAccepted, register, router, t, showDialog]);

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
      <Text style={[styles.formTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('email')}</Text>

      <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Mail size={20} color={Colors.textMuted} />
        <TextInput
          style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
          placeholder={t('email')}
          placeholderTextColor={Colors.textMuted}
          value={email}
            onChangeText={value => { setEmail(value.trim().toLowerCase()); setFieldErrors(previous => ({ ...previous, email: undefined })); setShowEmailLoginAction(false); }}
          keyboardType="email-address"
          autoCapitalize="none"
        />
       </View>
       {!!fieldErrors.email && <Text style={[styles.fieldError, { textAlign: isRTL ? 'right' : 'left' }]}>{fieldErrors.email}</Text>}
       {showEmailLoginAction && <Pressable onPress={() => router.replace('/login')} style={styles.inlineAction}><Text style={styles.inlineActionText}>{t('login')}</Text></Pressable>}
      <Pressable style={styles.primaryButton} onPress={handleContinueEmail}>
        <Text style={styles.primaryButtonText}>{t('next')}</Text>
      </Pressable>
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

      <Text style={[styles.fieldLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('country')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryRow}>
        {GCC_COUNTRIES.map(item => (
          <Pressable
            key={item.code}
            style={[styles.countryChip, countryCode === item.code && styles.countryChipActive]}
            disabled={markets.length > 0 && !markets.find(market => market.code === item.code)?.enabled}
            onPress={() => {
              if (markets.length > 0 && !markets.find(market => market.code === item.code)?.enabled) return;
              setCountryCode(item.code);
              setRegion('');
              setCity('');
              setCustomCity('');
              setPhone('');
            }}
          >
            <Text style={[styles.countryChipText, countryCode === item.code && styles.countryChipTextActive, markets.length > 0 && !markets.find(market => market.code === item.code)?.enabled && styles.countryChipTextDisabled]}>
              {language === 'ar' ? item.nameAr : item.nameEn}
            </Text>
            <Text style={styles.countryDial}>{item.dialCode}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Phone size={20} color={Colors.textMuted} />
        <TextInput
          style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
          placeholder={`${country.dialCode} 5XXXXXXXX`}
          placeholderTextColor={Colors.textMuted}
          value={phone}
           onChangeText={value => { setPhone(value); setFieldErrors(previous => ({ ...previous, phone: undefined })); }}
          keyboardType="phone-pad"
        />
       </View>
       {!!fieldErrors.phone && <Text style={[styles.fieldError, { textAlign: isRTL ? 'right' : 'left' }]}>{fieldErrors.phone}</Text>}

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
        <Pressable
          style={[styles.roleCard, role === 'driver' && styles.roleCardActive]}
          onPress={() => setRole('driver')}
          testID="role-driver"
        >
          <Truck size={24} color={role === 'driver' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.roleCardTitle, role === 'driver' && styles.roleCardTitleActive]}>{t('role_driver')}</Text>
          <Text style={[styles.roleCardDesc, role === 'driver' && styles.roleCardDescActive]} numberOfLines={2}>{t('role_driver_desc')}</Text>
        </Pressable>
      </View>

      {role === 'provider' && (
        <View>
        <View style={styles.roleRow}>
          <Pressable accessibilityRole="radio" accessibilityState={{ selected: providerType === 'individual' }} testID="provider-type-individual" style={[styles.roleCard, providerType === 'individual' && styles.roleCardActive]} onPress={() => { setProviderType('individual'); setCrNumber(''); }}>
            <Text style={[styles.roleCardTitle, providerType === 'individual' && styles.roleCardTitleActive]}>{isRTL ? 'فرد' : 'Individual'}</Text>
          </Pressable>
          <Pressable accessibilityRole="radio" accessibilityState={{ selected: providerType === 'company' }} testID="provider-type-company" style={[styles.roleCard, providerType === 'company' && styles.roleCardActive]} onPress={() => setProviderType('company')}>
            <Text style={[styles.roleCardTitle, providerType === 'company' && styles.roleCardTitleActive]}>{isRTL ? 'شركة / مؤسسة' : 'Company / Establishment'}</Text>
          </Pressable>
        </View>
        {providerType === 'company' && <View style={[styles.inputRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <FileText size={20} color={Colors.textMuted} />
          <TextInput
            style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
             placeholder={crRules[countryCode].placeholder}
            placeholderTextColor={Colors.textMuted}
            value={crNumber}
            onChangeText={setCrNumber}
             keyboardType={countryCode === 'AE' ? 'default' : 'numeric'}
             maxLength={crRules[countryCode].maxLength}
          />
         </View>}
         </View>
      )}

      <Pressable style={[styles.termsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => setTermsAccepted(value => !value)} testID="terms-acceptance">
        <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
          {termsAccepted && <CheckCircle size={16} color={Colors.primary} />}
        </View>
        <Text style={styles.termsText}>{t('terms_acceptance')}</Text>
      </Pressable>
      {!allowPhoneLogin && <Text style={styles.policyHint}>{t('phone_login_unavailable')}</Text>}

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
            {countryRegions.map(r => (
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
  fieldLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' as const, marginBottom: -5 },
  countryRow: { gap: 8, paddingVertical: 2 },
  countryChip: { backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, minWidth: 92 },
  countryChipActive: { borderColor: Colors.gold, backgroundColor: Colors.gold },
  countryChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' as const, textAlign: 'center' as const },
  countryChipTextActive: { color: Colors.primary },
  countryChipTextDisabled: { color: Colors.textMuted },
  countryDial: { color: Colors.textMuted, fontSize: 11, textAlign: 'center' as const, marginTop: 2 },
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
  fieldError: { color: Colors.error, fontSize: 13, marginTop: -8, marginBottom: 8 },
  inlineAction: { alignSelf: 'flex-start', marginBottom: 8 },
  inlineActionText: { color: Colors.gold, fontSize: 14, fontWeight: '700' },
  primaryButton: { backgroundColor: Colors.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: Colors.primary, fontSize: 17, fontWeight: '700' as const },
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
  termsRow: { alignItems: 'center', gap: 10, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  termsText: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  policyHint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center' as const },
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
