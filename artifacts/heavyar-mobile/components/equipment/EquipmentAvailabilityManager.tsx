import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { CalendarOff, PauseCircle, PlayCircle, RotateCcw, Trash2 } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import Colors from '@/constants/colors';
import type { GccCountryCode } from '@/constants/gcc';
import RentalSchedulePicker from '@/components/rental/RentalSchedulePicker';
import {
  HeavyarButton,
  HeavyarButtonText,
  HeavyarInput,
  HeavyarSurface,
} from '@/components/ui/heavyar';
import {
  addCalendarDays,
  marketClock,
  marketDateAt,
  type ListingAvailabilityCalendar,
} from '@/services/rentalV2';
import {
  getListingAvailability,
  updateListingAvailability,
  WorkerError,
  type ListingAvailability,
} from '@/services/workerClient';

type Props = {
  listingId: string;
  language: 'ar' | 'en';
  isRTL: boolean;
  countryCode?: GccCountryCode;
  marketTimezone?: string;
};

const copy = {
  ar: {
    title: 'التوفر والصيانة', intro: 'أدر فترات التوفر والصيانة دون تعديل الحجوزات المؤكدة.',
    from: 'متاح من (YYYY-MM-DD)', until: 'متاح حتى — اختياري', pause: 'إيقاف الاستقبال مؤقتًا', resume: 'استئناف استقبال الطلبات',
    maintenance: 'إضافة فترة صيانة', add: 'حفظ فترة الصيانة', existing: 'الفترات المحجوبة', none: 'لا توجد فترات صيانة مستقبلية.',
    save: 'حفظ التوفر', saved: 'تم تحديث التوفر.', retry: 'إعادة المحاولة', loading: 'جارٍ تحميل التوفر…',
    invalid: 'اختر بداية ونهاية صحيحتين.', failed: 'تعذر تحديث التوفر. حدّث التقويم ثم حاول مجددًا.', remove: 'إزالة فترة الصيانة',
  },
  en: {
    title: 'Availability & maintenance', intro: 'Manage availability and maintenance without changing confirmed rentals.',
    from: 'Available from (YYYY-MM-DD)', until: 'Available until — optional', pause: 'Pause new requests', resume: 'Resume new requests',
    maintenance: 'Add maintenance period', add: 'Save maintenance period', existing: 'Blocked periods', none: 'No future maintenance periods.',
    save: 'Save availability', saved: 'Availability updated.', retry: 'Retry', loading: 'Loading availability…',
    invalid: 'Choose a valid start and end date.', failed: 'Availability could not be updated. Refresh the calendar and retry.', remove: 'Remove maintenance period',
  },
} as const;

