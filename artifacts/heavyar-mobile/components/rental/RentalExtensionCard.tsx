import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { CalendarPlus, Check, Clock3, RotateCcw, X } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import type { EquipmentRequest, RentalExtension, RentalExtensionEstimate } from '@/types';
import { countryFor } from '@/constants/gcc';
import {
  formatMinorAmount,
  marketClock,
  marketDateAt,
  marketDateTimeToUtc,
  marketDateToUtc,
} from '@/services/rentalV2';
import {
  createRentalExtension,
  estimateRentalExtension,
  getRentalExtension,
  reviewRentalExtension,
  WorkerError,
} from '@/services/workerClient';
import { HeavyarButton, HeavyarButtonText, HeavyarInput, HeavyarSurface } from '@/components/ui/heavyar';

type Props = {
  request: EquipmentRequest;
  currentUid: string;
  language: 'ar' | 'en';
  isRTL: boolean;
};

const copy = {
  ar: {
    title: 'تمديد مدة الإيجار', intro: 'اطلب وقتًا إضافيًا بسعر محسوب من عقد الإيجار الأصلي.', date: 'تاريخ الانتهاء الجديد', time: 'وقت الانتهاء الجديد',
    estimate: 'حساب الزيادة', submit: 'إرسال للمزود', pending: 'بانتظار قرار المزود', approve: 'الموافقة المبدئية', decline: 'رفض الطلب',
    extra: 'المدة الإضافية', price: 'السعر الإضافي', hours: 'دقيقة', units: 'وحدة فوترة', retry: 'إعادة المحاولة',
    failed: 'تعذر تحميل أو تحديث طلب التمديد.', invalid: 'اختر نهاية لاحقة صحيحة.', paymentBlocked: 'وافق المزود. التمديد غير مؤكد حتى تتوفر دفعة إضافية موثقة. تاريخ الانتهاء الأصلي لم يتغير.',
    declined: 'تم رفض طلب التمديد.', expires: 'تنتهي صلاحية المراجعة', original: 'النهاية الحالية',
  },
  en: {
    title: 'Rental extension', intro: 'Request extra time priced from the original locked rental terms.', date: 'New end date', time: 'New end time',
    estimate: 'Calculate extension', submit: 'Send to provider', pending: 'Waiting for provider review', approve: 'Approve in principle', decline: 'Decline request',
    extra: 'Extra duration', price: 'Additional price', hours: 'minutes', units: 'billing units', retry: 'Retry',
    failed: 'The extension request could not be loaded or updated.', invalid: 'Choose a valid later end.', paymentBlocked: 'The provider approved. The extension is not confirmed until a verified additional payment flow is available. The original end is unchanged.',
    declined: 'The extension request was declined.', expires: 'Review expires', original: 'Current end',
  },
} as const;

