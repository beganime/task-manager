export type ColorScheme = "light" | "dark";
export type ThemeMode = ColorScheme | "system";

export interface Palette {
  scheme: ColorScheme;
  /** Три цвета основного градиента фона (сверху вниз). */
  backgroundGradient: readonly [string, string, string];
  /** Мягкие пятна поверх градиента — дают эффект «размытого света». */
  glow: readonly [string, string, string];
  background: string;
  surface: string;
  surfaceSolid: string;
  surfaceMuted: string;
  overlay: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  /** Акцент для текста и иконок: на тёмном фоне он светлее основного. */
  primaryText: string;
  onPrimary: string;
  /** Тёмно-коричневые кнопки и FAB из макета (в тёмной теме — зелёные). */
  strong: string;
  onStrong: string;
  /** Персиковая карточка напоминания. */
  highlight: string;
  highlightText: string;
  dayActive: string;
  onDayActive: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  info: string;
  infoSoft: string;
  purple: string;
  purpleSoft: string;
  blurTint: "light" | "dark";
  statusBar: "dark-content" | "light-content";
}

export const lightPalette: Palette = {
  scheme: "light",
  backgroundGradient: ["#FBF2EC", "#F5E7E5", "#F4ECE2"],
  glow: ["rgba(255, 196, 160, 0.55)", "rgba(233, 211, 230, 0.6)", "rgba(214, 226, 190, 0.55)"],
  background: "#F8EEE9",
  surface: "rgba(255, 255, 255, 0.74)",
  surfaceSolid: "#FFFFFF",
  surfaceMuted: "rgba(240, 226, 216, 0.65)",
  overlay: "rgba(35, 26, 21, 0.35)",
  border: "rgba(90, 46, 18, 0.08)",
  text: "#231A15",
  textMuted: "#8B7E75",
  textSubtle: "#B3A69C",
  primary: "#F07A2B",
  primaryPressed: "#D9681C",
  primarySoft: "#FFE4D1",
  primaryText: "#D9681C",
  onPrimary: "#FFFFFF",
  strong: "#5A2E12",
  onStrong: "#FFFFFF",
  highlight: "#FFD3B6",
  highlightText: "#3B1F0D",
  dayActive: "#2A2421",
  onDayActive: "#FFFFFF",
  danger: "#D4554F",
  dangerSoft: "rgba(212, 85, 79, 0.12)",
  warning: "#B97A12",
  warningSoft: "rgba(232, 168, 56, 0.16)",
  success: "#3A9466",
  successSoft: "rgba(58, 148, 102, 0.13)",
  info: "#4570B8",
  infoSoft: "rgba(69, 112, 184, 0.12)",
  purple: "#8A5CC7",
  purpleSoft: "rgba(138, 92, 199, 0.13)",
  blurTint: "light",
  statusBar: "dark-content",
};

export const darkPalette: Palette = {
  scheme: "dark",
  backgroundGradient: ["#0D1411", "#111A16", "#0C1310"],
  glow: ["rgba(47, 125, 91, 0.35)", "rgba(28, 74, 66, 0.4)", "rgba(70, 92, 44, 0.3)"],
  background: "#0F1714",
  surface: "rgba(26, 37, 32, 0.72)",
  surfaceSolid: "#17211D",
  surfaceMuted: "rgba(255, 255, 255, 0.05)",
  overlay: "rgba(0, 0, 0, 0.55)",
  border: "rgba(255, 255, 255, 0.07)",
  text: "#ECF2EE",
  textMuted: "#93A39A",
  textSubtle: "#62726A",
  primary: "#2F7D5B",
  primaryPressed: "#276A4D",
  primarySoft: "rgba(47, 125, 91, 0.22)",
  primaryText: "#63C496",
  onPrimary: "#FFFFFF",
  strong: "#2F7D5B",
  onStrong: "#FFFFFF",
  highlight: "#1D3A2D",
  highlightText: "#DDF0E5",
  dayActive: "#2F7D5B",
  onDayActive: "#FFFFFF",
  danger: "#EF7A73",
  dangerSoft: "rgba(239, 122, 115, 0.14)",
  warning: "#E3B25A",
  warningSoft: "rgba(227, 178, 90, 0.14)",
  success: "#63C496",
  successSoft: "rgba(99, 196, 150, 0.14)",
  info: "#7FA7E8",
  infoSoft: "rgba(127, 167, 232, 0.14)",
  purple: "#B793EA",
  purpleSoft: "rgba(183, 147, 234, 0.14)",
  blurTint: "dark",
  statusBar: "light-content",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 26,
  pill: 999,
} as const;

/** Manrope подключается по начертаниям: fontWeight с кастомным шрифтом на Android не работает. */
export const fonts = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
} as const;

/** Добавляет альфа-канал к цвету #RRGGBB. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) return hex;
  const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${match[1]}${value}`;
}
