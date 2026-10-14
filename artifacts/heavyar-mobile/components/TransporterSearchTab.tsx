import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin, RotateCcw, ShieldCheck, Truck } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { GCC_COUNTRIES } from '@/constants/gcc';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDiscoveryMarkets } from '@/contexts/DiscoveryContext';
import { isMarketEnabled, regionsForCountry } from '@/services/locationHierarchy';
import { LatestRequestGuard, mergeUniqueById } from '@/services/driverLiveSync';
import {
  searchTransporters,
  type TransporterAvailability,
  type TransporterPublicProfile,
  type TransporterVehicleCategory,
} from '@/services/transporterService';
import {
  HeavyarButton,
  HeavyarButtonText,
  HeavyarChip,
  HeavyarChipText,
  HeavyarEmptyState,
  HeavyarInput,
  HeavyarLoadingState,
  HeavyarSurface,
  useHeavyarDirection,
} from './ui/heavyar';

const VEHICLES: { id: TransporterVehicleCategory; ar: string; en: string }[] = [
  { id: 'lowbed', ar: 'لوبد', en: 'Lowbed' },
  { id: 'flatbed', ar: 'سطحة', en: 'Flatbed' },
  { id: 'trailer', ar: 'مقطورة', en: 'Trailer' },
  { id: 'recovery', ar: 'سطحة إنقاذ', en: 'Recovery' },
  { id: 'other', ar: 'أخرى', en: 'Other' },
];
const AVAILABILITY: { id: TransporterAvailability; ar: string; en: string }[] = [
  { id: 'available', ar: 'متاح', en: 'Available' },
  { id: 'busy', ar: 'مشغول', en: 'Busy' },
];
const numberOrUndefined = (value: string) => value.trim() ? Number(value) : undefined;

