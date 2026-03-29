import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { EquipmentRequest, Equipment } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchEquipmentById } from '@/services/firestoreService';
import { getFirstImageUrl } from '@/utils/imageHelpers';
import StatusBadge from './StatusBadge';

interface RequestCardProps {
  request: EquipmentRequest;
}

export default React.memo(function RequestCard({ request }: RequestCardProps) {
  const { isRTL, t, localizedText } = useLanguage();
  const router = useRouter();
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const eq = await fetchEquipmentById(request.equipmentId);
        if (mounted) setEquipment(eq);
      } catch (e) {
        console.log('[RequestCard] Error fetching equipment:', e);
      }
    };
    if (request.equipmentId) {
      void load();
    }
    return () => { mounted = false; };
  }, [request.equipmentId]);

  const handlePress = useCallback(() => {
    router.push(`/request/${request.id}`);
  }, [request.id, router]);

  const title = equipment ? localizedText(equipment.titleAr, equipment.titleEn) : '...';
  const imageUrl = equipment ? getFirstImageUrl(equipment.images) : '';
  const ChevronIcon = isRTL ? ChevronLeft : ChevronRight;
  const requestMode = request.requestMode || 'fixed_duration';
  const isOpenEnded = requestMode === 'open_ended';

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
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
              <Text style={styles.dateText}>{formatDate(request.startDate)} - {t('until_work_completion')}</Text>
            ) : (
              <Text style={styles.dateText}>{formatDate(request.startDate)} - {formatDate(request.endDate)}</Text>
            )}
          </View>
          <View style={[styles.bottomRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <StatusBadge status={request.status} />
            <Text style={styles.amount}>{request.amount.toLocaleString()} {t('sar')}</Text>
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
