import { defaultConfig } from '@tamagui/config/v5';
import { animations } from '@tamagui/config/v5-reanimated';
import { createTamagui } from 'tamagui';

export const heavyarColors = {
  navy: '#011130',
  navyDeep: '#041020',
  navySoft: '#061B3B',
  navyRaised: '#071C3F',
  navyElevated: '#0B2854',
  blue: '#0F4996',
  blueLight: '#4389CC',
  yellow: '#F1B61D',
  yellowSoft: 'rgba(241, 182, 29, 0.12)',
  white: '#FFFFFF',
  offWhite: '#F7F9FC',
  ink: '#0B1A2F',
  muted: '#7190B5',
  textSecondary: '#A8B6C8',
  borderLight: '#D8E1EC',
  borderDark: '#1E3A5F',
  borderStrong: '#2E5480',
  success: '#42D392',
  danger: '#EF6A5B',
  warning: '#F6C84D',
  transparent: 'transparent',
} as const;

export const heavyarShadows = {
  subtle: {
    shadowColor: '#011130',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  card: {
    shadowColor: '#011130',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 5,
  },
} as const;

const tokens = {
  ...defaultConfig.tokens,
  color: heavyarColors,
  space: {
    ...defaultConfig.tokens.space,
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  size: {
    ...defaultConfig.tokens.size,
    controlSm: 36,
    controlMd: 44,
    controlLg: 52,
    content: 1200,
  },
  radius: {
    ...defaultConfig.tokens.radius,
    sm: 8,
    md: 12,
    lg: 18,
    xl: 24,
    pill: 999,
  },
  zIndex: {
    ...defaultConfig.tokens.zIndex,
    base: 0,
    sticky: 100,
    overlay: 1000,
    modal: 1100,
    toast: 1200,
  },
};

const themes = {
  ...defaultConfig.themes,
  light: {
    ...defaultConfig.themes.light,
    background: heavyarColors.offWhite,
    backgroundHover: heavyarColors.white,
    backgroundPress: '#EAF0F7',
    color: heavyarColors.ink,
    colorMuted: heavyarColors.muted,
    surface: heavyarColors.white,
    surfaceRaised: heavyarColors.white,
    borderColor: heavyarColors.borderLight,
    borderColorHover: heavyarColors.blueLight,
    brand: heavyarColors.blue,
    brandHover: '#0C3D7F',
    accent: heavyarColors.yellow,
    accentSoft: heavyarColors.yellowSoft,
    success: heavyarColors.success,
    danger: heavyarColors.danger,
    warning: heavyarColors.warning,
    shadowColor: 'rgba(1, 17, 48, 0.14)',
  },
  dark: {
    ...defaultConfig.themes.dark,
    background: heavyarColors.navy,
    backgroundHover: heavyarColors.navyRaised,
    backgroundPress: '#00102A',
    color: heavyarColors.white,
    colorMuted: heavyarColors.textSecondary,
    surface: heavyarColors.navyRaised,
    surfaceRaised: heavyarColors.navyElevated,
    borderColor: heavyarColors.borderDark,
    borderColorHover: heavyarColors.blueLight,
    brand: heavyarColors.blueLight,
    brandHover: '#62A0DA',
    accent: heavyarColors.yellow,
    accentSoft: heavyarColors.yellowSoft,
    success: heavyarColors.success,
    danger: heavyarColors.danger,
    warning: heavyarColors.warning,
    shadowColor: 'rgba(0, 0, 0, 0.42)',
  },
};

const config = createTamagui({
  ...defaultConfig,
  animations,
  tokens,
  themes,
});

export type HeavyarTamaguiConfig = typeof config;

declare module 'tamagui' {
  // The empty declaration is the Tamagui-supported module augmentation hook.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends HeavyarTamaguiConfig {}
}

export default config;
