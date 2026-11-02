import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../theme";
import {
  priorityLabels,
  statusLabels,
  type TaskListItem,
  type TaskPriority,
  type TaskStatus,
} from "../types";

const statusColors: Record<TaskStatus, { background: string; text: string }> = {
  new: { background: colors.surfaceMuted, text: colors.textMuted },
  in_progress: { background: colors.infoSoft, text: colors.info },
  waiting: { background: colors.warningSoft, text: colors.warning },
  review: { background: "#EEE8FA", text: "#6C48A6" },
  done: { background: colors.successSoft, text: colors.success },
  cancelled: { background: colors.dangerSoft, text: colors.danger },
};

const priorityColors: Record<TaskPriority, string> = {
  low: colors.textMuted,
  medium: colors.info,
  high: colors.warning,
  critical: colors.danger,
};

function dateLabel(value: string | null): string {
  if (!value) return "Без срока";
  const date = new Date(value);
  const now = new Date();
  const overdue = date.getTime() < now.getTime();
  const formatted = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
  return overdue ? `Просрочено · ${formatted}` : formatted;
}

export function TaskCard({ task, onPress }: { task: TaskListItem; onPress: () => void }) {
  const statusColor = statusColors[task.status];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.mainRow}>
        <View style={[styles.checkCircle, task.status === "done" && styles.checkCircleDone]}>
          {task.status === "done" ? <Feather name="check" size={15} color="#FFFFFF" /> : null}
        </View>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.project} numberOfLines={1}>{task.project_name}</Text>
            {task.is_favorite ? <Feather name="star" size={16} color={colors.accent} /> : null}
          </View>
          <Text style={styles.title}>{task.title}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: statusColor.background }]}>
              <Text style={[styles.badgeText, { color: statusColor.text }]}>{statusLabels[task.status]}</Text>
            </View>
            <Text style={[styles.priority, { color: priorityColors[task.priority] }]}>{priorityLabels[task.priority]}</Text>
            <Text style={styles.due}>{dateLabel(task.due_at)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.72 },
  mainRow: { flexDirection: "row", alignItems: "flex-start" },
  checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.textMuted, alignItems: "center", justifyContent: "center", marginRight: 12, marginTop: 2 },
  checkCircleDone: { backgroundColor: colors.success, borderColor: colors.success },
  content: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  project: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  title: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: "700", marginVertical: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  priority: { fontSize: 12, fontWeight: "700" },
  due: { marginLeft: "auto", color: colors.textMuted, fontSize: 12, fontWeight: "600" },
});

