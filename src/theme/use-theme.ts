import { useColorScheme } from 'react-native';

import {
  Palette,
  StatusColors,
  type ColorScheme,
  type StatusPalette,
  type ThemeColors,
} from './tokens';

export function useColorSchemeName(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function useTheme(): {
  scheme: ColorScheme;
  colors: ThemeColors;
  status: StatusPalette;
  isDark: boolean;
} {
  const scheme = useColorSchemeName();
  return {
    scheme,
    colors: Palette[scheme],
    status: StatusColors[scheme],
    isDark: scheme === 'dark',
  };
}
