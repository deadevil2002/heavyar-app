import React, { useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Ban, CalendarClock, ChevronLeft, ChevronRight, Clock3, Construction, PauseCircle, RotateCcw } from 'lucide-react-native';
import { Button, Text, XStack, YStack, styled } from 'tamagui';
import Colors from '@/constants/colors';
import {
  addCalendarDays,
  availabilityConflictForInterval,
  availabilityStateForDate,
  calendarDayCount,
  marketDateTimeToUtc,
  marketDateToUtc,
  type AvailabilityCalendarState,
  type ListingAvailabilityCalendar,
  type NewRentalModeV2,
} from '@/services/rentalV2';
import { HeavyarBadge, HeavyarBadgeText, HeavyarIconButton, HeavyarSurface } from '@/components/ui/heavyar';

type Props = {
  language: 'ar' | 'en';
  isRTL: boolean;
  mode: NewRentalModeV2;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  calendar: ListingAvailabilityCalendar | null;
  offsetMinutes: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onStartDate: (value: string) => void;
  onEndDate: (value: string) => void;
  onStartTime: (value: string) => void;
  onEndTime: (value: string) => void;
  purpose?: 'rental' | 'maintenance';
};

const DayButton = styled(Button, {
  items: 'center',
  bg: '$transparent',
  borderColor: '$transparent',
  borderWidth: 1,
  height: 46,
  justify: 'center',
  minW: 0,
  p: 0,
  pressStyle: { opacity: 0.82, scale: 0.96 },
  rounded: '$sm',
  transition: '200ms',
  width: '14.285%',
  variants: {
    calendarState: {
      available: { bg: '$transparent' },
      booked: { bg: 'rgba(67, 137, 204, 0.12)', borderColor: '$blueLight' },
      in_rental: { bg: 'rgba(246, 200, 77, 0.12)', borderColor: '$warning' },
      owner_blocked: { bg: 'rgba(239, 106, 91, 0.09)', borderColor: '$danger' },
      temporarily_unavailable: { bg: '$navySoft', borderColor: '$borderColor' },
      outside_availability: { bg: '$transparent', borderColor: '$transparent' },
    },
    selected: { true: { bg: '$accent', borderColor: '$accent' } },
    inRange: { true: { bg: '$surfaceRaised' } },
  } as const,
});

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

const stateCopy = {
  ar: {
    available: 'متاح', booked: 'محجوز', in_rental: 'قيد التأجير', owner_blocked: 'محجوب للصيانة',
    temporarily_unavailable: 'متوقف مؤقتًا', outside_availability: 'خارج فترة التوفر', past: 'تاريخ سابق',
    interval_unavailable: 'لا يصلح كنهاية للفترة المحددة',
  },
  en: {
    available: 'Available', booked: 'Booked', in_rental: 'In rental', owner_blocked: 'Owner blocked / maintenance',
    temporarily_unavailable: 'Temporarily unavailable', outside_availability: 'Outside availability', past: 'Past date',
    interval_unavailable: 'Unavailable as the end of this interval',
  },
} as const;

function StateGlyph({ state }: { state: AvailabilityCalendarState }) {
  if (state === 'booked') return <CalendarClock size={10} color={Colors.primaryLight} />;
  if (state === 'in_rental') return <Construction size={10} color={Colors.warning} />;
  if (state === 'owner_blocked') return <Ban size={10} color={Colors.error} />;
  if (state === 'temporarily_unavailable') return <PauseCircle size={10} color={Colors.textMuted} />;
  return null;
}

