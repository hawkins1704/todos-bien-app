import { Platform } from 'react-native';

/**
 * Tokens de diseño. Único lugar donde viven colores, spacing y tipografía.
 *
 * La app respeta el tema del sistema; no hay switch manual claro/oscuro
 * (ver docs/ESTADO-DEL-PROYECTO.md §1.5).
 */

/**
 * El azul de marca es a propósito MÁS OSCURO que el `#007AFF` de iOS, para que
 * la app no se lea como una app de sistema.
 *
 * No es solo estética: el azul anterior (`#208AEF`) daba 3.53:1 contra blanco y
 * el de Apple da 4.02:1, o sea que ninguno de los dos llega al 4.5:1 que pide
 * WCAG AA, y la app usa el accent como color de texto en enlaces por todos
 * lados. Los valores de acá están medidos:
 *
 * | Uso | Contraste |
 * |---|---|
 * | accent como texto sobre blanco | 5.30:1 |
 * | accentText blanco sobre accent (botones, avatar) | 5.30:1 |
 * | accent sobre accentSoft (chips) | 4.57:1 |
 * | oscuro: accent sobre negro | 8.37:1 |
 *
 * El tono se mantiene en **210°**, la misma familia que el azul anterior. Una
 * primera versión usó 216.5° y se leía morada: al oscurecer un azul hay que
 * bajar la luminosidad SIN correr el matiz hacia el índigo.
 *
 * Si se cambia, recalcular: `accentSoft` y el accent oscuro se derivan del mismo
 * H/S moviendo solo la luminosidad (H 210°, S 88%; L 42 / 94 / 66).
 */
export const Palette = {
  light: {
    background: '#FFFFFF',
    backgroundGrouped: '#F2F2F7',
    surface: '#FFFFFF',
    surfaceSunken: '#F2F2F7',
    border: '#E3E3E8',
    borderStrong: '#C6C6C8',
    text: '#000000',
    textSecondary: '#6C6C70',
    textTertiary: '#A0A0A5',
    accent: '#0D6BC9',
    accentSoft: '#E2F0FD',
    accentText: '#FFFFFF',
    danger: '#FF3B30',
    scrim: 'rgba(0,0,0,0.4)',
  },
  dark: {
    background: '#000000',
    backgroundGrouped: '#000000',
    surface: '#1C1C1E',
    surfaceSunken: '#121214',
    border: '#38383A',
    borderStrong: '#48484A',
    text: '#FFFFFF',
    textSecondary: '#AEAEB2',
    textTertiary: '#7C7C80',
    accent: '#5CA8F5',
    accentSoft: '#12293F',
    accentText: '#00121F',
    danger: '#FF453A',
    scrim: 'rgba(0,0,0,0.6)',
  },
} as const;

export type ColorScheme = keyof typeof Palette;

// Se ensancha a `string`: si no, TypeScript infiere el literal exacto de cada
// color del tema claro y el tema oscuro deja de ser asignable.
export type ThemeColors = { [K in keyof (typeof Palette)['light']]: string };

/**
 * Los 4 estados de la spec §4.
 *
 * `base`   → anillo del avatar y puntos (necesita ser vívido)
 * `soft`   → fondo del chip
 * `strong` → texto sobre `soft` (contraste AA)
 *
 * Cada estado tiene además un ícono propio: la spec exige no depender solo del
 * color, por daltonismo rojo-verde.
 */
export const StatusColors = {
  light: {
    unconfirmed: { base: '#8E8E93', soft: '#EFEFF0', strong: '#5A5A5F' },
    safe: { base: '#34C759', soft: '#E3F8E9', strong: '#1B7A33' },
    needs_help: { base: '#FF3B30', soft: '#FFE5E3', strong: '#C21207' },
    helping: { base: '#FFB800', soft: '#FFF3D4', strong: '#845C00' },
  },
  dark: {
    unconfirmed: { base: '#98989D', soft: '#2A2A2C', strong: '#C4C4C8' },
    safe: { base: '#30D158', soft: '#10301A', strong: '#5DE07C' },
    needs_help: { base: '#FF453A', soft: '#3A1310', strong: '#FF8078' },
    helping: { base: '#FFD60A', soft: '#33290A', strong: '#FFE066' },
  },
} as const;

export type StatusKey = keyof (typeof StatusColors)['light'];

export type StatusPalette = Record<StatusKey, { base: string; soft: string; strong: string }>;

/**
 * Íconos distintivos por estado (spec §4: color + forma, nunca solo color).
 *
 * `sf` / `md` son para la tab bar nativa (SF Symbols y Material Symbols, que
 * resuelve el lado nativo). `mi` es el nombre en `@expo/vector-icons/MaterialIcons`
 * para los íconos dentro del contenido, igual en iOS y Android.
 */
export const StatusIcons: Record<StatusKey, { sf: string; md: string; mi: string }> = {
  unconfirmed: { sf: 'questionmark.circle.fill', md: 'help', mi: 'help' },
  safe: { sf: 'checkmark.circle.fill', md: 'check_circle', mi: 'check-circle' },
  needs_help: { sf: 'exclamationmark.triangle.fill', md: 'warning', mi: 'warning' },
  helping: { sf: 'heart.circle.fill', md: 'volunteer_activism', mi: 'volunteer-activism' },
};

export const StatusLabels: Record<StatusKey, string> = {
  unconfirmed: 'Sin confirmar',
  safe: 'En casa y todos bien',
  needs_help: 'Necesito ayuda',
  helping: 'Ayudando a otros',
};

/** Versión corta para chips y grillas donde no entra la etiqueta completa. */
export const StatusLabelsShort: Record<StatusKey, string> = {
  unconfirmed: 'Sin confirmar',
  safe: 'Todos bien',
  needs_help: 'Necesita ayuda',
  helping: 'Ayudando',
};

/** Los 3 estados que el usuario elige a mano. `unconfirmed` es solo default. */
export const MANUAL_STATUSES: StatusKey[] = ['safe', 'needs_help', 'helping'];

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

export const Type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

/**
 * Alto EXTRA a reservar bajo el contenido, además de `insets.bottom`, para que
 * la tab bar nativa no tape el último elemento de una lista.
 *
 * En iOS es 0 a propósito: dentro de una pantalla de NativeTabs el inset
 * inferior que reporta la pantalla YA incluye la tab bar. Medido en iPhone 17 /
 * iOS 26.3: 83pt dentro de los tabs contra 34pt fuera de ellos (drill), o sea
 * los 34 del home indicator más los 49 de la barra glass. Sumarle una constante
 * encima contaría doble.
 *
 * En Android no pasa lo mismo: las window insets solo traen la barra de
 * navegación del sistema, así que la altura de la BottomNavigationView de
 * Material va aparte. ⚠️ Los 80dp son el valor de Material 3, sin verificar
 * todavía en un dispositivo (ver docs/ESTADO-DEL-PROYECTO.md §4).
 */
export const TabBarExtraInset = Platform.select({ ios: 0, android: 80 }) ?? 0;
