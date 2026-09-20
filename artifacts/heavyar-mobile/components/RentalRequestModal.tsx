import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckCircle, Circle, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Equipment, RentalEstimate, RentalRateUnit } from '@/types';
import { estimateRentalRequest } from '@/services/workerClient';
import {
  addCalendarDays,
  calendarDayCount,
  formatMinorAmount,
  listingPricing,
  marketClock,
  marketDateTimeToUtc,
  marketDateToUtc,
  type RentalModeV2,
  type RentalRequestInput,
} from '@/services/rentalV2';
import RentalSchedulePicker from './rental/RentalSchedulePicker';
import { safeErrorMessage } from '@/services/errorMessages';

export type RentalRequestDraft = RentalRequestInput;

type Props = {
  visible: boolean;
  equipment: Equipment;
  onClose: () => void;
  onSubmit: (draft: RentalRequestDraft) => Promise<void> | void;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function RentalRequestModal({ visible, equipment, onClose, onSubmit }: Props) {
  const { isRTL, language, t } = useLanguage();
  const pricing = useMemo(() => listingPricing(equipment), [equipment]);
  const supportedUnits = useMemo(() => (['hourly', 'daily'] as const).filter(unit => pricing[unit].enabled), [pricing]);
  const initialUnit = supportedUnits[0] || 'daily';
  const [mode, setMode] = useState<RentalModeV2>(initialUnit);
  const [rateUnit, setRateUnit] = useState<RentalRateUnit>(initialUnit);
  const [startDate, setStartDate] = useState(addCalendarDays(today(), 1));
  const [endDate, setEndDate] = useState(addCalendarDays(today(), 2));
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [estimate, setEstimate] = useState<RentalEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setEstimate(null);
    setError('');
  }, [mode, rateUnit, startDate, endDate, startTime, endTime, visible]);

  useEffect(() => {
    if (mode === 'hourly') setRateUnit('hourly');
    if (mode === 'daily') setRateUnit('daily');
  }, [mode]);

  const input = (): RentalRequestInput => {
    const clock = marketClock(equipment);
    const start = mode === 'daily'
      ? marketDateToUtc(startDate, clock.offsetMinutes)
      : marketDateTimeToUtc(startDate, startTime, clock.offsetMinutes);
    const end = mode === 'open_ended'
      ? null
      : mode === 'daily'
        ? marketDateToUtc(endDate, clock.offsetMinutes)
        : marketDateTimeToUtc(endDate || startDate, endTime, clock.offsetMinutes);
    return {
      equipmentId: equipment.id,
      pricingModelVersion: 2,
      rentalMode: mode,
      rateUnit,
      expectedRateAmountMinor: pricing[rateUnit].amountMinor,
      requestedStartAt: start,
      requestedEndAt: end,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
  };

  const validate = () => {
    if (!pricing[rateUnit].enabled) return language === 'ar' ? 'وحدة التسعير المحددة غير متاحة.' : 'The selected rate is unavailable.';
    if (!startDate || (mode !== 'open_ended' && !endDate)) return language === 'ar' ? 'اختر تاريخ بدء وانتهاء صالحين.' : 'Select a valid start and end.';
    if (mode === 'daily' && calendarDayCount(startDate, endDate) < 1) return language === 'ar' ? 'يجب أن تكون مدة الإيجار يومًا واحدًا على الأقل.' : 'Daily rental must be at least one day.';
    try {
      const value = input();
      if (value.requestedEndAt && Date.parse(value.requestedEndAt) <= Date.parse(value.requestedStartAt)) {
        return language === 'ar' ? 'وقت الانتهاء يجب أن يكون بعد وقت البدء.' : 'End time must be after start time.';
      }
    } catch {
      return language === 'ar' ? 'تحقق من التاريخ والوقت.' : 'Check the date and time.';
    }
    return '';
  };

  const requestEstimate = async () => {
    const message = validate();
    if (message) return setError(message);
    try {
      setEstimating(true);
      setError('');
      setEstimate(await estimateRentalRequest(input()));
    } catch (estimateError) {
      setError(safeErrorMessage(estimateError, language));
    } finally {
      setEstimating(false);
    }
  };

  const submit = async () => {
    if (!estimate || submitting) return;
    try {
      setSubmitting(true);
      await onSubmit(input());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const modes: { value: RentalModeV2; label: string }[] = [
    ...(pricing.hourly.enabled ? [{ value: 'hourly' as const, label: t('rental_hourly') }] : []),
    ...(pricing.daily.enabled ? [{ value: 'daily' as const, label: t('rental_daily') }] : []),
    { value: 'open_ended', label: t('until_work_completion') },
  ];
  const duration = estimate?.duration.billableMinutes
    ? `${estimate.duration.billableMinutes} ${language === 'ar' ? 'دقيقة' : 'minutes'}`
    : estimate?.duration.unit === 'day' && estimate.duration.billableUnits
      ? `${estimate.duration.billableUnits} ${t('days')}`
      : mode === 'daily' && startDate && endDate ? `${calendarDayCount(startDate, endDate)} ${t('days')}` : '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={styles.title}>{t('request_rental')}</Text>
              <Pressable style={styles.close} onPress={onClose}><X size={20} color={Colors.textMuted} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('request_mode')}</Text>
              {modes.map(item => (
                <Pressable key={item.value} style={[styles.option, mode === item.value && styles.optionActive]} onPress={() => setMode(item.value)}>
                  <View style={[styles.optionRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    {mode === item.value ? <CheckCircle size={18} color={Colors.gold} /> : <Circle size={18} color={Colors.textMuted} />}
                    <Text style={styles.optionText}>{item.label}</Text>
                  </View>
                </Pressable>
              ))}
              {mode === 'open_ended' && supportedUnits.length > 1 && (
                <>
                  <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{language === 'ar' ? 'أساس الحساب' : 'Billing basis'}</Text>
                  <View style={[styles.unitRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    {supportedUnits.map(unit => (
                      <Pressable key={unit} style={[styles.unit, rateUnit === unit && styles.unitActive]} onPress={() => setRateUnit(unit)}>
                        <Text style={[styles.unitText, rateUnit === unit && styles.unitTextActive]}>{unit === 'hourly' ? (language === 'ar' ? 'بالساعة' : 'Hourly') : (language === 'ar' ? 'باليوم' : 'Daily')}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
              <RentalSchedulePicker
                language={language} isRTL={isRTL} mode={mode}
                startDate={startDate} endDate={endDate} startTime={startTime} endTime={endTime}
                onStartDate={setStartDate} onEndDate={setEndDate} onStartTime={setStartTime} onEndTime={setEndTime}
              />
              <TextInput
                style={[styles.notes, { textAlign: isRTL ? 'right' : 'left' }]}
                value={notes} onChangeText={setNotes} multiline maxLength={500}
                placeholder={t('notes_placeholder')} placeholderTextColor={Colors.textMuted}
              />
              {error ? <Text style={[styles.error, { textAlign: isRTL ? 'right' : 'left' }]}>{error}</Text> : null}
              {estimate && (
                <View style={styles.summary}>
                  <Text style={[styles.summaryTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('authoritative_estimate')}</Text>
                  <Text style={styles.summaryLine}>{language === 'ar' ? 'الأساس:' : 'Basis:'} {rateUnit === 'hourly' ? (language === 'ar' ? 'بالساعة' : 'Hourly') : (language === 'ar' ? 'باليوم' : 'Daily')}</Text>
                  {!!duration && <Text style={styles.summaryLine}>{language === 'ar' ? 'المدة:' : 'Duration:'} {duration}</Text>}
                  <Text style={styles.summaryLine}>{language === 'ar' ? 'السعر:' : 'Rate:'} {formatMinorAmount(estimate.rateAmountMinor, estimate.currency, language)}</Text>
                  <Text style={styles.estimateAmount}>{language === 'ar' ? 'التكلفة التقديرية:' : 'Estimated cost:'} {estimate.baseAmountMinor === null ? (language === 'ar' ? 'تُحسب بعد بدء الاستخدام' : 'Calculated after usage starts') : formatMinorAmount(estimate.baseAmountMinor, estimate.currency, language)}</Text>
                  <Text style={styles.disclaimer}>{language === 'ar' ? 'تقدير غير نهائي. يعتمد المبلغ النهائي على الاستخدام الفعلي وشروط الطلب المقفلة.' : 'Not a final charge. The final amount depends on actual usage and locked request terms.'}</Text>
                </View>
              )}
            </ScrollView>
            <View style={[styles.footer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable style={styles.secondary} onPress={estimate ? () => setEstimate(null) : onClose}><Text style={styles.secondaryText}>{estimate ? (language === 'ar' ? 'تعديل' : 'Edit') : t('cancel')}</Text></Pressable>
              <Pressable style={[styles.primary, (estimating || submitting) && styles.disabled]} onPress={estimate ? submit : requestEstimate} disabled={estimating || submitting}>
                {(estimating || submitting) ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.primaryText}>{estimate ? t('submit_request') : t('review_estimate')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.6)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '94%', backgroundColor: Colors.primary, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: Colors.border },
  header: { alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  close: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.surface },
  content: { padding: 16, gap: 10 },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  option: { borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 12, backgroundColor: Colors.card },
  optionActive: { borderColor: Colors.gold },
  optionRow: { alignItems: 'center', gap: 10 },
  optionText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  unitRow: { gap: 8 },
  unit: { flex: 1, padding: 11, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  unitActive: { borderColor: Colors.gold, backgroundColor: Colors.card },
  unitText: { color: Colors.textMuted, fontWeight: '600' },
  unitTextActive: { color: Colors.gold },
  notes: { minHeight: 82, backgroundColor: Colors.inputBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, padding: 12, textAlignVertical: 'top' },
  error: { color: Colors.error, fontSize: 13 },
  summary: { backgroundColor: Colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.gold, gap: 7 },
  summaryTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  summaryLine: { color: Colors.textSecondary, fontSize: 14 },
  estimateAmount: { color: Colors.gold, fontSize: 16, fontWeight: '800' },
  disclaimer: { color: Colors.textMuted, fontSize: 11, lineHeight: 17 },
  footer: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  secondary: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  secondaryText: { color: Colors.textPrimary, fontWeight: '700' },
  primary: { flex: 2, padding: 14, alignItems: 'center', borderRadius: 14, backgroundColor: Colors.gold },
  primaryText: { color: Colors.primary, fontWeight: '800' },
  disabled: { opacity: .6 },
});