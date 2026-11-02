import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "../theme";

export type TabKey = "home" | "tasks" | "projects" | "search" | "more";

const tabs: Array<{ key: TabKey; icon: ComponentProps<typeof Feather>["name"]; label: string }> = [
  { key: "home", icon: "home", label: "Главная" },
  { key: "tasks", icon: "check-circle", label: "Задачи" },
  { key: "projects", icon: "grid", label: "Проекты" },
  { key: "search", icon: "search", label: "Поиск" },
  { key: "more", icon: "bell", label: "Входящие" },
];

export function BottomBar({ active, onChange }: { active: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <View style={styles.bar}>
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={styles.item}>
            <Feather name={tab.icon} size={21} color={selected ? colors.primary : colors.textMuted} />
            <Text style={[styles.label, selected && styles.selected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 68,
    paddingHorizontal: spacing.sm,
    paddingTop: 9,
    paddingBottom: 12,
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  selected: { color: colors.primary },
});

