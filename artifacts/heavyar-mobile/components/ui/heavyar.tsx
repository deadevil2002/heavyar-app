import React from 'react';
import { ActivityIndicator, I18nManager, Platform } from 'react-native';
import {
  Button,
  Card,
  Input,
  Text,
  XStack,
  YStack,
  styled,
} from 'tamagui';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';

export const HeavyarScreen = styled(YStack, {
  bg: '$background',
  flex: 1,
});

export const HeavyarSurface = styled(Card, {
  bg: '$surface',
  borderColor: '$borderColor',
  borderWidth: 1,
  overflow: 'hidden',
  rounded: '$lg',
  variants: {
    tone: {
      default: { bg: '$surface' },
      raised: { bg: '$surfaceRaised' },
      subtle: { bg: '$navySoft' },
      transparent: { bg: '$transparent', borderColor: '$transparent' },
    },
    density: {
      compact: { p: '$sm' },
      comfortable: { p: '$md' },
      spacious: { p: '$lg' },
    },
  } as const,
  defaultVariants: {
    density: 'comfortable',
    tone: 'default',
  },
});

export const HeavyarButton = styled(Button, {
  items: 'center',
  animateOnly: ['opacity', 'transform', 'backgroundColor', 'borderColor'],
  borderWidth: 1,
  gap: '$sm',
  justify: 'center',
  minH: '$controlLg',
  px: '$md',
  pressStyle: { opacity: 0.9, scale: 0.985 },
  rounded: '$md',
  transition: '200ms',
  variants: {
    tone: {
      primary: { bg: '$accent', borderColor: '$accent' },
      secondary: { bg: '$surfaceRaised', borderColor: '$borderColor' },
      outline: { bg: '$transparent', borderColor: '$borderColor' },
      ghost: { bg: '$transparent', borderColor: '$transparent' },
      danger: { bg: '$danger', borderColor: '$danger' },
    },
    compact: {
      true: { minH: '$controlMd', px: '$sm' },
    },
    fullWidth: {
      true: { w: '100%' },
    },
  } as const,
  defaultVariants: {
    tone: 'primary',
  },
});

export const HeavyarButtonText = styled(Button.Text, {
  color: '$navy',
  fontSize: 15,
  fontWeight: '700',
  lineHeight: 20,
  variants: {
    tone: {
      primary: { color: '$navy' },
      secondary: { color: '$color' },
      outline: { color: '$color' },
      ghost: { color: '$accent' },
      danger: { color: '$white' },
    },
  } as const,
  defaultVariants: {
    tone: 'primary',
  },
});

export const HeavyarInput = styled(Input, {
  bg: '$navySoft',
  borderColor: '$borderColor',
  borderWidth: 1,
  color: '$color',
  fontSize: 15,
  minH: '$controlLg',
  px: '$md',
  placeholderTextColor: '$colorMuted',
  rounded: '$md',
  focusStyle: {
    borderColor: '$accent',
    outlineColor: '$accent',
    outlineWidth: 1,
  },
});

export const HeavyarIconButton = styled(Button, {
  items: 'center',
  animateOnly: ['opacity', 'transform', 'backgroundColor', 'borderColor'],
  bg: '$surface',
  borderColor: '$borderColor',
  borderWidth: 1,
  height: '$controlMd',
  justify: 'center',
  p: 0,
  pressStyle: { opacity: 0.88, scale: 0.96 },
  rounded: '$md',
  transition: '200ms',
  width: '$controlMd',
  variants: {
    tone: {
      default: { bg: '$surface', borderColor: '$borderColor' },
      active: { bg: '$accent', borderColor: '$accent' },
      subtle: { bg: '$navySoft', borderColor: '$borderColor' },
      ghost: { bg: '$transparent', borderColor: '$transparent' },
    },
    circular: {
      true: { rounded: '$pill' },
    },
  } as const,
  defaultVariants: {
    tone: 'default',
  },
});

export const HeavyarChip = styled(Button, {
  items: 'center',
  animateOnly: ['opacity', 'transform', 'backgroundColor', 'borderColor'],
  bg: '$surface',
  borderColor: '$borderColor',
  borderWidth: 1,
  gap: '$xs',
  minH: 38,
  maxW: '100%',
  px: '$sm',
  pressStyle: { opacity: 0.9, scale: 0.97 },
  rounded: '$pill',
  transition: '200ms',
  variants: {
    selected: {
      true: { bg: '$accent', borderColor: '$accent' },
      false: { bg: '$surface', borderColor: '$borderColor' },
    },
  } as const,
  defaultVariants: {
    selected: false,
  },
});

export const HeavyarChipText = styled(Button.Text, {
  color: '$colorMuted',
  fontSize: 12,
  fontWeight: '600',
  shrink: 1,
  variants: {
    selected: {
      true: { color: '$navy', fontWeight: '700' },
      false: { color: '$colorMuted' },
    },
  } as const,
  defaultVariants: {
    selected: false,
  },
});