function TimeControl({ value, onChange, label, isRTL }: { value: string; onChange: (value: string) => void; label: string; isRTL: boolean }) {
  const [hour, minute] = value.split(':').map(Number);
  const change = (nextHour: number, nextMinute: number) => onChange(`${pad((nextHour + 24) % 24)}:${pad((nextMinute + 60) % 60)}`);
  return (
    <YStack gap="$xs">
      <Text color="$colorMuted" fontSize={12} style={{ textAlign: isRTL ? 'right' : 'left' }}>{label}</Text>
      <XStack items="center" flexDirection={isRTL ? 'row-reverse' : 'row'} gap="$sm">
        <Clock3 size={17} color={Colors.gold} />
        <HeavyarIconButton accessibilityLabel={`${label} -1`} onPress={() => change(hour - 1, minute)} tone="subtle"><Text color="$color" fontSize={19}>−</Text></HeavyarIconButton>
        <Text color="$color" fontSize={17} fontWeight="700" style={{ minWidth: 58, textAlign: 'center' }}>{pad(hour)}:{pad(minute)}</Text>
        <HeavyarIconButton accessibilityLabel={`${label} +1`} onPress={() => change(hour + 1, minute)} tone="subtle"><Text color="$color" fontSize={19}>+</Text></HeavyarIconButton>
        <Button accessibilityLabel={`${label} +15`} bg="$navySoft" borderColor="$borderColor" borderWidth={1} minH="$controlMd" onPress={() => change(hour, minute + 15)} px="$sm" rounded="$md" pressStyle={{ opacity: 0.85, scale: 0.97 }}>
          <Text color="$accent" fontSize={12} fontWeight="700">+15</Text>
        </Button>
      </XStack>
    </YStack>
  );
}

