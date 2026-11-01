import type { TextStyle } from 'react-native';

/**
 * One accent for the whole app: a clear sky teal. Deliberately neither red nor
 * green — Coles red and Woolworths green appear only as small retailer
 * identity chips, so the chrome can never read as a nudge towards one store.
 */
export const palette = {
  bg: '#F3F6F6',
  surface: '#FFFFFF',
  surfaceSunken: '#EAEFEF',
  ink: '#16211F',
  inkMuted: '#5D6B69',
  inkFaint: '#8B9695',
  line: '#DDE5E4',
  lineStrong: '#C6D2D1',
  accent: '#0E7C86',
  accentDeep: '#0A5C64',
  accentTint: '#E1F0F1',
  coles: '#D5141C',
  colesTint: '#FBE9EA',
  woolworths: '#0E8A3E',
  woolworthsTint: '#E4F3EA',
  caution: '#8E6410',
  cautionTint: '#F8EFDB',
} as const;

/** 8px grid. `xs` is the only half-step, used for chip padding and gaps. */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Outfit carries the brand and every number the shopper reads; Plus Jakarta
 * Sans carries running text. Both are loaded in `app/_layout.tsx` — nothing
 * renders until they resolve, so there is no font swap flash.
 */
export const fonts = {
  display: 'Outfit_600SemiBold',
  displayBold: 'Outfit_700Bold',
  displayMedium: 'Outfit_500Medium',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemi: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const;

export const type = {
  hero: {
    fontFamily: fonts.displayBold,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.4,
    color: palette.ink,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: palette.ink,
  },
  heading: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
    color: palette.ink,
  },
  money: {
    fontFamily: fonts.displayBold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: palette.ink,
    fontVariant: ['tabular-nums'],
  },
  moneySmall: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    lineHeight: 20,
    color: palette.ink,
    fontVariant: ['tabular-nums'],
  },
  bodyLarge: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 26,
    color: palette.inkMuted,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: palette.inkMuted,
  },
  bodyStrong: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    lineHeight: 23,
    color: palette.ink,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: palette.inkFaint,
  },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: palette.inkFaint,
  },
} satisfies Record<string, TextStyle>;
