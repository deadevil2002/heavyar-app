import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, Pressable, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Search, Bell, Globe, Grid2X2, List, Package, PlusCircle, Inbox, Activity, UserSearch } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { mockCategories } from '@/mocks/categories';
import { useDiscovery, useDiscoveryDraft } from '@/contexts/DiscoveryContext';
import DiscoveryFilters from '@/components/DiscoveryFilters';
import EquipmentCard from '@/components/EquipmentCard';
import CategoryCard from '@/components/CategoryCard';
import EmptyState from '@/components/EmptyState';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { loadEquipmentView, saveEquipmentView, type EquipmentView } from '@/services/equipmentViewPreference';
import type { Equipment } from '@/types';
import { mobilePerformance } from '@/utils/mobilePerformance';

export default function HomeScreen() {
  mobilePerformance.countRender('home');
  const { isRTL, t, localizedText, setLanguage } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const discovery = useDiscovery();
  const { equipment: filteredEquipment, filters, markets, loading, refreshing, error, refresh, hasFilters, loadMore, hasMore, loadingMore } = discovery;
  const { text, changeText, commitText, draftFilters, beginFilters, changeFilter, commitFilters, resetAll } = useDiscoveryDraft(discovery);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<EquipmentView>('list');
  useEffect(() => { void loadEquipmentView().then(setView); }, []);
  const selectedCategory = showFilters ? draftFilters.category : filters.category;
  const renderItem = useCallback(({ item }: { item: Equipment }) => (
    <View style={view === 'grid' ? styles.gridItem : styles.listItem}>
      <EquipmentCard equipment={item} compact={view === 'grid'} />
    </View>
  ), [view]);

  const handleCategoryPress = useCallback((categoryId: string) => {
    if (!showFilters) beginFilters();
    changeFilter('category', selectedCategory === categoryId ? '' : categoryId);
    setShowFilters(true);
  }, [selectedCategory, changeFilter, showFilters, beginFilters]);

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
        <FlatList
          data={filteredEquipment}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          key={view}
          numColumns={view === 'grid' ? 2 : 1}
          columnWrapperStyle={view === 'grid' ? styles.gridRow : undefined}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing && !loading} onRefresh={refresh} tintColor={Colors.gold} />}
          onEndReached={() => { if (filteredEquipment.length) loadMore(); }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={<>
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

          {user?.role === 'provider' && (
            <View style={styles.providerOperations}>
              <Text style={[styles.sectionTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
                {isRTL ? 'إدارة عملياتك' : 'Run your operations'}
              </Text>
              <View style={[styles.providerActionGrid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {[
                  { label: isRTL ? 'معداتي' : 'My Equipment', icon: Package, route: '/my-equipment' as const },
                  { label: isRTL ? 'إضافة معدة' : 'Add Equipment', icon: PlusCircle, route: '/(tabs)/add' as const },
                  { label: isRTL ? 'الطلبات الواردة' : 'Incoming Requests', icon: Inbox, route: '/(tabs)/requests' as const },
                  { label: isRTL ? 'الإيجارات النشطة' : 'Active Rentals', icon: Activity, route: '/(tabs)/requests?status=active' as const },
                  { label: isRTL ? 'البحث عن سائق' : 'Find Driver', icon: UserSearch, route: '/(tabs)/search?mode=drivers' as const },
                ].map(action => (
                  <Pressable key={action.label} accessibilityRole="button" onPress={() => router.push(action.route)} style={styles.providerAction}>
                    <action.icon size={21} color={Colors.gold} />
                    <Text style={styles.providerActionText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable accessibilityRole="button" onPress={handleSearch} style={styles.marketLink}>
                <Text style={styles.seeAll}>{isRTL ? 'تصفح سوق المعدات' : 'Browse equipment market'}</Text>
              </Pressable>
            </View>
          )}

          <View style={[styles.searchBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Search size={20} color={Colors.textMuted} />
            <TextInput testID="home-search-input" style={[styles.searchText, { textAlign: isRTL ? 'right' : 'left', color: Colors.textPrimary }]}
              placeholder={t('search_placeholder')} placeholderTextColor={Colors.textMuted}
               value={text} onChangeText={changeText} onSubmitEditing={() => { commitText(); handleSearch(); }} />
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
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => { if (!showFilters) beginFilters(); setShowFilters(value => !value); }} style={styles.filterChip}>
                <Text style={styles.seeAll}>{t('filters')} · {filters.countryCode}</Text>
              </Pressable>
              {hasFilters && <Pressable accessibilityRole="button" onPress={() => { resetAll(); setShowFilters(false); }} style={styles.filterChip}><Text style={styles.seeAll}>{t('reset_filters')}</Text></Pressable>}
            </View>
            {showFilters && <>
              <DiscoveryFilters filters={draftFilters} markets={markets} setFilter={changeFilter} />
              <Pressable accessibilityRole="button" testID="home-apply-filters" onPress={() => { commitFilters(); setShowFilters(false); }} style={styles.filterChip}>
                <Text style={styles.seeAll}>{isRTL ? 'تطبيق الفلاتر' : 'Apply Filters'}</Text>
              </Pressable>
            </>}
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

          <View style={[styles.sectionHeader, styles.section, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={styles.sectionTitle}>{t('all_equipment')}</Text>
            <View style={styles.filterRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('list_view')} accessibilityState={{ selected: view === 'list' }}
                onPress={() => { setView('list'); void saveEquipmentView('list'); }} style={styles.filterChip}>
                <List size={18} color={view === 'list' ? Colors.gold : Colors.textMuted} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('grid_view')} accessibilityState={{ selected: view === 'grid' }}
                onPress={() => { setView('grid'); void saveEquipmentView('grid'); }} style={styles.filterChip}>
                <Grid2X2 size={18} color={view === 'grid' ? Colors.gold : Colors.textMuted} />
              </Pressable>
            </View>
          </View>
          {refreshing && <ActivityIndicator size="small" color={Colors.gold} />}
          {error && filteredEquipment.length > 0 && <Pressable accessibilityRole="button" onPress={refresh} style={styles.filterChip}>
            <Text style={styles.seeAll}>{t('discovery_load_error')} · {t('discovery_retry')}</Text>
          </Pressable>}
          </>}
          ListEmptyComponent={loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.gold} />
            </View>
          ) : error ? (
            <View style={styles.emptyContainer}>
              <EmptyState title={t('discovery_load_error')} />
              <Pressable accessibilityRole="button" onPress={refresh} style={styles.filterChip}><Text style={styles.seeAll}>{t('discovery_retry')}</Text></Pressable>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <EmptyState title={hasFilters ? t('no_results') : t('no_equipment')} />
            </View>
          )}
          ListFooterComponent={<View style={styles.footer}>
            {loadingMore ? <ActivityIndicator size="small" color={Colors.gold} /> : hasMore ? (
              <Pressable accessibilityRole="button" testID="home-equipment-load-more" onPress={loadMore} style={styles.loadMoreButton}>
                <Text style={styles.seeAll}>{isRTL ? 'تحميل المزيد' : 'Load more'}</Text>
              </Pressable>
            ) : null}
          </View>}
        />
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
  providerOperations: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  providerActionGrid: { flexWrap: 'wrap', gap: 10 },
  providerAction: {
    width: '47%',
    minHeight: 74,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  providerActionText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  marketLink: { alignSelf: 'center', paddingVertical: 4 },
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
  gridRow: { paddingHorizontal: 20, gap: 12 },
  gridItem: { width: '48%', flexGrow: 0, flexShrink: 1 },
  listItem: { paddingHorizontal: 20 },
  footer: { paddingBottom: 20 },
  loadMoreButton: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, marginVertical: 8 },
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
