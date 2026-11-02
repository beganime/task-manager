import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatShortDate, minutesLabel } from "../lib/dates";
import { useLayout } from "../lib/layout";
import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import { priorityLabels, statusLabels, type TaskListItem, type TaskPriority, type TaskStatus } from "../types";
import { GlassCard } from "./ui";

export function statusTone(colors: Palette, status: TaskStatus): { background: string; text: string } {
  switch (status) {
    case "in_progress":
      return { background: colors.infoSoft, text: colors.info };
    case "waiting":
      return { background: colors.warningSoft, text: colors.warning };
    case "review":
      return { background: colors.purpleSoft, text: colors.purple };
    case "done":
      return { background: colors.successSoft, text: colors.success };
    case "cancelled":
      return { background: colors.dangerSoft, text: colors.danger };
    default:
      return { background: colors.surfaceMuted, text: colors.textMuted };
  }
}

export function priorityColor(colors: Palette, priority: TaskPriority): string {
  return { low: colors.textMuted, medium: colors.info, high: colors.warning, critical: colors.danger }[priority];
}

function dueLabel(task: TaskListItem): { text: string; overdue: boolean } {
  if (!task.due_at) return { text: "Без срока", overdue: false };
  const date = new Date(task.due_at);
  const closed = task.status === "done" || task.status === "cancelled";
  const overdue = !closed && date.getTime() < Date.now();
  return { text: overdue ? `Просрочено · ${formatShortDate(date)}` : formatShortDate(date), overdue };
}

export function TaskCard({ task, onPress }: { task: TaskListItem; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { gutter } = useLayout();
  const tone = statusTone(colors, task.status);
  const due = dueLabel(task);
  const done = task.status === "done";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ marginHorizontal: gutter }, styles.wrap, pressed && styles.pressed]}>
      <GlassCard>
        <View style={styles.mainRow}>
          <View style={[styles.checkCircle, done && styles.checkCircleDone]}>
            {done ? <Feather name="check" size={14} color={colors.onPrimary} /> : null}
          </View>
          <View style={styles.content}>
            <View style={styles.topRow}>
              <Text style={styles.project} numberOfLines={1}>{task.project_name}</Text>
              {task.is_favorite ? <Feather name="star" size={15} color={colors.primaryText} /> : null}
            </View>
            <Text style={[styles.title, done && styles.titleDone]} numberOfLines={3}>{task.title}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.badge, { backgroundColor: tone.background }]}>
                <Text style={[styles.badgeText, { color: tone.text }]}>{statusLabels[task.status]}</Text>
              </View>
              <View style={styles.priority}>
                <View style={[styles.priorityDot, { backgroundColor: priorityColor(colors, task.priority) }]} />
                <Text style={styles.metaText}>{priorityLabels[task.priority]}</Text>
              </View>
              {task.estimate_minutes ? (
                <View style={styles.priority}>
                  <Feather name="clock" size={12} color={colors.textMuted} />
                  <Text style={styles.metaText}>{minutesLabel(task.estimate_minutes)}</Text>
                </View>
              ) : null}
              <Text style={[styles.due, due.overdue && styles.overdue]}>{due.text}</Text>
            </View>
          </View>
        </View>
      </GlassCard>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { marginBottom: spacing.sm + 2 },
    pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
    mainRow: { flexDirection: "row", alignItems: "flex-start" },
    checkCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.textSubtle,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      marginTop: 2,
    },
    checkCircleDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    content: { flex: 1 },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    project: { flex: 1, color: colors.textMuted, fontSize: 12, fontFamily: fonts.semibold },
    title: { color: colors.text, fontSize: 16, lineHeight: 22, fontFamily: fonts.bold, marginTop: 6, marginBottom: 10 },
    titleDone: { color: colors.textMuted, textDecorationLine: "line-through" },
    metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
    badgeText: { fontSize: 11, fontFamily: fonts.bold },
    priority: { flexDirection: "row", alignItems: "center", gap: 5 },
    priorityDot: { width: 7, height: 7, borderRadius: 4 },
    metaText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semibold },
    due: { marginLeft: "auto", color: colors.textMuted, fontSize: 12, fontFamily: fonts.semibold },
    overdue: { color: colors.danger },
  });
