import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { HardHat, MapPin, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import { GCC_COUNTRIES } from '@/constants/gcc';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDiscoveryMarkets } from '@/contexts/DiscoveryContext';
import { mockCategories } from '@/mocks/categories';
import { isMarketEnabled, regionsForCountry } from '@/services/locationHierarchy';
import { LatestRequestGuard, mergeUniqueById } from '@/services/driverLiveSync';
import { searchOperators, type OperatorAvailability, type OperatorPublicProfile } from '@/services/operatorService';
import {
  HeavyarButton,
  HeavyarButtonText,
  HeavyarChip,
  HeavyarChipText,
  HeavyarEmptyState,
  HeavyarLoadingState,
  HeavyarSurface,
  useHeavyarDirection,
} from './ui/heavyar';

const AVAILABILITY: { id: OperatorAvailability; ar: string; en: string }[] = [
  { id: 'available', ar: 'متاح', en: 'Available' },
  { id: 'busy', ar: 'مشغول', en: 'Busy' },
];

export default function OperatorSearchTab() {
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const auth = useAuth();
  const markets = useDiscoveryMarkets();
  const router = useRouter();
  const guard = useRef(new LatestRequestGuard());
  const [countryCode, setCountryCode] = useState('SA');
  const [region, setRegion] = useState('');
  const [equipmentSkill, setEquipmentSkill] = useState('');
  const [availability, setAvailability] = useState<OperatorAvailability | ''>('');
  const [operators, setOperators] = useState<OperatorPublicProfile[]>([]);
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
      const result = await searchOperators({
        countryCode, region, equipmentSkill, availability: availability || undefined,
        cursor: append ? nextCursor || undefined : undefined, limit: 20,
      }, active.signal);
      if (!guard.current.isCurrent(active.generation)) return;
      setActivationEnabled(result.activation.enabled);
      setOperators(previous => append ? mergeUniqueById(previous, result.operators) : result.operators);
      setNextCursor(result.nextCursor);
    } catch {
      if (!guard.current.isCurrent(active.generation)) return;
      setError(true);
      setOperators([]);
      setNextCursor(null);
    } finally {
      if (guard.current.isCurrent(active.generation)) { setLoading(false); setLoadingMore(false); }
    }
  }, [availability, countryCode, equipmentSkill, loadingMore, nextCursor, region]);

  useEffect(() => {
    const requestGuard = guard.current;
    const timer = setTimeout(() => void load(false), 200);
    return () => { clearTimeout(timer); requestGuard.cancel(); };
  }, [availability, auth.user?.uid, countryCode, equipmentSkill, region]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (id: string, label: string, selected: boolean, onPress: () => void, disabled = false) => (
    <HeavyarChip key={id} selected={selected} disabled={disabled} opacity={disabled ? 0.42 : 1}
      accessibilityRole="button" accessibilityState={{ selected, disabled }} onPress={onPress}>
      <HeavyarChipText selected={selected}>{label}</HeavyarChipText>
    </HeavyarChip>
  );
  const reset = () => { setCountryCode('SA'); setRegion(''); setEquipmentSkill(''); setAvailability(''); };
  const canPrepare = activationEnabled === true && auth.user?.role === 'customer' && auth.accountState === 'authenticated_complete';

  return (
    <YStack flex={1}>
      <ScrollView style={{ flexGrow: 0, maxHeight: '46%' }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 10 }}
        showsVerticalScrollIndicator={false}>
        <HeavyarSurface tone="subtle" density="compact" gap="$xs" mb="$md">
          <XStack items="center" flexDirection={direction.rowDirection} gap="$sm">
            <ShieldCheck color={Colors.gold} size={19} strokeWidth={2} />
            <Text color="$color" fontSize={14} fontWeight="700" text={direction.textAlign} flex={1}>
              {isRTL ? 'اكتشاف المشغّلين قيد الاعتماد التنظيمي' : 'Operator discovery is pending regulatory approval'}
            </Text>
          </XStack>
          <Text color="$colorMuted" fontSize={12} lineHeight={19} text={direction.textAlign}>
            {isRTL ? 'لن تظهر ملفات أو تُرسل طلبات قبل تفعيل الأهلية الموثقة رسميًا.' : 'No profiles or requests are activated until verified eligibility is formally enabled.'}
          </Text>
        </HeavyarSurface>
        <YStack gap="$sm">
          <Text color="$colorMuted" fontSize={13} fontWeight="700" text={direction.textAlign}>{isRTL ? 'الدولة' : 'Country'}</Text>
          <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
            {GCC_COUNTRIES.map(item => chip(item.code, isRTL ? item.nameAr : item.nameEn, countryCode === item.code, () => {
              setCountryCode(item.code); setRegion('');
            }, !isMarketEnabled(item.code, markets)))}
          </XStack>
          <Text color="$colorMuted" fontSize={13} fontWeight="700" text={direction.textAlign}>{isRTL ? 'المنطقة' : 'Region'}</Text>
          <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
            {regionsForCountry(countryCode, markets).map(item => chip(item.id, isRTL ? item.nameAr : item.nameEn, region === item.id, () => setRegion(region === item.id ? '' : item.id)))}
          </XStack>
          <Text color="$colorMuted" fontSize={13} fontWeight="700" text={direction.textAlign}>{isRTL ? 'التخصص' : 'Equipment skill'}</Text>
          <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
            {mockCategories.map(item => chip(item.id, isRTL ? item.nameAr : item.nameEn, equipmentSkill === item.id, () => setEquipmentSkill(equipmentSkill === item.id ? '' : item.id)))}
          </XStack>
          <Text color="$colorMuted" fontSize={13} fontWeight="700" text={direction.textAlign}>{isRTL ? 'التوفر' : 'Availability'}</Text>
          <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
            {AVAILABILITY.map(item => chip(item.id, isRTL ? item.ar : item.en, availability === item.id, () => setAvailability(availability === item.id ? '' : item.id)))}
          </XStack>
          {(region || equipmentSkill || availability || countryCode !== 'SA') ? (
            <HeavyarButton tone="ghost" compact self="center" onPress={reset} accessibilityRole="button">
              <RotateCcw color={Colors.gold} size={16} /><HeavyarButtonText tone="ghost">{isRTL ? 'إعادة الضبط' : 'Reset filters'}</HeavyarButtonText>
            </HeavyarButton>
          ) : null}
        </YStack>
      </ScrollView>

      {loading ? <HeavyarLoadingState label={isRTL ? 'التحقق من توفر الخدمة…' : 'Checking service availability…'} /> :
        error ? <HeavyarEmptyState icon={HardHat} title={isRTL ? 'تعذر تحميل حالة الخدمة' : 'Service status unavailable'}
          message={isRTL ? 'لم تُعرض أي نتائج حفاظًا على الخصوصية.' : 'No results are shown while eligibility cannot be verified.'}
          action={<HeavyarButton tone="secondary" compact onPress={() => void load(false)}><HeavyarButtonText tone="secondary">{isRTL ? 'إعادة المحاولة' : 'Retry'}</HeavyarButtonText></HeavyarButton>} /> :
        activationEnabled === false ? <YStack px="$md"><HeavyarEmptyState icon={HardHat}
          title={isRTL ? 'خدمة المشغّلين قيد التجهيز' : 'Operator service is being prepared'}
          message={isRTL ? 'يمكنك تجهيز متطلبات العمل محليًا، ولن يُرسل أي طلب.' : 'You can prepare work requirements locally; no request will be sent.'}
          action={canPrepare ? <HeavyarButton tone="secondary" onPress={() => router.push('/operator-request-prepare' as never)}>
            <HeavyarButtonText tone="secondary">{isRTL ? 'تجهيز المتطلبات فقط' : 'Prepare requirements only'}</HeavyarButtonText>
          </HeavyarButton> : undefined} /></YStack> :
        <FlatList data={operators} keyExtractor={item => item.id} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 10 }}
          onEndReached={() => { if (nextCursor) void load(true); }} onEndReachedThreshold={0.5}
          ListHeaderComponent={canPrepare ? <HeavyarButton tone="secondary" onPress={() => router.push('/service-rfqs' as never)}>
            <HeavyarButtonText tone="secondary">{isRTL ? 'طلباتي وعروضي الخاصة' : 'My private requests and offers'}</HeavyarButtonText>
          </HeavyarButton> : null}
          ListEmptyComponent={<HeavyarEmptyState icon={HardHat} title={isRTL ? 'لا توجد نتائج مؤهلة' : 'No eligible results'} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.gold} /> : null}
          renderItem={({ item }) => <HeavyarSurface density="compact" gap="$xs">
            <Text color="$color" fontSize={16} fontWeight="800" text={direction.textAlign}>{item.displayName}</Text>
            <XStack items="center" flexDirection={direction.rowDirection} gap="$xs"><MapPin color={Colors.gold} size={15} />
              <Text color="$colorMuted" fontSize={12}>{item.countryCode} · {item.region}</Text></XStack>
            <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{item.equipmentSkills.join(' · ')}</Text>
            {canPrepare ? <HeavyarButton compact tone="secondary" onPress={() => router.push({ pathname: '/operator-request-prepare', params: { profileId: item.id } } as never)}>
              <HeavyarButtonText tone="secondary">{isRTL ? 'طلب عرض خاص للاختبار' : 'Private QA quote request'}</HeavyarButtonText>
            </HeavyarButton> : null}
          </HeavyarSurface>} />}
    </YStack>
  );
}
