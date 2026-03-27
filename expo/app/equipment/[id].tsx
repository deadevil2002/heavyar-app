import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, ArrowRight, MapPin, Star, Calendar, Shield, Share2, Heart, Lock } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { mockCategories, mockCities } from '@/mocks/categories';
import { fetchEquipmentById, fetchUserById, createRequest } from '@/services/firestoreService';
import { Equipment, User } from '@/types';
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

  const categoryObj = equipment ? mockCategories.find(c => c.id === equipment.category) : null;
  const cityObj = equipment ? mockCities.find(c => c.id === equipment.city) : null;

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

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

  const handleRequestRental = () => {
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

    showDialog(
      t('request_rental'),
      t('confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          style: 'default',
          onPress: async () => {
            try {
              const days = 5;
              const amount = equipment.pricePerDay * days;
              const platformFee = Math.round(amount * 0.1);
              await createRequest({
                equipmentId: equipment.id,
                customerUid: currentUser.uid,
                providerUid: equipment.ownerUid,
                status: 'pending',
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + days * 86400000).toISOString(),
                notes: '',
                amount,
                platformFee,
                providerAmount: amount - platformFee,
                paymentStatus: 'unpaid',
                paymentId: '',
                paidAt: null,
                currency: 'SAR',
                allowChat: false,
              });
              showDialog(
                t('success'),
                t('request_sent_success'),
                [{ text: t('ok'), style: 'default', onPress: () => router.back() }]
              );
            } catch (e) {
              console.error('[EquipmentDetail] Request error:', e);
              showDialog(
                t('error_title'),
                t('error_generic_message'),
                [{ text: t('ok'), style: 'default' }]
              );
            }
          },
        },
      ]
    );
  };

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
                <Image source={{ uri: owner.avatar }} style={styles.ownerAvatar} contentFit="cover" />
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

      {equipment.availability && (
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
    height: 100,
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
