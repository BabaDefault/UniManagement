import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#60646C',
    textFaint: '#8B8D98',
    background: '#FBFBFC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EDEEF0',
    border: '#E3E4E8',
    tint: '#0B69C7',
    danger: '#C62A2F',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#B0B4BA',
    textFaint: '#7E8289',
    background: '#0D0E10',
    backgroundElement: '#17191C',
    backgroundSelected: '#24272B',
    border: '#2A2D31',
    tint: '#5AA9F5',
    danger: '#FF6369',
  },
} as const;

export type ThemeColors = (typeof Colors)['light'];
export type ThemeColor = keyof ThemeColors;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
})!;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
} as const;

export const Radius = { small: 6, medium: 10, large: 14 } as const;

export const MaxContentWidth = 720;
