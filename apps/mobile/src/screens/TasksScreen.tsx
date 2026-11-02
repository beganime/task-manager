import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { TabKey } from "../components/BottomBar";
import { TaskCard } from "../components/TaskCard";
import { TaskFormModal } from "../components/TaskFormModal";
import { Chip, EmptyState, ErrorState, IconButton, LoadingState, PageHeader, PrimaryButton, Screen, type IconName } from "../components/ui";
import { todayKey } from "../lib/dates";
import { useLayout } from "../lib/layout";
import { spacing, useStyles } from "../theme";
import type { TaskListItem } from "../types";

type TaskView = "all" | "today" | "week" | "overdue" | "favorites" | "done";

const filters: ReadonlyArray<{ key: TaskView; label: string; icon: IconName; empty: string }> = [
  { key: "all", label: "Все", icon: "list", empty: "Активных задач нет — можно выдохнуть." },
  { key: "today", label: "Сегодня", icon: "sun", empty: "На сегодня сроков нет." },
  { key: "week", label: "Неделя", icon: "calendar", empty: "На этой неделе сроков нет." },
  { key: "overdue", label: "Просрочено", icon: "alert-circle", empty: "Просроченных задач нет." },
  { key: "favorites", label: "Избранное", icon: "star", empty: "Отметьте задачу звёздочкой, чтобы она появилась здесь." },
  { key: "done", label: "Завершённые", icon: "check-circle", empty: "Завершённых задач пока нет." },
];

export function TasksScreen({
  openTask,
  onNavigate,
  liveVersion,
}: {
  openTask: (taskId: number) => void;
  onNavigate: (tab: TabKey) => void;
  liveVersion: number;
}) {
  const { token } = useAuth();
  const styles = useStyles(makeStyles);
  const { gutter, isWide } = useLayout();
  const [view, setView] = useState<TaskView>("all");
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

  // Событие из WebSocket (назначение, смена статуса) — тихо перезагружаем список.
  useEffect(() => {
    if (liveVersion > 0) void load();
  }, [liveVersion, load]);

  const active = filters.find((item) => item.key === view) ?? filters[0];
  const columns = isWide ? 2 : 1;

  return (
    <Screen>
      <PageHeader
        title="Мои задачи"
        eyebrow="Единый список"
        action={
          <View style={styles.actions}>
            {/* На телефоне вкладки поиска в нижней панели нет — открываем его отсюда. */}
            {!isWide ? <IconButton icon="search" label="Поиск" onPress={() => onNavigate("search")} /> : null}
            <PrimaryButton compact icon="plus" title="Задача" onPress={() => setCreating(true)} />
          </View>
        }
      />
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filters, { paddingHorizontal: gutter }]}
        >
          {filters.map((filter) => (
            <Chip key={filter.key} icon={filter.icon} label={filter.label} active={view === filter.key} onPress={() => setView(filter.key)} />
          ))}
        </ScrollView>
      </View>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : (
        <FlatList
          key={`columns-${columns}`}
          data={items}
          numColumns={columns}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={columns > 1 ? styles.halfColumn : undefined}>
              <TaskCard task={item} onPress={() => openTask(item.id)} />
            </View>
          )}
          contentContainerStyle={items.length ? styles.list : styles.emptyList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={<EmptyState icon={active?.icon ?? "check"} title="Задач нет" text={active?.empty ?? ""} />}
        />
      )}
      <TaskFormModal
        visible={creating}
        initialDay={view === "today" ? todayKey() : undefined}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          void load();
        }}
      />
    </Screen>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    actions: { flexDirection: "row", alignItems: "center", gap: 8 },
    filterContainer: { flexGrow: 0, marginBottom: spacing.sm },
    filters: { gap: spacing.sm, paddingBottom: spacing.sm },
    halfColumn: { width: "50%" },
    list: { paddingBottom: 120 },
    emptyList: { flexGrow: 1, justifyContent: "center", paddingBottom: 120 },
  });
