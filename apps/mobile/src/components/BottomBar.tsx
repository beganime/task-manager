import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import type { IconName } from "./ui";
import { Avatar } from "./ui";

export type TabKey = "home" | "tasks" | "calendar" | "projects" | "search" | "inbox" | "settings";

interface TabDef {
  key: TabKey;
  icon: IconName;
  label: string;
}

const mobileTabs: TabDef[] = [
  { key: "home", icon: "sun", label: "Мой день" },
  { key: "tasks", icon: "check-circle", label: "Задачи" },
  { key: "calendar", icon: "calendar", label: "Календарь" },
  { key: "projects", icon: "grid", label: "Проекты" },
  { key: "inbox", icon: "bell", label: "Входящие" },
];

const wideTabs: TabDef[] = [
  { key: "home", icon: "sun", label: "Мой день" },
  { key: "tasks", icon: "check-circle", label: "Задачи" },
  { key: "calendar", icon: "calendar", label: "Календарь" },
  { key: "projects", icon: "grid", label: "Проекты" },
  { key: "search", icon: "search", label: "Поиск" },
  { key: "inbox", icon: "bell", label: "Входящие" },
  { key: "settings", icon: "settings", label: "Настройки" },
];

/** Нижняя «стеклянная» панель для телефона. */
export function BottomBar({ active, onChange, unread }: { active: TabKey; onChange: (tab: TabKey) => void; unread: number }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.barWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        <BlurView intensity={60} tint={colors.blurTint} style={StyleSheet.absoluteFill} />
        <View style={styles.barFill}>
          {mobileTabs.map((tab) => {
            const selected = tab.key === active || (tab.key === "inbox" && active === "settings") || (tab.key === "tasks" && active === "search");
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                aria-selected={selected}
                onPress={() => onChange(tab.key)}
                style={styles.item}
              >
                <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
                  <Feather name={tab.icon} size={19} color={selected ? colors.onPrimary : colors.textMuted} />
                  {tab.key === "inbox" && unread > 0 ? <View style={styles.badge} /> : null}
                </View>
                <Text style={[styles.label, selected && styles.selected]} numberOfLines={1}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** Боковая навигация для широкого экрана (веб-сайт, планшет). */
export function SideNav({
  active,
  onChange,
  unread,
  userName,
  roleLabel,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  unread: number;
  userName: string;
  roleLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.side}>
      <BlurView intensity={50} tint={colors.blurTint} style={StyleSheet.absoluteFill} />
      <View style={styles.sideFill}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Feather name="sunrise" size={20} color={colors.onStrong} />
          </View>
          <Text style={styles.brandText}>Elite Task</Text>
        </View>
        <View style={styles.sideItems}>
          {wideTabs.map((tab) => {
            const selected = tab.key === active;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                aria-selected={selected}
                onPress={() => onChange(tab.key)}
                style={(state) => [
                  styles.sideItem,
                  // react-native-web добавляет `hovered` в состояние Pressable; в типах RN его нет.
                  (state as { hovered?: boolean }).hovered && !selected && styles.sideItemHover,
                  selected && styles.sideItemActive,
                ]}
              >
                <Feather name={tab.icon} size={18} color={selected ? colors.onPrimary : colors.textMuted} />
                <Text style={[styles.sideLabel, selected && styles.sideLabelActive]}>{tab.label}</Text>
                {tab.key === "inbox" && unread > 0 ? (
                  <Text style={[styles.sideBadge, selected && styles.sideBadgeActive]}>{unread}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => onChange("settings")} style={styles.profile}>
          <Avatar name={userName} size={38} />
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>{userName}</Text>
            <Text style={styles.profileRole} numberOfLines={1}>{roleLabel}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    barWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md },
    bar: {
      borderRadius: radius.lg + 4,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      alignSelf: "center",
      width: "100%",
      maxWidth: 560,
    },
    barFill: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 8, backgroundColor: colors.surface },
    item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
    iconWrap: { width: 42, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    iconWrapActive: { backgroundColor: colors.primary },
    badge: {
      position: "absolute",
      top: 4,
      right: 9,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.danger,
      borderWidth: 1.5,
      borderColor: colors.surfaceSolid,
    },
    label: { color: colors.textMuted, fontSize: 10, fontFamily: fonts.semibold },
    selected: { color: colors.text, fontFamily: fonts.bold },
    side: { width: 248, overflow: "hidden", borderRightWidth: 1, borderRightColor: colors.border },
    sideFill: { flex: 1, backgroundColor: colors.surface, padding: spacing.md, paddingTop: spacing.lg },
    brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, marginBottom: spacing.lg },
    logo: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.strong },
    brandText: { color: colors.text, fontSize: 19, fontFamily: fonts.extrabold, letterSpacing: -0.4 },
    sideItems: { gap: 4, flex: 1 },
    sideItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, height: 44, borderRadius: radius.md },
    sideItemHover: { backgroundColor: colors.surfaceMuted },
    sideItemActive: { backgroundColor: colors.primary },
    sideLabel: { flex: 1, color: colors.textMuted, fontSize: 14, fontFamily: fonts.semibold },
    sideLabelActive: { color: colors.onPrimary, fontFamily: fonts.bold },
    sideBadge: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.pill,
      overflow: "hidden",
      textAlign: "center",
      backgroundColor: colors.danger,
      color: "#FFFFFF",
      fontSize: 11,
      fontFamily: fonts.bold,
    },
    sideBadgeActive: { backgroundColor: "rgba(255,255,255,0.25)" },
    profile: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
    },
    profileText: { flex: 1 },
    profileName: { color: colors.text, fontSize: 13, fontFamily: fonts.bold },
    profileRole: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.medium, marginTop: 1 },
  });