export default function EquipmentAvailabilityManager({ listingId, language, isRTL, countryCode, marketTimezone }: Props) {
  const labels = copy[language];
  const clock = useMemo(() => marketClock({ countryCode, marketTimezone }), [countryCode, marketTimezone]);
  const today = useMemo(() => marketDateAt(new Date().toISOString(), clock.offsetMinutes), [clock.offsetMinutes]);
  const window = useMemo(() => ({ from: today, until: addCalendarDays(today, 366) }), [today]);
  const [calendar, setCalendar] = useState<ListingAvailabilityCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState('');
  const [maintenanceFrom, setMaintenanceFrom] = useState('');
  const [maintenanceUntil, setMaintenanceUntil] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(false);
    try {
      const next = await getListingAvailability(listingId, window, signal);
      setCalendar(next);
      setFrom(next.availability.from);
      setUntil(next.availability.until || '');
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [listingId, window]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const save = useCallback(async (next: ListingAvailability) => {
    if (!calendar || saving) return;
    setSaving(true); setMessage('');
    try {
      await updateListingAvailability(listingId, next, calendar.revision);
      setMessage(labels.saved);
      await load();
    } catch (cause) {
      setMessage(cause instanceof WorkerError && cause.code === 'AVAILABILITY_CONFLICT'
        ? (language === 'ar' ? 'الفترة تتعارض مع إيجار مؤكد.' : 'This period conflicts with a confirmed rental.')
        : cause instanceof WorkerError && cause.code === 'AVAILABILITY_UPDATE_CONFLICT'
          ? (language === 'ar' ? 'تغير التوفر. تم تحديث التقويم؛ أعد المحاولة.' : 'Availability changed. The calendar was refreshed; retry.')
          : labels.failed);
      await load();
    } finally {
      setSaving(false);
    }
  }, [calendar, labels.failed, labels.saved, language, listingId, load, saving]);

  const policy = calendar?.availability;
  const futureBlocked = policy?.blocked.filter(range => (range.until || range.from) >= today) || [];
  const basePolicy = (): ListingAvailability => ({
    from,
    ...(until ? { until } : {}),
    blocked: futureBlocked,
    temporarilyUnavailable: policy?.temporarilyUnavailable === true,
  });
  const validBase = /^\d{4}-\d{2}-\d{2}$/.test(from) && (!until || (/^\d{4}-\d{2}-\d{2}$/.test(until) && until >= from));

  if (loading && !calendar) {
    return <HeavyarSurface items="center" density="comfortable" gap="$sm"><ActivityIndicator color={Colors.gold} /><Text color="$colorMuted">{labels.loading}</Text></HeavyarSurface>;
  }
  if (error || !calendar || !policy) {
    return <HeavyarSurface density="comfortable" gap="$sm"><Text color="$color">{labels.failed}</Text><HeavyarButton self="flex-start" icon={RotateCcw} onPress={() => void load()} tone="secondary"><HeavyarButtonText tone="secondary">{labels.retry}</HeavyarButtonText></HeavyarButton></HeavyarSurface>;
  }

  return (
    <YStack gap="$md">
      <HeavyarSurface density="comfortable" gap="$md">
        <XStack items="center" flexDirection={isRTL ? 'row-reverse' : 'row'} gap="$sm"><CalendarOff color={Colors.gold} size={21} /><Text color="$color" flex={1} fontSize={17} fontWeight="800" style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.title}</Text></XStack>
        <Text color="$colorMuted" fontSize={13} lineHeight={20} style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.intro}</Text>
        <HeavyarInput accessibilityLabel={labels.from} onChangeText={setFrom} placeholder={labels.from} style={{ textAlign: isRTL ? 'right' : 'left' }} value={from} />
        <HeavyarInput accessibilityLabel={labels.until} onChangeText={setUntil} placeholder={labels.until} style={{ textAlign: isRTL ? 'right' : 'left' }} value={until} />
        <XStack flexDirection={isRTL ? 'row-reverse' : 'row'} flexWrap="wrap" gap="$sm">
          <HeavyarButton disabled={!validBase || saving} opacity={!validBase || saving ? 0.5 : 1} onPress={() => void save(basePolicy())} tone="secondary"><HeavyarButtonText tone="secondary">{labels.save}</HeavyarButtonText></HeavyarButton>
          <HeavyarButton icon={policy.temporarilyUnavailable ? PlayCircle : PauseCircle} onPress={() => void save({ ...basePolicy(), temporarilyUnavailable: !policy.temporarilyUnavailable })} tone={policy.temporarilyUnavailable ? 'primary' : 'outline'}>
            <HeavyarButtonText tone={policy.temporarilyUnavailable ? 'primary' : 'outline'}>{policy.temporarilyUnavailable ? labels.resume : labels.pause}</HeavyarButtonText>
          </HeavyarButton>
        </XStack>
        {!!message && <Text color={message === labels.saved ? '$success' : '$warning'} fontSize={13} style={{ textAlign: isRTL ? 'right' : 'left' }}>{message}</Text>}
      </HeavyarSurface>

      <YStack gap="$sm">
        <Text color="$color" fontSize={16} fontWeight="800" style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.maintenance}</Text>
        <RentalSchedulePicker calendar={calendar} endDate={maintenanceUntil} endTime="00:00" error={false} isRTL={isRTL} language={language} loading={false} mode="daily" offsetMinutes={clock.offsetMinutes} onEndDate={setMaintenanceUntil} onEndTime={() => {}} onRetry={() => void load()} onStartDate={setMaintenanceFrom} onStartTime={() => {}} purpose="maintenance" startDate={maintenanceFrom} startTime="00:00" />
        <HeavyarButton disabled={!maintenanceFrom || !maintenanceUntil || saving} fullWidth opacity={!maintenanceFrom || !maintenanceUntil || saving ? 0.5 : 1} onPress={() => {
          if (!maintenanceFrom || !maintenanceUntil || maintenanceUntil < maintenanceFrom) { setMessage(labels.invalid); return; }
          void save({ ...basePolicy(), blocked: [...futureBlocked, { from: maintenanceFrom, until: maintenanceUntil }] });
          setMaintenanceFrom(''); setMaintenanceUntil('');
        }}><HeavyarButtonText>{labels.add}</HeavyarButtonText></HeavyarButton>
      </YStack>

      <HeavyarSurface density="comfortable" gap="$sm" tone="subtle">
        <Text color="$color" fontSize={15} fontWeight="800" style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.existing}</Text>
        {futureBlocked.length === 0 ? <Text color="$colorMuted" fontSize={13} style={{ textAlign: isRTL ? 'right' : 'left' }}>{labels.none}</Text> : futureBlocked.map((range, index) => (
          <XStack items="center" flexDirection={isRTL ? 'row-reverse' : 'row'} gap="$sm" justify="space-between" key={`${range.from}-${range.until || ''}`}>
            <Text color="$color" flex={1} fontSize={13} style={{ textAlign: isRTL ? 'right' : 'left' }}>{range.from} — {range.until || '—'}</Text>
            <HeavyarButton accessibilityLabel={`${labels.remove}: ${range.from}`} compact icon={Trash2} onPress={() => void save({ ...basePolicy(), blocked: futureBlocked.filter((_, itemIndex) => itemIndex !== index) })} tone="danger"><HeavyarButtonText tone="danger">{labels.remove}</HeavyarButtonText></HeavyarButton>
          </XStack>
        ))}
      </HeavyarSurface>
    </YStack>
  );
}