export default function TransporterSearchTab() {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const auth = useAuth();
  const markets = useDiscoveryMarkets();
  const router = useRouter();
  const guard = useRef(new LatestRequestGuard());
  const [countryCode, setCountryCode] = useState('SA');
  const [region, setRegion] = useState('');
  const [vehicleCategory, setVehicleCategory] = useState<TransporterVehicleCategory | ''>('');
  const [vehicleType, setVehicleType] = useState('');
  const [availability, setAvailability] = useState<TransporterAvailability | ''>('');
  const [capacity, setCapacity] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [transporters, setTransporters] = useState<TransporterPublicProfile[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [activationEnabled, setActivationEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (append = false) => {
    if (append && (!nextCursor || loadingMore)) return;
    const active = guard.current.begin();
    if (append) setLoadingMore(true); else setLoading(true);
    setError(false);
    try {
      const result = await searchTransporters({
        countryCode, region, vehicleCategory: vehicleCategory || undefined, vehicleType: vehicleType.trim() || undefined,
        availability: availability || undefined, minCapacityKg: numberOrUndefined(capacity), minLengthMm: numberOrUndefined(length),
        minWidthMm: numberOrUndefined(width), minHeightMm: numberOrUndefined(height), cursor: append ? nextCursor || undefined : undefined, limit: 20,
      }, active.signal);
      if (!guard.current.isCurrent(active.generation)) return;
      setActivationEnabled(result.activation.enabled);
      setTransporters(previous => append ? mergeUniqueById(previous, result.transporters) : result.transporters);
      setNextCursor(result.nextCursor);
    } catch {
      if (!guard.current.isCurrent(active.generation)) return;
      setError(true); setTransporters([]); setNextCursor(null);
    } finally {
      if (guard.current.isCurrent(active.generation)) { setLoading(false); setLoadingMore(false); }
    }
  }, [availability, capacity, countryCode, height, length, loadingMore, nextCursor, region, vehicleCategory, vehicleType, width]);

  useEffect(() => {
    const requestGuard = guard.current;
    const timer = setTimeout(() => void load(false), 250);
    return () => { clearTimeout(timer); requestGuard.cancel(); };
  }, [auth.user?.uid, availability, capacity, countryCode, height, length, region, vehicleCategory, vehicleType, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (id: string, label: string, selected: boolean, onPress: () => void, disabled = false) => (
    <HeavyarChip key={id} selected={selected} disabled={disabled} opacity={disabled ? 0.42 : 1}
      accessibilityRole="button" accessibilityState={{ selected, disabled }} onPress={onPress}>
      <HeavyarChipText selected={selected}>{label}</HeavyarChipText>
    </HeavyarChip>
  );
  const reset = () => {
    setCountryCode('SA'); setRegion(''); setVehicleCategory(''); setVehicleType(''); setAvailability('');
    setCapacity(''); setLength(''); setWidth(''); setHeight('');
  };
  const canPrepare = auth.user?.role === 'customer' && auth.accountState === 'authenticated_complete';

  return (
    <YStack flex={1}>
      <ScrollView style={{ flexGrow: 0, maxHeight: '52%' }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 10 }} showsVerticalScrollIndicator={false}>
        <HeavyarSurface tone="subtle" density="compact" gap="$xs" mb="$md">
          <XStack items="center" flexDirection={direction.rowDirection} gap="$sm">
            <ShieldCheck color={Colors.gold} size={19} strokeWidth={2} />
            <Text color="$color" fontSize={14} fontWeight="700" text={direction.textAlign} flex={1}>
              {isRTL ? 'اكتشاف الناقلين قيد الاعتماد التنظيمي' : 'Transporter discovery is pending regulatory approval'}
            </Text>
          </XStack>
          <Text color="$colorMuted" fontSize={12} lineHeight={19} text={direction.textAlign}>
            {isRTL ? 'القدرات المعلنة ليست اعتمادًا للمركبة أو المسار، ولن يُرسل أي طلب.' : 'Declared capabilities are not vehicle or route certification, and no request will be sent.'}
          </Text>
        </HeavyarSurface>

        <YStack gap="$sm">
          <Text color="$colorMuted" fontSize={13} fontWeight="700" text={direction.textAlign}>{isRTL ? 'الدولة والمنطقة' : 'Country and region'}</Text>
          <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
            {GCC_COUNTRIES.map(item => chip(item.code, isRTL ? item.nameAr : item.nameEn, countryCode === item.code, () => { setCountryCode(item.code); setRegion(''); }, !isMarketEnabled(item.code, markets)))}
          </XStack>
          <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
            {regionsForCountry(countryCode, markets).map(item => chip(item.id, isRTL ? item.nameAr : item.nameEn, region === item.id, () => setRegion(region === item.id ? '' : item.id)))}
          </XStack>

          <Text color="$colorMuted" fontSize={13} fontWeight="700" text={direction.textAlign}>{isRTL ? 'فئة المركبة' : 'Vehicle category'}</Text>
          <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
            {VEHICLES.map(item => chip(item.id, isRTL ? item.ar : item.en, vehicleCategory === item.id, () => setVehicleCategory(vehicleCategory === item.id ? '' : item.id)))}
          </XStack>
          <HeavyarInput value={vehicleType} onChangeText={value => setVehicleType(value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} maxLength={48}
            style={{ textAlign: isRTL ? 'right' : 'left' }} placeholder={isRTL ? 'نوع المركبة (اختياري)' : 'Vehicle type (optional)'} />

          <Text color="$colorMuted" fontSize={13} fontWeight="700" text={direction.textAlign}>{isRTL ? 'الحمولة والأبعاد الدنيا' : 'Minimum load and dimensions'}</Text>
          <HeavyarInput value={capacity} onChangeText={setCapacity} keyboardType="number-pad" maxLength={6}
            style={{ textAlign: isRTL ? 'right' : 'left' }} placeholder={isRTL ? 'الوزن بالكيلوجرام' : 'Weight in kg'} />
          <XStack flexDirection={direction.rowDirection} gap="$sm">
            {[{ value: length, set: setLength, ar: 'الطول مم', en: 'Length mm' }, { value: width, set: setWidth, ar: 'العرض مم', en: 'Width mm' }, { value: height, set: setHeight, ar: 'الارتفاع مم', en: 'Height mm' }].map(item => (
              <HeavyarInput key={item.en} flex={1} value={item.value} onChangeText={item.set} keyboardType="number-pad" maxLength={5}
                style={{ textAlign: 'center' }} placeholder={isRTL ? item.ar : item.en} />
            ))}
          </XStack>
          <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
            {AVAILABILITY.map(item => chip(item.id, isRTL ? item.ar : item.en, availability === item.id, () => setAvailability(availability === item.id ? '' : item.id)))}
          </XStack>
          <HeavyarButton tone="ghost" compact self="center" onPress={reset} accessibilityRole="button">
            <RotateCcw color={Colors.gold} size={16} /><HeavyarButtonText tone="ghost">{isRTL ? 'إعادة الضبط' : 'Reset filters'}</HeavyarButtonText>
          </HeavyarButton>
        </YStack>
      </ScrollView>

      {loading ? <HeavyarLoadingState label={isRTL ? 'التحقق من توفر الخدمة…' : 'Checking service availability…'} /> :
        error ? <HeavyarEmptyState icon={Truck} title={isRTL ? 'تعذر تحميل حالة الخدمة' : 'Service status unavailable'}
          message={isRTL ? 'لم تُعرض أي نتائج حفاظًا على الخصوصية.' : 'No results are shown while eligibility cannot be verified.'}
          action={<HeavyarButton tone="secondary" compact onPress={() => void load(false)}><HeavyarButtonText tone="secondary">{isRTL ? 'إعادة المحاولة' : 'Retry'}</HeavyarButtonText></HeavyarButton>} /> :
        activationEnabled === false ? <YStack px="$md"><HeavyarEmptyState icon={Truck}
          title={isRTL ? 'خدمة النقل قيد التجهيز' : 'Transport service is being prepared'}
          message={isRTL ? 'يمكنك تجهيز متطلبات النقل فقط، ولن يتم الإرسال أو المطابقة.' : 'You can prepare transport requirements only; nothing is submitted or matched.'}
          action={canPrepare ? <HeavyarButton tone="secondary" onPress={() => router.push('/transport-request-prepare' as never)}>
            <HeavyarButtonText tone="secondary">{isRTL ? 'تجهيز المتطلبات فقط' : 'Prepare requirements only'}</HeavyarButtonText>
          </HeavyarButton> : undefined} /></YStack> :
        <FlatList data={transporters} keyExtractor={item => item.id} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 10 }}
          onEndReached={() => { if (nextCursor) void load(true); }} onEndReachedThreshold={0.5}
          ListEmptyComponent={<HeavyarEmptyState icon={Truck} title={isRTL ? 'لا توجد نتائج مؤهلة' : 'No eligible results'} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.gold} /> : null}
          renderItem={({ item }) => <HeavyarSurface density="compact" gap="$xs">
            <Text color="$color" fontSize={16} fontWeight="800" text={direction.textAlign}>{item.displayName}</Text>
            <XStack items="center" flexDirection={direction.rowDirection} gap="$xs"><MapPin color={Colors.gold} size={15} />
              <Text color="$colorMuted" fontSize={12}>{item.countryCode} · {item.region}</Text></XStack>
            <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{item.vehicleCategory} · {item.vehicleType} · {item.declaredCapacityKg} kg</Text>
          </HeavyarSurface>} />}
    </YStack>
  );
}