export default function RentalExtensionCard({ request, currentUid, language, isRTL }: Props) {
  const labels = copy[language];
  const originalEnd = request.requestedEndAt || '';
  const country = countryFor(request.equipmentSnapshot?.countryCode);
  const clock = useMemo(() => marketClock({ countryCode: country.code }), [country.code]);
  const initial = useMemo(() => {
    const parsed = Date.parse(originalEnd);
    if (!Number.isFinite(parsed)) return { date: '', time: '12:00' };
    const next = new Date(parsed + (request.rateUnit === 'daily' ? 86_400_000 : 3_600_000)).toISOString();
    const market = new Date(Date.parse(next) + clock.offsetMinutes * 60_000);
    return { date: market.toISOString().slice(0, 10), time: market.toISOString().slice(11, 16) };
  }, [clock.offsetMinutes, originalEnd, request.rateUnit]);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [extension, setExtension] = useState<RentalExtension | null>(null);
  const [estimate, setEstimate] = useState<RentalExtensionEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isCustomer = request.customerUid === currentUid;
  const isProvider = request.providerUid === currentUid;
  const eligible = request.pricingModelVersion === 2 && Boolean(originalEnd) && ['accepted', 'in_progress'].includes(request.status) && (isCustomer || isProvider);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!eligible) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const current = await getRentalExtension(request.id, signal);
      setExtension(current?.status === 'expired' && isCustomer ? null : current);
    }
    catch { setError(labels.failed); }
    finally { setLoading(false); }
  }, [eligible, isCustomer, labels.failed, request.id]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const proposedEndAt = useCallback(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID');
    return request.rateUnit === 'daily'
      ? marketDateToUtc(date, clock.offsetMinutes)
      : marketDateTimeToUtc(date, time, clock.offsetMinutes);
  }, [clock.offsetMinutes, date, request.rateUnit, time]);

  const act = useCallback(async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); }
    catch (cause) {
      setError(cause instanceof WorkerError && ['EXTENSION_INVALID_END', 'EXTENSION_RENTAL_EXPIRED'].includes(cause.code) ? labels.invalid : labels.failed);
    } finally { setBusy(false); }
  }, [busy, labels.failed, labels.invalid]);

  if (!eligible) return null;
  if (loading) return <HeavyarSurface items="center" density="comfortable" gap="$sm"><ActivityIndicator color={Colors.gold} /><Text color="$colorMuted">{labels.title}</Text></HeavyarSurface>;
  if (error && !extension && !isCustomer) return <HeavyarSurface density="comfortable" gap="$sm"><Text color="$warning">{error}</Text><HeavyarButton self="flex-start" icon={RotateCcw} onPress={() => void load()} tone="secondary"><HeavyarButtonText tone="secondary">{labels.retry}</HeavyarButtonText></HeavyarButton></HeavyarSurface>;

  const summary = extension || estimate;
  return (
    <HeavyarSurface density="comfortable" gap="$md">
      <XStack items="center" flexDirection={isRTL ? 'row-reverse' : 'row'} gap="$sm"><CalendarPlus color={Colors.gold} size={21} /><Text color="$color" flex={1} fontSize={17} fontWeight="800" style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.title}</Text></XStack>
      <Text color="$colorMuted" fontSize={13} lineHeight={20} style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.intro}</Text>
      <XStack flexDirection={isRTL ? 'row-reverse' : 'row'} justify="space-between"><Text color="$colorMuted" fontSize={12}>{labels.original}</Text><Text color="$color" fontSize={13} fontWeight="700">{originalEnd ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: request.rateUnit === 'hourly' ? 'short' : undefined, timeZone: clock.timezone }).format(new Date(originalEnd)) : '—'}</Text></XStack>

      {!extension && isCustomer && (
        <YStack gap="$sm">
          <HeavyarInput accessibilityLabel={labels.date} onChangeText={value => { setDate(value); setEstimate(null); }} placeholder={`${labels.date} (YYYY-MM-DD)`} style={{ textAlign: isRTL ? 'right' : 'left' }} value={date} />
          {request.rateUnit === 'hourly' && <HeavyarInput accessibilityLabel={labels.time} onChangeText={value => { setTime(value); setEstimate(null); }} placeholder={`${labels.time} (HH:mm)`} style={{ textAlign: isRTL ? 'right' : 'left' }} value={time} />}
          <HeavyarButton disabled={busy} fullWidth icon={Clock3} onPress={() => void act(async () => setEstimate(await estimateRentalExtension(request.id, proposedEndAt())))} tone="secondary"><HeavyarButtonText tone="secondary">{labels.estimate}</HeavyarButtonText></HeavyarButton>
        </YStack>
      )}

      {summary && (
        <YStack bg="$navySoft" borderColor="$borderColor" rounded="$md" borderWidth={1} gap="$xs" p="$sm">
          <XStack flexDirection={isRTL ? 'row-reverse' : 'row'} justify="space-between"><Text color="$colorMuted" fontSize={12}>{labels.extra}</Text><Text color="$color" fontSize={13} fontWeight="700">{summary.additionalDurationMinutes} {labels.hours} · {summary.additionalBillableUnits} {labels.units}</Text></XStack>
          <XStack flexDirection={isRTL ? 'row-reverse' : 'row'} justify="space-between"><Text color="$colorMuted" fontSize={12}>{labels.price}</Text><Text color="$accent" fontSize={16} fontWeight="800">{formatMinorAmount(summary.additionalBaseAmountMinor, summary.currency, language)}</Text></XStack>
          {'expiresAt' in summary && <XStack flexDirection={isRTL ? 'row-reverse' : 'row'} justify="space-between"><Text color="$colorMuted" fontSize={12}>{labels.expires}</Text><Text color="$color" fontSize={12}>{marketDateAt(summary.expiresAt, clock.offsetMinutes)}</Text></XStack>}
        </YStack>
      )}

      {estimate && !extension && isCustomer && <HeavyarButton disabled={busy} fullWidth onPress={() => void act(async () => { const created = await createRentalExtension(request.id, proposedEndAt(), estimate.additionalBaseAmountMinor); setExtension(created); setEstimate(null); })}><HeavyarButtonText>{labels.submit}</HeavyarButtonText></HeavyarButton>}
      {extension?.status === 'pending_provider' && <Text color="$warning" fontSize={13} fontWeight="700" style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.pending}</Text>}
      {extension?.status === 'pending_provider' && isProvider && (
        <XStack flexDirection={isRTL ? 'row-reverse' : 'row'} gap="$sm">
          <HeavyarButton flex={1} icon={Check} onPress={() => void act(async () => setExtension(await reviewRentalExtension(request.id, extension.id, 'approve')))}><HeavyarButtonText>{labels.approve}</HeavyarButtonText></HeavyarButton>
          <HeavyarButton flex={1} icon={X} onPress={() => void act(async () => setExtension(await reviewRentalExtension(request.id, extension.id, 'decline')))} tone="danger"><HeavyarButtonText tone="danger">{labels.decline}</HeavyarButtonText></HeavyarButton>
        </XStack>
      )}
      {extension?.status === 'awaiting_payment_integration' && <Text color="$warning" fontSize={13} lineHeight={20} style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.paymentBlocked}</Text>}
      {extension?.status === 'declined' && <Text color="$danger" fontSize={13} style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.declined}</Text>}
      {!!error && <Text color="$danger" fontSize={13} style={{ textAlign: isRTL ? 'right' : 'left' }}>{error}</Text>}
    </HeavyarSurface>
  );
}
