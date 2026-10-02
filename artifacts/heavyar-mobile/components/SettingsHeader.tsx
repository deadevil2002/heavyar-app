import React, { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { HeavyarIconButton, useHeavyarDirection } from '@/components/ui/heavyar';
import { backFromSettings, handleSettingsHardwareBack, type SettingsFallback } from '@/services/settingsNavigation';

export default function SettingsHeader({ title, fallback = '/settings' }: {
  title: string;
  fallback?: SettingsFallback;
}) {
  const router = useRouter();
  const { isRTL } = useLanguage();
  const { rowDirection, textAlign } = useHeavyarDirection();
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const goBack = useCallback(() => backFromSettings(router, fallback), [router, fallback]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      handleSettingsHardwareBack(router, fallback));
    return () => subscription.remove();
  }, [router, fallback]));

  return (
    <XStack items="center" flexDirection={rowDirection} gap="$sm" px="$md" py="$sm">
      <HeavyarIconButton accessibilityRole="button" accessibilityLabel={isRTL ? 'رجوع' : 'Back'}
        testID="settings-back" tone="subtle" onPress={goBack}>
        <BackIcon size={21} color="#FFFFFF" strokeWidth={2} />
      </HeavyarIconButton>
      <Text flex={1} minW={0} fontSize={19} fontWeight="800" color="$color" text={textAlign}>{title}</Text>
      <YStack width="$controlMd" />
    </XStack>
  );
}
