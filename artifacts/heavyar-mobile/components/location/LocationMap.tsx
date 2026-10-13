import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { DEFAULT_MAP_CENTER, mapTilerStyleUrl, type PreciseLocation } from '@/services/location';

type MapLibreModule = typeof import('@maplibre/maplibre-react-native');
let cachedMapLibre: MapLibreModule | null | undefined;

function mapLibre(): MapLibreModule | null {
  if (cachedMapLibre !== undefined) return cachedMapLibre;
  try {
    // A guarded runtime load keeps Expo Go on a clear fallback instead of a fatal
    // native-module error. A development/store build is required for the map.
    cachedMapLibre = require('@maplibre/maplibre-react-native') as MapLibreModule;
  } catch {
    cachedMapLibre = null;
  }
  return cachedMapLibre;
}

type Props = {
  location: Pick<PreciseLocation, 'lat' | 'lng'> | null;
  onChange?: (location: { lat: number; lng: number }) => void;
  height?: number;
  language: 'ar' | 'en';
};

export default function LocationMap({ location, onChange, height = 240, language }: Props) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const styleUrl = mapTilerStyleUrl();
  const module = useMemo(mapLibre, []);
  const center = location || DEFAULT_MAP_CENTER;

  if (!styleUrl || !module || failed) {
    const message = !styleUrl
      ? (language === 'ar' ? 'خريطة الموقع غير مهيأة في هذا الإصدار.' : 'The location map is not configured in this build.')
      : !module
        ? (language === 'ar' ? 'الخريطة تحتاج نسخة تطبيق أصلية محدثة.' : 'The map requires an updated native app build.')
        : (language === 'ar' ? 'تعذر تحميل الخريطة. حاول مرة أخرى لاحقًا.' : 'The map could not be loaded. Try again later.');
    return (
      <View style={[styles.fallback, { height }]} accessibilityRole="summary">
        <MapPin size={25} color={Colors.gold} />
        <Text style={styles.fallbackText}>{message}</Text>
      </View>
    );
  }

  const { Map, Camera, Marker } = module;
  return (
    <View style={[styles.frame, { height }]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={styleUrl}
        attribution
        logo={false}
        touchRotate={false}
        touchPitch={false}
        onDidFinishLoadingMap={() => setLoading(false)}
        onDidFailLoadingMap={() => { setLoading(false); setFailed(true); }}
        onPress={onChange ? event => {
          const [lng, lat] = event.nativeEvent.lngLat;
          onChange({ lat, lng });
        } : undefined}
      >
        <Camera center={[center.lng, center.lat]} zoom={location ? 15 : 4.5} duration={200} easing="ease" />
        {location ? (
          <Marker id="heavyar-location" lngLat={[location.lng, location.lat]} anchor="bottom">
            <View style={styles.pin}><MapPin size={23} color={Colors.primary} fill={Colors.gold} /></View>
          </Marker>
        ) : null}
      </Map>
      {loading ? <View style={styles.loading}><ActivityIndicator color={Colors.gold} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,26,47,.45)' },
  fallback: { alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, padding: 18 },
  fallbackText: { color: Colors.textMuted, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  pin: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gold, borderWidth: 2, borderColor: Colors.primary },
});
