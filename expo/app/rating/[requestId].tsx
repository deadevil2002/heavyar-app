import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchRequestById, fetchUserById, submitRating } from '@/services/firestoreService';
import { useAuth } from '@/contexts/AuthContext';
import { EquipmentRequest, User } from '@/types';
import RatingStars from '@/components/RatingStars';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export default function RatingScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const { isRTL, t, localizedText } = useLanguage();
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const [rating, setRating] = useState<number>(0);
  const [review, setReview] = useState<string>('');
  const [request, setRequest] = useState<EquipmentRequest | null>(null);
  const [provider, setProvider] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const { dialog, showDialog, hideDialog } = useAppDialog();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!requestId) return;
      try {
        const req = await fetchRequestById(requestId);
        if (mounted && req) {
          setRequest(req);
          const prov = await fetchUserById(req.providerUid);
          if (mounted) setProvider(prov);
        }
      } catch (e) {
        console.log('[Rating] Error loading:', e);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [requestId]);

  const providerName = provider ? localizedText(provider.nameAr, provider.nameEn) : '';

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const handleSubmit = useCallback(async () => {
    if (rating === 0 || !request || !currentUser || submitting) return;
    setSubmitting(true);
    try {
      await submitRating({
        requestId: request.id,
        fromUid: currentUser.uid,
        toUid: request.providerUid,
        equipmentId: request.equipmentId,
        stars: rating,
        comment: review,
      });
      showDialog(t('success'), '', [
        { text: t('confirm'), style: 'default', onPress: () => router.back() },
      ]);
    } catch (e) {
      console.error('[Rating] Submit error:', e);
      showDialog(t('error_title'), t('error_generic_message'), [{ text: t('ok'), style: 'default' }]);
    } finally {
      setSubmitting(false);
    }
  }, [rating, review, request, currentUser, submitting, t, router, showDialog]);

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

      <AppDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        buttons={dialog.buttons}
        onClose={hideDialog}
      />
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
