import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { MapPin, Star } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { Equipment } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { mockUsers } from '@/mocks/users';
import { mockCities } from '@/mocks/categories';
import { getFirstImageUrl } from '@/utils/imageHelpers';

interface EquipmentCardProps {
  equipment: Equipment;
  compact?: boolean;
}

export default React.memo(function EquipmentCard({ equipment, compact }: EquipmentCardProps) {
  const { isRTL, t, localizedText } = useLanguage();
  const router = useRouter();
  const owner = mockUsers.find(u => u.uid === equipment.ownerUid);
  const cityObj = mockCities.find(c => c.id === equipment.city);

  const handlePress = useCallback(() => {
    router.push(`/equipment/${equipment.id}`);
  }, [equipment.id, router]);

  const title = localizedText(equipment.titleAr, equipment.titleEn);
  const cityName = cityObj ? localizedText(cityObj.nameAr, cityObj.nameEn) : equipment.city;

  if (compact) {
    return (
      <Pressable style={styles.compactCard} onPress={handlePress} testID={`equipment-card-${equipment.id}`}>
        <Image source={{ uri: getFirstImageUrl(equipment.images) }} style={styles.compactImage} contentFit="cover" />
        <View style={styles.compactInfo}>
          <Text style={[styles.compactTitle, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{title}</Text>
          <View style={[styles.locationRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MapPin size={12} color={Colors.textMuted} />
            <Text style={styles.locationText}>{cityName}</Text>
          </View>
          <Text style={[styles.compactPrice, { textAlign: isRTL ? 'right' : 'left' }]}>
            {equipment.pricePerDay.toLocaleString()} {t('per_day')}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.card} onPress={handlePress} testID={`equipment-card-${equipment.id}`}>
      <View style={styles.imageContainer}>
        <Image source={{ uri: getFirstImageUrl(equipment.images) }} style={styles.image} contentFit="cover" />
        {!equipment.availability && (
          <View style={styles.unavailableBadge}>
            <Text style={styles.unavailableText}>{t('unavailable')}</Text>
          </View>
        )}
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>{equipment.pricePerDay.toLocaleString()} {t('per_day')}</Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={2}>{title}</Text>
        <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.locationRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MapPin size={14} color={Colors.textMuted} />
            <Text style={styles.locationText}>{cityName} - {equipment.district}</Text>
          </View>
          {owner && (
            <View style={[styles.ratingRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Star size={14} color={Colors.gold} fill={Colors.gold} />
              <Text style={styles.ratingText}>{owner.rating}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imageContainer: {
    position: 'relative',
    height: 180,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  unavailableBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: Colors.error,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  unavailableText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  priceBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: Colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  priceText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  info: {
    padding: 14,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  row: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationRow: {
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  ratingRow: {
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  compactCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    overflow: 'hidden',
    width: 200,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  compactImage: {
    width: '100%',
    height: 120,
  },
  compactInfo: {
    padding: 10,
  },
  compactTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  compactPrice: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '700' as const,
    marginTop: 4,
  },
});
