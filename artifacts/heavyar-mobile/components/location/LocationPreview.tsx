import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MapPinned, Navigation } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { openExternalDirections } from '@/services/externalNavigation';
import type { PreciseLocation } from '@/services/location';
import LocationMap from './LocationMap';

type Props = {
  location: PreciseLocation;
  language: 'ar' | 'en';
  title?: string;
  compact?: boolean;
};

export default function LocationPreview({ location, language, title, compact = false }: Props) {
  const [error, setError] = useState(false);
  const rtl = language === 'ar';
  const heading = title || (rtl ? 'الموقع المشترك' : 'Shared location');
  return (
    <View style={styles.card}>
      <View style={[styles.heading, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <MapPinned size={18} color={Colors.gold} />
        <Text style={[styles.title, { textAlign: rtl ? 'right' : 'left' }]}>{heading}</Text>
      </View>
      {compact ? (
        <View style={styles.compactPreview}>
          <MapPinned size={28} color={Colors.gold} />
          <Text style={styles.coordinates}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Text>
        </View>
      ) : <LocationMap location={location} language={language} height={210} />}
      {location.instructions ? <Text style={[styles.instructions, { textAlign: rtl ? 'right' : 'left' }]}>{location.instructions}</Text> : null}
      <Text style={[styles.warning, { textAlign: rtl ? 'right' : 'left' }]}>
        {rtl ? 'تحقق من ملاءمة المسار للمعدات الثقيلة؛ تطبيقات الخرائط العادية قد لا تدعم قيود الشاحنات.' : 'Verify heavy-vehicle suitability; standard map apps may not support truck restrictions.'}
      </Text>
      {error ? <Text style={styles.error}>{rtl ? 'تعذر فتح تطبيق خرائط.' : 'Could not open a maps app.'}</Text> : null}
      <Pressable style={styles.button} onPress={async () => setError(await openExternalDirections(location, heading, language) === 'unavailable')} accessibilityRole="button">
        <Navigation size={18} color={Colors.primary} />
        <Text style={styles.buttonText}>{rtl ? 'فتح الاتجاهات' : 'Open directions'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 9 },
  heading: { alignItems: 'center', gap: 7 },
  title: { flex: 1, color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  compactPreview: { minHeight: 86, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.inputBg, alignItems: 'center', justifyContent: 'center', gap: 7 },
  coordinates: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', writingDirection: 'ltr' },
  instructions: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  warning: { color: Colors.textMuted, fontSize: 11, lineHeight: 17 },
  error: { color: Colors.error, fontSize: 12, textAlign: 'center' },
  button: { minHeight: 44, borderRadius: 14, backgroundColor: Colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  buttonText: { color: Colors.primary, fontSize: 13, fontWeight: '800' },
});
