import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TaskCard } from "../components/TaskCard";
import { ErrorState, LoadingState, PageHeader, Screen, SecondaryButton, SectionTitle } from "../components/ui";
import { colors, radius, spacing } from "../theme";
import type { NotificationItem, TaskListItem, TeamSummary } from "../types";

export function MoreScreen({ openTask }: { openTask: (taskId: number) => void }) {
  const { token, user, logout } = useAuth();
  const [team, setTeam] = useState<TeamSummary[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedMember, setSelectedMember] = useState<TeamSummary | null>(null);
  const [memberTasks, setMemberTasks] = useState<TaskListItem[]>([]);

  const load = useCallback(async () => {
    if (!token || !user) return;
    setError("");
    try {
      const notificationItems = await api.notifications(token);
      setNotifications(notificationItems);
      if (user.role !== "manager") setTeam(await api.team(token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNotification = async (item: NotificationItem) => {
    if (!token) return;
    if (!item.is_read) {
      await api.markNotificationRead(token, item.id);
      setNotifications((current) => current.map((value) => value.id === item.id ? { ...value, is_read: true } : value));
    }
    if (item.task_id) openTask(item.task_id);
  };

  const openMember = async (member: TeamSummary) => {
    if (!token) return;
    setSelectedMember(member);
    setMemberTasks(await api.teamTasks(token, member.user.id));
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={() => void load()} />;
  if (selectedMember) {
    return (
      <Screen>
        <ScrollView>
          <PageHeader eyebrow="Загрузка сотрудника" title={selectedMember.user.full_name} action={<SecondaryButton title="Назад" onPress={() => setSelectedMember(null)} />} />
          <View style={styles.memberStats}>
            <MiniStat value={selectedMember.total} label="Всего" tone={colors.text} />
            <MiniStat value={selectedMember.in_progress} label="В работе" tone={colors.info} />
            <MiniStat value={selectedMember.waiting} label="Ожидают" tone={colors.warning} />
            <MiniStat value={selectedMember.overdue} label="Просрочено" tone={colors.danger} />
          </View>
          <SectionTitle>Задачи сотрудника</SectionTitle>
          {memberTasks.map((task) => <TaskCard key={task.id} task={task} onPress={() => openTask(task.id)} />)}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        <PageHeader
          eyebrow={user?.role === "leader" ? "Руководитель" : user?.role === "admin" ? "Администратор" : "Профиль"}
          title={user?.full_name ?? "Профиль"}
          action={<SecondaryButton title="Выйти" danger onPress={() => void logout()} />}
        />
        {user?.role !== "manager" ? (
          <>
            <SectionTitle>Команда</SectionTitle>
            {team.map((item) => (
              <Pressable key={item.user.id} onPress={() => void openMember(item)} style={styles.teamCard}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.user.full_name.slice(0, 1)}</Text></View>
                <View style={styles.teamMain}>
                  <Text style={styles.teamName}>{item.user.full_name}</Text>
                  <Text style={styles.teamMeta}>Всего {item.total} · в работе {item.in_progress}</Text>
                </View>
                <View style={styles.overdue}><Text style={styles.overdueValue}>{item.overdue}</Text><Text style={styles.overdueLabel}>проср.</Text></View>
                <Feather name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </>
        ) : null}
        <SectionTitle>Уведомления</SectionTitle>
        {notifications.length ? notifications.map((item) => (
          <Pressable key={item.id} onPress={() => void openNotification(item)} style={[styles.notification, !item.is_read && styles.unread]}>
            <View style={[styles.dot, item.is_read && styles.dotRead]} />
            <View style={styles.notificationMain}>
              <Text style={styles.notificationTitle}>{item.title}</Text>
              <Text style={styles.notificationBody}>{item.body}</Text>
              <Text style={styles.notificationTime}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at))}</Text>
            </View>
          </Pressable>
        )) : <Text style={styles.noNotifications}>Новых уведомлений нет.</Text>}
        <View style={styles.footer}><Text style={styles.footerText}>Elite Task · локальный MVP</Text></View>
      </ScrollView>
    </Screen>
  );
}

function MiniStat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return <View style={styles.miniStat}><Text style={[styles.miniValue, { color: tone }]}>{value}</Text><Text style={styles.miniLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  teamCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center" },
  memberStats: { flexDirection: "row", gap: 7, paddingHorizontal: spacing.md },
  miniStat: { flex: 1, minHeight: 82, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: "space-between" },
  miniValue: { fontSize: 24, fontWeight: "900" },
  miniLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  avatarText: { color: colors.primary, fontSize: 18, fontWeight: "900" },
  teamMain: { flex: 1, marginLeft: spacing.md },
  teamName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  teamMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  overdue: { alignItems: "center", minWidth: 48 },
  overdueValue: { color: colors.danger, fontSize: 20, fontWeight: "900" },
  overdueLabel: { color: colors.textMuted, fontSize: 10 },
  notification: { marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row" },
  unread: { borderColor: colors.primary, backgroundColor: "#F8FCFA" },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 5, marginRight: spacing.sm },
  dotRead: { backgroundColor: colors.border },
  notificationMain: { flex: 1 },
  notificationTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  notificationBody: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  notificationTime: { color: colors.textMuted, fontSize: 10, marginTop: spacing.sm },
  noNotifications: { color: colors.textMuted, fontSize: 14, marginHorizontal: spacing.md },
  footer: { alignItems: "center", padding: spacing.xl },
  footerText: { color: colors.textMuted, fontSize: 11 },
});

