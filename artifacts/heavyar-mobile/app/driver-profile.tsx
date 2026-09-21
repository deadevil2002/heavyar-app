import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDriverProfile, saveDriverProfile, WorkerError } from '@/services/workerClient';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { useAuth } from '@/contexts/AuthContext';
import { GCC_COUNTRIES, type GccCountryCode } from '@/constants/gcc';
import { citiesForLocation, regionsForCountry } from '@/services/locationHierarchy';
import { fetchMarketConfig, type MarketConfig } from '@/services/authService';
import { mockCategories } from '@/mocks/categories';
import { safeErrorMessage } from '@/services/errorMessages';
import { DRIVER_REQUESTS_ROUTE, driverRequestsAllowed } from '@/services/requestSections';
import {
  buildDriverOwnerSavePayload,
  canEditDriverOwnerProfile,
  canonicalEquipmentTypes,
  DRIVER_AVAILABILITY_STATUSES,
  type DriverAvailabilityStatus,
} from '@/services/driverOwnerContract';

type OwnerStatus = 'pending_review' | 'approved' | 'rejected' | 'suspended';

export default function DriverProfileScreen() {
  const { isRTL, t } = useLanguage();
  const router = useRouter();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const { user, isLoading: authLoading, isAuthenticated, requiresEmailVerification } = useAuth();
  const account = user as (typeof user & { accountStatus?: string; suspensionStatus?: string | null; isActive?: boolean });
  const canEdit = isAuthenticated && canEditDriverOwnerProfile(account);
  const dirty = useRef(false);
  const [displayName, setDisplayName] = useState('');
  const [countryCode, setCountryCode] = useState<GccCountryCode>('SA');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [years, setYears] = useState('');
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);
  const [availabilityStatus, setAvailabilityStatus] = useState<DriverAvailabilityStatus>('offline');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [profileActive, setProfileActive] = useState<boolean | null>(null);
  const [moderationStatus, setModerationStatus] = useState<OwnerStatus>('pending_review');
  const [markets, setMarkets] = useState<MarketConfig[]>(GCC_COUNTRIES.map(item => ({
    code: item.code,
    enabled: item.code === 'SA',
    marketplaceAvailable: item.code === 'SA',
    providerOnboardingAvailable: item.code === 'SA',
  })));

  const localized = useCallback((ar: string, en: string) => isRTL ? ar : en, [isRTL]);
  const markDirty = useCallback(() => { dirty.current = true; }, []);

  const applyProfile = useCallback((profile: Awaited<ReturnType<typeof getDriverProfile>>['profile'], hydrateDraft: boolean) => {
    if (!profile) return;
    setProfileActive(profile.active === true);
    setModerationStatus((profile.moderationStatus || 'pending_review') as OwnerStatus);
    if (!hydrateDraft) return;
    setCountryCode(profile.countryCode || 'SA');
    setDisplayName(profile.displayName || '');
    setRegion(profile.region || '');
    setCity(profile.city || '');
    setDescription(profile.description || '');
    setYears(profile.yearsExperience === undefined ? '' : String(profile.yearsExperience));
    setEquipmentTypes(canonicalEquipmentTypes(profile.equipmentTypes || []));
    const availability = String(profile.availabilityStatus || 'offline');
    setAvailabilityStatus(DRIVER_AVAILABILITY_STATUSES.includes(availability as DriverAvailabilityStatus)
      ? availability as DriverAvailabilityStatus
      : 'offline');
  }, []);

  const loadProfile = useCallback(async (initial = false) => {
    if (!canEdit) {
      setLoading(false);
      return;
    }
    if (!initial) setRefreshing(true);
    try {
      const { profile } = await getDriverProfile();
      applyProfile(profile, !dirty.current);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof WorkerError ? safeErrorMessage(error, isRTL ? 'ar' : 'en') : localized(
        'تعذر تحميل ملف السائق. تحقق من الاتصال وحاول مرة أخرى.',
        'Could not load the driver profile. Check your connection and try again.',
      ));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyProfile, canEdit, localized]);

  useFocusEffect(useCallback(() => {
    void loadProfile(true);
    const interval = setInterval(() => void loadProfile(false), 15_000);
    return () => clearInterval(interval);
  }, [loadProfile]));

  useEffect(() => {
    void fetchMarketConfig().then(setMarkets).catch(() => {
      setLoadError(localized(
        'تعذر تحميل الأسواق المتاحة. حاول مرة أخرى.',
        'Could not load available markets. Try again.',
      ));
    });
  }, [localized]);

  const selectedMarket = markets.find(item => item.code === countryCode);
  const marketEnabled = selectedMarket?.enabled === true && selectedMarket.providerOnboardingAvailable !== false;
  const validRegion = regionsForCountry(countryCode, markets).some(item => item.id === region);
  const validCity = citiesForLocation(countryCode, region, markets).some(item => item.id === city);
  const parsedYears = Number(years);
  const formValid = displayName.trim().length >= 2
    && validRegion && validCity
    && equipmentTypes.length > 0
    && Number.isInteger(parsedYears) && parsedYears >= 0 && parsedYears <= 80
    && marketEnabled;
  const moderationLocked = moderationStatus === 'rejected' || moderationStatus === 'suspended';

  const save = async () => {
    if (!canEdit || saving || loading || !formValid || moderationLocked) return;
    if (requiresEmailVerification('driver') && (moderationStatus === 'approved' || availabilityStatus === 'available')) {
      showDialog(t('email_verification_required_title'), t('email_verification_required_driver'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    setSaving(true);
    try {
      const payload = buildDriverOwnerSavePayload({
        displayName, countryCode, region, city, equipmentTypes, yearsExperience: years,
        description, availabilityStatus,
      });
      const result = await saveDriverProfile(payload);
      dirty.current = false;
      applyProfile(result.profile, true);
      showDialog(t('success'), t('profile_updated'), [{ text: t('ok'), style: 'default' }]);
    } catch (error) {
      showDialog(t('error_title'), error instanceof WorkerError ? safeErrorMessage(error, isRTL ? 'ar' : 'en') : localized(
        'تعذر حفظ ملف السائق. حاول مرة أخرى.',
        'Could not save the driver profile. Try again.',
      ), [{ text: t('ok'), style: 'default' }]);
    } finally {
      setSaving(false);
    }
  };

  const update = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    markDirty();
    setter(value);
  };

  const moderationLabel: Record<OwnerStatus, string> = {
    pending_review: localized('قيد المراجعة', 'Pending review'),
    approved: localized('معتمد', 'Approved'),
    rejected: localized('مرفوض', 'Rejected'),
    suspended: localized('موقوف', 'Suspended'),
  };

  if (!authLoading && !canEdit) {
    return <View style={styles.container}><SafeAreaView edges={['top', 'bottom']} style={styles.safe}><View style={styles.content}>
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('driver_profile')}</Text>
      <View style={styles.errorBox}><Text style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>
        {localized('هذه الصفحة متاحة فقط لحساب سائق نشط وغير موقوف.', 'This page is available only to an active, unrestricted driver account.')}
      </Text></View>
    </View></SafeAreaView></View>;
  }

  if (isAuthenticated && user?.role !== 'driver') return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: Colors.textPrimary }}>{localized('هذه الصفحة متاحة لحسابات السائقين فقط.', 'This page is available to driver accounts only.')}</Text></SafeAreaView>;
  return <View style={styles.container}><SafeAreaView edges={['top', 'bottom']} style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
    <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('driver_profile')}</Text>
    <View style={styles.statusCard}>
      <Text style={[styles.statusText, { textAlign: isRTL ? 'right' : 'left' }]}>
        {localized('حالة التفعيل', 'Active status')}: {profileActive ? localized('نشط', 'Active') : localized('غير نشط', 'Inactive')}
      </Text>
      <Text style={[styles.statusText, { textAlign: isRTL ? 'right' : 'left' }]}>
        {localized('حالة المراجعة', 'Moderation status')}: {moderationLabel[moderationStatus]}
      </Text>
    </View>
    {moderationLocked && <View style={styles.pending}><Text style={[styles.pendingText, { textAlign: isRTL ? 'right' : 'left' }]}>
      {localized('لا يمكن تعديل الملف أثناء رفضه أو إيقافه.', 'The profile cannot be edited while rejected or suspended.')}
    </Text></View>}
    {loadError ? <View style={styles.errorBox}>
      <Text style={[styles.errorText, { textAlign: isRTL ? 'right' : 'left' }]}>{loadError}</Text>
      <Pressable disabled={refreshing} onPress={() => void loadProfile(false)} style={styles.retryButton}>
        <Text style={styles.retryText}>{refreshing ? localized('جارٍ المحاولة...', 'Retrying...') : localized('إعادة المحاولة', 'Retry')}</Text>
      </Pressable>
    </View> : null}
    {loading || authLoading ? <ActivityIndicator color={Colors.gold} /> : <>
      <View style={styles.group}><Text style={styles.label}>{t('country')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryRow}>
        {GCC_COUNTRIES.map(item => {
          const market = markets.find(entry => entry.code === item.code);
          const enabled = market?.enabled === true && market.providerOnboardingAvailable !== false;
          const selected = countryCode === item.code;
          return <Pressable key={item.code} disabled={!enabled || moderationLocked} accessibilityState={{ disabled: !enabled || moderationLocked, selected }}
            onPress={() => { markDirty(); setCountryCode(item.code); setRegion(''); setCity(''); }}
            style={[styles.countryChip, selected && styles.countryChipActive, !enabled && styles.countryChipDisabled]}>
            <Text style={selected ? styles.countryChipTextActive : [styles.countryChipText, !enabled && styles.countryChipTextDisabled]}>
              {isRTL ? item.nameAr : item.nameEn}{!enabled ? ` (${t('inactive')})` : ''}
            </Text>
          </Pressable>;
        })}
      </ScrollView></View>
      <View style={styles.group}><Text style={styles.label}>{t('name')}</Text><TextInput editable={!moderationLocked} style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} value={displayName} onChangeText={value => update(setDisplayName, value)} /></View>
      <View style={styles.group}><Text style={styles.label}>{t('years_experience')}</Text><TextInput editable={!moderationLocked} style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} value={years} onChangeText={value => update(setYears, value)} keyboardType="numeric" /></View>
      <View style={styles.group}><Text style={styles.label}>{t('region')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryRow}>
        {regionsForCountry(countryCode, markets).map(item => <Pressable disabled={moderationLocked} key={item.id} onPress={() => { markDirty(); setRegion(item.id); setCity(''); }} style={[styles.countryChip, region === item.id && styles.countryChipActive]}>
          <Text style={region === item.id ? styles.countryChipTextActive : styles.countryChipText}>{isRTL ? item.nameAr : item.nameEn}</Text>
        </Pressable>)}
      </ScrollView></View>
      <View style={styles.group}><Text style={styles.label}>{t('city')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryRow}>
        {citiesForLocation(countryCode, region, markets).map(item => <Pressable disabled={moderationLocked} key={item.id} onPress={() => update(setCity, item.id)} style={[styles.countryChip, city === item.id && styles.countryChipActive]}>
          <Text style={city === item.id ? styles.countryChipTextActive : styles.countryChipText}>{isRTL ? item.nameAr : item.nameEn}</Text>
        </Pressable>)}
      </ScrollView></View>
      <View style={styles.group}><Text style={styles.label}>{localized('قدرات تشغيل المعدات', 'Equipment capabilities')}</Text><View style={[styles.wrapRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {mockCategories.map(item => {
          const selected = equipmentTypes.includes(item.id);
          return <Pressable disabled={moderationLocked} key={item.id} onPress={() => update(setEquipmentTypes, selected ? equipmentTypes.filter(id => id !== item.id) : [...equipmentTypes, item.id])} style={[styles.countryChip, selected && styles.countryChipActive]}>
            <Text style={selected ? styles.countryChipTextActive : styles.countryChipText}>{isRTL ? item.nameAr : item.nameEn}</Text>
          </Pressable>;
        })}
      </View></View>
      <View style={styles.group}><Text style={styles.label}>{localized('حالة التوفر', 'Availability')}</Text><View style={[styles.wrapRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {DRIVER_AVAILABILITY_STATUSES.map(status => <Pressable disabled={moderationLocked} key={status} onPress={() => update(setAvailabilityStatus, status)} style={[styles.countryChip, availabilityStatus === status && styles.countryChipActive]}>
          <Text style={availabilityStatus === status ? styles.countryChipTextActive : styles.countryChipText}>{{ available: localized('متاح', 'Available'), busy: localized('مشغول', 'Busy'), offline: localized('غير متصل', 'Offline') }[status]}</Text>
        </Pressable>)}
      </View></View>
      <View style={styles.group}><Text style={styles.label}>{t('description')}</Text><TextInput editable={!moderationLocked} style={[styles.input, styles.area, { textAlign: isRTL ? 'right' : 'left' }]} value={description} onChangeText={value => update(setDescription, value)} multiline /></View>
      {!formValid && <Text style={[styles.validationText, { textAlign: isRTL ? 'right' : 'left' }]}>
        {localized('أكمل الاسم والموقع، واختر قدرة واحدة على الأقل، وأدخل خبرة من 0 إلى 80.', 'Complete the name and location, select at least one capability, and enter experience from 0 to 80.')}
      </Text>}
      <Pressable style={[styles.button, (!formValid || saving || moderationLocked) && styles.buttonDisabled]} onPress={() => void save()} disabled={!formValid || saving || loading || moderationLocked}>
        <Text style={styles.buttonText}>{saving ? t('saving') : t('save')}</Text>
      </Pressable>
      {driverRequestsAllowed(user) ? <Pressable style={styles.secondaryButton} onPress={() => router.push(DRIVER_REQUESTS_ROUTE)}><Text style={styles.secondaryButtonText}>{localized('عرض الطلبات', 'View Requests')}</Text></Pressable> : null}
    </>}
  </ScrollView></SafeAreaView><AppDialog visible={dialog.visible} title={dialog.title} message={dialog.message} buttons={dialog.buttons} onClose={hideDialog} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  safe: { flex: 1 },
  content: { padding: 20, gap: 16 },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '700' },
  statusCard: { backgroundColor: Colors.inputBg, borderColor: Colors.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  statusText: { color: Colors.textSecondary, fontWeight: '600' },
  pending: { backgroundColor: 'rgba(243,156,18,0.14)', borderColor: Colors.warning, borderWidth: 1, borderRadius: 12, padding: 12 },
  pendingText: { color: Colors.warning },
  errorBox: { backgroundColor: 'rgba(231,76,60,0.12)', borderColor: Colors.error, borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  errorText: { color: Colors.error },
  retryButton: { alignSelf: 'flex-start', borderColor: Colors.error, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  retryText: { color: Colors.error, fontWeight: '700' },
  group: { gap: 7 },
  label: { color: Colors.textSecondary, fontWeight: '600' },
  input: { backgroundColor: Colors.inputBg, color: Colors.textPrimary, borderColor: Colors.border, borderWidth: 1, borderRadius: 12, padding: 13 },
  area: { minHeight: 100, textAlignVertical: 'top' },
  countryRow: { gap: 8 },
  wrapRow: { flexWrap: 'wrap', gap: 8 },
  countryChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  countryChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  countryChipDisabled: { opacity: 0.5 },
  countryChipText: { color: Colors.textSecondary, fontSize: 12 },
  countryChipTextDisabled: { color: Colors.textMuted },
  countryChipTextActive: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
  validationText: { color: Colors.warning, fontSize: 12 },
  button: { backgroundColor: Colors.gold, borderRadius: 12, padding: 15, alignItems: 'center' },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: Colors.primary, fontWeight: '700' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.gold, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  secondaryButtonText: { color: Colors.gold, fontWeight: '700' },
});