import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, I18nManager, Platform } from 'react-native';
import { Image } from 'expo-image';
import { ArrowLeft, ArrowRight, MapPin, Package } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Card } from 'tamagui';
import Colors from '@/constants/colors';
import { Equipment } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { findCityById } from '@/mocks/saudiRegions';
import { getEquipmentThumbnailUrl, getFirstImageUrl } from '@/utils/imageHelpers';
import ListingPriceDisplay from '@/components/ListingPriceDisplay';

interface EquipmentCardProps {
  equipment: Equipment;
  compact?: boolean;
  home?: boolean;
}

export default React.memo(function EquipmentCard({ equipment, compact = false, home = false }: EquipmentCardProps) {
  const { isRTL, t, localizedText } = useLanguage();
  const rowDirection = Platform.OS === 'web'
    ? (isRTL ? 'row-reverse' : 'row')
    : (isRTL === I18nManager.isRTL ? 'row' : 'row-reverse');
  const router = useRouter();
  const original = getFirstImageUrl(equipment.images);
  const imageUrl = getEquipmentThumbnailUrl(original, compact ? 480 : 320);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const city = findCityById(equipment.city);
  const cityName = city ? localizedText(city.nameAr, city.nameEn) : (equipment.customCity || equipment.city);
  const handlePress = useCallback(() => router.push(`/equipment/${equipment.id}`), [equipment.id, router]);
  const premium = true;

  const content = (
    <Pressable accessibilityRole="button" style={({ pressed }) => [
      styles.card,
      premium && styles.homeCard,
      compact ? styles.grid : { flexDirection: rowDirection },
      pressed && styles.cardPressed,
    ]}
      onPress={handlePress} testID={`equipment-card-${equipment.id}`}>
      <View style={compact ? styles.gridImage : [styles.listImage, premium && styles.homeListImage]}>
        {imageUrl && failedUrl !== imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk"
            recyclingKey={imageUrl} transition={0} onError={() => setFailedUrl(imageUrl)} />
        ) : <View style={styles.fallback}><Package size={28} color={Colors.textMuted} /></View>}
        {premium && (
          <View style={styles.availabilityBadge}>
            <View style={[styles.availabilityDot, !equipment.availability && styles.availabilityDotOff]} />
            <Text style={styles.availabilityText}>{equipment.availability ? t('available') : t('unavailable')}</Text>
          </View>
        )}
      </View>
      <View style={[styles.info, premium && styles.homeInfo]}>
        <Text style={[styles.title, premium && styles.homeTitle, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>
          {localizedText(equipment.titleAr, equipment.titleEn)}
        </Text>
        <View style={[styles.location, { flexDirection: rowDirection }]}>
          <MapPin size={12} color={Colors.textMuted} />
          <Text style={styles.locationText} numberOfLines={1}>{cityName}</Text>
        </View>
        {premium ? (
          <View style={[styles.cardFooter, { flexDirection: rowDirection }]}>
            <View style={styles.priceSurface}>
              <ListingPriceDisplay listing={equipment as unknown as import('@/services/listingPricing').ListingPricingSource}
                isRTL={isRTL} compact style={styles.price} textStyle={styles.homePriceText} />
            </View>
            {!compact && (
              <View style={styles.cardArrow}>
                {isRTL ? <ArrowLeft size={15} color={Colors.gold} strokeWidth={2.2} /> : <ArrowRight size={15} color={Colors.gold} strokeWidth={2.2} />}
              </View>
            )}
          </View>
        ) : (
          <>
            <ListingPriceDisplay listing={equipment as unknown as import('@/services/listingPricing').ListingPricingSource}
              isRTL={isRTL} compact style={styles.price} />
            {!equipment.availability && <Text style={styles.unavailable}>{t('unavailable')}</Text>}
          </>
        )}
      </View>
    </Pressable>
  );

  return (
    <Card theme="dark" bg="$surface" borderColor="$borderColor" borderWidth={1} rounded="$lg" elevation={2} style={styles.homeCardShell}>
      {content}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  homeCard: { backgroundColor: 'transparent', borderWidth: 0, borderRadius: 18, marginBottom: 0 },
  homeCardShell: { marginBottom: 12, overflow: 'hidden' },
  grid: { width: '100%', flexDirection: 'column' },
  gridImage: { width: '100%', aspectRatio: 4 / 3, backgroundColor: Colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  listImage: { width: 112, aspectRatio: 1, backgroundColor: Colors.surface, alignSelf: 'center' },
  homeListImage: { borderRadius: 16, margin: 8, overflow: 'hidden', width: 116 },
  image: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, padding: 12, gap: 6 },
  homeInfo: { paddingHorizontal: 12, paddingVertical: 13 },
  title: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '600', minHeight: 40 },
  homeTitle: { fontSize: 16, lineHeight: 22, minHeight: 30, fontWeight: '700' },
  location: { alignItems: 'center', gap: 4 },
  locationText: { color: Colors.textMuted, fontSize: 12, flexShrink: 1 },
  price: { marginTop: 2 },
  homePriceText: { fontSize: 12, lineHeight: 17 },
  cardFooter: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 3 },
  priceSurface: { backgroundColor: 'rgba(241, 182, 29, 0.09)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, flexShrink: 1 },
  cardArrow: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  availabilityBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(1, 17, 48, 0.88)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  availabilityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#42D392' },
  availabilityDotOff: { backgroundColor: Colors.error },
  availabilityText: { color: Colors.textPrimary, fontSize: 9, fontWeight: '700' },
  unavailable: { color: Colors.error, fontSize: 11 },
});
