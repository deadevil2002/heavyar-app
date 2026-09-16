import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowLeft, ArrowRight, Camera, X, ChevronDown, Save, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { mockCategories } from '@/mocks/categories';
import { saudiRegions, getCitiesByRegion, findCityById, findRegionByCityId } from '@/mocks/saudiRegions';
import { fetchEquipmentById, updateEquipmentWithImageCleanup } from '@/services/firestoreService';
import { uploadMultipleImages } from '@/services/cloudinaryService';
import { getImageUrl } from '@/utils/imageHelpers';
import { Equipment, EquipmentImage } from '@/types';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export default function EditEquipmentScreen() {
  const { isRTL, t, localizedText } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const [originalEquipment, setOriginalEquipment] = useState<Equipment | null>(null);
  const [oldImages, setOldImages] = useState<EquipmentImage[]>([]);

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
  const [price, setPrice] = useState<string>('');

  const [existingImages, setExistingImages] = useState<EquipmentImage[]>([]);
  const [newImageUris, setNewImageUris] = useState<string[]>([]);

  const [showCategoryPicker, setShowCategoryPicker] = useState<boolean>(false);
  const [showCityPicker, setShowCityPicker] = useState<boolean>(false);
  const [showRegionPicker, setShowRegionPicker] = useState<boolean>(false);
  const [citySearch, setCitySearch] = useState<string>('');

  const selectedRegion = React.useMemo(() => saudiRegions.find(r => r.id === region), [region]);
  const regionCities = React.useMemo(() => getCitiesByRegion(region), [region]);
  const filteredCities = React.useMemo(() => {
    if (!citySearch.trim()) return regionCities;
    const q = citySearch.toLowerCase();
    return regionCities.filter(c => c.nameAr.includes(q) || c.nameEn.toLowerCase().includes(q));
  }, [regionCities, citySearch]);
  const selectedCityObj = React.useMemo(() => findCityById(city), [city]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!id) return;
      try {
        console.log('[EditEquipment] Loading equipment:', id);
        const eq = await fetchEquipmentById(id);
        if (!mounted) return;
        if (!eq) {
          showDialog(t('error_title'), t('load_failed'), [
            { text: t('confirm'), style: 'default', onPress: () => router.back() },
          ]);
          return;
        }
        if (user && eq.ownerUid !== user.uid) {
          console.log('[EditEquipment] Not owner, going back');
          showDialog(t('error_title'), t('error_generic_message'), [
            { text: t('confirm'), style: 'default', onPress: () => router.back() },
          ]);
          return;
        }
        setOriginalEquipment(eq);
        setOldImages([...eq.images]);
        setTitleAr(eq.titleAr);
        setTitleEn(eq.titleEn);
        setDescAr(eq.descriptionAr);
        setDescEn(eq.descriptionEn);
        setCategory(eq.category);
        setCustomCategory(eq.customCategory || '');
        const existingRegion = eq.region || '';
        if (existingRegion) {
          setRegion(existingRegion);
        } else if (eq.city) {
          const foundRegion = findRegionByCityId(eq.city);
          if (foundRegion) setRegion(foundRegion.id);
        }
        setCity(eq.city);
        setCustomCity(eq.customCity || '');
        setDistrict(eq.district);
        setPrice(eq.pricePerDay > 0 ? String(eq.pricePerDay) : '');
        setExistingImages([...eq.images]);
        console.log('[EditEquipment] Loaded with', eq.images.length, 'existing images');
      } catch (e) {
        console.log('[EditEquipment] Load error:', e);
        if (mounted) {
          showDialog(t('error_title'), t('load_failed'), [
            { text: t('confirm'), style: 'default', onPress: () => router.back() },
          ]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [id, user, t, router, showDialog]);

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showDialog('إذن مرفوض', 'يرجى السماح بالوصول للصور لاختيار صور المعدات', [{ text: 'حسناً', style: 'default' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets) {
      setNewImageUris(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  }, [showDialog]);

  const removeExistingImage = useCallback((index: number) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const removeNewImage = useCallback((index: number) => {
    setNewImageUris(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    if (!id || !originalEquipment || !user) return;

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
    const parsedPrice = parseFloat(price);
    if (!price.trim() || isNaN(parsedPrice) || parsedPrice <= 0) {
      showDialog(t('validation_error'), t('validation_price_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (existingImages.length === 0 && newImageUris.length === 0) {
      showDialog(t('validation_error'), t('validation_images_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }

    setSaving(true);
    try {
      let uploadedNewImages: EquipmentImage[] = [];

      if (newImageUris.length > 0) {
        setUploadProgress(`${t('uploading_images')} 0/${newImageUris.length}`);
        console.log('[EditEquipment] Uploading', newImageUris.length, 'new images');
        const cloudinaryResults = await uploadMultipleImages(
          newImageUris,
          (completed, total) => {
            setUploadProgress(`${t('uploading_images')} ${completed}/${total}`);
          }
        );
        uploadedNewImages = cloudinaryResults;
        console.log('[EditEquipment] New images uploaded:', cloudinaryResults.length);
      }

      const finalImages: EquipmentImage[] = [...existingImages, ...uploadedNewImages];

      setUploadProgress(t('saving_changes'));
      console.log('[EditEquipment] Saving with', finalImages.length, 'total images');

      await updateEquipmentWithImageCleanup(
        id,
        {
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
          pricePerDay: parsedPrice,
          images: finalImages,
        },
        oldImages
      );

      console.log('[EditEquipment] Save successful');
      showDialog(t('success'), t('update_success'), [
        { text: t('confirm'), style: 'default', onPress: () => router.back() },
      ]);
    } catch (e) {
      console.error('[EditEquipment] Save error:', e);
      const message = e instanceof Error ? e.message : t('unexpected_error');
      showDialog(t('error_title'), message, [{ text: t('ok'), style: 'default' }]);
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  }, [id, originalEquipment, user, titleAr, titleEn, descAr, descEn, category, customCategory, region, city, customCity, district, price, existingImages, newImageUris, oldImages, t, router, showDialog]);

  const selectedCategory = mockCategories.find(c => c.id === category);

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={styles.loadingText}>{t('loading')}</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <BackIcon size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('edit_listing')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <View style={styles.imagesSection}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>
                {t('existing_images')} ({existingImages.length})
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.imagesRow}>
                  {existingImages.map((img, index) => (
                    <View key={`existing-${index}`} style={styles.imageWrapper}>
                      <Image
                        source={{ uri: getImageUrl(img) }}
                        style={styles.imagePreview}
                        contentFit="cover"
                      />
                      <Pressable
                        style={styles.removeImage}
                        onPress={() => removeExistingImage(index)}
                      >
                        <Trash2 size={12} color={Colors.white} />
                      </Pressable>
                    </View>
                  ))}
                  {existingImages.length === 0 && (
                    <Text style={styles.noImagesText}>{t('no_equipment')}</Text>
                  )}
                </View>
              </ScrollView>
            </View>

            <View style={styles.imagesSection}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>
                {t('new_images')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.imagesRow}>
                  <Pressable style={styles.addImageButton} onPress={pickImage}>
                    <Camera size={28} color={Colors.gold} />
                    <Text style={styles.addImageText}>{t('add_images')}</Text>
                  </Pressable>
                  {newImageUris.map((uri, index) => (
                    <View key={`new-${index}`} style={styles.imageWrapper}>
                      <Image source={{ uri }} style={styles.imagePreview} contentFit="cover" />
                      <Pressable
                        style={styles.removeImage}
                        onPress={() => removeNewImage(index)}
                      >
                        <X size={14} color={Colors.white} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>

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
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
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
                      onPress={() => { setCategory(cat.id); if (cat.id !== 'other') setCustomCategory(''); setShowCategoryPicker(false); }}
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
                onPress={() => { setShowRegionPicker(!showRegionPicker); setShowCityPicker(false); }}
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
                      onPress={() => { setRegion(r.id); setCity(''); setCustomCity(''); setCitySearch(''); setShowRegionPicker(false); }}
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
                  onPress={() => { setShowCityPicker(!showCityPicker); setShowRegionPicker(false); }}
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
                      onChangeText={setCitySearch}
                    />
                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                      {filteredCities.map(c => (
                        <Pressable
                          key={c.id}
                          style={[styles.pickerItem, city === c.id && styles.pickerItemSelected]}
                          onPress={() => { setCity(c.id); setCustomCity(''); setShowCityPicker(false); setCitySearch(''); }}
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

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('price_per_day')}</Text>
              <TextInput
                style={[styles.textInput, { textAlign: isRTL ? 'right' : 'left' }]}
                value={price}
                onChangeText={setPrice}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            <Pressable
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <View style={styles.savingRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.saveText}>{uploadProgress || t('saving_changes')}</Text>
                </View>
              ) : (
                <View style={styles.savingRow}>
                  <Save size={18} color={Colors.primary} />
                  <Text style={styles.saveText}>{t('save_changes')}</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  headerSpacer: {
    width: 42,
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
    flexDirection: 'row' as const,
    gap: 12,
    alignItems: 'center',
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
    position: 'relative' as const,
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 14,
  },
  removeImage: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImagesText: {
    color: Colors.textMuted,
    fontSize: 13,
    paddingVertical: 30,
    paddingHorizontal: 10,
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
    textAlignVertical: 'top' as const,
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
    overflow: 'hidden' as const,
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
  saveButton: {
    backgroundColor: Colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  savingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  saveText: {
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
