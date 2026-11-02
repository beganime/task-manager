import { Alert, Platform, useWindowDimensions } from "react-native";

export const WIDE_BREAKPOINT = 900;
export const CONTENT_MAX_WIDTH = 1180;

export interface LayoutInfo {
  width: number;
  /** Десктоп/планшет в альбомной ориентации: боковая навигация и две колонки. */
  isWide: boolean;
  /** Планшет: можно увеличить сетки и отступы. */
  isTablet: boolean;
  gutter: number;
}

export function useLayout(): LayoutInfo {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const isTablet = width >= 640;
  return { width, isWide, isTablet, gutter: isWide ? 32 : isTablet ? 24 : 16 };
}

/**
 * Alert.alert с кнопками в react-native-web не работает — в браузере
 * подтверждение показываем через window.confirm.
 */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Отмена", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

export function notify(title: string, message: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
