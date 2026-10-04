import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Globe, Bell, Info, FileText, HelpCircle, ChevronLeft, ChevronRight, Trash2, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';
import { useAccountDeletion } from '@/hooks/useAccountDeletion';
import SettingsHeader from '@/components/SettingsHeader';
import { mobilePerformance } from '@/utils/mobilePerformance';

export default function SettingsScreen() {
  mobilePerformance.countRender('Settings');
  const { isRTL, t, language, setLanguage } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const handleAccountDeletion = useAccountDeletion(showDialog);

  const ChevronIcon = isRTL ? ChevronLeft : ChevronRight;

  const handleLanguageSwitch = useCallback(async () => {
    const newLang = language === 'ar' ? 'en' : 'ar';
    await setLanguage(newLang);
    showDialog(
      t('language_changed'),
      t('change_language_restart'),
      [{ text: t('ok'), style: 'default' }]
    );
  }, [language, setLanguage, t, showDialog]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <SettingsHeader title={t('settings')} fallback="/(tabs)/profile" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <Pressable style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={handleLanguageSwitch}>
              <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.menuIcon}>
                  <Globe size={20} color={Colors.gold} />
                </View>
                <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                  <Text style={styles.menuLabel}>{t('language')}</Text>
                  <Text style={styles.menuSub}>{language === 'ar' ? t('arabic') : t('english')}</Text>
                </View>
              </View>
              <ChevronIcon size={20} color={Colors.textMuted} />
            </Pressable>

            <View style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.menuIcon}>
                  <Bell size={20} color={Colors.gold} />
                </View>
                <Text style={styles.menuLabel}>{t('notifications')}</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: Colors.surface, true: Colors.gold }}
                thumbColor={Colors.white}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Pressable style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => router.navigate('/privacy')}>
              <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.menuIcon}>
                  <FileText size={20} color={Colors.gold} />
                </View>
                <Text style={styles.menuLabel}>{t('privacy_policy')}</Text>
              </View>
              <ChevronIcon size={20} color={Colors.textMuted} />
            </Pressable>

            <Pressable style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => router.navigate('/terms')}>
              <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.menuIcon}>
                  <FileText size={20} color={Colors.gold} />
                </View>
                <Text style={styles.menuLabel}>{t('terms')}</Text>
              </View>
              <ChevronIcon size={20} color={Colors.textMuted} />
            </Pressable>

            <Pressable style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => router.navigate('/help')}>
              <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.menuIcon}>
                  <HelpCircle size={20} color={Colors.gold} />
                </View>
                <Text style={styles.menuLabel}>{t('help')}</Text>
              </View>
              <ChevronIcon size={20} color={Colors.textMuted} />
            </Pressable>

            <Pressable style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.menuIcon}>
                  <Info size={20} color={Colors.gold} />
                </View>
                <Text style={styles.menuLabel}>{t('about')}</Text>
              </View>
              <Text style={styles.versionText}>{t('version')} 1.0.0</Text>
            </Pressable>
          </View>

          {isAuthenticated && user ? (
            <><View style={styles.section}>
              <Pressable style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]} onPress={() => router.navigate('/privacy-rights' as never)}>
                <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}><View style={styles.menuIcon}><ShieldCheck size={20} color={Colors.gold} /></View><Text style={styles.menuLabel}>{language === 'ar' ? 'حقوق الخصوصية وطلب البيانات' : 'Privacy rights & data requests'}</Text></View><ChevronIcon size={20} color={Colors.textMuted} />
              </Pressable>
            </View><View style={styles.dangerSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('delete_account')}
                accessibilityHint={t('delete_account_hint')}
                style={({ pressed }) => [
                  styles.deleteAccountItem,
                  { flexDirection: isRTL ? 'row-reverse' : 'row' },
                  pressed && styles.deleteAccountPressed,
                ]}
                onPress={handleAccountDeletion}
              >
                <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={styles.dangerIcon}>
                    <Trash2 size={20} color={Colors.error} />
                  </View>
                  <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                    <Text style={styles.deleteAccountLabel}>{t('delete_account')}</Text>
                    <Text style={[styles.deleteAccountDescription, { textAlign: isRTL ? 'right' : 'left' }]}>
                      {t('delete_account_settings_description')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View></>
          ) : null}
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
  container: { flex: 1, backgroundColor: Colors.primary },
  scrollContent: { paddingHorizontal: 20, gap: 20, paddingBottom: 40 },
  section: {
    backgroundColor: Colors.card,
    borderRadius: 20,
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
  menuLeft: { alignItems: 'center', gap: 12 },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: { fontSize: 15, color: Colors.textPrimary, fontWeight: '700' as const },
  menuSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  versionText: { color: Colors.textMuted, fontSize: 13 },
  dangerSection: {
    backgroundColor: 'rgba(231, 76, 60, 0.06)',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.35)',
  },
  deleteAccountItem: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  deleteAccountPressed: { opacity: 0.72 },
  dangerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAccountLabel: {
    color: Colors.error,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  deleteAccountDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
});
