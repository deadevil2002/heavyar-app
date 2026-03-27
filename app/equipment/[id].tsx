import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, TextInput, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, ArrowRight, MapPin, Star, Calendar, Shield, Share2, Heart, Lock, Clock, CalendarDays } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { mockCategories, mockCities } from '@/mocks/categories';
import { fetchEquipmentById, fetchUserById, createRequest } from '@/services/firestoreService';
import { Equipment, User, RequestMode } from '@/types';
import { getImageUrl } from '@/utils/imageHelpers';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isRTL, t, localizedText } = useLanguage();
  const { user: currentUser, isAuthenticated } = useAuth();
  const router = useRouter();
  const [currentImage, setCurrentImage] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [owner, setOwner] = useState<User | null>(null);
  const [_loading, setLoading] = useState<boolean>(true);
  const scrollRef = useRef<ScrollView>(null);
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const [showRequestForm, setShowRequestForm] = useState<boolean>(false);
  const [requestMode, setRequestMode] = useState<RequestMode>('fixed_days');
  const [numberOfDays, setNumberOfDays] = useState<string>('');
  const [requestNotes, setRequestNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const formAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (!id) return;
        const eq = await fetchEquipmentById(id);
        if (mounted && eq) {
          setEquipment(eq);
          const ownerUser = await fetchUserById(eq.ownerUid);
          if (mounted) setOwner(ownerUser);
        }
      } catch (e) {
        console.log('[EquipmentDetail] Error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    Animated.timing(formAnim, {
      toValue: showRequestForm ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [showRequestForm, formAnim]);

  const categoryObj = equipment ? mockCategories.find(c => c.id === equipment.category) : null;
  const cityObj = equipment ? mockCities.find(c => c.id === equipment.city) : null;

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const calculatedAmount = requestMode === 'fixed_days' && numberOfDays
    ? (equipment?.pricePerDay || 0) * parseInt(numberOfDays, 10)
    : 0;
  const platformFee = Math.round(calculatedAmount * 0.1);

  const handleRequestRental = useCallback(() => {
    if (!isAuthenticated || !currentUser) {
      showDialog(
        t('login_required'),
        t('login_required_message'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('go_to_login'), style: 'default', onPress: () => router.push('/login') },
        ]
      );
      return;
    }

    if (!equipment) return;

    if (currentUser.uid === equipment.ownerUid) {
      showDialog(
        t('error_title'),
        t('cannot_request_own'),
        [{ text: t('ok'), style: 'default' }]
      );
      return;
    }

    setShowRequestForm(true);
  }, [isAuthenticated, currentUser, equipment, showDialog, t, router]);

  const handleSubmitRequest = useCallback(async () => {
    if (!equipment || !currentUser) return;

    if (requestMode === 'fixed_days') {
      const days = parseInt(numberOfDays, 10);
      if (!days || days <= 0) {
        showDialog(t('validation_error'), t('validation_days_required'), [{ text: t('ok'), style: 'default' }]);
        return;
      }
    }

    setSubmitting(true);
    try {
      const days = requestMode === 'fixed_days' ? parseInt(numberOfDays, 10) : null;
      const amount = days ? equipment.pricePerDay * days : 0;
      const fee = Math.round(amount * 0.1);

      await createRequest({
        equipmentId: equipment.id,
        customerUid: currentUser.uid,
        providerUid: equipment.ownerUid,
        status: 'pending',
        requestMode,
        numberOfDays: days,
        startDate: new Date().toISOString(),
        endDate: days ? new Date(Date.now() + days * 86400000).toISOString() : '',
        notes: requestNotes.trim(),
        amount,
        platformFee: fee,
        providerAmount: amount - fee,
        paymentStatus: 'unpaid',
        paymentId: '',
        paidAt: null,
        currency: 'SAR',
        allowChat: false,
      });

      setShowRequestForm(false);
      setNumberOfDays('');
      setRequestNotes('');
      showDialog(
        t('success'),
        t('request_sent_success'),
        [{ text: t('ok'), style: 'default', onPress: () => router.back() }]
      );
    } catch (e) {
      console.log('[EquipmentDetail] Request error:', e);
      showDialog(
        t('error_title'),
        t('error_generic_message'),
        [{ text: t('ok'), style: 'default' }]
      );
    } finally {
      setSubmitting(false);
    }
  }, [equipment, currentUser, requestMode, numberOfDays, requestNotes, showDialog, t, router]);

  const handleContactProvider = () => {
    if (!isAuthenticated) {
      showDialog(
        t('login_required'),
        t('login_required_message'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('go_to_login'), style: 'default', onPress: () => router.push('/login') },
        ]
      );
      return;
    }
  };

  if (!equipment) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <Text style={styles.errorText}>{t('error_occurred')}</Text>
        </SafeAreaView>
      </View>
    );
  }

  const title = localizedText(equipment.titleAr, equipment.titleEn);
  const description = localizedText(equipment.descriptionAr, equipment.descriptionEn);
  const cityName = cityObj ? localizedText(cityObj.nameAr, cityObj.nameEn) : equipment.city;
  const categoryName = categoryObj ? localizedText(categoryObj.nameAr, categoryObj.nameEn) : equipment.category;
  const ownerName = owner ? localizedText(owner.nameAr, owner.nameEn) : '';

  const formHeight = formAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 380],
  });

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.imageCarousel}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setCurrentImage(index);
            }}
          >
            {equipment.images.map((img, i) => (
              <Image key={i} source={{ uri: getImageUrl(img) }} style={styles.carouselImage} contentFit="cover" />
            ))}
          </ScrollView>

          <SafeAreaView edges={['top']} style={styles.imageOverlay}>
            <View style={[styles.imageActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable style={styles.backButton} onPress={() => router.back()}>
                <BackIcon size={22} color={Colors.white} />
              </Pressable>
              <View style={[styles.imageActionsRight, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Pressable style={styles.actionButton} onPress={() => setLiked(!liked)}>
                  <Heart size={20} color={liked ? Colors.error : Colors.white} fill={liked ? Colors.error : 'transparent'} />
                </Pressable>
                <Pressable style={styles.actionButton}>
                  <Share2 size={20} color={Colors.white} />
                </Pressable>
              </View>
            </View>
          </SafeAreaView>

          <View style={styles.dotsContainer}>
            {equipment.images.map((_, i) => (
              <View key={i} style={[styles.dot, currentImage === i && styles.dotActive]} />
            ))}
          </View>

          {equipment.availability ? (
            <View style={styles.availableBadge}>
              <Text style={styles.availableText}>{t('available')}</Text>
            </View>
          ) : (
            <View style={styles.unavailableBadge}>
              <Text style={styles.unavailableText}>{t('unavailable')}</Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <View style={[styles.titleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
              <Text style={[styles.categoryText, { textAlign: isRTL ? 'right' : 'left' }]}>{categoryName}</Text>
            </View>
            <View style={styles.priceTag}>
              <Text style={styles.priceValue}>{equipment.pricePerDay.toLocaleString()}</Text>
              <Text style={styles.priceUnit}>{t('per_day')}</Text>
            </View>
          </View>

          <View style={[styles.locationRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <MapPin size={16} color={Colors.gold} />
            <Text style={styles.locationText}>{cityName} - {equipment.district}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={[styles.sectionTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('description')}</Text>
          <Text style={[styles.descriptionText, { textAlign: isRTL ? 'right' : 'left' }]}>{description}</Text>

          <View style={styles.divider} />

          {owner && (
            <>
              <Text style={[styles.sectionTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('owner')}</Text>
              <Pressable style={[styles.ownerCard, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={handleContactProvider}>
                <Image source={{ uri: owner.avatar || undefined }} style={styles.ownerAvatar} contentFit="cover" />
                <View style={[styles.ownerInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.ownerNameRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={styles.ownerName}>{ownerName}</Text>
                    {owner.isVerified && <Shield size={14} color={Colors.success} />}
                  </View>
                  <View style={[styles.ownerRating, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Star size={14} color={Colors.gold} fill={Colors.gold} />
                    <Text style={styles.ownerRatingText}>{owner.rating} ({owner.totalRatings} {t('rating_count')})</Text>
                  </View>
                  <Text style={styles.ownerEquipment}>{owner.equipmentCount} {t('equipment_count')}</Text>
                </View>
              </Pressable>
            </>
          )}

          {showRequestForm && (
            <Animated.View style={[styles.requestFormContainer, { maxHeight: formHeight, opacity: formAnim }]}>
              <View style={styles.requestForm}>
                <Text style={[styles.sectionTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('rental_mode')}</Text>

                <View style={styles.modeSelector}>
                  <Pressable
                    style={[styles.modeButton, requestMode === 'fixed_days' && styles.modeButtonActive]}
                    onPress={() => setRequestMode('fixed_days')}
                  >
                    <CalendarDays size={20} color={requestMode === 'fixed_days' ? Colors.primary : Colors.textMuted} />
                    <Text style={[styles.modeText, requestMode === 'fixed_days' && styles.modeTextActive]}>
                      {t('fixed_days')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modeButton, requestMode === 'open_ended' && styles.modeButtonActive]}
                    onPress={() => setRequestMode('open_ended')}
                  >
                    <Clock size={20} color={requestMode === 'open_ended' ? Colors.primary : Colors.textMuted} />
                    <Text style={[styles.modeText, requestMode === 'open_ended' && styles.modeTextActive]}>
                      {t('open_ended')}
                    </Text>
                  </Pressable>
                </View>

                {requestMode === 'fixed_days' && (
                  <View style={styles.daysInput}>
                    <Text style={[styles.inputLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('number_of_days')}</Text>
                    <TextInput
                      style={[styles.daysField, { textAlign: isRTL ? 'right' : 'left' }]}
                      placeholder={t('enter_days')}
                      placeholderTextColor={Colors.textMuted}
                      value={numberOfDays}
                      onChangeText={setNumberOfDays}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                )}

                <TextInput
                  style={[styles.notesField, { textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t('request_notes_placeholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={requestNotes}
                  onChangeText={setRequestNotes}
                  multiline
                  numberOfLines={3}
                />

                {requestMode === 'fixed_days' && numberOfDays && parseInt(numberOfDays, 10) > 0 ? (
                  <View style={styles.pricePreview}>
                    <View style={[styles.pricePreviewRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <Text style={styles.pricePreviewLabel}>{t('estimated_total')}</Text>
                      <Text style={styles.pricePreviewValue}>{calculatedAmount.toLocaleString()} {t('sar')}</Text>
                    </View>
                    <View style={[styles.pricePreviewRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <Text style={styles.pricePreviewLabel}>{t('platform_fee')}</Text>
                      <Text style={styles.pricePreviewFee}>{platformFee.toLocaleString()} {t('sar')}</Text>
                    </View>
                  </View>
                ) : requestMode === 'open_ended' ? (
                  <View style={styles.pricePreview}>
                    <Text style={styles.openEndedNote}>{t('price_on_completion')}</Text>
                  </View>
                ) : null}

                <View style={styles.formActions}>
                  <Pressable style={styles.cancelFormButton} onPress={() => setShowRequestForm(false)}>
                    <Text style={styles.cancelFormText}>{t('cancel')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.submitFormButton, submitting && { opacity: 0.6 }]}
                    onPress={handleSubmitRequest}
                    disabled={submitting}
                  >
                    <Text style={styles.submitFormText}>{submitting ? t('processing') : t('submit_request')}</Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          )}

          {!isAuthenticated && (
            <View style={styles.authBanner}>
              <Lock size={18} color={Colors.gold} />
              <Text style={styles.authBannerText}>{t('login_required_message')}</Text>
              <Pressable style={styles.authBannerButton} onPress={() => router.push('/login')}>
                <Text style={styles.authBannerButtonText}>{t('go_to_login')}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>

      {equipment.availability && !showRequestForm && (
        <View style={styles.bottomBar}>
          <SafeAreaView edges={['bottom']}>
            <View style={[styles.bottomContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View>
                <Text style={styles.bottomPrice}>{equipment.pricePerDay.toLocaleString()} {t('sar')}</Text>
                <Text style={styles.bottomPerDay}>{t('per_day')}</Text>
              </View>
              <Pressable style={styles.requestButton} onPress={handleRequestRental}>
                <Calendar size={18} color={Colors.primary} />
                <Text style={styles.requestButtonText}>{t('request_rental')}</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      )}

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
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  imageCarousel: {
    position: 'relative',
    height: 320,
  },
  carouselImage: {
    width: SCREEN_WIDTH,
    height: 320,
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  imageActions: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageActionsRight: {
    gap: 10,
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: Colors.white,
    width: 20,
  },
  availableBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: Colors.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  availableText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  unavailableBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: Colors.error,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  unavailableText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  content: {
    padding: 20,
  },
  titleRow: {
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    flex: 1,
  },
  categoryText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  priceTag: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  priceValue: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  priceUnit: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '500' as const,
  },
  locationRow: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  locationText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  ownerCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ownerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  ownerInfo: {
    flex: 1,
    gap: 4,
  },
  ownerNameRow: {
    alignItems: 'center',
    gap: 6,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  ownerRating: {
    alignItems: 'center',
    gap: 4,
  },
  ownerRatingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  ownerEquipment: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  requestFormContainer: {
    marginTop: 20,
    overflow: 'hidden',
  },
  requestForm: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.gold,
    gap: 14,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.inputBg,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  modeButtonActive: {
    borderColor: Colors.gold,
    backgroundColor: Colors.gold,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textMuted,
  },
  modeTextActive: {
    color: Colors.primary,
  },
  daysInput: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  daysField: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notesField: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  pricePreview: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  pricePreviewRow: {
    justifyContent: 'space-between',
  },
  pricePreviewLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  pricePreviewValue: {
    color: Colors.gold,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  pricePreviewFee: {
    color: Colors.warning,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  openEndedNote: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelFormButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelFormText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  submitFormButton: {
    flex: 2,
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitFormText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  authBanner: {
    marginTop: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  authBannerText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  authBannerButton: {
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 4,
  },
  authBannerButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  bottomSpacer: {
    height: 140,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  bottomContent: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  bottomPrice: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.gold,
  },
  bottomPerDay: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  requestButton: {
    flexDirection: 'row',
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  requestButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
