import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Search, Bell, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { mockEquipment } from '@/mocks/equipment';
import { mockCategories } from '@/mocks/categories';
import EquipmentCard from '@/components/EquipmentCard';
import CategoryCard from '@/components/CategoryCard';

export default function HomeScreen() {
  const { isRTL, t, localizedText } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const scrollAnim = useRef(new Animated.Value(0)).current;

  const featuredEquipment = mockEquipment.filter(e => e.availability && e.isActive).slice(0, 5);
  const recentEquipment = mockEquipment.filter(e => e.isActive).slice(0, 6);

  const handleCategoryPress = useCallback((categoryId: string) => {
    setSelectedCategory(prev => prev === categoryId ? null : categoryId);
  }, []);

  const handleSearch = useCallback(() => {
    router.push('/(tabs)/(search)');
  }, [router]);

  const handleNotifications = useCallback(() => {
    console.log('Notifications pressed');
  }, []);

  const userName = user ? localizedText(user.nameAr, user.nameEn).split(' ')[0] : '';

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollAnim } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
          <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start', flex: 1 }}>
              <Text style={[styles.greeting, { textAlign: isRTL ? 'right' : 'left' }]}>
                {isAuthenticated ? `${t('welcome_back')}` : t('welcome')} {userName ? `${userName} 👋` : ''}
              </Text>
              <Text style={[styles.subtitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('browse_equipment')}</Text>
            </View>
            <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable style={styles.notifButton} onPress={handleNotifications}>
                <Bell size={22} color={Colors.textPrimary} />
                <View style={styles.notifDot} />
              </Pressable>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
            </View>
          </View>

          <Pressable style={[styles.searchBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={handleSearch}>
            <Search size={20} color={Colors.textMuted} />
            <Text style={[styles.searchText, { textAlign: isRTL ? 'right' : 'left' }]}>{t('search_placeholder')}</Text>
          </Pressable>

          <View style={styles.section}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={styles.sectionTitle}>{t('categories')}</Text>
              <Pressable onPress={handleSearch}>
                <Text style={styles.seeAll}>{t('see_all')}</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesScroll}>
              {mockCategories.map(cat => (
                <CategoryCard key={cat.id} category={cat} onPress={handleCategoryPress} isSelected={selectedCategory === cat.id} />
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={styles.sectionTitle}>{t('featured')}</Text>
              <Pressable onPress={handleSearch}>
                <View style={[styles.seeAllRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={styles.seeAll}>{t('see_all')}</Text>
                  {isRTL ? <ChevronLeft size={16} color={Colors.gold} /> : <ChevronRight size={16} color={Colors.gold} />}
                </View>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredScroll}>
              {featuredEquipment.map(eq => (
                <EquipmentCard key={eq.id} equipment={eq} compact />
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={styles.sectionTitle}>{t('recent')}</Text>
            </View>
            <View style={styles.recentList}>
              {recentEquipment.map(eq => (
                <EquipmentCard key={eq.id} equipment={eq} />
              ))}
            </View>
          </View>

          <View style={styles.bottomPadding} />
        </Animated.ScrollView>
      </SafeAreaView>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    alignItems: 'center',
    gap: 12,
  },
  notifButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notifDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  searchBar: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 15,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    marginBottom: 14,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  seeAll: {
    color: Colors.gold,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  seeAllRow: {
    alignItems: 'center',
    gap: 2,
  },
  categoriesScroll: {
    paddingHorizontal: 20,
  },
  featuredScroll: {
    paddingHorizontal: 20,
  },
  recentList: {
    paddingHorizontal: 20,
  },
  bottomPadding: {
    height: 20,
  },
});
