import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TaskCard } from "../components/TaskCard";
import { ErrorState, LoadingState, PageHeader, Screen, SectionTitle } from "../components/ui";
import { colors, radius, spacing } from "../theme";
import type { Dashboard } from "../types";

export function HomeScreen({ openTask }: { openTask: (taskId: number) => void }) {
  const { token, user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      setData(await api.dashboard(token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (!data || error) return <ErrorState message={error} retry={() => void load()} />;

  const firstName = user?.full_name.split(" ")[0] ?? "Коллега";
  return (
    <Screen>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <PageHeader eyebrow="Мой день" title={`Добрый день, ${firstName}`} />
        <View style={styles.grid}>
          <StatCard value={data.today} label="На сегодня" tone="info" />
          <StatCard value={data.overdue} label="Просрочено" tone="danger" />
          <StatCard value={data.waiting} label="Ожидают" tone="warning" />
          <StatCard value={data.done_this_week} label="За неделю" tone="success" />
        </View>
        <SectionTitle>В фокусе</SectionTitle>
        {data.priorities.map((task) => (
          <TaskCard key={task.id} task={task} onPress={() => openTask(task.id)} />
        ))}
        <View style={styles.tip}>
          <Text style={styles.tipTitle}>Рабочий ритм</Text>
          <Text style={styles.tipText}>Начните с просроченных и критических задач, затем разберите ожидания.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function StatCard({ value, label, tone }: { value: number; label: string; tone: "info" | "danger" | "warning" | "success" }) {
  const palette = {
    info: [colors.infoSoft, colors.info],
    danger: [colors.dangerSoft, colors.danger],
    warning: [colors.warningSoft, colors.warning],
    success: [colors.successSoft, colors.success],
  }[tone];
  return (
    <View style={[styles.stat, { backgroundColor: palette[0] }]}>
      <Text style={[styles.statValue, { color: palette[1] }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.md },
  stat: { width: "48.7%", minHeight: 112, padding: spacing.md, borderRadius: radius.md, justifyContent: "space-between" },
  statValue: { fontSize: 34, fontWeight: "900" },
  statLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  tip: { margin: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary },
  tipTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", marginBottom: 5 },
  tipText: { color: "#DDEBE5", fontSize: 13, lineHeight: 19 },
});

