import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { TabKey } from "../components/BottomBar";
import { ReminderModal, RoutineFormModal, RoutinesManageModal } from "../components/RoutineForms";
import { ReminderCard, RoutineRow, RoutineTimerModal, WeekStrip } from "../components/ritual";
import { TaskCard } from "../components/TaskCard";
import { TaskFormModal } from "../components/TaskFormModal";
import {
  Avatar,
  EmptyState,
  ErrorState,
  GlassCard,
  LoadingState,
  Screen,
  ScreenScroll,
  SectionHeader,
  type IconName,
} from "../components/ui";
import { addDays, daysLabel, formatLongDate, greeting, minutesLabel, parseDayKey, toDayKey, todayKey } from "../lib/dates";
import { useLayout } from "../lib/layout";
import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import type { Dashboard, Ritual, Routine, Workload } from "../types";

/** Отметки ставятся за сегодня и за прошлые 7 дней — то же правило проверяет сервер. */
function canCheckDay(day: string): boolean {
  const today = todayKey();
  const oldest = toDayKey(addDays(new Date(), -7));
  return day <= today && day >= oldest;
}

export function HomeScreen({
  openTask,
  onNavigate,
  liveVersion,
}: {
  openTask: (taskId: number) => void;
  onNavigate: (tab: TabKey) => void;
  liveVersion: number;
}) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { isWide, gutter } = useLayout();

  const [ritual, setRitual] = useState<Ritual | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const [timerRoutine, setTimerRoutine] = useState<Routine | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [routineFormOpen, setRoutineFormOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const load = useCallback(
    async (day: string | null) => {
      if (!token) return;
      setError("");
      try {
        const [ritualData, dashboardData] = await Promise.all([api.ritual(token, day ?? undefined), api.dashboard(token)]);
        setRitual(ritualData);
        setDashboard(dashboardData);
        setSelectedDay(ritualData.day);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load(null);
    // liveVersion: перезагружаем при событиях WebSocket (новая задача, дедлайн и т. п.).
  }, [load, liveVersion]);

  const selectDay = async (day: string) => {
    if (!token || day === selectedDay) return;
    setSelectedDay(day);
    setActionError("");
    try {
      setRitual(await api.ritual(token, day));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Не удалось загрузить день");
    }
  };

  const toggleRoutine = async (routine: Routine) => {
    if (!token || !ritual) return;
    const day = ritual.day;
    setActionError("");
    // Оптимистично переключаем галочку; серию и итоги потом пересчитывает сервер.
    setRitual({
      ...ritual,
      routines: ritual.routines.map((item) => (item.id === routine.id ? { ...item, done: !item.done } : item)),
    });
    try {
      const next = routine.done ? await api.uncheckRoutine(token, routine.id, day) : await api.checkRoutine(token, routine.id, day);
      setRitual(next);
      setTimerRoutine((current) => (current && current.id === routine.id ? next.routines.find((item) => item.id === routine.id) ?? null : current));
      if (day === todayKey() && token) setDashboard(await api.dashboard(token));
    } catch (caught) {
      setRitual(ritual);
      setActionError(caught instanceof Error ? caught.message : "Не удалось отметить привычку");
    }
  };

  const openRoutineForm = (routine: Routine | null) => {
    setEditingRoutine(routine);
    setTimerRoutine(null);
    setManageOpen(false);
    setFabOpen(false);
    setRoutineFormOpen(true);
  };

  if (loading) return <LoadingState />;
  if (!ritual || !dashboard) return <ErrorState message={error} retry={() => void load(selectedDay)} />;

  const firstName = user?.full_name.split(" ")[0] ?? "";
  const day = selectedDay ?? ritual.day;
  const dayCheckable = canCheckDay(day);
  const isToday = day === todayKey();
  const doneCount = ritual.routines.filter((item) => item.done).length;

  const ritualColumn = (
    <View>
      <View style={{ paddingHorizontal: gutter }}>
        <WeekStrip week={ritual.week} selected={day} onSelect={(value) => void selectDay(value)} />
      </View>
      <View style={[styles.block, { paddingHorizontal: gutter }]}>
        <ReminderCard
          reminderTime={user?.reminder_time ?? null}
          enabled={user?.reminder_enabled ?? false}
          onPress={() => setReminderOpen(true)}
        />
      </View>
      <SectionHeader title="Ежедневная рутина" actionLabel="Все" onAction={() => setManageOpen(true)} />
      <View style={{ paddingHorizontal: gutter }}>
        <View style={styles.ritualSummary}>
          <Text style={styles.ritualSummaryText}>
            {isToday ? "Сегодня" : formatLongDate(parseDayKey(day))} · {doneCount} из {ritual.routines.length} ·{" "}
            {minutesLabel(ritual.done_minutes)} из {minutesLabel(ritual.total_minutes)}
          </Text>
          {ritual.streak > 0 ? (
            <View style={styles.streakBadge}>
              <Feather name="zap" size={12} color={colors.primaryText} />
              <Text style={styles.streakText}>{daysLabel(ritual.streak)}</Text>
            </View>
          ) : null}
        </View>
        {!dayCheckable ? (
          <Text style={styles.hint}>
            {day > todayKey() ? "Этот день ещё не наступил — отметить можно будет утром." : "Отмечать можно только последние 7 дней."}
          </Text>
        ) : null}
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
        {ritual.routines.length ? (
          ritual.routines.map((routine, index) => (
            <RoutineRow
              key={routine.id}
              routine={routine}
              isLast={index === ritual.routines.length - 1}
              canCheck={dayCheckable}
              onToggle={() => void toggleRoutine(routine)}
              onOpen={() => setTimerRoutine(routine)}
            />
          ))
        ) : (
          <EmptyState icon="sunrise" title="Ритуал пуст" text="Нажмите «+», чтобы добавить первую привычку." />
        )}
      </View>
    </View>
  );

  const dayColumn = (
    <View>
      {dashboard.workload ? (
        <View style={[styles.block, isWide && styles.blockFlush, { paddingHorizontal: gutter }]}>
          <WorkloadCard workload={dashboard.workload} />
        </View>
      ) : null}
      <View style={[styles.stats, { paddingHorizontal: gutter }]}>
        <StatCard icon="sun" label="На сегодня" value={dashboard.today} tone={colors.primaryText} onPress={() => onNavigate("tasks")} />
        <StatCard icon="alert-circle" label="Просрочено" value={dashboard.overdue} tone={colors.danger} onPress={() => onNavigate("tasks")} />
        <StatCard icon="pause-circle" label="Ожидают" value={dashboard.waiting} tone={colors.warning} onPress={() => onNavigate("tasks")} />
        <StatCard icon="check-circle" label="За неделю" value={dashboard.done_this_week} tone={colors.success} onPress={() => onNavigate("tasks")} />
      </View>
      <SectionHeader title="Фокус дня" count={dashboard.priorities.length} actionLabel="Все задачи" onAction={() => onNavigate("tasks")} />
      {dashboard.priorities.length ? (
        dashboard.priorities.map((task) => <TaskCard key={task.id} task={task} onPress={() => openTask(task.id)} />)
      ) : (
        <EmptyState icon="coffee" title="Спокойный день" text="Срочных задач нет — самое время для важного, но не горящего." />
      )}
    </View>
  );

  return (
    <Screen>
      <ScreenScroll
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              void load(selectedDay);
            }}
          />
        }
      >
        <View style={[styles.header, { paddingHorizontal: gutter }]}>
          <View style={styles.headerText}>
            <Text style={styles.hello}>
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </Text>
            <Text style={styles.date}>{formatLongDate(new Date())}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Настройки профиля" onPress={() => onNavigate("settings")}>
            <Avatar name={user?.full_name ?? ""} size={50} />
          </Pressable>
        </View>
        {isWide ? (
          <View style={styles.columns}>
            <View style={styles.leftColumn}>{ritualColumn}</View>
            <View style={styles.rightColumn}>{dayColumn}</View>
          </View>
        ) : (
          <>
            {ritualColumn}
            {dayColumn}
          </>
        )}
      </ScreenScroll>

      {fabOpen ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFabOpen(false)} accessibilityLabel="Закрыть меню" />
          <View style={[styles.fabMenu, isWide ? styles.fabMenuWide : null]}>
            <FabAction icon="sunrise" label="Привычка" onPress={() => openRoutineForm(null)} />
            <FabAction
              icon="check-circle"
              label="Задача"
              onPress={() => {
                setFabOpen(false);
                setTaskFormOpen(true);
              }}
            />
          </View>
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Добавить"
        onPress={() => setFabOpen((value) => !value)}
        style={({ pressed }) => [styles.fab, isWide && styles.fabWide, pressed && styles.pressed]}
      >
        <Feather name={fabOpen ? "x" : "plus"} size={26} color={colors.onStrong} />
      </Pressable>

      <RoutineTimerModal
        routine={timerRoutine}
        visible={timerRoutine !== null}
        canCheck={dayCheckable}
        onClose={() => setTimerRoutine(null)}
        onComplete={() => {
          if (timerRoutine && !timerRoutine.done) void toggleRoutine(timerRoutine);
        }}
        onEdit={() => openRoutineForm(timerRoutine)}
      />
      <RoutineFormModal
        visible={routineFormOpen}
        routine={editingRoutine}
        onClose={() => setRoutineFormOpen(false)}
        onSaved={(next) => {
          setRoutineFormOpen(false);
          if (next) setRitual(next);
          else void load(selectedDay);
        }}
      />
      <RoutinesManageModal
        visible={manageOpen}
        ritual={ritual}
        onClose={() => setManageOpen(false)}
        onEdit={(routine) => openRoutineForm(routine)}
        onCreate={() => openRoutineForm(null)}
      />
      <ReminderModal visible={reminderOpen} onClose={() => setReminderOpen(false)} />
      <TaskFormModal
        visible={taskFormOpen}
        initialDay={todayKey()}
        onClose={() => setTaskFormOpen(false)}
        onCreated={(taskId) => {
          setTaskFormOpen(false);
          void load(selectedDay);
          openTask(taskId);
        }}
      />
    </Screen>
  );
}

