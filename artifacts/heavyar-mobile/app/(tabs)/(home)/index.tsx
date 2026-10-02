import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, Pressable, ActivityIndicator, RefreshControl, I18nManager, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Search, Bell, Globe, Grid2X2, List, Package, PlusCircle, Inbox, Activity, SlidersHorizontal, HardHat, ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Input, XStack, YStack, styled } from 'tamagui';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
import { canBrowsePublicEquipment } from '@/services/marketplaceAccess';
import { useNotificationUnread } from '@/hooks/useNotificationUnread';
import { driverRequestsAllowed } from '@/services/requestSections';

const HomeIconButton = styled(Button, {
  animateOnly: ['opacity', 'transform'],
  variants: {
    homeTone: {
      default: {
        bg: '$surface',
        borderColor: '$borderColor',
      },
      active: {
        bg: '$surfaceRaised',
        borderColor: '$accent',
      },
      subtle: {
        bg: 'transparent',
        borderColor: 'transparent',
      },
      accent: {
        bg: '$accent',
        borderColor: '$accent',
      },
    },
  } as const,
  defaultVariants: {
    homeTone: 'default',
  },
});

const HomeChip = styled(Button, {
  animateOnly: ['opacity', 'transform'],
  variants: {
    selected: {
      true: {
        bg: '$surfaceRaised',
        borderColor: '$accent',
      },
      false: {
        bg: '$surface',
        borderColor: '$borderColor',
      },
    },
  } as const,
});

export default function HomeScreen() {
  const auth = useAuth();
  if (auth.isLoading) return <View style={styles.container}><ActivityIndicator color={Colors.gold} /></View>;
  return canBrowsePublicEquipment(auth) ? <MarketplaceHome /> : <OperationsHome />;
}

function NotificationBell() {
  const { user, isAuthenticated } = useAuth();
  const { unreadCount } = useNotificationUnread(isAuthenticated ? user?.uid || '' : '');
  const router = useRouter();
  return <HomeIconButton chromeless theme="dark" homeTone="default" bg="$surface" borderColor="$borderColor"
    accessibilityRole="button" accessibilityLabel="Notifications"
    style={styles.homeIconButton} pressStyle={styles.homeIconButtonPressed} transition="200ms"
    onPress={() => router.push('/notifications')}>
    <Bell size={21} strokeWidth={2} color={Colors.textPrimary} />
    {!!unreadCount && unreadCount > 0 && <View testID="home-notification-dot" style={styles.notifDot} />}
  </HomeIconButton>;
}

