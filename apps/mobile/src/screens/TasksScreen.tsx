import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TaskFormModal } from "../components/TaskFormModal";
import { TaskCard } from "../components/TaskCard";
import { EmptyState, ErrorState, LoadingState, PageHeader, PrimaryButton, Screen } from "../components/ui";
import { colors, spacing } from "../theme";
import type { TaskListItem } from "../types";

const filters = [
  ["all", "Все"],
  ["today", "Сегодня"],
  ["week", "Неделя"],
  ["overdue", "Просрочено"],
  ["done", "Завершённые"],
] as const;

export function TasksScreen({ openTask }: { openTask: (taskId: number) => void }) {
  const { token } = useAuth();
  const [view, setView] = useState("all");
  const [items, setItems] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      setItems(await api.tasks(token, view));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, view]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <Screen>
      <PageHeader title="Мои задачи" eyebrow="Единый список" action={<PrimaryButton compact title="+ Задача" onPress={() => setCreating(true)} />} />
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters}>
          {filters.map(([key, label]) => (
            <Pressable key={key} onPress={() => setView(key)} style={[styles.filter, view === key && styles.filterActive]}>
              <Text style={[styles.filterText, view === key && styles.filterTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <TaskCard task={item} onPress={() => openTask(item.id)} />}
          contentContainerStyle={items.length ? styles.list : styles.emptyList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListEmptyComponent={<EmptyState title="Задач нет" text="В этом фильтре пока ничего нет." />}
        />
      )}
      <TaskFormModal visible={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  filterContainer: { height: 52, flexGrow: 0 },
  filterScroll: { flexGrow: 0 },
  filter: { height: 38, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center" },
  filterActive: { backgroundColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  filterTextActive: { color: "#FFFFFF" },
  list: { paddingBottom: spacing.lg },
  emptyList: { flexGrow: 1, justifyContent: "center" },
});

