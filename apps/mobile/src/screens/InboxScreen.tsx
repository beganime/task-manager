import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { TabKey } from "../components/BottomBar";
import { TaskCard } from "../components/TaskCard";
import {
  Avatar,
  EmptyState,
  ErrorState,
  GlassCard,
  IconButton,
  LoadingState,
  PageHeader,
  Screen,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Segmented,
  type IconName,
} from "../components/ui";
import { formatDateTime } from "../lib/dates";
import { useLayout } from "../lib/layout";
import { fonts, spacing, useStyles, useTheme, type Palette } from "../theme";
import { isCompanyManager, type NotificationItem, type NotificationKind, type TaskListItem, type TeamSummary } from "../types";

const kindIcons: Record<NotificationKind, IconName> = {
  assigned: "user-check",
  comment: "message-circle",
  deadline: "clock",
  status: "refresh-cw",
  mention: "at-sign",
  event: "calendar",
};

type Section = "notifications" | "team";

export function InboxScreen({
  openTask,
  onNavigate,
  onUnreadChange,
  liveVersion,
}: {
  openTask: (taskId: number) => void;
  onNavigate: (tab: TabKey) => void;
  onUnreadChange: (count: number) => void;
  liveVersion: number;
}) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { isWide } = useLayout();
  // Сводка по команде нужна только руководителю и администратору; сервер всё равно вернёт 403 остальным.
  const canSeeTeam = isCompanyManager(user?.role);
  const [section, setSection] = useState<Section>("notifications");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [team, setTeam] = useState<TeamSummary[]>([]);
  const [member, setMember] = useState<TeamSummary | null>(null);
  const [memberTasks, setMemberTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [items, summary] = await Promise.all([
        api.notifications(token),
        canSeeTeam ? api.team(token) : Promise.resolve<TeamSummary[]>([]),
      ]);
      setNotifications(items);
      setTeam(summary);
      onUnreadChange(items.filter((item) => !item.is_read).length);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canSeeTeam, onUnreadChange, token]);

  useEffect(() => {
    void load();
  }, [load, liveVersion]);

  const unread = notifications.filter((item) => !item.is_read).length;

  const openNotification = async (item: NotificationItem) => {
    if (!token) return;
    if (!item.is_read) {
      const next = notifications.map((value) => (value.id === item.id ? { ...value, is_read: true } : value));
      setNotifications(next);
      onUnreadChange(next.filter((value) => !value.is_read).length);
      void api.markNotificationRead(token, item.id).catch(() => undefined);
    }
    if (item.task_id) openTask(item.task_id);
  };

  const readAll = async () => {
    if (!token) return;
    try {
      await api.markAllNotificationsRead(token);
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      onUnreadChange(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отметить");
    }
  };

  const openMember = async (summary: TeamSummary) => {
    if (!token) return;
    setMember(summary);
    setMemberTasks([]);
    try {
      setMemberTasks(await api.teamTasks(token, summary.user.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить задачи");
    }
  };

  if (loading) return <LoadingState />;
  if (error && notifications.length === 0 && team.length === 0) return <ErrorState message={error} retry={() => void load()} />;

  if (member) {
    return (
      <Screen>
        <ScreenScroll>
          <PageHeader
            eyebrow="Загрузка сотрудника"
            title={member.user.full_name}
            action={<IconButton icon="arrow-left" label="Назад" onPress={() => setMember(null)} />}
          />
          <View style={styles.miniStats}>
            <MiniStat value={member.total} label="Всего" tone={colors.text} />
            <MiniStat value={member.in_progress} label="В работе" tone={colors.info} />
            <MiniStat value={member.waiting} label="Ожидают" tone={colors.warning} />
            <MiniStat value={member.overdue} label="Просрочено" tone={colors.danger} />
          </View>
          <SectionHeader title="Задачи сотрудника" count={memberTasks.length} />
          {memberTasks.map((task) => (
            <TaskCard key={task.id} task={task} onPress={() => openTask(task.id)} />
          ))}
        </ScreenScroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenScroll
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <PageHeader
          eyebrow={unread ? `Непрочитанных: ${unread}` : "Всё прочитано"}
          title="Входящие"
          action={
            !isWide ? (
              <View style={styles.headerActions}>
                <IconButton icon="search" label="Поиск" onPress={() => onNavigate("search")} />
                <IconButton icon="settings" label="Настройки" onPress={() => onNavigate("settings")} />
              </View>
            ) : undefined
          }
        />
        {canSeeTeam ? (
          <View style={styles.segment}>
            <Segmented
              options={[
                { value: "notifications", label: "Уведомления", icon: "bell" },
                { value: "team", label: "Команда", icon: "users" },
              ]}
              value={section}
              onChange={setSection}
            />
          </View>
        ) : null}

        {section === "notifications" || !canSeeTeam ? (
          <>
            {unread > 0 ? (
              <View style={styles.readAll}>
                <SecondaryButton title="Прочитать все" icon="check-square" onPress={() => void readAll()} />
              </View>
            ) : null}
            {notifications.length === 0 ? (
              <EmptyState icon="bell" title="Тишина" text="Здесь появятся назначения, комментарии и напоминания о сроках." />
            ) : (
              notifications.map((item) => (
                <Pressable key={item.id} onPress={() => void openNotification(item)} style={({ pressed }) => [styles.itemWrap, pressed && styles.pressed]}>
                  <GlassCard>
                    <View style={styles.itemRow}>
                      <View style={[styles.kindIcon, !item.is_read && styles.kindIconUnread]}>
                        <Feather name={kindIcons[item.kind]} size={17} color={item.is_read ? colors.textMuted : colors.primaryText} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={[styles.itemTitle, item.is_read && styles.itemTitleRead]}>{item.title}</Text>
                        {item.body ? <Text style={styles.itemBody}>{item.body}</Text> : null}
                        <Text style={styles.itemTime}>{formatDateTime(item.created_at)}</Text>
                      </View>
                      {!item.is_read ? <View style={styles.unreadDot} /> : null}
                    </View>
                  </GlassCard>
                </Pressable>
              ))
            )}
          </>
        ) : (
          team.map((item) => (
            <Pressable key={item.user.id} onPress={() => void openMember(item)} style={({ pressed }) => [styles.itemWrap, pressed && styles.pressed]}>
              <GlassCard>
                <View style={styles.itemRow}>
                  <Avatar name={item.user.full_name} size={42} />
                  <View style={styles.flex}>
                    <Text style={styles.itemTitle}>{item.user.full_name}</Text>
                    <Text style={styles.itemBody}>
                      Всего {item.total} · в работе {item.in_progress} · ждут {item.waiting}
                    </Text>
                  </View>
                  <View style={styles.overdue}>
                    <Text style={[styles.overdueValue, item.overdue === 0 && styles.overdueZero]}>{item.overdue}</Text>
                    <Text style={styles.itemTime}>проср.</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </View>
              </GlassCard>
            </Pressable>
          ))
        )}
      </ScreenScroll>
    </Screen>
  );
}

function MiniStat({ value, label, tone }: { value: number; label: string; tone: string }) {
  const styles = useStyles(makeStyles);
  return (
    <GlassCard style={styles.flex}>
      <Text style={[styles.miniValue, { color: tone }]}>{value}</Text>
      <Text style={styles.itemTime}>{label}</Text>
    </GlassCard>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pressed: { opacity: 0.8 },
    headerActions: { flexDirection: "row", gap: 8 },
    segment: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
    readAll: { alignItems: "flex-end", paddingHorizontal: spacing.md, marginBottom: spacing.sm },
    itemWrap: { marginHorizontal: spacing.md, marginBottom: spacing.sm },
    itemRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    kindIcon: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    kindIconUnread: { backgroundColor: colors.primarySoft },
    itemTitle: { color: colors.text, fontSize: 14, fontFamily: fonts.bold },
    itemTitleRead: { fontFamily: fonts.semibold, color: colors.textMuted },
    itemBody: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: fonts.medium, marginTop: 3 },
    itemTime: { color: colors.textSubtle, fontSize: 11, fontFamily: fonts.semibold, marginTop: 4 },
    unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
    overdue: { alignItems: "center", minWidth: 44 },
    overdueValue: { color: colors.danger, fontSize: 20, fontFamily: fonts.extrabold },
    overdueZero: { color: colors.textSubtle },
    miniStats: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.md },
    miniValue: { fontSize: 24, fontFamily: fonts.extrabold },
  });
