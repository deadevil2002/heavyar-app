import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Camera, X, ChevronDown, Upload } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { mockCategories, mockCities } from '@/mocks/categories';
import { createEquipment } from '@/services/firestoreService';
import { uploadMultipleImages, CloudinaryImage } from '@/services/cloudinaryService';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export default function CreateListingScreen() {
  const { isRTL, t, localizedText } = useLanguage();
  const { user } = useAuth();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const [titleAr, setTitleAr] = useState<string>('');
  const [titleEn, setTitleEn] = useState<string>('');
  const [descAr, setDescAr] = useState<string>('');
  const [descEn, setDescEn] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [district, setDistrict] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [images, setImages] = useState<string[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState<boolean>(false);
  const [showCityPicker, setShowCityPicker] = useState<boolean>(false);
  const [_uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets) {
      setImages(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const [publishing, setPublishing] = useState<boolean>(false);

  const handlePublish = useCallback(async () => {
    if (!user) return;

    if (!titleAr.trim()) {
      showDialog(t('validation_error'), t('validation_title_ar_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!category) {
      showDialog(t('validation_error'), t('validation_category_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (!city) {
      showDialog(t('validation_error'), t('validation_city_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    const parsedPrice = parseFloat(price);
    if (!price.trim() || isNaN(parsedPrice) || parsedPrice <= 0) {
      showDialog(t('validation_error'), t('validation_price_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    if (images.length === 0) {
      showDialog(t('validation_error'), t('validation_images_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }
    setPublishing(true);
    setUploading(true);
    setUploadProgress(`${t('uploading_images')} 0/${images.length}`);
    try {
      console.log('[CreateListing] Uploading', images.length, 'images to Cloudinary');
      const cloudinaryImages: CloudinaryImage[] = await uploadMultipleImages(
        images,
        (completed, total) => {
          setUploadProgress(`${t('uploading_images')} ${completed}/${total}`);
          console.log('[CreateListing] Upload progress:', completed, '/', total);
        }
      );
      setUploading(false);
      setUploadProgress(t('saving'));
      console.log('[CreateListing] All images uploaded, saving to Firestore');

      await createEquipment({
        ownerUid: user.uid,
        titleAr,
        titleEn: titleEn || titleAr,
        descriptionAr: descAr,
        descriptionEn: descEn || descAr,
        category,
        city,
        district,
        location: { lat: 0, lng: 0 },
        pricePerDay: parsedPrice,
        images: cloudinaryImages,
        availability: true,
        isActive: true,
      });
      showDialog(t('success'), '', [{ text: t('confirm'), style: 'default' }]);
      setTitleAr('');
      setTitleEn('');
      setDescAr('');
      setDescEn('');
      setCategory('');
      setCity('');
      setDistrict('');
      setPrice('');
      setImages([]);
    } catch (e) {
      console.error('[CreateListing] Error:', e);
      const message = e instanceof Error ? e.message : t('unexpected_error');
      showDialog(t('error_title'), message, [{ text: t('ok'), style: 'default' }]);
    } finally {
      setPublishing(false);
      setUploading(false);
      setUploadProgress('');
    }
  }, [titleAr, titleEn, descAr, descEn, category, city, district, price, images, user, t, showDialog]);

  const selectedCategory = mockCategories.find(c => c.id === category);
  const selectedCity = mockCities.find(c => c.id === city);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('create_listing')}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.imagesSection}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('add_images')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.imagesRow}>
                  <Pressable style={styles.addImageButton} onPress={pickImage}>
                    <Camera size={28} color={Colors.gold} />
                    <Text style={styles.addImageText}>{t('add_images')}</Text>
                  </Pressable>
                  {images.map((uri, index) => (
                    <View key={index} style={styles.imageWrapper}>
                      <Image source={{ uri }} style={styles.imagePreview} contentFit="cover" />
                      <Pressable style={styles.removeImage} onPress={() => removeImage(index)}>
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
                      onPress={() => { setCategory(cat.id); setShowCategoryPicker(false); }}
                    >
                      <Text style={[styles.pickerItemText, category === cat.id && styles.pickerItemTextSelected]}>
                        {localizedText(cat.nameAr, cat.nameEn)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_city')}</Text>
              <Pressable
                style={[styles.picker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                onPress={() => setShowCityPicker(!showCityPicker)}
              >
                <Text style={[styles.pickerText, !city && styles.pickerPlaceholder]}>
                  {selectedCity ? localizedText(selectedCity.nameAr, selectedCity.nameEn) : t('select_city')}
                </Text>
                <ChevronDown size={20} color={Colors.textMuted} />
              </Pressable>
              {showCityPicker && (
                <View style={styles.pickerDropdown}>
                  {mockCities.map(c => (
                    <Pressable
                      key={c.id}
                      style={[styles.pickerItem, city === c.id && styles.pickerItemSelected]}
                      onPress={() => { setCity(c.id); setShowCityPicker(false); }}
                    >
                      <Text style={[styles.pickerItemText, city === c.id && styles.pickerItemTextSelected]}>
                        {localizedText(c.nameAr, c.nameEn)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

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
});
