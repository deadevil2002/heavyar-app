import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, ClipboardCheck, ShieldCheck, Truck } from 'lucide-react-native';
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
import type { PreciseLocation } from '@/services/location';
import { addCalendarDays, marketClock, marketDateTimeToUtc } from '@/services/rentalV2';
import { prepareTransportRequest } from '@/services/transporterService';

function draftId() {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
function safePositiveInteger(value: string, max: number) {
  const parsed = Number(value);
  return /^\d+$/.test(value.trim()) && Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : null;
}

export default function TransportRequestPrepareScreen() {
  const { user } = useAuth();
  const identityKey = user?.uid ? `uid:${user.uid}` : 'signed-out';
  return <TransportRequestPrepareForm key={identityKey} />;
}

function TransportRequestPrepareForm() {
  const router = useRouter();
  const auth = useAuth();
  const { language, isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const controller = useRef<AbortController | null>(null);
  const countryCode = auth.user?.countryCode || 'SA';
  const offset = marketClock({ countryCode, marketTimezone: undefined }).offsetMinutes;
  const today = useMemo(() => new Date(Date.now() + offset * 60_000).toISOString().slice(0, 10), [offset]);
  const [equipmentCategory, setEquipmentCategory] = useState('excavators');
  const [weightKg, setWeightKg] = useState('10000');
  const [lengthMm, setLengthMm] = useState('8000');
  const [widthMm, setWidthMm] = useState('2500');
  const [heightMm, setHeightMm] = useState('3000');
  const [originRegion, setOriginRegion] = useState(auth.user?.region || '');
  const [destinationRegion, setDestinationRegion] = useState('');
  const [originPin, setOriginPin] = useState<PreciseLocation | null>(null);
  const [destinationPin, setDestinationPin] = useState<PreciseLocation | null>(null);
  const [pickupDate, setPickupDate] = useState(addCalendarDays(today, 1));
  const [pickupStart, setPickupStart] = useState('08:00');
  const [pickupEnd, setPickupEnd] = useState('10:00');
  const [deliveryDate, setDeliveryDate] = useState(addCalendarDays(today, 2));
  const [deliveryTime, setDeliveryTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState(false);
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const message = (ar: string, en: string) => isRTL ? ar : en;

  useEffect(() => () => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  const submit = async () => {
    if (!auth.user || auth.user.role !== 'customer') return setError(message('هذه الخطوة متاحة لحساب العميل فقط.', 'This step is available to customer accounts only.'));
    const weight = safePositiveInteger(weightKg, 250_000), length = safePositiveInteger(lengthMm, 50_000);
    const width = safePositiveInteger(widthMm, 20_000), height = safePositiveInteger(heightMm, 20_000);
    if (weight === null || length === null || width === null || height === null) return setError(message('أدخل الوزن والأبعاد كأرقام صحيحة موجبة ضمن الحدود.', 'Enter weight and dimensions as positive whole numbers within the limits.'));
    if (!originRegion.trim() || !destinationRegion.trim() || !originPin || !destinationPin) return setError(message('أدخل منطقتي الاستلام والتسليم وأكّد كلا الدبوسين.', 'Enter pickup and delivery regions and confirm both pins.'));
    let startAt: string, endAt: string, deliveryBy: string;
    try {
      startAt = marketDateTimeToUtc(pickupDate, pickupStart, offset);
      endAt = marketDateTimeToUtc(pickupDate, pickupEnd, offset);
      deliveryBy = marketDateTimeToUtc(deliveryDate, deliveryTime, offset);
      if (Date.parse(endAt) <= Date.parse(startAt) || Date.parse(deliveryBy) < Date.parse(endAt)) throw new Error('invalid');
    } catch {
      return setError(message('تحقق من نافذة الاستلام وموعد التسليم.', 'Check the pickup window and delivery deadline.'));
    }
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    setSubmitting(true); setError(''); setPrepared(false);
    try {
      await prepareTransportRequest({
        clientDraftId: draftId(), contractVersion: 1, expectedRevision: null, equipmentCategory,
        loadWeightKg: weight, loadDimensionsMm: { length, width, height },
        origin: { region: { countryCode, region: originRegion.trim() }, pin: originPin },
        destination: { region: { countryCode, region: destinationRegion.trim() }, pin: destinationPin },
        requestedPickupWindow: { startAt, endAt }, requestedDeliveryBy: deliveryBy,
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
            <HeavyarIconButton tone="subtle" circular onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={message('رجوع', 'Back')}>
              <BackIcon color={Colors.gold} size={20} />
            </HeavyarIconButton>
            <YStack flex={1} items={isRTL ? 'flex-end' : 'flex-start'}>
              <HeavyarTitle>{message('تجهيز متطلبات النقل', 'Prepare transport requirements')}</HeavyarTitle>
              <Text color="$colorMuted" fontSize={12} text={direction.textAlign}>{message('تحقق فقط — لا يتم إرسال طلب', 'Validation only — no request is sent')}</Text>
            </YStack>
          </XStack>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 14 }} showsVerticalScrollIndicator={false}>
            <HeavyarSurface tone="subtle" density="compact" gap="$sm">
              <XStack items="center" flexDirection={direction.rowDirection} gap="$sm"><ShieldCheck color={Colors.gold} size={19} />
                <Text color="$color" fontWeight="700" flex={1} text={direction.textAlign}>{message('خدمة النقل التجارية غير مفعّلة', 'Commercial transport service is not active')}</Text></XStack>
              <Text color="$colorMuted" fontSize={12} lineHeight={19} text={direction.textAlign}>
                {message('لا اختيار ناقل، ولا اعتماد مسار أو تصريح، ولا إشعار أو دفع. القدرات المعلنة غير متحققة بشكل مستقل.', 'No transporter selection, route or permit approval, notification, or payment occurs. Declared capabilities are not independently verified.')}
              </Text>
            </HeavyarSurface>

            <Text color="$color" fontWeight="700" text={direction.textAlign}>{message('فئة الحمولة', 'Load category')}</Text>
            <XStack flexWrap="wrap" flexDirection={direction.rowDirection} gap="$sm">
              {mockCategories.map(item => <HeavyarChip key={item.id} selected={equipmentCategory === item.id} onPress={() => setEquipmentCategory(item.id)} accessibilityRole="button" accessibilityState={{ selected: equipmentCategory === item.id }}>
                <HeavyarChipText selected={equipmentCategory === item.id}>{isRTL ? item.nameAr : item.nameEn}</HeavyarChipText>
              </HeavyarChip>)}
            </XStack>

            <Text color="$color" fontWeight="700" text={direction.textAlign}>{message('الوزن والأبعاد', 'Weight and dimensions')}</Text>
            <HeavyarInput value={weightKg} onChangeText={setWeightKg} keyboardType="number-pad" maxLength={6} style={{ textAlign: isRTL ? 'right' : 'left' }} placeholder={message('الوزن بالكيلوجرام', 'Weight in kg')} />
            <XStack flexDirection={direction.rowDirection} gap="$sm">
              {[{ value: lengthMm, set: setLengthMm, ar: 'الطول مم', en: 'Length mm' }, { value: widthMm, set: setWidthMm, ar: 'العرض مم', en: 'Width mm' }, { value: heightMm, set: setHeightMm, ar: 'الارتفاع مم', en: 'Height mm' }].map(item => (
                <HeavyarInput key={item.en} flex={1} value={item.value} onChangeText={item.set} keyboardType="number-pad" maxLength={5} style={{ textAlign: 'center' }} placeholder={isRTL ? item.ar : item.en} />
              ))}
            </XStack>

            <HeavyarSurface density="compact" gap="$sm">
              <Text color="$color" fontWeight="800" text={direction.textAlign}>{message('1. موقع الاستلام', '1. Pickup location')}</Text>
              <HeavyarInput value={originRegion} onChangeText={setOriginRegion} maxLength={80} style={{ textAlign: isRTL ? 'right' : 'left' }} placeholder={message('منطقة الاستلام', 'Pickup region')} />
              <LocationPicker value={originPin} onConfirm={setOriginPin} language={language} />
            </HeavyarSurface>
            <HeavyarSurface density="compact" gap="$sm">
              <Text color="$color" fontWeight="800" text={direction.textAlign}>{message('2. موقع التسليم', '2. Delivery location')}</Text>
              <HeavyarInput value={destinationRegion} onChangeText={setDestinationRegion} maxLength={80} style={{ textAlign: isRTL ? 'right' : 'left' }} placeholder={message('منطقة التسليم', 'Delivery region')} />
              <LocationPicker value={destinationPin} onConfirm={setDestinationPin} language={language} />
            </HeavyarSurface>

            <Text color="$color" fontWeight="700" text={direction.textAlign}>{message('نافذة الاستلام', 'Pickup window')}</Text>
            <XStack flexDirection={direction.rowDirection} gap="$sm">
              <HeavyarInput flex={1} value={pickupDate} onChangeText={setPickupDate} maxLength={10} keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD" style={{ textAlign: 'center' }} />
              <HeavyarInput width={88} value={pickupStart} onChangeText={setPickupStart} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="HH:mm" style={{ textAlign: 'center' }} />
              <HeavyarInput width={88} value={pickupEnd} onChangeText={setPickupEnd} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="HH:mm" style={{ textAlign: 'center' }} />
            </XStack>
            <Text color="$color" fontWeight="700" text={direction.textAlign}>{message('التسليم المطلوب قبل', 'Deliver by')}</Text>
            <XStack flexDirection={direction.rowDirection} gap="$sm">
              <HeavyarInput flex={1} value={deliveryDate} onChangeText={setDeliveryDate} maxLength={10} keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD" style={{ textAlign: 'center' }} />
              <HeavyarInput width={104} value={deliveryTime} onChangeText={setDeliveryTime} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="HH:mm" style={{ textAlign: 'center' }} />
            </XStack>
            <Text color="$color" fontWeight="700" text={direction.textAlign}>{message('ملاحظات النقل (اختياري)', 'Transport notes (optional)')}</Text>
            <HeavyarInput value={notes} onChangeText={setNotes} maxLength={1000} multiline minH={92} style={{ textAlign: isRTL ? 'right' : 'left' }} placeholder={message('معلومات تشغيلية مختصرة دون بيانات حساسة', 'Short operational notes without sensitive data')} />

            {error ? <Text color="$danger" fontSize={13} lineHeight={20} text={direction.textAlign}>{error}</Text> : null}
            {prepared ? <HeavyarSurface tone="subtle" density="compact" gap="$sm"><XStack items="center" flexDirection={direction.rowDirection} gap="$sm">
              <ClipboardCheck color={Colors.success} size={20} /><Text color="$color" fontWeight="700" flex={1} text={direction.textAlign}>{message('المتطلبات صالحة ولم يُرسل أي طلب', 'Requirements are valid and no request was sent')}</Text>
            </XStack></HeavyarSurface> : null}
            <HeavyarButton fullWidth disabled={submitting} opacity={submitting ? 0.6 : 1} onPress={() => void submit()} accessibilityRole="button">
              <Truck color={Colors.primary} size={19} /><HeavyarButtonText>{submitting ? message('جارٍ التحقق…', 'Validating…') : message('تحقق من المتطلبات فقط', 'Validate requirements only')}</HeavyarButtonText>
            </HeavyarButton>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </HeavyarScreen>
  );
}
