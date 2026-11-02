import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { daysLabel, parseDayKey, todayKey, weekdayShort } from "../lib/dates";
import { fonts, radius, spacing, useStyles, useTheme, withAlpha, type Palette } from "../theme";
import type { Routine, RoutineDay } from "../types";
import { GlassCard, ModalScreen, PrimaryButton, SecondaryButton, type IconName } from "./ui";

export const routineIcons: IconName[] = [
  "droplet",
  "wind",
  "activity",
  "book-open",
  "coffee",
  "sun",
  "heart",
  "music",
  "feather",
  "edit-3",
  "smile",
  "moon",
  "zap",
  "headphones",
  "target",
  "check-square",
];

export const routineColors = ["#F07A2B", "#E9A23B", "#6BAF5B", "#2F7D5B", "#4C9A8A", "#5B8DEF", "#A070D8", "#E06A9A"] as const;

export function routineIcon(name: string): IconName {
  return (routineIcons as string[]).includes(name) ? (name as IconName) : "sun";
}

/** Лента недели Пн–Вс: выбранный день — тёмный круг, полностью выполненный день отмечен точкой. */
export function WeekStrip({ week, selected, onSelect }: { week: RoutineDay[]; selected: string; onSelect: (day: string) => void }) {
  const styles = useStyles(makeStyles);
  const today = todayKey();
  return (
    <View style={styles.week}>
      {week.map((item, index) => {
        const active = item.day === selected;
        const complete = item.total > 0 && item.done >= item.total;
        const partial = item.done > 0 && !complete;
        const isToday = item.day === today;
        return (
          <Pressable
            key={item.day}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
              aria-selected={active}
            accessibilityLabel={`${weekdayShort[index] ?? ""} ${parseDayKey(item.day).getDate()}`}
            onPress={() => onSelect(item.day)}
            style={styles.weekItem}
          >
            <Text style={[styles.weekLabel, (active || isToday) && styles.weekLabelActive]}>{weekdayShort[index]}</Text>
            <View style={[styles.dayPill, active && styles.dayPillActive, !active && isToday && styles.dayPillToday]}>
              <Text style={[styles.dayNumber, active && styles.dayNumberActive]}>{parseDayKey(item.day).getDate()}</Text>
            </View>
            <View style={[styles.dayDot, complete && styles.dayDotComplete, partial && styles.dayDotPartial]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Персиковая карточка «Настройте напоминание» из макета. */
export function ReminderCard({
  reminderTime,
  enabled,
  onPress,
}: {
  reminderTime: string | null;
  enabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.reminder}>
      <View style={styles.reminderGlow} />
      <View style={styles.reminderText}>
        <Text style={styles.reminderTitle}>{enabled && reminderTime ? `Напомним в ${reminderTime}` : "Настройте напоминание"}</Text>
        <Text style={styles.reminderBody}>
          {enabled
            ? "Каждое утро придёт уведомление — ритуал не потеряется в делах."
            : "Не пропускайте утренний ритуал! Напоминание поможет держать ритм."}
        </Text>
        <Pressable onPress={onPress} style={({ pressed }) => [styles.reminderButton, pressed && styles.pressed]}>
          <Text style={styles.reminderButtonText}>{enabled ? "Изменить" : "Настроить"}</Text>
        </Pressable>
      </View>
      <View style={styles.bell}>
        <View style={[styles.bellWave, styles.bellWaveLeft]} />
        <View style={[styles.bellWave, styles.bellWaveRight]} />
        <View style={styles.bellCircle}>
          <Feather name="bell" size={40} color={colors.scheme === "dark" ? colors.text : "#FFFFFF"} />
        </View>
      </View>
    </View>
  );
}

/** Строка привычки: чекбокс на «таймлайне» слева, карточка с иконкой, серией и длительностью. */
export function RoutineRow({
  routine,
  isLast,
  canCheck,
  onToggle,
  onOpen,
}: {
  routine: Routine;
  isLast: boolean;
  canCheck: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.routineRow}>
      <View style={styles.timeline}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: routine.done, disabled: !canCheck }}
          accessibilityLabel={routine.title}
          disabled={!canCheck}
          hitSlop={12}
          onPress={onToggle}
          style={[styles.check, routine.done && styles.checkDone, !canCheck && styles.checkDisabled]}
        >
          {routine.done ? <Feather name="check" size={12} color={colors.onPrimary} /> : null}
        </Pressable>
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.routineCardWrap, pressed && styles.pressed]}>
        <GlassCard padded={false}>
          <View style={styles.routineCard}>
            <View style={[styles.routineIcon, { backgroundColor: withAlpha(routine.color, colors.scheme === "dark" ? 0.26 : 0.18) }]}>
              <Feather name={routineIcon(routine.icon)} size={19} color={routine.color} />
            </View>
            <View style={styles.routineMain}>
              <Text style={[styles.routineTitle, routine.done && styles.routineTitleDone]} numberOfLines={2}>
                {routine.title}
              </Text>
              <Text style={styles.routineStreak}>
                {routine.streak > 0 ? `Серия ${daysLabel(routine.streak)}` : "Начните серию сегодня"}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.duration}>
              <Feather name="clock" size={15} color={colors.text} />
              <Text style={styles.durationText}>{routine.duration_minutes} мин</Text>
            </View>
          </View>
        </GlassCard>
      </Pressable>
    </View>
  );
}

