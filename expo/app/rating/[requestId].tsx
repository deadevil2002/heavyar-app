import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { mockRequests } from '@/mocks/requests';
import { mockUsers } from '@/mocks/users';
import RatingStars from '@/components/RatingStars';

export default function RatingScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { isRTL, t, localizedText } = useLanguage();
  const router = useRouter();
  const [rating, setRating] = useState<number>(0);
  const [review, setReview] = useState<string>('');

  const request = mockRequests.find(r => r.id === requestId);
  const provider = request ? mockUsers.find(u => u.uid === request.providerUid) : null;
  const providerName = provider ? localizedText(provider.nameAr, provider.nameEn) : '';

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const handleSubmit = useCallback(() => {
    if (rating === 0) return;
    Alert.alert(t('success'), '', [
      { text: t('confirm'), onPress: () => router.back() },
    ]);
  }, [rating, t, router]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <BackIcon size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('rate_provider')}</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.content}>
          {provider && (
            <View style={styles.providerInfo}>
              <Image source={{ uri: provider.avatar }} style={styles.avatar} contentFit="cover" />
              <Text style={styles.providerName}>{providerName}</Text>
            </View>
          )}

          <Text style={styles.rateLabel}>{t('rate_experience')}</Text>

          <RatingStars rating={rating} size={40} interactive onRatingChange={setRating} />

          <TextInput
            style={[styles.reviewInput, { textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('write_review')}
            placeholderTextColor={Colors.textMuted}
            value={review}
            onChangeText={setReview}
            multiline
            numberOfLines={5}
          />

          <Pressable
            style={[styles.submitButton, rating === 0 && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={rating === 0}
          >
            <Text style={styles.submitText}>{t('submit_rating')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  header: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 18, fontWeight: '700' as const, color: Colors.textPrimary },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    alignItems: 'center',
    gap: 24,
  },
  providerInfo: { alignItems: 'center', gap: 12 },
  avatar: { width: 80, height: 80, borderRadius: 24, borderWidth: 3, borderColor: Colors.gold },
  providerName: { fontSize: 20, fontWeight: '700' as const, color: Colors.textPrimary },
  rateLabel: { color: Colors.textSecondary, fontSize: 16, fontWeight: '500' as const },
  reviewInput: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    color: Colors.textPrimary,
    fontSize: 15,
    width: '100%',
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  submitButton: {
    backgroundColor: Colors.gold,
    borderRadius: 16,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: Colors.primary, fontSize: 17, fontWeight: '700' as const },
});
