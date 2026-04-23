/**
 * ZURI Driver — Design Tokens
 * Paleta: Opción A (Uber-inspired, negro + accent azul #276EF1)
 * Creado: 2026-04-23 · Fase B.0
 * Notas:
 *  - Single source of truth para colores, tipografía, spacing, radios, sombras.
 *  - NO importar este archivo en componentes hasta Fase B.1 (Home screen).
 *  - Toda modificación posterior debe respetar las claves aquí definidas.
 */

export const COLORS = {
  // ---- Base ----
  bg:           '#FFFFFF',
  surface:      '#F7F7F7',
  surfaceAlt:   '#EEEEEE',
  card:         '#FFFFFF',
  border:       '#EEEEEE',
  borderStrong: '#DDDDDD',
  overlay:      'rgba(0,0,0,0.72)',

  // ---- Brand ----
  primary:      '#000000',
  primaryHover: '#1A1A1A',
  accent:       '#276EF1',
  accentHover:  '#1E5ED6',

  // ---- Semánticos ----
  success:      '#05944F',
  successBg:    '#E6F4EC',
  danger:       '#E11900',
  dangerBg:     '#FCE8E5',
  warning:      '#FFC043',
  warningBg:    '#FFF5DE',
  info:         '#276EF1',
  infoBg:       '#E6EEFD',

  // ---- Texto ----
  textPrimary:   '#000000',
  textSecondary: '#545454',
  textMuted:     '#8E8E93',
  textOnDark:    '#FFFFFF',
  textInverse:   '#FFFFFF',

  // ---- Estados del servicio ----
  estado: {
    PROGRAMADO:    { bg: '#F2F2F2', text: '#545454', dot: '#8E8E93' },
    ASIGNADO:      { bg: '#FFF5DE', text: '#8A5A00', dot: '#FFC043' },
    ACEPTADO:      { bg: '#E6F4EC', text: '#05944F', dot: '#05944F' },
    EN_CAMINO:     { bg: '#E6EEFD', text: '#1A4AB8', dot: '#276EF1' },
    EN_ORIGEN:     { bg: '#E6EEFD', text: '#1A4AB8', dot: '#276EF1' },
    EN_TRANSPORTE: { bg: '#E6EEFD', text: '#1A4AB8', dot: '#276EF1' },
    EN_DESTINO:    { bg: '#E6F4EC', text: '#05944F', dot: '#05944F' },
    COMPLETADO:    { bg: '#E6F4EC', text: '#05944F', dot: '#05944F' },
    CANCELADO:     { bg: '#FCE8E5', text: '#B01200', dot: '#E11900' },
  },
} as const;

export const FONT = {
  regular: 'System',
  weights: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },
  sizes: {
    xs:      12,
    sm:      14,
    base:    16,
    lg:      18,
    xl:      20,
    xxl:     24,
    display: 32,
  },
  lineHeights: {
    tight:   1.2,
    normal:  1.4,
    relaxed: 1.6,
  },
} as const;

export const SPACING = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
} as const;

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  pill: 999,
} as const;

export const SHADOW = {
  card: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius:  3,
    elevation:     2,
  },
  elevated: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius:  6,
    elevation:     4,
  },
  modal: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius:  24,
    elevation:     12,
  },
} as const;

export const DURATION = {
  fast: 150,
  base: 200,
  slow: 300,
} as const;

export type EstadoKey = keyof typeof COLORS.estado;

export const getEstadoStyle = (estado: string) => {
  const key = estado as EstadoKey;
  return COLORS.estado[key] ?? COLORS.estado.PROGRAMADO;
};
