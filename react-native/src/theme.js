/**
 * Alphinium Design System — Theme Tokens
 * All colors, typography, spacing, and shadows live here.
 * Forge projects: customise this file to match your brand.
 */

export const colors = {
  // Brand
  primary: '#6C63FF',
  primaryLight: '#8B84FF',
  primaryDark: '#4A42CC',
  accent: '#00D4AA',
  accentLight: '#33DDBB',

  // Backgrounds
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#242438',
  surfaceBorder: '#2E2E4A',

  // Text
  text: '#FFFFFF',          // Default text color
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted: '#606080',
  textInverse: '#0F0F1A',

  // Status
  success: '#00D4AA',
  successBg: 'rgba(0, 212, 170, 0.12)',
  warning: '#FFB800',
  warningBg: 'rgba(255, 184, 0, 0.12)',
  error: '#FF4D6D',
  errorBg: 'rgba(255, 77, 109, 0.12)',
  info: '#4DA6FF',
  infoBg: 'rgba(77, 166, 255, 0.12)',

  // Addon category colours
  addonAI: '#A855F7',
  addonAIBg: 'rgba(168, 85, 247, 0.12)',
  addonData: '#3B82F6',
  addonDataBg: 'rgba(59, 130, 246, 0.12)',
  addonComm: '#EC4899',
  addonCommBg: 'rgba(236, 72, 153, 0.12)',
  addonInfra: '#F59E0B',
  addonInfraBg: 'rgba(245, 158, 11, 0.12)',

  // UI
  divider: 'rgba(255,255,255,0.07)',
  overlay: 'rgba(0,0,0,0.6)',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
};

export const typography = {
  // Sizes
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 34,
  '4xl': 42,

  // Weights
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 28,
  full: 999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
};

export default { colors, typography, spacing, radius, shadows };
