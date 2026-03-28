import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Globe, Bell, Info, FileText, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import AppDialog from '@/components/AppDialog';
import { useAppDialog } from '@/hooks/useAppDialog';

export default function SettingsScreen() {
  const { isRTL, t, language, setLanguage } = useLanguage();
  const router = useRouter();
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const { dialog, showDialog, hideDialog } = useAppDialog();

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
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
        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <BackIcon size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('settings')}</Text>
          <View style={{ width: 42 }} />
        </View>

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
            <Pressable style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.menuIcon}>
                  <FileText size={20} color={Colors.gold} />
                </View>
                <Text style={styles.menuLabel}>{t('privacy_policy')}</Text>
              </View>
              <ChevronIcon size={20} color={Colors.textMuted} />
            </Pressable>

            <Pressable style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <View style={[styles.menuLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={styles.menuIcon}>
                  <FileText size={20} color={Colors.gold} />
                </View>
                <Text style={styles.menuLabel}>{t('terms')}</Text>
              </View>
              <ChevronIcon size={20} color={Colors.textMuted} />
            </Pressable>

            <Pressable style={[styles.menuItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
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
              <Text style={styles.versionText}>{t('version')} 3.0.1</Text>
            </Pressable>
          </View>
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
  header: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 18, fontWeight: '700' as const, color: Colors.textPrimary },
  scrollContent: { paddingHorizontal: 20, gap: 20, paddingBottom: 40 },
  section: {
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
  menuLeft: { alignItems: 'center', gap: 12 },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: { fontSize: 16, color: Colors.textPrimary, fontWeight: '500' as const },
  menuSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  versionText: { color: Colors.textMuted, fontSize: 13 },
});
