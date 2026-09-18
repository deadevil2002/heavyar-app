import React, { useCallback } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { backFromSettings, handleSettingsHardwareBack, type SettingsFallback } from '@/services/settingsNavigation';

export default function SettingsHeader({ title, fallback = '/settings' }: {
  title: string;
  fallback?: SettingsFallback;
}) {
  const router = useRouter();
  const { isRTL } = useLanguage();
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const goBack = useCallback(() => backFromSettings(router, fallback), [router, fallback]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      handleSettingsHardwareBack(router, fallback));
    return () => subscription.remove();
  }, [router, fallback]));

  return (
    <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={isRTL ? 'رجوع' : 'Back'}
        testID="settings-back" style={styles.backButton} onPress={goBack}>
        <BackIcon size={22} color={Colors.textPrimary} />
      </Pressable>
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', gap: 12 },
  backButton: { width: 42, height: 42, flexShrink: 0, borderRadius: 14, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  spacer: { width: 42, flexShrink: 0 },
});