export const HeavyarSegmentedControl = styled(XStack, {
  bg: '$navySoft',
  borderColor: '$borderColor',
  borderWidth: 1,
  gap: '$xs',
  p: '$xs',
  rounded: '$md',
});

export const HeavyarSegment = styled(Button, {
  items: 'center',
  animateOnly: ['opacity', 'transform', 'backgroundColor'],
  bg: '$transparent',
  borderColor: '$transparent',
  borderWidth: 1,
  flex: 1,
  minH: '$controlMd',
  pressStyle: { opacity: 0.88, scale: 0.985 },
  rounded: '$sm',
  transition: '200ms',
  variants: {
    selected: {
      true: { bg: '$surfaceRaised', borderColor: '$borderColor' },
      false: { bg: '$transparent', borderColor: '$transparent' },
    },
  } as const,
  defaultVariants: {
    selected: false,
  },
});

export const HeavyarSegmentText = styled(Button.Text, {
  color: '$colorMuted',
  fontSize: 13,
  fontWeight: '600',
  variants: {
    selected: {
      true: { color: '$accent', fontWeight: '700' },
      false: { color: '$colorMuted' },
    },
  } as const,
  defaultVariants: {
    selected: false,
  },
});

export const HeavyarBadge = styled(XStack, {
  items: 'center',
  self: 'flex-start',
  bg: '$navySoft',
  borderColor: '$borderColor',
  borderWidth: 1,
  gap: '$xs',
  minH: 28,
  px: '$sm',
  rounded: '$pill',
  variants: {
    tone: {
      neutral: { bg: '$navySoft', borderColor: '$borderColor' },
      accent: { bg: '$accentSoft', borderColor: '$accent' },
      success: { bg: 'rgba(66, 211, 146, 0.12)', borderColor: '$success' },
      danger: { bg: 'rgba(239, 106, 91, 0.12)', borderColor: '$danger' },
      warning: { bg: '$accentSoft', borderColor: '$warning' },
    },
  } as const,
  defaultVariants: {
    tone: 'neutral',
  },
});

export const HeavyarBadgeText = styled(Text, {
  color: '$color',
  fontSize: 11,
  fontWeight: '700',
  lineHeight: 15,
});

export const HeavyarTitle = styled(Text, {
  color: '$color',
  fontSize: 24,
  fontWeight: '800',
  lineHeight: 32,
});

export const HeavyarSubtitle = styled(Text, {
  color: '$colorMuted',
  fontSize: 14,
  lineHeight: 21,
});

export function useHeavyarDirection() {
  const { isRTL } = useLanguage();
  const rowDirection = Platform.OS === 'web'
    ? (isRTL ? 'row-reverse' : 'row')
    : (isRTL === I18nManager.isRTL ? 'row' : 'row-reverse');
  return {
    isRTL,
    rowDirection: rowDirection as 'row' | 'row-reverse',
    textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left',
  };
}

export function HeavyarSectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const { isRTL, rowDirection, textAlign } = useHeavyarDirection();
  return (
    <XStack items="center" flexDirection={rowDirection} justify="space-between" gap="$md">
      <YStack items={isRTL ? 'flex-end' : 'flex-start'} flex={1} gap="$xs">
        <Text color="$color" fontSize={20} fontWeight="800" lineHeight={27} text={textAlign}>
          {title}
        </Text>
        {subtitle ? (
          <Text color="$colorMuted" fontSize={13} lineHeight={19} text={textAlign}>
            {subtitle}
          </Text>
        ) : null}
      </YStack>
      {action}
    </XStack>
  );
}

export function HeavyarEmptyState({
  icon: Icon,
  title,
  message,
  action,
  testID,
}: {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: React.ReactNode;
  testID?: string;
}) {
  const { textAlign } = useHeavyarDirection();
  return (
    <HeavyarSurface items="center" density="spacious" gap="$md" my="$md" tone="subtle" testID={testID}>
      {Icon ? (
        <XStack items="center" bg="$surfaceRaised" borderColor="$borderColor" borderWidth={1}
          height={52} justify="center" rounded="$lg" width={52}>
          <Icon color={Colors.gold} size={24} strokeWidth={2} />
        </XStack>
      ) : null}
      <YStack items="center" gap="$xs">
        <Text color="$color" fontSize={17} fontWeight="700" lineHeight={24} text={textAlign}>{title}</Text>
        {message ? <Text color="$colorMuted" fontSize={13} lineHeight={20} text="center">{message}</Text> : null}
      </YStack>
      {action}
    </HeavyarSurface>
  );
}

export function HeavyarLoadingState({ label }: { label?: string }) {
  return (
    <YStack items="center" gap="$sm" justify="center" p="$xl">
      <ActivityIndicator color={Colors.gold} />
      {label ? <Text color="$colorMuted" fontSize={13}>{label}</Text> : null}
    </YStack>
  );
}
