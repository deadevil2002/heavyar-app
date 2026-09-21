import React, { useState, useCallback, useRef, useLayoutEffect, memo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Camera, X, ChevronDown, Upload, Lock, Briefcase } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { mockCategories } from '@/mocks/categories';
import { saudiRegions, getCitiesByRegion, findCityById } from '@/mocks/saudiRegions';
import { uploadMultipleImages, deleteCloudinaryImage, CloudinaryImage } from '@/services/cloudinaryService';
import { createListing } from '@/services/workerClient';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { preferredDisplayCurrency } from '@/services/currency';
import { safeErrorMessage } from '@/services/errorMessages';
import ListingPricingFields from '@/components/ListingPricingFields';
import { mobilePerformance } from '@/utils/mobilePerformance';
import {
  buildListingPricing,
  ListingPricingInput,
} from '@/services/listingPricing';

const initialPricing = (): ListingPricingInput => ({
  hourlyEnabled: false, hourlyAmount: '', dailyEnabled: true, dailyAmount: '',
});

// Keep rate keystrokes inside this section. The ref is a screen-local submit
// snapshot, not shared state; it is updated synchronously before submit can run.
const PricingSection = memo(function PricingSection({
  draft, currency, isRTL, disabled,
}: {
  draft: React.MutableRefObject<ListingPricingInput>;
  currency: string;
  isRTL: boolean;
  disabled: boolean;
}) {
  mobilePerformance.countRender('AddEquipment.Pricing');
  const [value, setValue] = useState(() => draft.current);
  const pending = useRef<ReturnType<typeof mobilePerformance.startPress> | null>(null);
  useLayoutEffect(() => { pending.current?.visible(); pending.current = null; });
  const onChange = useCallback((next: ListingPricingInput) => {
    pending.current = mobilePerformance.startPress('AddEquipment.pricing');
    draft.current = next;
    setValue(next);
  }, [draft]);
  return <ListingPricingFields value={value} onChange={onChange} currency={currency} isRTL={isRTL} disabled={disabled} />;
});

const ImagesSection = memo(function ImagesSection({ images, label, isRTL, pickImage, removeImage }: {
  images: string[]; label: string; isRTL: boolean;
  pickImage: () => void; removeImage: (index: number) => void;
}) {
  mobilePerformance.countRender('AddEquipment.Images');
  return (
    <View style={styles.imagesSection}>
      <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.imagesRow}>
          <Pressable style={styles.addImageButton} onPress={pickImage}>
            <Camera size={28} color={Colors.gold} />
            <Text style={styles.addImageText}>{label}</Text>
          </Pressable>
          {images.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.imageWrapper}>
              <Image source={{ uri }} style={styles.imagePreview} contentFit="cover" cachePolicy="memory-disk" />
              <Pressable style={styles.removeImage} onPress={() => removeImage(index)}>
                <X size={14} color={Colors.white} />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});

export default function AddEquipmentScreen() {
  const auth = useAuth();
  const uid = auth.isAuthenticated ? auth.user?.uid : undefined;
  const activeUid = useRef(uid);
  activeUid.current = uid;
  // One identity owns the entire draft, including refs, pickers and dialogs.
  return <AddEquipmentForm key={uid || 'signed-out'} auth={auth} activeUid={activeUid} />;
}

