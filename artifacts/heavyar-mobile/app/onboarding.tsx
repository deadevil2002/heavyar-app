import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Truck, ShieldCheck, MessageCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  titleKey: 'onboarding_title_1' | 'onboarding_title_2' | 'onboarding_title_3';
  descKey: 'onboarding_desc_1' | 'onboarding_desc_2' | 'onboarding_desc_3';
  icon: React.ComponentType<{ size: number; color: string }>;
}

const slides: OnboardingSlide[] = [
  { id: '1', titleKey: 'onboarding_title_1', descKey: 'onboarding_desc_1', icon: Truck },
  { id: '2', titleKey: 'onboarding_title_2', descKey: 'onboarding_desc_2', icon: ShieldCheck },
  { id: '3', titleKey: 'onboarding_title_3', descKey: 'onboarding_desc_3', icon: MessageCircle },
];

export default function OnboardingScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
    } else {
      router.replace('/');
    }
  }, [currentIndex, router]);

  const handleSkip = useCallback(() => {
    router.replace('/');
  }, [router]);

  const renderSlide = useCallback(({ item }: { item: OnboardingSlide }) => {
    const IconComponent = item.icon;
    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        <View style={styles.iconWrapper}>
          <View style={styles.iconCircle}>
            <IconComponent size={60} color={Colors.gold} />
          </View>
          <View style={styles.iconGlow} />
        </View>
        <Text style={styles.slideTitle}>{t(item.titleKey)}</Text>
        <Text style={styles.slideDesc}>{t(item.descKey)}</Text>
      </View>
    );
  }, [t]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.topRow}>
          <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
          {currentIndex < slides.length - 1 && (
            <Pressable onPress={handleSkip}>
              <Text style={styles.skipText}>{t('skip')}</Text>
            </Pressable>
          )}
        </View>

        <FlatList
          ref={flatListRef}
          data={slides}
          renderItem={renderSlide}
          keyExtractor={item => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}
        />

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View key={i} style={[styles.dot, currentIndex === i && styles.dotActive]} />
            ))}
          </View>

          <Pressable style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextText}>
              {currentIndex === slides.length - 1 ? t('get_started') : t('next')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  safeArea: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  logo: { width: 48, height: 48, borderRadius: 12 },
  skipText: { color: Colors.textMuted, fontSize: 15, fontWeight: '600' as const },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconWrapper: {
    marginBottom: 40,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.gold,
    zIndex: 1,
  },
  iconGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(212, 168, 67, 0.08)',
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  slideDesc: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surface,
  },
  dotActive: {
    backgroundColor: Colors.gold,
    width: 28,
  },
  nextButton: {
    backgroundColor: Colors.gold,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  nextText: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '700' as const,
  },
});
