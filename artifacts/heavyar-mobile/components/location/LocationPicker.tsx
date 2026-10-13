import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Crosshair, MapPin, RotateCcw } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { requestForegroundDeviceLocation } from '@/services/deviceLocation';
import { buildPreciseLocation, decodePreciseLocation, type PreciseLocation } from '@/services/location';
import LocationMap from './LocationMap';

type Props = {
  value: PreciseLocation | null;
  onConfirm: (location: PreciseLocation) => void;
  language: 'ar' | 'en';
  instructions?: boolean;
};

export default function LocationPicker({ value, onConfirm, language, instructions = true }: Props) {
  const [draft, setDraft] = useState<PreciseLocation | null>(() => decodePreciseLocation(value));
  const [note, setNote] = useState(value?.instructions || '');
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState<'idle' | 'confirmed' | 'denied' | 'unavailable' | 'invalid'>('idle');
  const rtl = language === 'ar';

  useEffect(() => {
    setDraft(decodePreciseLocation(value));
    setNote(value?.instructions || '');
    setStatus(value ? 'confirmed' : 'idle');
  }, [value]);

  const requestDeviceLocation = async () => {
    setLocating(true);
    const result = await requestForegroundDeviceLocation();
    setLocating(false);
    if (result.status !== 'ok') return setStatus(result.status);
    setDraft(result.location);
    setStatus('idle');
  };

  const confirm = () => {
    if (!draft) return;
    try {
      const location = buildPreciseLocation(draft, instructions ? note : undefined);
      onConfirm(location);
      setStatus('confirmed');
    } catch {
      setStatus('invalid');
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.heading, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <MapPin size={18} color={Colors.gold} />
        <Text style={styles.title}>{rtl ? 'الموقع الدقيق' : 'Precise location'}</Text>
      </View>
      <Text style={[styles.hint, { textAlign: rtl ? 'right' : 'left' }]}>
        {rtl ? 'اضغط الخريطة لتحريك الدبوس، ثم أكّد الموقع قبل الحفظ.' : 'Tap the map to move the pin, then confirm it before saving.'}
      </Text>
      <LocationMap
        location={draft}
        language={language}
        onChange={coordinates => { setDraft({ ...coordinates, ...(note.trim() ? { instructions: note.trim() } : {}) }); setStatus('idle'); }}
      />
      {instructions ? (
        <TextInput
          value={note}
          onChangeText={value => { setNote(value); setStatus('idle'); }}
          maxLength={500}
          multiline
          style={[styles.instructions, { textAlign: rtl ? 'right' : 'left' }]}
          placeholder={rtl ? 'تعليمات الوصول للموقع (اختياري)' : 'Site access instructions (optional)'}
          placeholderTextColor={Colors.textMuted}
        />
      ) : null}
      {status === 'denied' || status === 'unavailable' || status === 'invalid' ? (
        <Text style={[styles.error, { textAlign: rtl ? 'right' : 'left' }]}>
          {status === 'denied'
            ? (rtl ? 'لم يُمنح إذن الموقع. يمكنك تثبيت الدبوس يدويًا.' : 'Location permission was not granted. You can place the pin manually.')
            : status === 'unavailable'
              ? (rtl ? 'تعذر تحديد موقع الجهاز. ثبّت الدبوس يدويًا.' : 'Device location is unavailable. Place the pin manually.')
              : (rtl ? 'بيانات الموقع غير صالحة. عدّل الدبوس أو التعليمات.' : 'The location data is invalid. Adjust the pin or instructions.')}
        </Text>
      ) : null}
      <View style={[styles.actions, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <Pressable style={styles.secondary} onPress={() => void requestDeviceLocation()} disabled={locating} accessibilityRole="button">
          {locating ? <ActivityIndicator size="small" color={Colors.gold} /> : <Crosshair size={18} color={Colors.gold} />}
          <Text style={styles.secondaryText}>{rtl ? 'استخدم موقعي' : 'Use my location'}</Text>
        </Pressable>
        <Pressable style={[styles.confirm, !draft && styles.disabled]} onPress={confirm} disabled={!draft} accessibilityRole="button">
          {status === 'confirmed' ? <Check size={18} color={Colors.primary} /> : <RotateCcw size={18} color={Colors.primary} />}
          <Text style={styles.confirmText}>{status === 'confirmed' ? (rtl ? 'تم التأكيد' : 'Confirmed') : (rtl ? 'تأكيد الدبوس' : 'Confirm pin')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  heading: { alignItems: 'center', gap: 7 },
  title: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  hint: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  instructions: { minHeight: 64, color: Colors.textPrimary, backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 12, textAlignVertical: 'top' },
  actions: { gap: 9 },
  secondary: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 10 },
  secondaryText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '700' },
  confirm: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 10 },
  confirmText: { color: Colors.primary, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: .45 },
  error: { color: Colors.error, fontSize: 12, lineHeight: 18 },
});
