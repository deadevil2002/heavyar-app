import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Modal } from 'react-native';
import { Globe } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';

export default React.memo(function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();
  const [showPicker, setShowPicker] = useState<boolean>(false);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showPicker) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 65, friction: 8, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [showPicker, scaleAnim, opacityAnim]);

  const handleSelect = useCallback(async (lang: 'ar' | 'en') => {
    await setLanguage(lang);
    setShowPicker(false);
  }, [setLanguage]);

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setShowPicker(true)} testID="language-selector">
        <Globe size={20} color={Colors.gold} />
        <Text style={styles.triggerText}>{language === 'ar' ? 'عربي' : 'EN'}</Text>
      </Pressable>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)} statusBarTranslucent>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setShowPicker(false)} />
          <Animated.View style={[styles.picker, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
            <View style={styles.accentBar} />
            <Text style={styles.pickerTitle}>{t('select_language')}</Text>
            <Pressable
              style={[styles.langOption, language === 'ar' && styles.langOptionActive]}
              onPress={() => handleSelect('ar')}
            >
              <Text style={[styles.langText, language === 'ar' && styles.langTextActive]}>العربية</Text>
              {language === 'ar' && <View style={styles.activeDot} />}
            </Pressable>
            <Pressable
              style={[styles.langOption, language === 'en' && styles.langOptionActive]}
              onPress={() => handleSelect('en')}
            >
              <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>English</Text>
              {language === 'en' && <View style={styles.activeDot} />}
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  triggerText: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  picker: {
    width: 280,
    backgroundColor: Colors.card,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accentBar: {
    height: 3,
    backgroundColor: Colors.gold,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    textAlign: 'center',
    paddingTop: 20,
    paddingBottom: 12,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: Colors.inputBg,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  langOptionActive: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(212, 168, 67, 0.1)',
  },
  langText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
  },
  langTextActive: {
    color: Colors.gold,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gold,
  },
});