function AddEquipmentForm({ auth, activeUid }: {
  auth: ReturnType<typeof useAuth>;
  activeUid: React.MutableRefObject<string | undefined>;
}) {
  mobilePerformance.countRender('AddEquipment');
  const { isRTL, t, localizedText } = useLanguage();
  const { user, isAuthenticated, requiresEmailVerification } = auth;
  const mounted = useRef(true);
  const publishingRef = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const ownsDraft = useCallback(() => mounted.current && !!user?.uid && activeUid.current === user.uid, [activeUid, user?.uid]);
  const router = useRouter();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const [titleAr, setTitleAr] = useState<string>('');
  const [titleEn, setTitleEn] = useState<string>('');
  const [descAr, setDescAr] = useState<string>('');
  const [descEn, setDescEn] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<string>('');
  const [region, setRegion] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [customCity, setCustomCity] = useState<string>('');
  const [district, setDistrict] = useState<string>('');
  const [showRegionPicker, setShowRegionPicker] = useState<boolean>(false);
  const [citySearch, setCitySearch] = useState<string>('');
  const pricingDraft = useRef<ListingPricingInput>(initialPricing());
  const [pricingRevision, setPricingRevision] = useState(0);
  const pendingInteraction = useRef<ReturnType<typeof mobilePerformance.startPress> | null>(null);
  useLayoutEffect(() => { pendingInteraction.current?.visible(); pendingInteraction.current = null; });
  const beginLocalInteraction = useCallback(() => {
    pendingInteraction.current = mobilePerformance.startPress('AddEquipment.local');
  }, []);
  const [images, setImages] = useState<string[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState<boolean>(false);
  const [showCityPicker, setShowCityPicker] = useState<boolean>(false);

  const selectedRegion = React.useMemo(() => saudiRegions.find(r => r.id === region), [region]);
  const regionCities = React.useMemo(() => getCitiesByRegion(region), [region]);
  const filteredCities = React.useMemo(() => {
    if (!citySearch.trim()) return regionCities;
    const q = citySearch.toLowerCase();
    return regionCities.filter(c => c.nameAr.includes(q) || c.nameEn.toLowerCase().includes(q));
  }, [regionCities, citySearch]);
  const selectedCityObj = React.useMemo(() => findCityById(city), [city]);
  const [_uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [publishing, setPublishing] = useState<boolean>(false);

  const isProvider = user?.role === 'provider';

  const pickImage = useCallback(async () => {
    if (!ownsDraft()) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!ownsDraft()) return;
    if (!perm.granted) {
      showDialog('إذن مرفوض', 'يرجى السماح بالوصول للصور لاختيار صور المعدات', [{ text: 'حسناً', style: 'default' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!ownsDraft()) return;
    if (!result.canceled && result.assets) {
      setImages(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  }, [showDialog, ownsDraft]);

  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handlePublish = useCallback(async () => {
    if (!user || !ownsDraft() || publishingRef.current) return;
    if (requiresEmailVerification('listing')) {
      showDialog(t('email_verification_required_title'), t('email_verification_required_listing'), [{ text: t('ok'), style: 'default' }]);
      return;
    }

    if (!titleAr.trim()) {
      showDialog(t('validation_error'), t('validation_title_ar_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!category) {
      showDialog(t('validation_error'), t('validation_category_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (category === 'other' && !customCategory.trim()) {
      showDialog(t('validation_error'), 'يرجى إدخال اسم الفئة', [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!city && !customCity.trim()) {
      showDialog(t('validation_error'), t('validation_city_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    const currency = user.nativeCurrency || 'SAR';
    const pricingResult = buildListingPricing(pricingDraft.current, currency);
    if (!pricingResult.ok) {
      const message = pricingResult.reason === 'RATE_REQUIRED'
        ? (isRTL ? 'فعّل سعراً واحداً على الأقل.' : 'Enable at least one rental rate.')
        : (isRTL ? 'أدخل سعراً موجباً صالحاً بدقة العملة المحددة.' : 'Enter a valid positive rate using the currency precision shown.');
      showDialog(t('validation_error'), message, [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (images.length === 0) {
      showDialog(t('validation_error'), t('validation_images_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    // Lock synchronously; a second press can arrive before React commits.
    publishingRef.current = true;
    const submitUid = user.uid;
    const isCurrentSubmission = () => ownsDraft() && activeUid.current === submitUid;
    setPublishing(true);
    setUploading(true);
    setUploadProgress(`${t('uploading_images')} 0/${images.length}`);
    let uploadedImages: CloudinaryImage[] = [];
    let listingSubmitted = false;
    let listingCommitted = false;
    try {
      if (!isCurrentSubmission()) return;
      uploadedImages = await uploadMultipleImages(
        images,
        (completed, total) => {
          if (!isCurrentSubmission()) return;
          setUploadProgress(`${t('uploading_images')} ${completed}/${total}`);
        },
        submitUid,
      );
      if (!isCurrentSubmission()) return;
      setUploading(false);
      setUploadProgress(t('saving'));

      listingSubmitted = true;
      await createListing({
        titleAr,
        titleEn: titleEn || titleAr,
        descriptionAr: descAr,
        descriptionEn: descEn || descAr,
        category,
        customCategory: category === 'other' ? customCategory.trim() : '',
        region,
        city,
        customCity,
        district,
        location: { lat: 0, lng: 0 },
        pricingModelVersion: pricingResult.pricingModelVersion,
        pricing: pricingResult.pricing,
        countryCode: user.countryCode || 'SA',
        nativeCurrency: user.nativeCurrency || 'SAR',
        displayCurrency: preferredDisplayCurrency(user.countryCode, user.displayCurrency),
        images: uploadedImages,
        availability: { from: new Date().toISOString().slice(0, 10), temporarilyUnavailable: false },
      }, submitUid);
      listingCommitted = true;
      if (!isCurrentSubmission()) return;
      showDialog(t('success'), '', [{ text: t('confirm'), style: 'default' }]);
      setTitleAr('');
      setTitleEn('');
      setDescAr('');
      setDescEn('');
      setCategory('');
      setCustomCategory('');
      setRegion('');
      setCity('');
      setCustomCity('');
      setDistrict('');
      pricingDraft.current = initialPricing();
      setPricingRevision(revision => revision + 1);
      setImages([]);
    } catch (e) {
      // Never issue cleanup under a different authenticated identity.
      if (!isCurrentSubmission()) return;
      const failure = e as { code?: unknown; status?: unknown } | null;
      const transportFailure = failure?.code === 'NETWORK_TIMEOUT' || failure?.code === 'NETWORK_UNAVAILABLE'
        || failure?.code === 'AUTH_SESSION_CHANGED';
      const definitiveRejection = !transportFailure && typeof failure?.status === 'number'
        && failure.status >= 400 && failure.status < 500 && failure.status !== 408;
      const uncertainOutcome = listingSubmitted && !listingCommitted && !definitiveRejection;
      // A lost response is not a rejected write. Never delete media that the
      // Worker may already have attached to a listing, or retry implicitly.
      if (!listingCommitted && (!listingSubmitted || definitiveRejection)) {
        await Promise.allSettled(uploadedImages.map(image => deleteCloudinaryImage(image.publicId)));
      }
      if (!isCurrentSubmission()) return;
      const message = safeErrorMessage(e, isRTL ? 'ar' : 'en');
      showDialog(t('error_title'), uncertainOutcome
        ? `${message}\n${isRTL ? 'تعذر تأكيد النشر. تحقق من إعلاناتك قبل المحاولة مجددًا.' : 'Publishing could not be confirmed. Check your listings before trying again.'}`
        : message, [{ text: t('ok'), style: 'default' }]);
    } finally {
      publishingRef.current = false;
      if (isCurrentSubmission()) {
        setPublishing(false);
        setUploading(false);
        setUploadProgress('');
      }
    }
  }, [titleAr, titleEn, descAr, descEn, category, customCategory, region, city, customCity, district, images, user, t, showDialog, requiresEmailVerification, isRTL, ownsDraft, activeUid]);

  const selectedCategory = mockCategories.find(c => c.id === category);

  if (!isAuthenticated || !user) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.blockedContainer}>
            <Lock size={48} color={Colors.textMuted} />
            <Text style={styles.blockedTitle}>{t('login_required')}</Text>
            <Text style={styles.blockedDesc}>{t('login_required_message')}</Text>
            <Pressable style={styles.blockedButton} onPress={() => router.push('/login')}>
              <Text style={styles.blockedButtonText}>{t('go_to_login')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!isProvider) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.blockedContainer}>
            <Briefcase size={48} color={Colors.textMuted} />
            <Text style={styles.blockedTitle}>{t('provider_only')}</Text>
            <Text style={styles.blockedDesc}>{t('role_provider_desc')}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('create_listing')}</Text>
          </View>

          <View style={styles.form}>
            <ImagesSection images={images} label={t('add_images')} isRTL={isRTL} pickImage={pickImage} removeImage={removeImage} />

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('title_ar')}</Text>
              <TextInput
                style={[styles.textInput, { textAlign: isRTL ? 'right' : 'left' }]}
                value={titleAr}
                onChangeText={setTitleAr}
                placeholder={t('title_ar')}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('title_en')}</Text>
              <TextInput
                style={[styles.textInput, { textAlign: 'left' }]}
                value={titleEn}
                onChangeText={setTitleEn}
                placeholder={t('title_en')}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('description_ar')}</Text>
              <TextInput
                style={[styles.textArea, { textAlign: isRTL ? 'right' : 'left' }]}
                value={descAr}
                onChangeText={setDescAr}
                placeholder={t('description_ar')}
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('description_en')}</Text>
              <TextInput
                style={[styles.textArea, { textAlign: 'left' }]}
                value={descEn}
                onChangeText={setDescEn}
                placeholder={t('description_en')}
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_category')}</Text>
              <Pressable
                style={[styles.picker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                onPress={() => { beginLocalInteraction(); setShowCategoryPicker(!showCategoryPicker); }}
              >
                <Text style={[styles.pickerText, !category && styles.pickerPlaceholder]}>
                  {selectedCategory ? localizedText(selectedCategory.nameAr, selectedCategory.nameEn) : t('select_category')}
                </Text>
                <ChevronDown size={20} color={Colors.textMuted} />
              </Pressable>
              {showCategoryPicker && (
                <View style={styles.pickerDropdown}>
                  {mockCategories.map(cat => (
                    <Pressable
                      key={cat.id}
                      style={[styles.pickerItem, category === cat.id && styles.pickerItemSelected]}
                      onPress={() => { beginLocalInteraction(); setCategory(cat.id); if (cat.id !== 'other') setCustomCategory(''); setShowCategoryPicker(false); }}
                    >
                      <Text style={[styles.pickerItemText, category === cat.id && styles.pickerItemTextSelected]}>
                        {localizedText(cat.nameAr, cat.nameEn)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {category === 'other' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>اسم الفئة</Text>
                <TextInput
                  style={[styles.textInput, { textAlign: isRTL ? 'right' : 'left' }]}
                  value={customCategory}
                  onChangeText={setCustomCategory}
                  placeholder="مثال: معدات زراعية"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_region')}</Text>
              <Pressable
                style={[styles.picker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                onPress={() => { beginLocalInteraction(); setShowRegionPicker(!showRegionPicker); setShowCityPicker(false); }}
              >
                <Text style={[styles.pickerText, !region && styles.pickerPlaceholder]}>
                  {selectedRegion ? localizedText(selectedRegion.nameAr, selectedRegion.nameEn) : t('select_region')}
                </Text>
                <ChevronDown size={20} color={Colors.textMuted} />
              </Pressable>
              {showRegionPicker && (
                <ScrollView style={[styles.pickerDropdown, { maxHeight: 200 }]} nestedScrollEnabled>
                  {saudiRegions.map(r => (
                    <Pressable
                      key={r.id}
                      style={[styles.pickerItem, region === r.id && styles.pickerItemSelected]}
                      onPress={() => { beginLocalInteraction(); setRegion(r.id); setCity(''); setCustomCity(''); setCitySearch(''); setShowRegionPicker(false); }}
                    >
                      <Text style={[styles.pickerItemText, region === r.id && styles.pickerItemTextSelected]}>
                        {localizedText(r.nameAr, r.nameEn)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>

            {region ? (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_city')}</Text>
                <Pressable
                  style={[styles.picker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                  onPress={() => { beginLocalInteraction(); setShowCityPicker(!showCityPicker); setShowRegionPicker(false); }}
                >
                  <Text style={[styles.pickerText, !city && styles.pickerPlaceholder]}>
                    {selectedCityObj ? localizedText(selectedCityObj.nameAr, selectedCityObj.nameEn) : t('select_city')}
                  </Text>
                  <ChevronDown size={20} color={Colors.textMuted} />
                </Pressable>
                {showCityPicker && (
                  <View style={styles.pickerDropdown}>
                    <TextInput
                      style={[styles.citySearchInput, { textAlign: isRTL ? 'right' : 'left' }]}
                      placeholder={t('search_city')}
                      placeholderTextColor={Colors.textMuted}
                      value={citySearch}
                      onChangeText={(text) => { beginLocalInteraction(); setCitySearch(text); }}
                    />
                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                      {filteredCities.map(c => (
                        <Pressable
                          key={c.id}
                          style={[styles.pickerItem, city === c.id && styles.pickerItemSelected]}
                          onPress={() => { beginLocalInteraction(); setCity(c.id); setCustomCity(''); setShowCityPicker(false); setCitySearch(''); }}
                        >
                          <Text style={[styles.pickerItemText, city === c.id && styles.pickerItemTextSelected]}>
                            {localizedText(c.nameAr, c.nameEn)}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
                <TextInput
                  style={[styles.textInput, { textAlign: isRTL ? 'right' : 'left' }]}
                  placeholder={t('custom_city_placeholder')}
                  placeholderTextColor={Colors.textMuted}
                  value={customCity}
                  onChangeText={(text) => { setCustomCity(text); if (text.trim()) setCity(''); }}
                />
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('district_name')}</Text>
              <TextInput
                style={[styles.textInput, { textAlign: isRTL ? 'right' : 'left' }]}
                value={district}
                onChangeText={setDistrict}
                placeholder={t('district_name')}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <PricingSection
              key={pricingRevision}
              draft={pricingDraft}
              currency={user.nativeCurrency || 'SAR'}
              isRTL={isRTL}
              disabled={publishing}
            />

            <Pressable
              style={[styles.publishButton, publishing && styles.publishButtonDisabled]}
              onPress={handlePublish}
              disabled={publishing}
            >
              {publishing ? (
                <View style={styles.publishingRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.publishText}>{uploadProgress || t('processing')}</Text>
                </View>
              ) : (
                <View style={styles.publishingRow}>
                  <Upload size={18} color={Colors.primary} />
                  <Text style={styles.publishText}>{t('publish')}</Text>
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>
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
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  safeArea: {
    flex: 1,
  },
  blockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  blockedTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 8,
  },
  blockedDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  blockedButton: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 12,
    marginTop: 8,
  },
  blockedButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  form: {
    paddingHorizontal: 20,
    gap: 20,
    paddingTop: 12,
  },
  imagesSection: {
    gap: 10,
  },
  imagesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    gap: 6,
  },
  addImageText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  imageWrapper: {
    position: 'relative',
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 14,
  },
  removeImage: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  textInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  picker: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerText: {
    color: Colors.textPrimary,
    fontSize: 15,
  },
  pickerPlaceholder: {
    color: Colors.textMuted,
  },
  pickerDropdown: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pickerItemSelected: {
    backgroundColor: Colors.surface,
  },
  pickerItemText: {
    color: Colors.textPrimary,
    fontSize: 14,
  },
  pickerItemTextSelected: {
    color: Colors.gold,
    fontWeight: '600' as const,
  },
  publishButton: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  publishButtonDisabled: {
    opacity: 0.7,
  },
  publishingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  publishText: {
    color: Colors.primary,
    fontSize: 17,
    fontWeight: '700' as const,
  },
  bottomPadding: {
    height: 80,
  },
  citySearchInput: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
});
