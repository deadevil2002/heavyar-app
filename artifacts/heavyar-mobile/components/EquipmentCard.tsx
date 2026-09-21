import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MapPin, Package } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { Equipment } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { findCityById } from '@/mocks/saudiRegions';
import { getEquipmentThumbnailUrl, getFirstImageUrl } from '@/utils/imageHelpers';
import ListingPriceDisplay from '@/components/ListingPriceDisplay';

interface EquipmentCardProps {
  equipment: Equipment;
  compact?: boolean;
}

export default React.memo(function EquipmentCard({ equipment, compact = false }: EquipmentCardProps) {
  const { isRTL, t, localizedText } = useLanguage();
  const router = useRouter();
  const original = getFirstImageUrl(equipment.images);
  const imageUrl = getEquipmentThumbnailUrl(original, compact ? 480 : 320);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const city = findCityById(equipment.city);
  const cityName = city ? localizedText(city.nameAr, city.nameEn) : (equipment.customCity || equipment.city);
  const handlePress = useCallback(() => router.push(`/equipment/${equipment.id}`), [equipment.id, router]);

  return (
    <Pressable accessibilityRole="button" style={[styles.card, compact ? styles.grid : { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
      onPress={handlePress} testID={`equipment-card-${equipment.id}`}>
      <View style={compact ? styles.gridImage : styles.listImage}>
        {imageUrl && failedUrl !== imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk"
            recyclingKey={imageUrl} transition={0} onError={() => setFailedUrl(imageUrl)} />
        ) : <View style={styles.fallback}><Package size={28} color={Colors.textMuted} /></View>}
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
          {localizedText(equipment.titleAr, equipment.titleEn)}
        </Text>
        <View style={[styles.location, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <MapPin size={12} color={Colors.textMuted} />
          <Text style={styles.locationText} numberOfLines={1}>{cityName}</Text>
        </View>
        <ListingPriceDisplay listing={equipment as unknown as import('@/services/listingPricing').ListingPricingSource}
          isRTL={isRTL} compact style={styles.price} />
        {!equipment.availability && <Text style={styles.unavailable}>{t('unavailable')}</Text>}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  grid: { width: '100%', flexDirection: 'column' },
  gridImage: { width: '100%', aspectRatio: 4 / 3, backgroundColor: Colors.surface },
  listImage: { width: 112, aspectRatio: 1, backgroundColor: Colors.surface, alignSelf: 'center' },
  image: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, padding: 12, gap: 6 },
  title: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '600', minHeight: 40 },
  location: { alignItems: 'center', gap: 4 },
  locationText: { color: Colors.textMuted, fontSize: 12, flexShrink: 1 },
  price: { marginTop: 2 },
  unavailable: { color: Colors.error, fontSize: 11 },
});