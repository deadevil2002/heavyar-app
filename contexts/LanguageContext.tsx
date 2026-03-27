import { useEffect, useState, useCallback, useMemo } from 'react';
import { I18nManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { translations, TranslationKey } from '@/i18n/translations';
import { Language } from '@/types';

const LANGUAGE_KEY = 'heavyar_language';

export const [LanguageProvider, useLanguage] = createContextHook(() => {
  const [language, setLanguageState] = useState<Language>('ar');
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (stored === 'en' || stored === 'ar') {
          setLanguageState(stored);
        } else {
          setLanguageState('ar');
          await AsyncStorage.setItem(LANGUAGE_KEY, 'ar');
        }
      } catch (e) {
        console.log('Error loading language:', e);
      } finally {
        setIsReady(true);
      }
    };
    void loadLanguage();
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const isRTL = language === 'ar';
    if (Platform.OS !== 'web') {
      if (I18nManager.isRTL !== isRTL) {
        I18nManager.allowRTL(isRTL);
        I18nManager.forceRTL(isRTL);
      }
    } else {
      try {
        document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
        document.documentElement.lang = language;
      } catch (e) {
        console.log('Web RTL setup:', e);
      }
    }
  }, [language, isReady]);

  const isRTL = language === 'ar';

  const t = useCallback((key: TranslationKey): string => {
    return translations[language][key] || key;
  }, [language]);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  }, []);

  const localizedText = useCallback((ar: string, en: string): string => {
    return language === 'ar' ? ar : en;
  }, [language]);

  return useMemo(() => ({
    language,
    isRTL,
    isReady,
    t,
    setLanguage,
    localizedText,
  }), [language, isRTL, isReady, t, setLanguage, localizedText]);
});
