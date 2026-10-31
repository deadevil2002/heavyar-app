import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import SettingsHeader from '@/components/SettingsHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { createNotificationOperationGuard } from '@/services/notificationOperationGuard';
import {
  defaultPreferences,
  enablePushNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/services/notificationService';

const REQUIRED_CATEGORIES = new Set<keyof NotificationPreferences>(['payment', 'verification', 'security']);

export default function NotificationSettingsScreen() {
  const { t, isRTL } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  const uid = isAuthenticated ? user?.uid || '' : '';
  const operations = useRef(createNotificationOperationGuard()).current;
  operations.setIdentity(uid);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(!!uid);
  const [savingCategory, setSavingCategory] = useState<keyof NotificationPreferences | null>(null);
  const [enablingPush, setEnablingPush] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    const isCurrent = operations.begin(uid, 'preferences-load');
    setLoading(true);
    setError(null);
    try {
      const saved = await getNotificationPreferences(uid);
      if (isCurrent()) setPreferences(saved);
    } catch {
      if (isCurrent()) setError(t('notifications_error'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [operations, t, uid]);

  useEffect(() => {
    setPreferences(defaultPreferences);
    setSavingCategory(null);
    setEnablingPush(false);
    setError(null);
    setLoading(!!uid);
    if (uid) void load();
    return () => operations.invalidate();
  }, [load, operations, uid]);

  const togglePreference = useCallback(async (category: keyof NotificationPreferences) => {
    if (!uid || REQUIRED_CATEGORIES.has(category) || savingCategory) return;
    const previous = preferences;
    const next = { ...preferences, [category]: !preferences[category] };
    const isCurrent = operations.begin(uid, 'preference-save');
    setPreferences(next);
    setSavingCategory(category);
    setError(null);
    try {
      const saved = await updateNotificationPreferences(next, uid);
      if (isCurrent()) setPreferences(saved);
    } catch {
      if (isCurrent()) {
        setPreferences(previous);
        setError(t('notifications_error'));
      }
    } finally {
      if (isCurrent()) setSavingCategory(null);
    }
  }, [operations, preferences, savingCategory, t, uid]);

  const enablePush = useCallback(async () => {
    if (!uid || enablingPush) return;
    const isCurrent = operations.begin(uid, 'permission');
    setEnablingPush(true);
    setError(null);
    try {
      const result = await enablePushNotifications(uid);
      if (isCurrent() && result.status !== 'registered') setError(t('notification_permission_denied'));
    } catch {
      if (isCurrent()) setError(t('notifications_error'));
    } finally {
      if (isCurrent()) setEnablingPush(false);
    }
  }, [enablingPush, operations, t, uid]);

  return <View style={styles.container}>
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <SettingsHeader title={t('notification_preferences')} fallback="/settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { textAlign: isRTL ? 'right' : 'left' }]}>{t('notification_settings_description')}</Text>
        {!uid ? <Text style={styles.error}>{t('login_required_message')}</Text> : loading ?
          <View style={styles.loading}><ActivityIndicator color={Colors.gold} /><Text style={styles.muted}>{t('loading')}</Text></View> : <>
            <View style={styles.preferenceList}>
              {(Object.keys(defaultPreferences) as (keyof NotificationPreferences)[]).map(category => {
                const required = REQUIRED_CATEGORIES.has(category);
                return <View key={category} style={[styles.preferenceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.preferenceLabel, { textAlign: isRTL ? 'right' : 'left' }]}>
                    {t(`notification_${category}` as never)}{required ? ` (${t('required')})` : ''}
                  </Text>
                  <Switch
                    accessibilityRole="switch"
                    accessibilityLabel={t(`notification_${category}` as never)}
                    accessibilityState={{ checked: preferences[category], disabled: required || savingCategory !== null }}
                    value={preferences[category]}
                    disabled={required || savingCategory !== null}
                    onValueChange={() => void togglePreference(category)}
                    trackColor={{ false: Colors.border, true: Colors.goldDark }}
                    thumbColor={preferences[category] ? Colors.gold : Colors.textMuted}
                  />
                </View>;
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('enable_device_notifications')}
              accessibilityState={{ busy: enablingPush }}
              disabled={enablingPush}
              onPress={() => void enablePush()}
              style={({ pressed }) => [styles.pushButton, pressed && styles.pressed, enablingPush && styles.disabled]}
            >
              {enablingPush ? <ActivityIndicator color={Colors.primary} /> : <Bell size={18} color={Colors.primary} />}
              <Text style={styles.pushButtonText}>{t('enable_device_notifications')}</Text>
            </Pressable>
          </>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  description: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
  preferenceList: { gap: 8 },
  preferenceRow: { minHeight: 52, alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  preferenceLabel: { flex: 1, color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },
  pushButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 14, backgroundColor: Colors.gold, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  pushButtonText: { color: Colors.primary, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.62 },
  loading: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: Colors.textMuted },
  error: { color: Colors.error, textAlign: 'center', lineHeight: 20 },
});