export default function RentalSchedulePicker(props: Props) {
  const isMaintenance = props.purpose === 'maintenance';
  const initial = props.startDate ? new Date(`${props.startDate}T00:00:00Z`) : new Date();
  const [visibleMonth, setVisibleMonth] = useState(new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1)));
  const locale = props.language === 'ar' ? 'ar-SA' : 'en-GB';
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(visibleMonth);
  const weekdays = useMemo(() => {
    const sunday = Date.UTC(2024, 0, 7);
    return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(sunday + i * 86_400_000)));
  }, [locale]);
  const year = visibleMonth.getUTCFullYear();
  const month = visibleMonth.getUTCMonth();
  const firstWeekday = visibleMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  const minimum = props.calendar?.window.from || new Date().toISOString().slice(0, 10);
  const maximum = props.calendar?.window.until || minimum;
  const selectingEnd = Boolean(props.startDate && !props.endDate);
  const stateFor = (date: string): AvailabilityCalendarState => props.calendar ? availabilityStateForDate(props.calendar, date, props.offsetMinutes) : 'temporarily_unavailable';
  const conflictsAsEnd = (date: string): boolean => {
    if (!selectingEnd || !props.calendar) return false;
    const normalizedEnd = isMaintenance
      ? addCalendarDays(date < props.startDate ? props.startDate : date, 1)
      : props.mode === 'daily' && date <= props.startDate ? addCalendarDays(props.startDate, 1) : date;
    try {
      const startAt = props.mode === 'daily'
        ? marketDateToUtc(props.startDate, props.offsetMinutes)
        : marketDateTimeToUtc(props.startDate, props.startTime, props.offsetMinutes);
      const endAt = props.mode === 'daily'
        ? marketDateToUtc(normalizedEnd, props.offsetMinutes)
        : marketDateTimeToUtc(normalizedEnd, props.endTime, props.offsetMinutes);
      return availabilityConflictForInterval(props.calendar, startAt, endAt, props.offsetMinutes) !== null;
    } catch {
      return true;
    }
  };
  const choose = (date: string) => {
    if (!props.calendar || date < minimum || (selectingEnd ? date > maximum : date >= maximum)) return;
    const state = stateFor(date);
    if (conflictsAsEnd(date)) return;
    if (!selectingEnd && state !== 'available' && !(props.mode === 'hourly' && (state === 'booked' || state === 'in_rental'))) return;
    if (!props.startDate || props.endDate) {
      props.onStartDate(date);
      props.onEndDate('');
      return;
    }
    props.onEndDate(isMaintenance
      ? (date < props.startDate ? props.startDate : date)
      : props.mode === 'daily' && date <= props.startDate ? addCalendarDays(props.startDate, 1) : date);
  };
  const shiftMonth = (delta: number) => setVisibleMonth(new Date(Date.UTC(year, month + delta, 1)));
  const monthKey = dateKey(year, month, 1);
  const previousDisabled = monthKey <= `${minimum.slice(0, 7)}-01`;
  const nextMonth = dateKey(year, month + 1, 1);
  const nextDisabled = nextMonth >= maximum;
  const ArrowPrevious = props.isRTL ? ChevronRight : ChevronLeft;
  const ArrowNext = props.isRTL ? ChevronLeft : ChevronRight;
  const selectedDays = props.mode === 'daily' && props.startDate && props.endDate
    ? calendarDayCount(props.startDate, isMaintenance ? addCalendarDays(props.endDate, 1) : props.endDate)
    : 0;

  if (props.loading) {
    return <HeavyarSurface accessibilityLabel={props.language === 'ar' ? 'جارٍ تحميل تقويم التوفر' : 'Loading availability calendar'} items="center" density="comfortable" gap="$sm"><ActivityIndicator color={Colors.gold} /><Text color="$colorMuted">{props.language === 'ar' ? 'جارٍ التحقق من المواعيد المتاحة…' : 'Checking available dates…'}</Text></HeavyarSurface>;
  }
  if (props.error || !props.calendar) {
    return (
      <HeavyarSurface density="comfortable" gap="$sm" tone="subtle">
        <Text color="$color" fontWeight="700" style={{ textAlign: props.isRTL ? 'right' : 'left' }}>{props.language === 'ar' ? 'تعذر تحميل التوفر' : 'Availability could not be loaded'}</Text>
        <Text color="$colorMuted" fontSize={12} lineHeight={18} style={{ textAlign: props.isRTL ? 'right' : 'left' }}>{props.language === 'ar' ? 'لا يمكن إنشاء طلب قبل التحقق من التقويم.' : 'A request cannot be created until the calendar is verified.'}</Text>
        <Button self="flex-start" bg="$surfaceRaised" borderColor="$borderColor" borderWidth={1} icon={RotateCcw} minH="$controlMd" onPress={props.onRetry} px="$md" rounded="$md"><Text color="$color" fontWeight="700">{props.language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Text></Button>
      </HeavyarSurface>
    );
  }

  return (
    <HeavyarSurface density="compact" gap="$sm" tone="subtle">
      <XStack items="center" flexDirection={props.isRTL ? 'row-reverse' : 'row'} justify="space-between">
        <HeavyarIconButton accessibilityLabel={props.language === 'ar' ? 'الشهر السابق' : 'Previous month'} disabled={previousDisabled} opacity={previousDisabled ? 0.35 : 1} onPress={() => shiftMonth(-1)} tone="subtle"><ArrowPrevious size={18} color={Colors.textPrimary} /></HeavyarIconButton>
        <Text color="$color" fontSize={15} fontWeight="700">{monthTitle}</Text>
        <HeavyarIconButton accessibilityLabel={props.language === 'ar' ? 'الشهر التالي' : 'Next month'} disabled={nextDisabled} opacity={nextDisabled ? 0.35 : 1} onPress={() => shiftMonth(1)} tone="subtle"><ArrowNext size={18} color={Colors.textPrimary} /></HeavyarIconButton>
      </XStack>
      <XStack flexWrap="wrap">
        {weekdays.map((day, i) => <Text color="$colorMuted" fontSize={11} key={`w-${i}`} py="$xs" style={{ textAlign: 'center' }} width="14.285%">{day}</Text>)}
        {cells.map((day, i) => {
          if (!day) return <YStack height={46} key={`e-${i}`} width="14.285%" />;
          const key = dateKey(year, month, day);
          const state = stateFor(key);
          const selected = key === props.startDate || key === props.endDate;
          const inRange = Boolean(props.startDate && props.endDate && key > props.startDate && key < props.endDate);
          const outsideWindow = key < minimum || (selectingEnd ? key > maximum : key >= maximum);
          const unavailableStart = !selectingEnd && state !== 'available' && !(props.mode === 'hourly' && (state === 'booked' || state === 'in_rental'));
          const unavailableEnd = conflictsAsEnd(key);
          const disabled = outsideWindow || unavailableStart || unavailableEnd;
          const labelState = key < minimum
            ? stateCopy[props.language].past
            : unavailableEnd ? stateCopy[props.language].interval_unavailable : stateCopy[props.language][state];
          return (
            <DayButton accessibilityLabel={`${day} ${monthTitle}, ${labelState}`} accessibilityState={{ disabled, selected }} calendarState={state} disabled={disabled} inRange={inRange && !selected} key={key} onPress={() => choose(key)} opacity={disabled && !selected ? 0.38 : 1} selected={selected}>
              <YStack items="center" gap={1}>
                <Text color={selected ? '$navy' : '$color'} fontSize={13} fontWeight={selected ? '800' : '500'}>{day}</Text>
                {!selected && <StateGlyph state={state} />}
              </YStack>
            </DayButton>
          );
        })}
      </XStack>
      <XStack flexDirection={props.isRTL ? 'row-reverse' : 'row'} flexWrap="wrap" gap="$xs">
        {(['available', 'booked', 'in_rental', 'owner_blocked'] as AvailabilityCalendarState[]).map(state => (
          <HeavyarBadge key={state} tone={state === 'available' ? 'success' : state === 'owner_blocked' ? 'danger' : state === 'in_rental' ? 'warning' : 'neutral'}>
            <StateGlyph state={state} /><HeavyarBadgeText>{stateCopy[props.language][state]}</HeavyarBadgeText>
          </HeavyarBadge>
        ))}
      </XStack>
      <Text color="$colorMuted" fontSize={12} lineHeight={18} style={{ textAlign: props.isRTL ? 'right' : 'left' }}>{isMaintenance
        ? (props.language === 'ar' ? 'اختر أول وآخر يوم للصيانة. لا يمكن حجب فترة إيجار مؤكدة.' : 'Select the first and last maintenance day. A confirmed rental cannot be blocked.')
        : (props.language === 'ar' ? 'اختر تاريخ البدء ثم تاريخ الانتهاء. التحقق النهائي يتم عند التقدير والإرسال.' : 'Select a start date, then an end date. Availability is rechecked for estimate and submission.')}</Text>
      {selectedDays > 0 && (
        <XStack bg="$surfaceRaised" flexDirection={props.isRTL ? 'row-reverse' : 'row'} p="$sm" rounded="$md">
          <Text color="$accent" flex={1} fontSize={13} fontWeight="700" style={{ textAlign: props.isRTL ? 'right' : 'left' }}>{isMaintenance
            ? (props.language === 'ar' ? `${selectedDays} ${selectedDays === 1 ? 'يوم صيانة' : 'أيام صيانة'}` : `${selectedDays} maintenance ${selectedDays === 1 ? 'day' : 'days'}`)
            : (props.language === 'ar' ? `${selectedDays} ${selectedDays === 1 ? 'يوم محسوب' : 'أيام محسوبة'} (وقت الانتهاء غير مشمول)` : `${selectedDays} billable ${selectedDays === 1 ? 'day' : 'days'} (end time excluded)`)}</Text>
        </XStack>
      )}
      {props.mode === 'hourly' && (
        <YStack gap="$sm">
          <TimeControl value={props.startTime} onChange={props.onStartTime} label={props.language === 'ar' ? 'وقت البدء' : 'Start time'} isRTL={props.isRTL} />
          <TimeControl value={props.endTime} onChange={props.onEndTime} label={props.language === 'ar' ? 'وقت الانتهاء' : 'End time'} isRTL={props.isRTL} />
        </YStack>
      )}
    </HeavyarSurface>
  );
}
