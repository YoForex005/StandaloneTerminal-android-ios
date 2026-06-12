import { Platform } from 'react-native';

export const colors = {
  bg: '#06070A',
  surface: 'rgba(255,255,255,0.04)',
  surface2: 'rgba(255,255,255,0.025)',
  ink: '#F4F5F7',
  inkSecondary: 'rgba(244,245,247,0.58)',
  inkMuted: 'rgba(244,245,247,0.40)',
  inkSubtle: 'rgba(244,245,247,0.22)',
  line: 'rgba(255,255,255,0.10)',
  lineSoft: 'rgba(255,255,255,0.06)',
  accent: '#E5C07B',
  accentSoft: 'rgba(229,192,123,0.18)',
  accentTint: 'rgba(229,192,123,0.12)',
  positive: '#57E08A',
  danger: '#E5705B',
};

export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 18,
  xl: 20,
};
