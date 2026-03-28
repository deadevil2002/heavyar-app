import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Settings, Package, Star, ChevronLeft, ChevronRight, LogOut, Shield, Edit3, X, Check, FileText, Briefcase, ShoppingCart, Receipt, ChevronDown } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { saudiRegions, getCitiesByRegion, findCityById, findRegionById, findRegionByCityId } from '@/mocks/saudiRegions';

export default function ProfileScreen() {
  const { isRTL, t, localizedText } = useLanguage();
  const { user, isAuthenticated, logout, updateProfile } = useAuth();
  const router = useRouter();
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editRegion, setEditRegion] = useState<string>('');
  const [editCity, setEditCity] = useState<string>('');
  const [editCustomCity, setEditCustomCity] = useState<string>('');
  const [editCrNumber, setEditCrNumber] = useState<string>('');
  const [showRegionPicker, setShowRegionPicker] = useState<boolean>(false);
  const [showCityPicker, setShowCityPicker] = useState<boolean>(false);
  const [citySearch, setCitySearch] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const handleLogin = useCallback(() => {
    router.push('/login');
  }, [router]);

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const editRegionObj = React.useMemo(() => findRegionById(editRegion), [editRegion]);
  const editRegionCities = React.useMemo(() => getCitiesByRegion(editRegion), [editRegion]);
  const editFilteredCities = React.useMemo(() => {
    if (!citySearch.trim()) return editRegionCities;
    const q = citySearch.toLowerCase();
    return editRegionCities.filter(c => c.nameAr.includes(q) || c.nameEn.toLowerCase().includes(q));
  }, [editRegionCities, citySearch]);
  const editCityObj = React.useMemo(() => findCityById(editCity), [editCity]);

  const startEditing = useCallback(() => {
    if (!user) return;
    setEditName(user.nameAr || '');
    setEditPhone(user.phone || '');
    const userRegion = user.region || '';
    if (userRegion) {
      setEditRegion(userRegion);
    } else if (user.city) {
      const foundRegion = findRegionByCityId(user.city);
      if (foundRegion) setEditRegion(foundRegion.id);
    }
    setEditCity(user.city || '');
    setEditCustomCity(user.customCity || '');
    setEditCrNumber(user.crNumber || '');
    setShowRegionPicker(false);
    setShowCityPicker(false);
    setCitySearch('');
    setIsEditing(true);
  }, [user]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!user) return;

    if (!editName.trim()) {
      showDialog(t('validation_error'), t('validation_name_required'), [{ text: t('ok'), style: 'default' }]);
      return;
    }

    if (user.role === 'provider' && editCrNumber.trim() && !/^\d{10}$/.test(editCrNumber.trim())) {
      showDialog(t('validation_error'), t('cr_validation_error'), [{ text: t('ok'), style: 'default' }]);
      return;
    }

    setSaving(true);
    try {
      const updates: Record<string, string> = {
        nameAr: editName.trim(),
        nameEn: editName.trim(),
        phone: editPhone.trim(),
        region: editRegion,
        city: editCity,
        customCity: editCustomCity.trim(),
      };
      if (user.role === 'provider') {
        updates.crNumber = editCrNumber.trim();
      }
      await updateProfile(updates);
      setIsEditing(false);
      showDialog(t('success'), t('profile_updated'), [{ text: t('ok'), style: 'default' }]);
    } catch (e) {
      console.log('[Profile] Save error:', e);
      showDialog(t('error_title'), t('profile_update_failed'), [{ text: t('ok'), style: 'default' }]);
    } finally {
      setSaving(false);
    }
  }, [user, editName, editPhone, editRegion, editCity, editCustomCity, editCrNumber, updateProfile, t, showDialog]);

  const ChevronIcon = isRTL ? ChevronLeft : ChevronRight;

  const menuItems = [
    ...(user?.role === 'provider' ? [{ icon: Package, label: t('my_equipment'), route: '/my-equipment' as const }] : []),
    { icon: Receipt, label: t('invoices'), route: '/invoices' as const },
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
                <View style={[styles.roleBadge, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {user.role === 'provider' ? (
                    <Briefcase size={12} color={Colors.gold} />
                  ) : (
                    <ShoppingCart size={12} color={Colors.info} />
                  )}
                  <Text style={[styles.roleText, { color: user.role === 'provider' ? Colors.gold : Colors.info }]}>
                    {user.role === 'provider' ? t('provider') : t('customer')}
                  </Text>
                </View>
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
                <Text style={styles.statValue}>
                  {user.city ? (findCityById(user.city)?.nameAr || user.city) : user.customCity || '-'}
                </Text>
                <Text style={styles.statLabel}>{t('city')}</Text>
              </View>
            </View>
          </View>

          {user.role === 'provider' && user.crNumber ? (
            <View style={styles.crCard}>
              <View style={[styles.crRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <FileText size={18} color={Colors.gold} />
                <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                  <Text style={styles.crLabel}>{t('cr_number')}</Text>
                  <Text style={styles.crValue}>{user.crNumber}</Text>
                </View>
                <View style={[styles.crStatusBadge, { backgroundColor: user.crVerified ? 'rgba(46, 204, 113, 0.15)' : 'rgba(243, 156, 18, 0.15)' }]}>
                  <Text style={[styles.crStatusText, { color: user.crVerified ? Colors.success : Colors.warning }]}>
                    {user.crVerified ? t('cr_verified') : t('cr_not_verified')}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {isEditing ? (
            <View style={styles.editSection}>
              <View style={[styles.editHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={styles.editTitle}>{t('edit_profile_title')}</Text>
                <Pressable onPress={cancelEditing}>
                  <X size={22} color={Colors.textMuted} />
                </Pressable>
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('name')}</Text>
                <TextInput
                  style={[styles.editInput, { textAlign: isRTL ? 'right' : 'left' }]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('phone')}</Text>
                <TextInput
                  style={[styles.editInput, { textAlign: isRTL ? 'right' : 'left' }]}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.editField}>
                <Text style={[styles.editLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_region')}</Text>
                <Pressable
                  style={[styles.editPicker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                  onPress={() => { setShowRegionPicker(!showRegionPicker); setShowCityPicker(false); }}
                >
                  <Text style={[styles.editPickerText, !editRegion && { color: Colors.textMuted }]}>
                    {editRegionObj ? localizedText(editRegionObj.nameAr, editRegionObj.nameEn) : t('select_region')}
                  </Text>
                  <ChevronDown size={18} color={Colors.textMuted} />
                </Pressable>
                {showRegionPicker && (
                  <ScrollView style={styles.editPickerDropdown} nestedScrollEnabled>
                    {saudiRegions.map(r => (
                      <Pressable
                        key={r.id}
                        style={[styles.editPickerItem, editRegion === r.id && styles.editPickerItemSelected]}
                        onPress={() => { setEditRegion(r.id); setEditCity(''); setEditCustomCity(''); setCitySearch(''); setShowRegionPicker(false); }}
                      >
                        <Text style={[styles.editPickerItemText, editRegion === r.id && { color: Colors.gold }]}>
                          {localizedText(r.nameAr, r.nameEn)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>

              {editRegion ? (
                <View style={styles.editField}>
                  <Text style={[styles.editLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('select_city')}</Text>
                  <Pressable
                    style={[styles.editPicker, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
                    onPress={() => { setShowCityPicker(!showCityPicker); setShowRegionPicker(false); }}
                  >
                    <Text style={[styles.editPickerText, !editCity && { color: Colors.textMuted }]}>
                      {editCityObj ? localizedText(editCityObj.nameAr, editCityObj.nameEn) : t('select_city')}
                    </Text>
                    <ChevronDown size={18} color={Colors.textMuted} />
                  </Pressable>
                  {showCityPicker && (
                    <View style={styles.editPickerDropdown}>
                      <TextInput
                        style={[styles.editCitySearch, { textAlign: isRTL ? 'right' : 'left' }]}
                        placeholder={t('search_city')}
                        placeholderTextColor={Colors.textMuted}
                        value={citySearch}
                        onChangeText={setCitySearch}
                      />
                      <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                        {editFilteredCities.map(c => (
                          <Pressable
                            key={c.id}
                            style={[styles.editPickerItem, editCity === c.id && styles.editPickerItemSelected]}
                            onPress={() => { setEditCity(c.id); setEditCustomCity(''); setShowCityPicker(false); setCitySearch(''); }}
                          >
                            <Text style={[styles.editPickerItemText, editCity === c.id && { color: Colors.gold }]}>
                              {localizedText(c.nameAr, c.nameEn)}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  <TextInput
                    style={[styles.editInput, { textAlign: isRTL ? 'right' : 'left' }]}
                    placeholder={t('custom_city_placeholder')}
                    placeholderTextColor={Colors.textMuted}
                    value={editCustomCity}
                    onChangeText={(text) => { setEditCustomCity(text); if (text.trim()) setEditCity(''); }}
                  />
                </View>
              ) : null}

              {user.role === 'provider' && (
                <View style={styles.editField}>
                  <Text style={[styles.editLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('cr_number')}</Text>
                  <TextInput
                    style={[styles.editInput, { textAlign: isRTL ? 'right' : 'left' }]}
                    value={editCrNumber}
                    onChangeText={setEditCrNumber}
                    keyboardType="numeric"
                    maxLength={10}
                    placeholder={t('cr_number_placeholder')}
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
              )}

              <Pressable
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Check size={18} color={Colors.primary} />
                    <Text style={styles.saveButtonText}>{t('save')}</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.editProfileButton} onPress={startEditing}>
              <Edit3 size={18} color={Colors.gold} />
              <Text style={styles.editProfileText}>{t('edit_profile')}</Text>
            </Pressable>
          )}

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
  roleBadge: {
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600' as const,
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
  crCard: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  crRow: {
    alignItems: 'center',
    gap: 12,
  },
  crLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  crValue: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  crStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  crStatusText: {
    fontSize: 12,
    fontWeight: '600' as const,
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
  editSection: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  editHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  editField: {
    gap: 6,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  editInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700' as const,
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
  editPicker: {
    backgroundColor: Colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editPickerText: {
    color: Colors.textPrimary,
    fontSize: 15,
  },
  editPickerDropdown: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: 200,
    overflow: 'hidden' as const,
  },
  editPickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  editPickerItemSelected: {
    backgroundColor: Colors.surface,
  },
  editPickerItemText: {
    color: Colors.textPrimary,
    fontSize: 14,
  },
  editCitySearch: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
});