/** Нагрузка дня: рабочее время минус ритуал против оценок задач. Расчёт делает сервер. */
function WorkloadCard({ workload }: { workload: Workload }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const capacity = Math.max(1, workload.workday_minutes - workload.ritual_minutes);
  const ratio = Math.min(1, workload.planned_minutes / capacity);
  const tone = workload.overloaded ? colors.danger : ratio > 0.8 ? colors.warning : colors.success;
  return (
    <GlassCard>
      <View style={styles.workloadHead}>
        <View style={[styles.workloadIcon, { backgroundColor: workload.overloaded ? colors.dangerSoft : colors.successSoft }]}>
          <Feather name={workload.overloaded ? "alert-triangle" : "battery-charging"} size={18} color={tone} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.workloadTitle}>{workload.overloaded ? "День перегружен" : "Нагрузка дня"}</Text>
          <Text style={styles.workloadSub}>
            Запланировано {minutesLabel(workload.planned_minutes)} из {minutesLabel(capacity)}
          </Text>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: tone }]} />
      </View>
      <View style={styles.workloadMeta}>
        <Text style={styles.workloadMetaText}>Ритуал {minutesLabel(workload.ritual_minutes)}</Text>
        <Text style={styles.workloadMetaText}>Свободно {minutesLabel(Math.max(0, workload.free_minutes))}</Text>
        <Text style={styles.workloadMetaText}>Сроков сегодня: {workload.deadlines_today}</Text>
      </View>
      {workload.message ? <Text style={[styles.workloadMessage, { color: tone }]}>{workload.message}</Text> : null}
    </GlassCard>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: number;
  tone: string;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.statWrap, pressed && styles.pressed]}>
      <GlassCard>
        <Feather name={icon} size={18} color={tone} />
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </GlassCard>
    </Pressable>
  );
}

function FabAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fabAction, pressed && styles.pressed]}>
      <Feather name={icon} size={17} color={colors.primaryText} />
      <Text style={styles.fabActionText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
    header: { flexDirection: "row", alignItems: "center", paddingTop: spacing.md, paddingBottom: spacing.lg },
    headerText: { flex: 1, paddingRight: spacing.md },
    hello: { color: colors.text, fontSize: 28, fontFamily: fonts.extrabold, letterSpacing: -0.8 },
    date: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.medium, marginTop: 4 },
    block: { marginTop: spacing.lg },
    blockFlush: { marginTop: 0 },
    columns: { flexDirection: "row", alignItems: "flex-start" },
    leftColumn: { flex: 1.1 },
    rightColumn: { flex: 1 },
    ritualSummary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: spacing.sm },
    ritualSummaryText: { flex: 1, color: colors.textMuted, fontSize: 13, fontFamily: fonts.semibold },
    streakBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.primarySoft,
    },
    streakText: { color: colors.primaryText, fontSize: 12, fontFamily: fonts.bold },
    hint: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginBottom: spacing.sm },
    errorText: { color: colors.danger, fontSize: 13, fontFamily: fonts.semibold, marginBottom: spacing.sm },
    stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: spacing.lg },
    statWrap: { flexGrow: 1, flexBasis: "45%" },
    statValue: { color: colors.text, fontSize: 26, fontFamily: fonts.extrabold, marginTop: 8 },
    statLabel: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semibold },
    workloadHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    workloadIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    workloadTitle: { color: colors.text, fontSize: 16, fontFamily: fonts.extrabold },
    workloadSub: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: "hidden", marginTop: 14 },
    trackFill: { height: 8, borderRadius: 4 },
    workloadMeta: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginTop: 10 },
    workloadMetaText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semibold },
    workloadMessage: { fontSize: 13, lineHeight: 18, fontFamily: fonts.bold, marginTop: 10 },
    fab: {
      position: "absolute",
      right: 24,
      bottom: 108,
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.strong,
      shadowColor: colors.strong,
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    fabWide: { bottom: 32, right: 32 },
    fabMenu: {
      position: "absolute",
      right: 24,
      bottom: 180,
      gap: 8,
      alignItems: "flex-end",
    },
    fabMenuWide: { bottom: 104, right: 32 },
    fabAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceSolid,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    fabActionText: { color: colors.text, fontSize: 14, fontFamily: fonts.bold },
  });
