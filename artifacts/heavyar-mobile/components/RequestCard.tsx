import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { EquipmentRequest, Equipment } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { getFirstImageUrl } from '@/utils/imageHelpers';
import StatusBadge from './StatusBadge';
import { formatMinorAmount } from '@/services/rentalV2';

interface RequestCardProps {
  request: EquipmentRequest;
  equipment?: Equipment | null;
}

export default React.memo(function RequestCard({ request, equipment = null }: RequestCardProps) {
  const { isRTL, t, localizedText } = useLanguage();
  const router = useRouter();
  const handlePress = useCallback(() => {
    router.push(`/request/${request.id}`);
  }, [request.id, router]);

  const title = equipment
    ? localizedText(equipment.titleAr, equipment.titleEn)
    : request.equipmentSnapshot
      ? localizedText(request.equipmentSnapshot.titleAr, request.equipmentSnapshot.titleEn)
      : t('equipment_no_longer_available');
  const imageUrl = equipment ? getFirstImageUrl(equipment.images) : getFirstImageUrl(request.equipmentSnapshot?.images || []);
  const ChevronIcon = isRTL ? ChevronLeft : ChevronRight;
  const requestMode = request.pricingModelVersion === 2 ? request.rentalMode : (request.requestMode || 'fixed_days');
  const isOpenEnded = requestMode === 'open_ended';

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat(isRTL ? 'ar-SA' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(request.pricingModelVersion === 2 && request.rentalMode !== 'daily' ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZone: request.pricingSnapshot?.marketTimezone,
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  return (
    <Pressable style={styles.card} onPress={handlePress} testID={`request-card-${request.id}`}>
      <View style={[styles.content, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]} />
        )}
        <View style={[styles.info, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{title}</Text>
          <View style={[styles.dateRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Calendar size={14} color={Colors.textMuted} />
            {isOpenEnded ? (
               <Text style={styles.dateText}>{formatDate(request.requestedStartAt || request.startDate)} — {t('until_work_completion')}</Text>
            ) : (
               <Text style={styles.dateText}>{formatDate(request.requestedStartAt || request.startDate)} — {formatDate(request.requestedEndAt || request.endDate)}</Text>
            )}
          </View>
          <View style={[styles.bottomRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <StatusBadge status={request.status} />
            <Text style={styles.amount}>
              {request.pricingModelVersion === 2 && request.pricingSnapshot
                ? formatMinorAmount(request.pricingSnapshot.baseAmountMinor as number || request.pricingSnapshot.rateAmountMinor, request.pricingSnapshot.currency, isRTL ? 'ar' : 'en')
                : `${request.amount.toLocaleString()} ${request.currency || t('sar')}`}
            </Text>
          </View>
        </View>
        <ChevronIcon size={20} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  content: {
    alignItems: 'center',
    gap: 12,
  },
  image: {
    width: 70,
    height: 70,
    borderRadius: 12,
  },
  imagePlaceholder: {
    backgroundColor: Colors.surface,
  },
  info: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  dateRow: {
    alignItems: 'center',
    gap: 5,
  },
  dateText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  bottomRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  amount: {
    color: Colors.gold,
    fontSize: 14,
    fontWeight: '700' as const,
  },
});
