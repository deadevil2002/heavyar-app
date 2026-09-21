import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { MapPin, Wrench, ChevronLeft, ChevronRight, Info } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDiscoveryMarkets } from '@/contexts/DiscoveryContext';
import { getPublicDriverProfile, type DriverPublicProfile } from '@/services/workerClient';
import { useAuth } from '@/contexts/AuthContext';
import { formatDriverLocation, formatEquipmentCapability, canRequestDriver, getAvailabilityLabel } from '@/services/driverUtils';
import { LatestRequestGuard } from '@/services/driverLiveSync';

export default function DriverDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isRTL } = useLanguage();
  const markets = useDiscoveryMarkets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const accountStatus = (user as (typeof user & { accountStatus?: string }))?.accountStatus;

  const [driver, setDriver] = useState<DriverPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const guardRef = useRef(new LatestRequestGuard());

  const fetchDriver = useCallback(async (silent = false) => {
    if (!id) return;
    const request = guardRef.current.begin();
    if (!silent) setLoading(true);
    try {
      const res = await getPublicDriverProfile(id as string, request.signal);
      if (!guardRef.current.isCurrent(request.generation)) return;
      setDriver(res.profile);
      setError(false);
    } catch {
      if (!guardRef.current.isCurrent(request.generation)) return;
      setError(true);
      setDriver(null);
    } finally {
      if (guardRef.current.isCurrent(request.generation)) setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const doFetch = () => { if (active) void fetchDriver(); };
      doFetch();
       const interval = setInterval(() => {
         if (active) void fetchDriver(true);
       }, 15000);
      return () => {
        active = false;
        clearInterval(interval);
         guardRef.current.cancel();
      };
    }, [fetchDriver])
  );

  const location = driver ? formatDriverLocation(driver.countryCode, driver.region, driver.city, driver.customCity, isRTL, markets) : '';
  const getInitials = (name?: string) => {
    if (!name) return 'D';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const handleRequest = () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!canRequestDriver(isAuthenticated, user?.role, accountStatus)) {
      return;
    }
    router.push(`/driver/request?id=${id}`);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.gold} /></View>;
  if (error || !driver) return (
    <View style={styles.center}>
      <Text style={styles.errorText}>{isRTL ? 'تعذر تحميل ملف السائق. حاول مرة أخرى.' : 'Unable to load this driver. Please try again.'}</Text>
      <Pressable style={styles.retryButton} onPress={() => void fetchDriver()}>
        <Text style={styles.retryText}>{isRTL ? 'إعادة المحاولة' : 'Retry'}</Text>
      </Pressable>
      <Pressable style={styles.backLink} onPress={() => router.back()}>
        <Text style={styles.backLinkText}>{isRTL ? 'رجوع' : 'Back'}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            {isRTL ? <ChevronRight color={Colors.textPrimary} /> : <ChevronLeft color={Colors.textPrimary} />}
          </Pressable>
          <Text style={styles.headerTitle}>{isRTL ? 'ملف السائق' : 'Driver Profile'}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.profileTop}>
            {driver.photoUrl ? (
              <Image source={{ uri: driver.photoUrl }} style={styles.avatarLarge} />
            ) : (
              <View style={styles.avatarFallbackLarge}>
                <Text style={styles.avatarInitialsLarge}>{getInitials(driver.displayName)}</Text>
              </View>
            )}
            <Text style={styles.nameLarge}>{driver.displayName}</Text>
            {location ? (
              <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <MapPin size={16} color={Colors.textSecondary} />
                <Text style={styles.locationLarge}>{location}</Text>
              </View>
            ) : null}
            <View style={[styles.badgeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {driver.availabilityStatus ? <View style={[styles.badge, driver.availabilityStatus === 'available' ? styles.badgeAvailable : styles.badgeUnavailable]}>
                <Text style={driver.availabilityStatus === 'available' ? styles.badgeTextAvailable : styles.badgeTextUnavailable}>
                   {getAvailabilityLabel(driver.availabilityStatus, isRTL)}
                </Text>
              </View> : null}
              {driver.yearsExperience ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{driver.yearsExperience} {isRTL ? 'سنوات خبرة' : 'years exp.'}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {driver.description ? (
            <View style={styles.section}>
              <View style={[styles.sectionTitleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Info size={20} color={Colors.gold} />
                <Text style={styles.sectionTitle}>{isRTL ? 'عن السائق' : 'About Driver'}</Text>
              </View>
              <Text style={[styles.description, { textAlign: isRTL ? 'right' : 'left' }]}>{driver.description}</Text>
            </View>
          ) : null}

          {driver.equipmentTypes && driver.equipmentTypes.length > 0 && (
            <View style={styles.section}>
              <View style={[styles.sectionTitleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Wrench size={20} color={Colors.gold} />
                <Text style={styles.sectionTitle}>{isRTL ? 'المعدات' : 'Equipment Capabilities'}</Text>
              </View>
              <View style={[styles.chipContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {driver.equipmentTypes.map(eq => (
                  <View key={eq} style={styles.eqChip}>
                    <Text style={styles.eqChipText}>{formatEquipmentCapability(eq, isRTL)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        </ScrollView>
        <View style={styles.footer}>
          {!isAuthenticated ? (
            <Pressable style={styles.primaryButton} onPress={handleRequest}>
              <Text style={styles.primaryButtonText}>{isRTL ? 'تسجيل الدخول لطلب السائق' : 'Sign in to Request Driver'}</Text>
            </Pressable>
          ) : !canRequestDriver(isAuthenticated, user?.role, accountStatus) ? (
             <View style={styles.disabledButton}>
               <Text style={styles.disabledButtonText}>{isRTL ? 'لا يمكنك طلب سائق حالياً' : 'You cannot request drivers'}</Text>
             </View>
          ) : (
            <Pressable style={styles.primaryButton} onPress={handleRequest}>
              <Text style={styles.primaryButtonText}>{isRTL ? 'طلب سائق' : 'Request Driver'}</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  errorText: { color: Colors.error, fontSize: 16 },
  retryButton: { backgroundColor: Colors.gold, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 11, marginTop: 18 },
  retryText: { color: Colors.primary, fontWeight: '700' },
  backLink: { padding: 12, marginTop: 4 },
  backLinkText: { color: Colors.textSecondary, fontWeight: '600' },
  header: { paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  content: { padding: 20, gap: 24 },
  profileTop: { alignItems: 'center', gap: 12 },
  avatarLarge: { width: 100, height: 100, borderRadius: 50 },
  avatarFallbackLarge: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.inputBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  avatarInitialsLarge: { color: Colors.gold, fontSize: 36, fontWeight: '700' },
  nameLarge: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  row: { alignItems: 'center', gap: 6 },
  locationLarge: { fontSize: 15, color: Colors.textSecondary },
  badgeRow: { alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  badgeText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  badgeAvailable: { backgroundColor: Colors.surface, borderColor: Colors.gold },
  badgeTextAvailable: { color: Colors.gold, fontSize: 13, fontWeight: '600' },
  badgeUnavailable: { opacity: 0.8 },
  badgeTextUnavailable: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  section: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  sectionTitleRow: { alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  description: { fontSize: 15, color: Colors.textSecondary, lineHeight: 24 },
  chipContainer: { flexWrap: 'wrap', gap: 8 },
  eqChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border },
  eqChipText: { color: Colors.textPrimary, fontSize: 14 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.primary },
  primaryButton: { backgroundColor: Colors.gold, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  disabledButton: { backgroundColor: Colors.surface, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  disabledButtonText: { color: Colors.textMuted, fontSize: 15, fontWeight: '600' },
});
