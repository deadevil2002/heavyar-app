import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Settings, Package, Star, ChevronLeft, ChevronRight, LogOut, Shield, Edit3 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const { isRTL, t, localizedText } = useLanguage();
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  const handleLogin = useCallback(() => {
    router.push('/login');
  }, [router]);

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const ChevronIcon = isRTL ? ChevronLeft : ChevronRight;

  const menuItems = [
    { icon: Package, label: t('my_equipment'), route: '/my-equipment' as const },
    { icon: Settings, label: t('settings'), route: '/settings' as const },
  ];

  if (!isAuthenticated || !user) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <View style={styles.loginContainer}>
            <Image source={require('@/assets/images/logo.png')} style={styles.loginLogo} contentFit="contain" />
            <Text style={styles.loginTitle}>{t('app_name')}</Text>
            <Text style={styles.loginSubtitle}>{t('browse_equipment')}</Text>
            <Pressable style={styles.loginButton} onPress={handleLogin}>
              <Text style={styles.loginButtonText}>{t('login')}</Text>
            </Pressable>
            <Pressable style={styles.registerLink} onPress={() => router.push('/register')}>
              <Text style={styles.registerText}>{t('dont_have_account')} <Text style={styles.registerHighlight}>{t('register')}</Text></Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const userName = localizedText(user.nameAr, user.nameEn);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('profile')}</Text>
          </View>

          <View style={styles.profileCard}>
            <View style={[styles.profileHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Image source={{ uri: user.avatar }} style={styles.avatar} contentFit="cover" />
              <View style={[styles.profileInfo, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                <View style={[styles.nameRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={styles.name}>{userName}</Text>
                  {user.isVerified && <Shield size={16} color={Colors.success} />}
                </View>
                <Text style={styles.email}>{user.email}</Text>
                <Text style={styles.memberSince}>{t('member_since')} {user.joinedAt}</Text>
              </View>
            </View>

            <View style={[styles.statsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{user.equipmentCount}</Text>
                <Text style={styles.statLabel}>{t('equipment_count')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <View style={[styles.ratingInline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Star size={16} color={Colors.gold} fill={Colors.gold} />
                  <Text style={styles.statValue}>{user.rating}</Text>
                </View>
                <Text style={styles.statLabel}>{user.totalRatings} {t('rating_count')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{user.city === 'riyadh' ? t('riyadh') : user.city}</Text>
                <Text style={styles.statLabel}>{t('city')}</Text>
              </View>
            </View>
          </View>

          <Pressable style={styles.editProfileButton}>
            <Edit3 size={18} color={Colors.gold} />
            <Text style={styles.editProfileText}>{t('edit_profile')}</Text>
          </Pressable>

          <View style={styles.menuSection}>
            {menuItems.map((item, index) => (
              <Pressable
                key={index}
                style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                onPress={() => router.push(item.route)}
              >
                <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={styles.menuIcon}>
                    <item.icon size={20} color={Colors.gold} />
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </View>
                <ChevronIcon size={20} color={Colors.textMuted} />
              </Pressable>
            ))}
          </View>

          <Pressable style={[styles.logoutButton, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={handleLogout}>
            <LogOut size={20} color={Colors.error} />
            <Text style={styles.logoutText}>{t('logout')}</Text>
          </Pressable>

          <View style={styles.bottomPadding} />
        </ScrollView>
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
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loginLogo: {
    width: 100,
    height: 100,
    borderRadius: 24,
    marginBottom: 20,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: Colors.gold,
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  loginButtonText: {
    color: Colors.primary,
    fontSize: 17,
    fontWeight: '700' as const,
  },
  registerLink: {
    paddingVertical: 8,
  },
  registerText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  registerHighlight: {
    color: Colors.gold,
    fontWeight: '600' as const,
  },
  profileCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileHeader: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  email: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  memberSince: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  statsRow: {
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  stat: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.divider,
  },
  ratingInline: {
    alignItems: 'center',
    gap: 4,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  editProfileText: {
    color: Colors.gold,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  menuSection: {
    marginTop: 24,
    marginHorizontal: 20,
    backgroundColor: Colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  menuLeft: {
    alignItems: 'center',
    gap: 12,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '500' as const,
  },
  logoutButton: {
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  bottomPadding: {
    height: 40,
  },
});
