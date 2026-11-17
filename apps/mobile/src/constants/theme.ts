/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Tema "Millennium": meia-noite, violeta e ouro. O app tem uma identidade só, então o esquema claro usa a mesma paleta.
 * A paleta espelha apps/web/src/app/globals.css.
 */
const millennium = {
  text: '#F3EEDD',
  background: '#0A0919',
  backgroundElement: '#15132E',
  backgroundSelected: '#211E45',
  textSecondary: '#A8A4C4',
  gold: '#E6B422',
  goldLight: '#F6DC8C',
  goldDark: '#A87B0A',
  border: '#3A3220',
  danger: '#FF7A7A',
  forbidden: '#E5484D',
  limited: '#F08C2A',
  semi: '#E8C53A',
} as const;

export const Colors = {
  light: millennium,
  dark: millennium,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Fonte dos títulos (carregada em app/_layout.tsx com @expo-google-fonts/cinzel). */
export const DisplayFont = { semibold: 'Cinzel_600SemiBold', bold: 'Cinzel_700Bold' } as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** Na web as abas flutuam no topo (position: absolute); as telas reservam esse espaço. */
export const TopTabInset = Platform.select({ web: 72 }) ?? 0;
export const MaxContentWidth = 800;