/** Таймер привычки: считает от реального времени, поэтому не «плывёт» при фризах JS-потока. */
export function RoutineTimerModal({
  routine,
  visible,
  canCheck,
  onClose,
  onComplete,
  onEdit,
}: {
  routine: Routine | null;
  visible: boolean;
  canCheck: boolean;
  onClose: () => void;
  onComplete: () => void;
  onEdit: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const total = (routine?.duration_minutes ?? 5) * 60;
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const endsAt = useRef<number | null>(null);
  const completed = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setRemaining(total);
    setRunning(false);
    endsAt.current = null;
    completed.current = false;
  }, [routine?.id, total, visible]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      if (endsAt.current === null) return;
      const left = Math.max(0, Math.round((endsAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setRunning(false);
        endsAt.current = null;
        if (!completed.current && canCheck && routine && !routine.done) {
          completed.current = true;
          onComplete();
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [canCheck, onComplete, routine, running]);

  const toggle = () => {
    if (running) {
      setRunning(false);
      endsAt.current = null;
      return;
    }
    const start = remaining === 0 ? total : remaining;
    setRemaining(start);
    endsAt.current = Date.now() + start * 1000;
    setRunning(true);
  };

  const reset = () => {
    setRunning(false);
    endsAt.current = null;
    setRemaining(total);
  };

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = total ? 1 - remaining / total : 0;
  const tint = routine?.color ?? colors.primary;

  return (
    <ModalScreen visible={visible} onClose={onClose} eyebrow="Таймер привычки" title={routine?.title ?? ""}>
      <GlassCard style={styles.timerCard}>
        <View style={styles.timerInner}>
          <View style={[styles.timerIcon, { backgroundColor: withAlpha(tint, 0.2) }]}>
            <Feather name={routineIcon(routine?.icon ?? "sun")} size={30} color={tint} />
          </View>
          <Text style={styles.timerDigits}>
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: tint }]} />
          </View>
          <Text style={styles.timerHint}>
            {remaining === 0
              ? routine?.done
                ? "Готово! Привычка отмечена."
                : "Время вышло."
              : running
                ? "Сосредоточьтесь — остальное подождёт."
                : `${routine?.duration_minutes ?? 0} мин · серия ${daysLabel(routine?.streak ?? 0)}`}
          </Text>
          <View style={styles.timerActions}>
            <PrimaryButton title={running ? "Пауза" : remaining === total ? "Старт" : remaining === 0 ? "Ещё раз" : "Продолжить"} icon={running ? "pause" : "play"} tone="strong" onPress={toggle} />
            <SecondaryButton title="Сброс" icon="rotate-ccw" onPress={reset} />
          </View>
        </View>
      </GlassCard>
      {canCheck && routine && !routine.done ? (
        <PrimaryButton title="Отметить выполненной" icon="check" onPress={onComplete} />
      ) : null}
      <SecondaryButton title="Изменить привычку" icon="edit-2" onPress={onEdit} />
    </ModalScreen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
    week: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
    weekItem: { flex: 1, alignItems: "center", gap: 8 },
    weekLabel: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium },
    weekLabelActive: { color: colors.text, fontFamily: fonts.bold },
    dayPill: {
      width: 44,
      height: 44,
      maxWidth: "100%",
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSolid,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dayPillActive: { backgroundColor: colors.dayActive, borderColor: colors.dayActive },
    dayPillToday: { borderColor: colors.primary, borderWidth: 1.5 },
    dayNumber: { color: colors.text, fontSize: 15, fontFamily: fonts.semibold },
    dayNumberActive: { color: colors.onDayActive, fontFamily: fonts.bold },
    dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "transparent" },
    dayDotComplete: { backgroundColor: colors.primary },
    dayDotPartial: { backgroundColor: withAlpha(colors.primary, 0.4) },
    reminder: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md + 4,
      borderRadius: radius.lg,
      backgroundColor: colors.highlight,
      overflow: "hidden",
    },
    reminderGlow: {
      position: "absolute",
      right: -40,
      top: -50,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: colors.scheme === "dark" ? "rgba(99,196,150,0.12)" : "rgba(255,255,255,0.35)",
    },
    reminderText: { flex: 1, gap: 6 },
    reminderTitle: { color: colors.highlightText, fontSize: 19, fontFamily: fonts.extrabold, letterSpacing: -0.3 },
    reminderBody: { color: colors.highlightText, opacity: 0.75, fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
    reminderButton: {
      alignSelf: "flex-start",
      marginTop: 8,
      paddingHorizontal: 18,
      height: 38,
      borderRadius: radius.pill,
      justifyContent: "center",
      backgroundColor: colors.strong,
    },
    reminderButtonText: { color: colors.onStrong, fontSize: 13, fontFamily: fonts.bold },
    bell: { width: 96, alignItems: "center", justifyContent: "center" },
    bellCircle: {
      width: 74,
      height: 74,
      borderRadius: 37,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      transform: [{ rotate: "-12deg" }],
    },
    bellWave: { position: "absolute", width: 6, height: 26, borderRadius: 3, backgroundColor: colors.scheme === "dark" ? colors.primaryText : "#9DBF3A" },
    bellWaveLeft: { left: 2, transform: [{ rotate: "-18deg" }] },
    bellWaveRight: { right: 2, transform: [{ rotate: "18deg" }] },
    routineRow: { flexDirection: "row", alignItems: "stretch" },
    timeline: { width: 34, alignItems: "center", paddingTop: 26 },
    check: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.textSubtle,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSolid,
      zIndex: 1,
    },
    checkDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkDisabled: { opacity: 0.4 },
    timelineLine: {
      flex: 1,
      width: 0,
      marginTop: 4,
      borderLeftWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.textSubtle,
      marginBottom: -26,
    },
    routineCardWrap: { flex: 1, marginBottom: spacing.sm + 2 },
    routineCard: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
    routineIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    routineMain: { flex: 1 },
    routineTitle: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
    routineTitleDone: { color: colors.textMuted },
    routineStreak: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 3 },
    divider: { width: 1, alignSelf: "stretch", backgroundColor: colors.border },
    duration: { width: 54, alignItems: "center", gap: 4 },
    durationText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semibold },
    timerCard: { marginTop: spacing.sm },
    timerInner: { alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
    timerIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
    timerDigits: { color: colors.text, fontSize: 64, fontFamily: fonts.extrabold, letterSpacing: -2 },
    progressTrack: { width: "86%", height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: "hidden" },
    progressFill: { height: 8, borderRadius: 4 },
    timerHint: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.medium, textAlign: "center" },
    timerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  });
