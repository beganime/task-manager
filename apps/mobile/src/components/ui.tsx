import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CONTENT_MAX_WIDTH, useLayout } from "../lib/layout";
import { fonts, radius, spacing, useStyles, useTheme, withAlpha, type Palette } from "../theme";

export type IconName = ComponentProps<typeof Feather>["name"];

/** Градиентный фон с мягкими «пятнами света», размытыми через BlurView. */
export function Backdrop() {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={colors.backgroundGradient} style={StyleSheet.absoluteFill} />
      <View style={[styles.glow, styles.glowTop, { backgroundColor: colors.glow[0] }]} />
      <View style={[styles.glow, styles.glowMiddle, { backgroundColor: colors.glow[1] }]} />
      <View style={[styles.glow, styles.glowBottom, { backgroundColor: colors.glow[2] }]} />
      <BlurView intensity={80} tint={colors.blurTint} style={StyleSheet.absoluteFill} />
    </View>
  );
}

/** Экран: безопасные отступы + ограничение ширины на десктопе. Фон рисует Backdrop в корне. */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles(makeStyles);
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.screen, style]}>
      <View style={styles.screenInner}>{children}</View>
    </SafeAreaView>
  );
}

/** Прокручиваемое содержимое экрана с отступом под нижнюю панель. */
export function ScreenScroll({
  children,
  refreshControl,
  contentStyle,
}: {
  children: ReactNode;
  refreshControl?: ComponentProps<typeof ScrollView>["refreshControl"];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles(makeStyles);
  return (
    <ScrollView
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

export function GlassCard({
  children,
  style,
  padded = true,
  intensity = 40,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  intensity?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.card, style]}>
      <BlurView intensity={intensity} tint={colors.blurTint} style={StyleSheet.absoluteFill} />
      <View style={[styles.cardFill, padded && styles.cardPadded]}>{children}</View>
    </View>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const styles = useStyles(makeStyles);
  const { gutter } = useLayout();
  return (
    <View style={[styles.header, { paddingHorizontal: gutter }]}>
      <View style={styles.headerText}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  compact = false,
  icon,
  tone = "primary",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  icon?: IconName;
  tone?: "primary" | "strong";
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const background = tone === "strong" ? colors.strong : colors.primary;
  const foreground = tone === "strong" ? colors.onStrong : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: background },
        compact && styles.compactButton,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.buttonRow}>
          {icon ? <Feather name={icon} size={compact ? 15 : 17} color={foreground} /> : null}
          <Text style={[styles.primaryText, { color: foreground }, compact && styles.compactText]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  danger = false,
  icon,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  danger?: boolean;
  icon?: IconName;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const color = danger ? colors.danger : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        danger && styles.dangerButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.buttonRow}>
        {icon ? <Feather name={icon} size={15} color={color} /> : null}
        <Text style={[styles.secondaryText, { color }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  active = false,
  color,
  size = 44,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  active?: boolean;
  color?: string;
  size?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2.6 },
        active && styles.iconButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Feather name={icon} size={Math.round(size * 0.42)} color={color ?? (active ? colors.primaryText : colors.text)} />
    </Pressable>
  );
}

export function Chip({
  label,
  active = false,
  onPress,
  icon,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const tint = color ?? colors.primary;
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: colors.scheme === "dark" ? withAlpha(tint, 0.28) : tint, borderColor: "transparent" },
        pressed && styles.pressed,
      ]}
    >
      {icon ? <Feather name={icon} size={13} color={active ? (colors.scheme === "dark" ? colors.text : colors.onPrimary) : colors.textMuted} /> : null}
      <Text style={[styles.chipText, active && { color: colors.scheme === "dark" ? colors.text : colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string; icon?: IconName }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
              aria-selected={active}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            {option.icon ? <Feather name={option.icon} size={14} color={active ? colors.text : colors.textMuted} /> : null}
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, props.multiline && styles.multiline, style]}
        {...props}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Avatar({ name, size = 44, color }: { name: string; size?: number; color?: string }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const tint = color ?? colors.primary;
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(tint, colors.scheme === "dark" ? 0.3 : 0.2) },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36, color: colors.scheme === "dark" ? colors.text : tint }]}>
        {initials || "?"}
      </Text>
    </View>
  );
}

