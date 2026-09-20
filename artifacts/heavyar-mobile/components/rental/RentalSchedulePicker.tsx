import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Clock3 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { addCalendarDays } from '@/services/rentalV2';

type Props = {
  language: 'ar' | 'en';
  isRTL: boolean;
  mode: 'hourly' | 'daily' | 'open_ended';
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  onStartDate: (value: string) => void;
  onEndDate: (value: string) => void;
  onStartTime: (value: string) => void;
  onEndTime: (value: string) => void;
};

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

function TimeControl({ value, onChange, label, isRTL }: { value: string; onChange: (value: string) => void; label: string; isRTL: boolean }) {
  const [hour, minute] = value.split(':').map(Number);
  const change = (nextHour: number, nextMinute: number) => onChange(`${pad((nextHour + 24) % 24)}:${pad((nextMinute + 60) % 60)}`);
  return (
    <View style={styles.timeBox}>
      <Text style={[styles.smallLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
      <View style={[styles.timeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Clock3 size={16} color={Colors.gold} />
        <Pressable style={styles.step} onPress={() => change(hour - 1, minute)}><Text style={styles.stepText}>−</Text></Pressable>
        <Text style={styles.timeText}>{pad(hour)}:{pad(minute)}</Text>
        <Pressable style={styles.step} onPress={() => change(hour + 1, minute)}><Text style={styles.stepText}>+</Text></Pressable>
        <Pressable style={styles.minuteStep} onPress={() => change(hour, minute + 15)}><Text style={styles.minuteText}>+15</Text></Pressable>
      </View>
    </View>
  );
}

export default function RentalSchedulePicker(props: Props) {
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
  const minimum = new Date().toISOString().slice(0, 10);
  const choose = (date: string) => {
    if (date < minimum) return;
    if (!props.startDate || (props.mode !== 'open_ended' && props.endDate)) {
      props.onStartDate(date);
      props.onEndDate('');
    } else if (props.mode !== 'open_ended') {
      props.onEndDate(props.mode === 'daily' && date <= props.startDate ? addCalendarDays(props.startDate, 1) : date);
    } else {
      props.onStartDate(date);
    }
  };
  const shiftMonth = (delta: number) => setVisibleMonth(new Date(Date.UTC(year, month + delta, 1)));
  const ArrowPrevious = props.isRTL ? ChevronRight : ChevronLeft;
  const ArrowNext = props.isRTL ? ChevronLeft : ChevronRight;

  return (
    <View style={styles.wrap}>
      <View style={[styles.monthHeader, { flexDirection: props.isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable style={styles.arrow} onPress={() => shiftMonth(-1)}><ArrowPrevious size={18} color={Colors.textPrimary} /></Pressable>
        <Text style={styles.monthTitle}>{monthTitle}</Text>
        <Pressable style={styles.arrow} onPress={() => shiftMonth(1)}><ArrowNext size={18} color={Colors.textPrimary} /></Pressable>
      </View>
      <View style={styles.grid}>
        {weekdays.map((day, i) => <Text key={`w-${i}`} style={styles.weekday}>{day}</Text>)}
        {cells.map((day, i) => {
          if (!day) return <View key={`e-${i}`} style={styles.day} />;
          const key = dateKey(year, month, day);
          const selected = key === props.startDate || key === props.endDate;
          const inRange = Boolean(props.startDate && props.endDate && key > props.startDate && key < props.endDate);
          const disabled = key < minimum;
          return (
            <Pressable key={key} style={[styles.day, inRange && styles.inRange, selected && styles.selected]} onPress={() => choose(key)} disabled={disabled}>
              <Text style={[styles.dayText, disabled && styles.disabled, selected && styles.selectedText]}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { textAlign: props.isRTL ? 'right' : 'left' }]}>
        {props.language === 'ar'
          ? (props.mode === 'open_ended' ? 'اختر تاريخ بدء المهمة' : 'اختر تاريخ البدء ثم تاريخ الانتهاء')
          : (props.mode === 'open_ended' ? 'Select the job start date' : 'Select the start date, then the end date')}
      </Text>
      {props.mode !== 'daily' && (
        <View style={styles.times}>
          <TimeControl value={props.startTime} onChange={props.onStartTime} label={props.language === 'ar' ? 'وقت البدء' : 'Start time'} isRTL={props.isRTL} />
          {props.mode === 'hourly' && <TimeControl value={props.endTime} onChange={props.onEndTime} label={props.language === 'ar' ? 'وقت الانتهاء' : 'End time'} isRTL={props.isRTL} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  monthHeader: { alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.surface },
  monthTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.285%', textAlign: 'center', color: Colors.textMuted, fontSize: 11, paddingVertical: 5 },
  day: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  inRange: { backgroundColor: Colors.surface },
  selected: { backgroundColor: Colors.gold },
  dayText: { color: Colors.textPrimary, fontSize: 13 },
  disabled: { color: Colors.textMuted, opacity: 0.35 },
  selectedText: { color: Colors.primary, fontWeight: '800' },
  hint: { color: Colors.textMuted, fontSize: 12 },
  times: { gap: 8 },
  timeBox: { gap: 5 },
  smallLabel: { color: Colors.textSecondary, fontSize: 12 },
  timeRow: { alignItems: 'center', gap: 8 },
  step: { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: Colors.textPrimary, fontSize: 18 },
  timeText: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', minWidth: 52, textAlign: 'center' },
  minuteStep: { paddingHorizontal: 9, height: 30, borderRadius: 9, backgroundColor: Colors.surface, justifyContent: 'center' },
  minuteText: { color: Colors.gold, fontSize: 12, fontWeight: '700' },
});