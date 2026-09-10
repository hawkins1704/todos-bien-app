import { useColorScheme } from 'react-native';

import {
  ModuleColors,
  Palette,
  StatusColors,
  type ColorScheme,
  type ModulePalette,
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
  /** Los seis pasteles del Centro de Preparación. Solo esa pestaña los usa. */
  modules: ModulePalette;
  isDark: boolean;
} {
  const scheme = useColorSchemeName();
  return {
    scheme,
    colors: Palette[scheme],
    status: StatusColors[scheme],
    modules: ModuleColors[scheme],
    isDark: scheme === 'dark',
  };
}