function OperationsHome() {
  mobilePerformance.countRender('home');
  const { user } = useAuth();
  const { isRTL, t, localizedText } = useLanguage();
  const router = useRouter();
  const provider = user?.role === 'provider';
  const canUseDriverRequests = driverRequestsAllowed(user);
  const rowDirection = Platform.OS === 'web'
    ? (isRTL ? 'row-reverse' : 'row')
    : (isRTL === I18nManager.isRTL ? 'row' : 'row-reverse');
  const actionIcon = (Icon: typeof Package) => (
    <View style={styles.operationsIconSurface}><Icon size={21} color={Colors.gold} strokeWidth={2} /></View>
  );
  return <View style={styles.container}><SafeAreaView edges={['top']} style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.operationsContent} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#0B2854', '#061B3B', '#011130']} locations={[0, 0.55, 1]} style={styles.operationsHero}>
        <View pointerEvents="none" style={styles.heroHighlight} />
        <View style={[styles.header, { flexDirection: rowDirection }]}>
          <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Text style={[styles.greeting, styles.heroGreeting, { textAlign: isRTL ? 'right' : 'left' }]}>
              {t('welcome_back')} {user ? localizedText(user.nameAr, user.nameEn).split(' ')[0] : ''}
            </Text>
            <Text style={[styles.subtitle, styles.heroSubtitle, { textAlign: isRTL ? 'right' : 'left' }]}>
              {provider ? (isRTL ? 'إدارة عملياتك' : 'Run your operations') : (isRTL ? 'مساحة عمل السائق' : 'Driver workspace')}
            </Text>
          </View>
          <NotificationBell />
          <Pressable accessibilityRole="button" accessibilityLabel={t('profile')} hitSlop={8} onPress={() => router.push('/(tabs)/profile')}>
            <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.operationsSection}>
        <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
          <Text style={styles.operationsSectionTitle}>{isRTL ? 'اختصارات العمليات' : 'Operations shortcuts'}</Text>
          <Text style={styles.operationsSectionHint}>{provider
            ? (isRTL ? 'إدارة المعدات والطلبات من مكان واحد' : 'Manage equipment and requests in one place')
            : (isRTL ? 'تابع فرص العمل وحالة نشاطك' : 'Track jobs and your availability')}</Text>
        </View>
        <View style={[styles.providerActionGrid, { flexDirection: rowDirection }]}>
          {provider && <>
            <HomeIconButton chromeless theme="dark" homeTone="default" style={styles.providerAction} onPress={() => router.push('/my-equipment')}>
              {actionIcon(Package)}<Text style={styles.providerActionText}>{isRTL ? 'معداتي' : 'My Equipment'}</Text>
            </HomeIconButton>
            <HomeIconButton chromeless theme="dark" homeTone="default" style={styles.providerAction} onPress={() => router.push('/(tabs)/add')}>
              {actionIcon(PlusCircle)}<Text style={styles.providerActionText}>{isRTL ? 'إضافة معدة' : 'Add Equipment'}</Text>
            </HomeIconButton>
            <HomeIconButton chromeless theme="dark" homeTone="default" style={styles.providerAction} onPress={() => router.push({ pathname: '/(tabs)/requests', params: { section: 'equipment' } })}>
              {actionIcon(Inbox)}<Text style={styles.providerActionText}>{isRTL ? 'الطلبات الواردة' : 'Incoming Requests'}</Text>
            </HomeIconButton>
            <HomeIconButton chromeless theme="dark" homeTone="default" style={styles.providerAction} onPress={() => router.push({ pathname: '/(tabs)/requests', params: { section: 'active' } })}>
              {actionIcon(Activity)}<Text style={styles.providerActionText}>{isRTL ? 'الإيجارات النشطة' : 'Active Rentals'}</Text>
            </HomeIconButton>
          </>}
          {!provider && <HomeIconButton chromeless theme="dark" homeTone="default" style={[styles.providerAction, styles.driverActionWide]} onPress={() => router.push({ pathname: '/(tabs)/requests', params: { section: 'drivers' } })}>
            {actionIcon(Inbox)}<Text style={styles.providerActionText}>{t('my_requests')}</Text>
          </HomeIconButton>}
        </View>
      </View>

      {provider && canUseDriverRequests && <View style={styles.operationsDriverWrap}>
        <Button chromeless theme="dark" bg="transparent" borderColor="$borderColor" borderWidth={1} rounded="$lg"
          transition="200ms" pressStyle={{ opacity: 0.9, scale: 0.985 }} style={styles.operationsDriverBanner}
          onPress={() => router.push('/(tabs)/search?mode=drivers')}>
          <LinearGradient pointerEvents="none" colors={['#123A70', '#0B2854', '#071C3F']} style={StyleSheet.absoluteFillObject} />
          <View style={[styles.driverHeadingRow, { flexDirection: rowDirection }]}>
            <View style={styles.driverIconSurface}><HardHat size={21} color={Colors.gold} strokeWidth={2} /></View>
            <View style={[styles.driverCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={[styles.driverCompactTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'تحتاج إلى سائق معدات؟' : 'Need an equipment driver?'}</Text>
              <Text style={[styles.driverCompactSubtitle, { textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'البحث عن سائق' : 'Find Driver'}</Text>
            </View>
            <View style={styles.driverArrowSurface}>{isRTL ? <ArrowLeft size={18} color={Colors.primary} /> : <ArrowRight size={18} color={Colors.primary} />}</View>
          </View>
        </Button>
        <HomeChip chromeless theme="dark" selected={false} bg="$surface" borderColor="$borderColor"
          style={[styles.homeChip, styles.operationsRequestsLink]} pressStyle={styles.homeChipPressed} transition="200ms"
          onPress={() => router.push({ pathname: '/(tabs)/requests', params: { section: 'drivers' } })}>
          <Text style={styles.homeChipText}>{t('my_requests')}</Text>
        </HomeChip>
      </View>}
    </ScrollView>
  </SafeAreaView></View>;
}

function MarketplaceHome() {
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
      <EquipmentCard equipment={item} compact={view === 'grid'} home />
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
  const rowDirection = Platform.OS === 'web'
    ? (isRTL ? 'row-reverse' : 'row')
    : (isRTL === I18nManager.isRTL ? 'row' : 'row-reverse');

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
          <LinearGradient colors={['#0B2854', '#061B3B', '#011130']} locations={[0, 0.55, 1]} style={styles.heroSurface}>
            <View pointerEvents="none" style={styles.heroHighlight} />
            <View style={[styles.header, { flexDirection: rowDirection }]}>
              <YStack flex={1} gap="$xs" items={isRTL ? 'flex-end' : 'flex-start'}>
                <XStack items="center" gap="$xs">
                  <View style={styles.liveDot} />
                  <Text style={styles.heroEyebrow}>{isRTL ? 'سوق المعدات الثقيلة' : 'Heavy equipment marketplace'}</Text>
                </XStack>
                <Text style={[styles.greeting, styles.heroGreeting, { textAlign: isRTL ? 'right' : 'left' }]}>
                  {isAuthenticated ? `${t('welcome_back')}` : t('welcome')} {userName || ''}
                </Text>
                <Text style={[styles.subtitle, styles.heroSubtitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('browse_equipment')}</Text>
              </YStack>
              <View style={[styles.headerActions, { flexDirection: rowDirection }]}>
                {isAuthenticated ? (
                  <NotificationBell />
                ) : (
                  <HomeIconButton chromeless theme="dark" homeTone="default" bg="$surface" borderColor="$borderColor"
                    accessibilityLabel={t('language')} style={styles.homeIconButton}
                    pressStyle={styles.homeIconButtonPressed} transition="200ms" onPress={handleGuestLanguage}>
                    <Globe size={21} strokeWidth={2} color={Colors.textPrimary} />
                  </HomeIconButton>
                )}
                <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
              </View>
            </View>

            <XStack style={[styles.discoveryDock, { flexDirection: rowDirection }]} gap="$sm" items="center">
              <Card theme="dark" bg="$surface" borderColor="$borderColor" rounded="$lg" borderWidth={1} flex={1}
                style={[styles.searchBar, { flexDirection: rowDirection }]}>
                <View style={styles.searchIconSurface}>
                  <Search size={20} color={Colors.gold} strokeWidth={2} />
                </View>
                <Input unstyled theme="dark" testID="home-search-input" style={[styles.searchText, { textAlign: isRTL ? 'right' : 'left', color: Colors.textPrimary }]}
                  placeholder={t('search_placeholder')} placeholderTextColor="$colorMuted"
                  value={text} onChangeText={changeText} onSubmitEditing={() => { commitText(); handleSearch(); }} />
              </Card>
              <HomeChip chromeless theme="dark" accessibilityRole="button" accessibilityState={{ expanded: showFilters }} selected={showFilters}
                bg={showFilters ? '$accent' : '$surface'} borderColor={showFilters ? '$accent' : '$borderColor'}
                style={styles.searchFilterButton} pressStyle={styles.homeChipPressed} transition="200ms"
                onPress={() => { if (!showFilters) beginFilters(); setShowFilters(value => !value); }}>
                <SlidersHorizontal size={18} color={showFilters ? Colors.primary : Colors.gold} strokeWidth={2.2} />
                <Text style={[styles.searchFilterText, showFilters && styles.searchFilterTextActive]}>{filters.countryCode}</Text>
              </HomeChip>
            </XStack>
          </LinearGradient>

          <View style={styles.section}>
            <View style={[styles.sectionHeader, { flexDirection: rowDirection }]}>
              <YStack gap="$xs" items={isRTL ? 'flex-end' : 'flex-start'}>
                <Text style={styles.sectionTitle}>{t('categories')}</Text>
                <Text style={styles.sectionHint}>{isRTL ? 'اختر نوع المعدة للوصول أسرع' : 'Choose a type to narrow your search'}</Text>
              </YStack>
              <Pressable onPress={handleSearch}>
                <Text style={styles.seeAll}>{t('see_all')}</Text>
              </Pressable>
            </View>
            <ScrollView testID="home-category-scroll" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.categoriesScroll, { flexDirection: rowDirection }]}>
              {mockCategories.map(cat => (
                <CategoryCard key={cat.id} category={cat} onPress={handleCategoryPress} isSelected={selectedCategory === cat.id} home />
              ))}
            </ScrollView>
          </View>
          {(showFilters || hasFilters) && <View style={styles.locationFilters}>
            {hasFilters && <HomeChip chromeless theme="dark" selected={false} bg="$surface" borderColor="$borderColor"
              accessibilityRole="button" style={styles.resetChip}
              pressStyle={styles.homeChipPressed} transition="200ms" onPress={() => { resetAll(); setShowFilters(false); }}>
              <Text style={styles.homeChipText}>{t('reset_filters')}</Text>
            </HomeChip>}
            {showFilters && <Animated.View entering={FadeInDown.duration(180)} style={styles.filtersPanel}>
              <DiscoveryFilters filters={draftFilters} markets={markets} setFilter={changeFilter} />
              <HomeChip chromeless theme="dark" accessibilityRole="button" testID="home-apply-filters" selected
                bg="$accent" borderColor="$accent" style={styles.applyFiltersButton}
                pressStyle={styles.homeChipPressed} transition="200ms"
                onPress={() => { commitFilters(); setShowFilters(false); }}>
                <Text style={styles.applyFiltersText}>{isRTL ? 'تطبيق الفلاتر' : 'Apply Filters'}</Text>
              </HomeChip>
            </Animated.View>}
          </View>}

          {user?.accountPurpose !== 'store_review' && <Animated.View entering={FadeInDown.duration(220)} style={styles.driverPanelWrap}>
            <Button chromeless theme="dark" bg="transparent" borderColor="$borderColor" borderWidth={1} rounded="$lg"
              animateOnly={['opacity', 'transform']}
              transition="200ms" pressStyle={{ opacity: 0.9, scale: 0.985 }} style={styles.driverBanner}
              accessibilityLabel={isRTL ? 'البحث عن سائق معدات' : 'Find an equipment driver'}
              onPress={() => router.push('/(tabs)/search?mode=drivers')}>
              <LinearGradient pointerEvents="none" colors={['#123A70', '#0B2854', '#071C3F']} style={StyleSheet.absoluteFillObject} />
              <View style={[styles.driverHeadingRow, { flexDirection: rowDirection }]}>
                <View style={styles.driverIconSurface}>
                  <HardHat size={21} color={Colors.gold} strokeWidth={2} />
                </View>
                <View style={[styles.driverCopy, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <Text style={[styles.driverCompactTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
                    {isRTL ? 'تحتاج سائق معدات؟' : 'Need an equipment driver?'}
                  </Text>
                  <Text style={[styles.driverCompactSubtitle, { textAlign: isRTL ? 'right' : 'left' }]}>
                    {isRTL ? 'اعثر على السائق المناسب' : 'Find the right driver'}
                  </Text>
                </View>
                <View style={styles.driverArrowSurface}>
                  {isRTL ? <ArrowLeft size={18} color={Colors.primary} strokeWidth={2.4} /> : <ArrowRight size={18} color={Colors.primary} strokeWidth={2.4} />}
                </View>
              </View>
            </Button>
            {isAuthenticated && user?.role !== 'driver' && (
              <HomeChip chromeless theme="dark" selected={false} bg="$surface" borderColor="$borderColor"
                style={[styles.homeChip, styles.driverRequestsLink]}
                pressStyle={styles.homeChipPressed} transition="200ms"
                onPress={() => router.push({ pathname: '/(tabs)/requests', params: { section: 'drivers' } })}>
                <Text style={styles.homeChipText}>{isRTL ? 'عرض طلبات السائقين' : 'View driver requests'}</Text>
              </HomeChip>
            )}
          </Animated.View>}

          <View style={[styles.sectionHeader, styles.equipmentHeader, { flexDirection: rowDirection }]}>
            <YStack gap="$xs" items={isRTL ? 'flex-end' : 'flex-start'}>
              <Text style={styles.sectionTitle}>{t('all_equipment')}</Text>
              <Text style={styles.sectionHint}>{isRTL ? 'معدات متاحة للإيجار الآن' : 'Equipment available to rent now'}</Text>
            </YStack>
            <Card theme="dark" bg="$surface" borderColor="$borderColor" rounded="$md" borderWidth={1} style={styles.viewToggle}>
              <HomeIconButton chromeless theme="dark" accessibilityRole="button" accessibilityLabel={t('list_view')} accessibilityState={{ selected: view === 'list' }}
                homeTone={view === 'list' ? 'active' : 'subtle'} style={styles.viewToggleButton} pressStyle={styles.homeIconButtonPressed} transition="200ms"
                onPress={() => { setView('list'); void saveEquipmentView('list'); }}>
                <List size={19} strokeWidth={2} color={view === 'list' ? Colors.gold : Colors.textMuted} />
              </HomeIconButton>
              <HomeIconButton chromeless theme="dark" accessibilityRole="button" accessibilityLabel={t('grid_view')} accessibilityState={{ selected: view === 'grid' }}
                homeTone={view === 'grid' ? 'active' : 'subtle'} style={styles.viewToggleButton} pressStyle={styles.homeIconButtonPressed} transition="200ms"
                onPress={() => { setView('grid'); void saveEquipmentView('grid'); }}>
                <Grid2X2 size={18} strokeWidth={2} color={view === 'grid' ? Colors.gold : Colors.textMuted} />
              </HomeIconButton>
            </Card>
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
  heroSurface: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderBottomWidth: 1,
    borderColor: 'rgba(67, 137, 204, 0.28)',
    overflow: 'hidden',
    paddingBottom: 16,
  },
  heroHighlight: {
    backgroundColor: 'rgba(67, 137, 204, 0.12)',
    borderRadius: 120,
    height: 180,
    position: 'absolute',
    right: -72,
    top: -96,
    width: 180,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    alignItems: 'center',
  },
  greeting: {
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: '#A8B6C8',
  },
  heroEyebrow: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  liveDot: {
    backgroundColor: Colors.gold,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  heroGreeting: {
    fontSize: 24,
    lineHeight: 31,
  },
  heroSubtitle: {
    color: '#B9C7D9',
    fontSize: 13,
  },
  headerActions: {
    alignItems: 'center',
    gap: 12,
  },
  homeIconButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  homeIconButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
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
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  searchBar: {
    alignItems: 'center',
    gap: 8,
    height: 56,
    paddingHorizontal: 12,
  },
  discoveryDock: {
    paddingHorizontal: 16,
  },
  searchIconSurface: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: Colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operationsContent: { paddingBottom: 24 },
  operationsHero: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28, borderBottomWidth: 1, borderColor: 'rgba(67, 137, 204, 0.28)', overflow: 'hidden' },
  operationsSection: { gap: 12, marginTop: 20, paddingHorizontal: 16 },
  operationsSectionTitle: { color: Colors.textPrimary, fontSize: 18, lineHeight: 25, fontWeight: '800' },
  operationsSectionHint: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  providerActionGrid: { flexWrap: 'wrap', gap: 10 },
  providerAction: {
    width: '48%',
    minHeight: 82,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  operationsIconSurface: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  providerActionText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  driverActionWide: { width: '100%' },
  operationsDriverWrap: { gap: 8, marginHorizontal: 16, marginTop: 20 },
  operationsDriverBanner: { minHeight: 98, overflow: 'hidden', paddingHorizontal: 16, width: '100%' },
  operationsRequestsLink: { alignSelf: 'center' },
  marketLink: { alignSelf: 'center', paddingVertical: 4 },
  searchText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 14,
    paddingVertical: 0,
  },
  section: {
    marginTop: 22,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  seeAll: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  sectionHint: {
    color: '#8297B1',
    fontSize: 11,
    lineHeight: 16,
  },
  seeAllRow: {
    alignItems: 'center',
    gap: 2,
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    paddingBottom: 3,
  },
  locationFilters: { marginTop: 12, gap: 8, paddingHorizontal: 16 },
  filterRow: { gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  homeChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  homeChipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  homeChipText: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '700',
  },
  searchFilterButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 56,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: 12,
  },
  searchFilterText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '800',
  },
  searchFilterTextActive: {
    color: Colors.primary,
  },
  filtersPanel: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 12,
  },
  resetChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  applyFiltersButton: {
    alignSelf: 'stretch',
    borderRadius: 13,
    borderWidth: 1,
    minHeight: 44,
  },
  applyFiltersText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
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
  listItem: { paddingHorizontal: 16 },
  driverIconSurface: {
    alignItems: 'center',
    backgroundColor: 'rgba(1, 17, 48, 0.62)',
    borderColor: 'rgba(67, 137, 204, 0.34)',
    borderRadius: 13,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  driverPanelWrap: {
    gap: 8,
    marginBottom: 10,
    marginHorizontal: 16,
    marginTop: 20,
  },
  driverBanner: {
    height: 88,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  driverHeadingRow: {
    alignItems: 'center',
    gap: 10,
  },
  driverCopy: {
    flex: 1,
    gap: 2,
  },
  driverCompactTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  driverCompactSubtitle: {
    color: '#A8B6C8',
    fontSize: 12,
    lineHeight: 18,
  },
  driverArrowSurface: {
    alignItems: 'center',
    backgroundColor: Colors.gold,
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  driverRequestsLink: {
    alignSelf: 'center',
    minHeight: 38,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
  },
  equipmentHeader: {
    marginTop: 26,
  },
  viewToggleButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 0,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
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