export function LoadingState({ label = "Загрузка…" }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.centerState}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, text, icon = "check" }: { title: string; text: string; icon?: IconName }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <GlassCard style={styles.empty}>
      <View style={styles.emptyInner}>
        <View style={[styles.stateIcon, { backgroundColor: colors.primarySoft }]}>
          <Feather name={icon} size={22} color={colors.primaryText} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.stateText}>{text}</Text>
      </View>
    </GlassCard>
  );
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <GlassCard style={styles.empty}>
      <View style={styles.emptyInner}>
        <View style={[styles.stateIcon, { backgroundColor: colors.dangerSoft }]}>
          <Feather name="alert-triangle" size={22} color={colors.danger} />
        </View>
        <Text style={styles.emptyTitle}>Не удалось загрузить</Text>
        <Text style={styles.stateText}>{message || "Попробуйте ещё раз"}</Text>
        <SecondaryButton title="Повторить" icon="refresh-cw" onPress={retry} />
      </View>
    </GlassCard>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  count,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  count?: number;
}) {
  const styles = useStyles(makeStyles);
  const { gutter } = useLayout();
  return (
    <View style={[styles.sectionHeader, { paddingHorizontal: gutter }]}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {count !== undefined ? <Text style={styles.sectionCount}>{count}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const styles = useStyles(makeStyles);
  return <Text style={styles.errorText}>{children}</Text>;
}

/**
 * Полноэкранная форма на телефоне и центрированная «карточка» на широком экране.
 */
export function ModalScreen({
  visible,
  onClose,
  title,
  eyebrow,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { isWide } = useLayout();
  const header = (
    <View style={styles.modalHeader}>
      <View style={styles.headerText}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.modalTitle}>{title}</Text>
      </View>
      <IconButton icon="x" label="Закрыть" onPress={onClose} />
    </View>
  );
  const body = (
    <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );

  if (isWide) {
    return (
      <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
          <Pressable style={styles.modalDialog} onPress={() => undefined}>
            <Backdrop />
            {header}
            {body}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.flex}>
        <Backdrop />
        <SafeAreaView style={styles.flex}>
          {header}
          {body}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    glow: { position: "absolute", borderRadius: 999 },
    glowTop: { width: 420, height: 420, top: -140, right: -120 },
    glowMiddle: { width: 360, height: 360, top: "38%", left: -160 },
    glowBottom: { width: 460, height: 460, bottom: -180, right: -100 },
    screen: { flex: 1, backgroundColor: "transparent" },
    screenInner: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
    scrollContent: { paddingBottom: 120 },
    card: {
      borderRadius: radius.lg,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      ...(Platform.OS === "web" ? { boxShadow: `0 10px 30px ${colors.scheme === "dark" ? "rgba(0,0,0,0.25)" : "rgba(120,70,40,0.07)"}` } : {}),
    },
    cardFill: { backgroundColor: colors.surface },
    cardPadded: { padding: spacing.md },
    header: {
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerText: { flex: 1, paddingRight: spacing.md },
    eyebrow: {
      color: colors.primaryText,
      fontSize: 12,
      fontFamily: fonts.bold,
      textTransform: "uppercase",
      letterSpacing: 1.1,
      marginBottom: 4,
    },
    headerTitle: { color: colors.text, fontSize: 30, fontFamily: fonts.extrabold, letterSpacing: -0.8 },
    headerSubtitle: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.medium, marginTop: 4 },
    buttonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    primaryButton: {
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    compactButton: { minHeight: 40, paddingHorizontal: spacing.md },
    primaryText: { fontSize: 15, fontFamily: fonts.bold },
    compactText: { fontSize: 13 },
    secondaryButton: {
      minHeight: 42,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primarySoft,
    },
    secondaryText: { fontSize: 13, fontFamily: fonts.bold },
    dangerButton: { backgroundColor: colors.dangerSoft },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
    iconButton: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconButtonActive: { backgroundColor: colors.primarySoft, borderColor: "transparent" },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      height: 36,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.semibold },
    segmented: {
      flexDirection: "row",
      padding: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceMuted,
      gap: 4,
    },
    segment: {
      flex: 1,
      minHeight: 38,
      borderRadius: radius.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 10,
    },
    segmentActive: { backgroundColor: colors.surfaceSolid },
    segmentText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.semibold },
    segmentTextActive: { color: colors.text, fontFamily: fonts.bold },
    field: { gap: 6 },
    fieldLabel: { color: colors.text, fontSize: 13, fontFamily: fonts.bold, marginTop: 4 },
    fieldHint: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium },
    input: {
      minHeight: 50,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 15,
      fontFamily: fonts.medium,
    },
    multiline: { minHeight: 104, paddingTop: 14, textAlignVertical: "top" },
    avatar: { alignItems: "center", justifyContent: "center" },
    avatarText: { fontFamily: fonts.extrabold },
    centerState: { flex: 1, minHeight: 240, alignItems: "center", justifyContent: "center", gap: spacing.md },
    empty: { marginHorizontal: spacing.md, marginVertical: spacing.sm },
    emptyInner: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
    stateIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
    emptyTitle: { color: colors.text, fontSize: 18, fontFamily: fonts.extrabold },
    stateText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center", fontFamily: fonts.medium },
    sectionHeader: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm + 2,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    sectionTitle: { color: colors.text, fontSize: 19, fontFamily: fonts.extrabold, letterSpacing: -0.3 },
    sectionCount: {
      minWidth: 24,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.pill,
      overflow: "hidden",
      backgroundColor: colors.surfaceMuted,
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.bold,
      textAlign: "center",
    },
    sectionAction: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.semibold },
    errorText: { color: colors.danger, fontSize: 13, lineHeight: 18, fontFamily: fonts.semibold },
    modalHeader: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
    },
    modalTitle: { color: colors.text, fontSize: 24, fontFamily: fonts.extrabold, letterSpacing: -0.5 },
    modalBody: { paddingHorizontal: spacing.lg, paddingBottom: 48, paddingTop: spacing.sm, gap: spacing.sm + 4 },
    modalOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
    modalDialog: {
      width: "100%",
      maxWidth: 640,
      maxHeight: "92%",
      borderRadius: radius.lg,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
  });
