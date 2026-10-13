import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, ClipboardCheck, HardHat, ShieldCheck } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import LocationPicker from '@/components/location/LocationPicker';
import {
  HeavyarButton,
  HeavyarButtonText,
  HeavyarChip,
  HeavyarChipText,
  HeavyarIconButton,
  HeavyarInput,
  HeavyarScreen,
  HeavyarSurface,
  HeavyarTitle,
  useHeavyarDirection,
} from '@/components/ui/heavyar';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { mockCategories } from '@/mocks/categories';
import { prepareOperatorRequest } from '@/services/operatorService';
import { addCalendarDays, marketClock, marketDateTimeToUtc } from '@/services/rentalV2';
import type { PreciseLocation } from '@/services/location';

function draftId() {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export default function OperatorRequestPrepareScreen() {
  const router = useRouter();
  const auth = useAuth();
  const { language, isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const controller = useRef<AbortController | null>(null);
  const countryCode = auth.user?.countryCode || 'SA';
  const offset = marketClock({ countryCode, marketTimezone: undefined }).offsetMinutes;
  const today = useMemo(() => new Date(Date.now() + offset * 60_000).toISOString().slice(0, 10), [offset]);
  const [equipmentSkill, setEquipmentSkill] = useState('excavators');
  const [region, setRegion] = useState(auth.user?.region || '');
  const [startDate, setStartDate] = useState(addCalendarDays(today, 1));
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState(addCalendarDays(today, 2));
  const [endTime, setEndTime] = useState('17:00');
  const [workSite, setWorkSite] = useState<PreciseLocation | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState(false);
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const message = (ar: string, en: string) => isRTL ? ar : en;

  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setPrepared(false);
    setError('');
    setRegion(auth.user?.region || '');
    return () => controller.current?.abort();
  }, [auth.user?.uid, auth.user?.region]);

  const submit = async () => {
    if (!auth.user || auth.user.role !== 'customer') return setError(message('هذه الخطوة متاحة لحساب العميل فقط.', 'This step is available to customer accounts only.'));
    if (!region.trim() || !workSite) return setError(message('أدخل المنطقة وأكّد دبوس موقع العمل.', 'Enter the region and confirm the work-site pin.'));
    let requestedStartAt: string, requestedEndAt: string;
    try {
      requestedStartAt = marketDateTimeToUtc(startDate, startTime, offset);
      requestedEndAt = marketDateTimeToUtc(endDate, endTime, offset);
      if (Date.parse(requestedEndAt) <= Date.parse(requestedStartAt)) throw new Error('invalid');
    } catch {
      return setError(message('تحقق من تاريخ ووقت البداية والنهاية.', 'Check the start and end date/time.'));
    }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setSubmitting(true); setError(''); setPrepared(false);
    try {
      await prepareOperatorRequest({
        clientDraftId: draftId(), contractVersion: 1, expectedRevision: null,
        equipmentSkill, requestedStartAt, requestedEndAt,
        matchingRegion: { countryCode, region: region.trim() }, workSite,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }, auth.user.uid, active.signal);
      if (!active.signal.aborted) setPrepared(true);
    } catch {
      if (!active.signal.aborted) setError(message('تعذر التحقق من المتطلبات. لم يُرسل أي طلب.', 'Requirements could not be validated. No request was sent.'));
    } finally {
      if (!active.signal.aborted) setSubmitting(false);
    }
  };

  return (
    <HeavyarScreen>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <XStack items="center" flexDirection={direction.rowDirection} gap="$md" px="$md" py="$sm">
            <HeavyarIconButton tone="subtle" circular onPress={() => router.back()} accessibilityRole="button"
              accessibilityLabel={message('رجوع', 'Back')}><BackIcon color={Colors.gold} size={20} /></HeavyarIconButton>
            <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}>
              <HeavyarTitle>{message('تجهيز متطلبات مشغّل', 'Prepare operator requirements')}</HeavyarTitle>
              <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{message('تحقق فقط — لا يتم إرسال طلب', 'Validation only — no request is sent')}</Text>
            </YStack>
          </XStack>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 14 }} showsVerticalScrollIndicator={false}>
            <HeavyarSurface tone="subtle" density="compact" gap="$sm">
              <XStack items="center" flexDirection={direction.rowDirection} gap="$sm"><ShieldCheck color={Colors.gold} size={19} />
                <Text color="$color" fontWeight="700" flex={1} text={direction.textAlign}>{message('الخدمة التجارية غير مفعّلة بعد', 'Commercial service is not active yet')}</Text></XStack>
              <Text color="$colorMuted" fontSize={12} lineHeight={19} text={direction.textAlign}>
                {message('هذه الشاشة تتحقق من بنية المتطلبات فقط. لا اختيار مشغّل، ولا إشعار، ولا دفع.', 'This screen validates the requirements structure only. It does not select an operator, notify anyone, or create a payment.')}
              </Text>
            </HeavyarSurface>

            <Text color="$color" fontWeight="700" text={direction.textAlign}>{message('تخصص المعدة', 'Equipment skill')}</Text>
            <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
              {mockCategories.map(item => <HeavyarChip key={item.id} selected={equipmentSkill === item.id} onPress={() => setEquipmentSkill(item.id)}
                accessibilityRole="button" accessibilityState={{ selected: equipmentSkill === item.id }}>
                <HeavyarChipText selected={equipmentSkill === item.id}>{isRTL ? item.nameAr : item.nameEn}</HeavyarChipText>
              </HeavyarChip>)}
            </XStack>

            <Text color="$color" fontWeight="700" text={direction.textAlign}>{message('منطقة المطابقة', 'Matching region')}</Text>
            <HeavyarInput value={region} onChangeText={setRegion} maxLength={80} style={{ textAlign: isRTL ? 'right' : 'left' }}
              placeholder={message('مثال: الرياض', 'Example: Riyadh')} />

            <Text color="$color" fontWeight="700" text={direction.textAlign}>{message('الفترة الثابتة', 'Fixed service period')}</Text>
            <XStack flexDirection={direction.rowDirection} gap="$sm">
              <HeavyarInput flex={1} value={startDate} onChangeText={setStartDate} maxLength={10} keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD" style={{ textAlign: 'center' }} />
              <HeavyarInput width={104} value={startTime} onChangeText={setStartTime} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="HH:mm" style={{ textAlign: 'center' }} />
            </XStack>
            <XStack flexDirection={direction.rowDirection} gap="$sm">
              <HeavyarInput flex={1} value={endDate} onChangeText={setEndDate} maxLength={10} keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD" style={{ textAlign: 'center' }} />
              <HeavyarInput width={104} value={endTime} onChangeText={setEndTime} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="HH:mm" style={{ textAlign: 'center' }} />
            </XStack>

            <LocationPicker value={workSite} onConfirm={setWorkSite} language={language} />
            <Text color="$color" fontWeight="700" text={direction.textAlign}>{message('ملاحظات العمل (اختياري)', 'Work notes (optional)')}</Text>
            <HeavyarInput value={notes} onChangeText={setNotes} maxLength={1000} multiline minH={92}
              style={{ textAlign: isRTL ? 'right' : 'left' }} placeholder={message('متطلبات مختصرة دون بيانات حساسة', 'Short requirements without sensitive personal data')} />

            {error ? <Text color="$danger" fontSize={13} lineHeight={20} text={direction.textAlign}>{error}</Text> : null}
            {prepared ? <HeavyarSurface tone="subtle" density="compact" gap="$sm">
              <XStack items="center" flexDirection={direction.rowDirection} gap="$sm"><ClipboardCheck color={Colors.success} size={20} />
                <Text color="$color" fontWeight="700" flex={1} text={direction.textAlign}>{message('المتطلبات صالحة ولم يُرسل أي طلب', 'Requirements are valid and no request was sent')}</Text></XStack>
            </HeavyarSurface> : null}
            <HeavyarButton fullWidth disabled={submitting} opacity={submitting ? 0.6 : 1} onPress={() => void submit()} accessibilityRole="button">
              <HardHat color={Colors.primary} size={19} />
              <HeavyarButtonText>{submitting ? message('جارٍ التحقق…', 'Validating…') : message('تحقق من المتطلبات فقط', 'Validate requirements only')}</HeavyarButtonText>
            </HeavyarButton>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </HeavyarScreen>
  );
}
