import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Search, Bell, Globe, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { mockCategories } from '@/mocks/categories';
import { useDiscovery } from '@/contexts/DiscoveryContext';
import DiscoveryFilters from '@/components/DiscoveryFilters';
import EquipmentCard from '@/components/EquipmentCard';
import CategoryCard from '@/components/CategoryCard';
import EmptyState from '@/components/EmptyState';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export default function HomeScreen() {
  const { isRTL, t, localizedText, setLanguage } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const { equipment: filteredEquipment, filters, markets, setFilter, resetFilters, loading, refreshing, error, refresh, hasFilters } = useDiscovery();
  const [showFilters, setShowFilters] = useState(false);
  const selectedCategory = filters.category;
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const featuredEquipment = filteredEquipment.filter(e => e.availability).slice(0, 5);

  const handleCategoryPress = useCallback((categoryId: string) => {
    setFilter('category', selectedCategory === categoryId ? '' : categoryId);
  }, [selectedCategory, setFilter]);

  const handleSearch = useCallback(() => {
    router.push('/(tabs)/search?mode=equipment');
  }, [router]);

  const handleNotifications = useCallback(() => {
  }, []);

  const handleGuestLanguage = useCallback(() => {
    showDialog(
      t('language'),
      t('select_language_prompt'),
      [
        { text: t('arabic'), style: 'default', onPress: () => void setLanguage('ar') },
        { text: t('english'), style: 'default', onPress: () => void setLanguage('en') },
        { text: t('cancel'), style: 'cancel' },
      ]
    );
  }, [setLanguage, showDialog, t]);

  const userName = user ? localizedText(user.nameAr, user.nameEn).split(' ')[0] : '';

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing && !loading} onRefresh={refresh} tintColor={Colors.gold} />}
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
              {isAuthenticated ? (
                <Pressable style={styles.notifButton} onPress={handleNotifications}>
                  <Bell size={22} color={Colors.textPrimary} />
                  <View style={styles.notifDot} />
                </Pressable>
              ) : (
                <Pressable style={styles.notifButton} onPress={handleGuestLanguage}>
                  <Globe size={22} color={Colors.textPrimary} />
                </Pressable>
              )}
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
            </View>
          </View>

          <View style={[styles.searchBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Search size={20} color={Colors.textMuted} />
            <TextInput testID="home-search-input" style={[styles.searchText, { textAlign: isRTL ? 'right' : 'left', color: Colors.textPrimary }]}
              placeholder={t('search_placeholder')} placeholderTextColor={Colors.textMuted}
              value={filters.text} onChangeText={text => setFilter('text', text)} onSubmitEditing={handleSearch} />
          </View>

          <View style={styles.section}>
            <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={styles.sectionTitle}>{t('categories')}</Text>
              <Pressable onPress={handleSearch}>
                <Text style={styles.seeAll}>{t('see_all')}</Text>
              </Pressable>
            </View>
            <ScrollView testID="home-category-scroll" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.categoriesScroll, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {mockCategories.map(cat => (
                <CategoryCard key={cat.id} category={cat} onPress={handleCategoryPress} isSelected={selectedCategory === cat.id} />
              ))}
            </ScrollView>
          </View>
          <View style={styles.locationFilters}>
            <View style={[styles.filterRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters(value => !value)} style={styles.filterChip}>
                <Text style={styles.seeAll}>{t('filters')} · {filters.countryCode}</Text>
              </Pressable>
              {hasFilters && <Pressable accessibilityRole="button" onPress={resetFilters} style={styles.filterChip}><Text style={styles.seeAll}>{t('reset_filters')}</Text></Pressable>}
            </View>
            {showFilters && <DiscoveryFilters filters={filters} markets={markets} setFilter={setFilter} />}
          </View>

          <View style={styles.driverCtaContainer}>
            <View style={[styles.driverCtaTextContainer, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.driverCtaTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'تحتاج سائق معدات؟' : 'Need an equipment driver?'}</Text>
              <Text style={[styles.driverCtaSubtitle, { textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'ابحث عن سائق مناسب لمعدتك' : 'Find the right driver for your equipment'}</Text>
            </View>
            <View style={[styles.driverCtaActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable style={styles.driverCtaButton} onPress={() => router.push('/(tabs)/search?mode=drivers')}>
                <Text style={styles.driverCtaButtonText}>{isRTL ? 'البحث عن سائق' : 'Find a Driver'}</Text>
              </Pressable>
              {isAuthenticated && user?.role !== 'driver' && (
                <Pressable style={styles.driverCtaOutlineButton} onPress={() => router.push('/driver/requests')}>
                  <Text style={styles.driverCtaOutlineButtonText}>{isRTL ? 'طلباتي' : 'My Requests'}</Text>
                </Pressable>
              )}
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.gold} />
            </View>
          ) : error ? (
            <View style={styles.emptyContainer}>
              <EmptyState title={t('discovery_load_error')} />
              <Pressable accessibilityRole="button" onPress={refresh} style={styles.filterChip}><Text style={styles.seeAll}>{t('discovery_retry')}</Text></Pressable>
            </View>
          ) : filteredEquipment.length === 0 ? (
            <View style={styles.emptyContainer}>
              <EmptyState title={hasFilters ? t('no_results') : t('no_equipment')} />
            </View>
          ) : (
            <>
              {featuredEquipment.length > 0 && (
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
              )}

              <View style={styles.section}>
                <View style={[styles.sectionHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={styles.sectionTitle}>{t('all_equipment')}</Text>
                  <Pressable onPress={handleSearch}>
                    <Text style={styles.seeAll}>{t('see_all')}</Text>
                  </Pressable>
                </View>
                <View style={styles.recentList}>
                  {filteredEquipment.map(eq => (
                    <EquipmentCard key={eq.id} equipment={eq} />
                  ))}
                </View>
              </View>
            </>
          )}

          <View style={styles.bottomPadding} />
        </Animated.ScrollView>
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
  locationFilters: { marginTop: 12, gap: 8, paddingHorizontal: 20 },
  filterRow: { gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterChipSelected: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  filterChipDisabled: { opacity: 0.5 },
  filterChipText: { color: Colors.textSecondary, fontSize: 12 },
  filterChipTextSelected: { color: Colors.primary, fontWeight: '700' as const },
  filterChipTextDisabled: { color: Colors.textMuted },
  driverCtaContainer: {
    marginHorizontal: 20,
    marginTop: 24,
    padding: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  driverCtaTextContainer: {
    gap: 4,
  },
  driverCtaTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  driverCtaSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  driverCtaActions: {
    gap: 10,
  },
  driverCtaButton: {
    backgroundColor: Colors.gold,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  driverCtaButtonText: {
    color: Colors.primary,
    fontWeight: '700' as const,
    fontSize: 15,
  },
  driverCtaOutlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.gold,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  driverCtaOutlineButtonText: {
    color: Colors.gold,
    fontWeight: '700' as const,
    fontSize: 15,
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
  loadingContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingTop: 40,
    paddingHorizontal: 20,
  },
});
