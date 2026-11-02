import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { confirmAction, notify } from "../lib/layout";
import { remindersSupported, cancelDailyReminder, scheduleDailyReminder } from "../notifications/reminder";
import { fonts, radius, spacing, useStyles, useTheme, withAlpha, type Palette } from "../theme";
import type { Ritual, Routine } from "../types";
import { FieldLabel } from "./formParts";
import { routineColors, routineIcon, routineIcons } from "./ritual";
import { Chip, ErrorText, Field, GlassCard, ModalScreen, PrimaryButton, SecondaryButton } from "./ui";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const quickTimes = ["06:00", "06:30", "07:00", "07:30", "08:00", "09:00"] as const;
const quickDurations = [2, 5, 10, 15, 20, 30, 45] as const;

/** Тот же формат ЧЧ:ММ проверяет сервер (PATCH /auth/me). */
function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function ReminderModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [time, setTime] = useState(user?.reminder_time ?? "07:00");
  const [enabled, setEnabled] = useState(user?.reminder_enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setTime(user?.reminder_time ?? "07:00");
    setEnabled(user?.reminder_enabled ?? true);
    setError("");
  }, [user, visible]);

  const save = async () => {
    if (enabled && !isValidTime(time)) {
      setError("Укажите время в формате ЧЧ:ММ, например 07:30");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // Сервер хранит настройку (и проверяет её), а локальное уведомление ставит само устройство.
      await updateProfile(enabled ? { reminder_time: time, reminder_enabled: true } : { reminder_enabled: false });
      if (remindersSupported) {
        if (enabled) {
          const result = await scheduleDailyReminder(time);
          if (result === "denied") {
            notify(
              "Уведомления выключены",
              "Время сохранено, но системные уведомления запрещены. Разрешите их в настройках телефона.",
            );
          }
        } else {
          await cancelDailyReminder();
        }
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить напоминание");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalScreen visible={visible} onClose={onClose} eyebrow="Утренний ритуал" title="Напоминание">
      <GlassCard>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.switchTitle}>Напоминать каждый день</Text>
            <Text style={styles.switchHint}>Время по часовому поясу {user?.timezone ?? "устройства"}</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: colors.surfaceMuted, true: colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>
      </GlassCard>
      {enabled ? (
        <>
          <FieldLabel icon="clock">Время</FieldLabel>
          <View style={styles.chips}>
            {quickTimes.map((value) => (
              <Chip key={value} label={value} active={time === value} onPress={() => setTime(value)} />
            ))}
          </View>
          <Field
            value={time}
            onChangeText={setTime}
            placeholder="ЧЧ:ММ"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            hint={isValidTime(time) ? `Каждый день в ${time}` : "Формат: ЧЧ:ММ"}
          />
        </>
      ) : null}
      {!remindersSupported ? (
        <View style={styles.webHint}>
          <Feather name="smartphone" size={18} color={colors.primaryText} />
          <Text style={styles.webHintText}>
            На сайте время только сохраняется. Уведомление придёт на телефон, где установлено приложение Elite Task.
          </Text>
        </View>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton title="Сохранить" icon="check" tone="strong" onPress={() => void save()} loading={saving} />
    </ModalScreen>
  );
}

export function RoutineFormModal({
  visible,
  routine,
  onClose,
  onSaved,
}: {
  visible: boolean;
  routine: Routine | null;
  onClose: () => void;
  onSaved: (ritual: Ritual | null) => void;
}) {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string>("sun");
  const [color, setColor] = useState<string>(routineColors[0]);
  const [duration, setDuration] = useState("5");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setTitle(routine?.title ?? "");
    setIcon(routine?.icon ?? "sun");
    setColor(routine?.color ?? routineColors[0]);
    setDuration(String(routine?.duration_minutes ?? 5));
    setError("");
  }, [routine, visible]);

  const minutes = Number.parseInt(duration, 10);
  const durationValid = Number.isInteger(minutes) && minutes >= 1 && minutes <= 240;
  const canSave = title.trim().length >= 1 && durationValid;

  const save = async () => {
    if (!token || !canSave) return;
    setSaving(true);
    setError("");
    try {
      const payload = { title: title.trim(), icon, color, duration_minutes: minutes };
      if (routine) {
        onSaved(await api.updateRoutine(token, routine.id, payload));
      } else {
        await api.createRoutine(token, payload);
        onSaved(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить привычку");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!token || !routine) return;
    confirmAction("Удалить привычку?", `«${routine.title}» и её серия исчезнут из ритуала.`, "Удалить", () => {
      void api
        .deleteRoutine(token, routine.id)
        .then(() => onSaved(null))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Не удалось удалить"));
    });
  };

  return (
    <ModalScreen
      visible={visible}
      onClose={onClose}
      eyebrow="Ежедневная рутина"
      title={routine ? "Изменить привычку" : "Новая привычка"}
    >
      <View style={styles.preview}>
        <View style={[styles.previewIcon, { backgroundColor: withAlpha(color, 0.2) }]}>
          <Feather name={routineIcon(icon)} size={26} color={color} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.previewTitle} numberOfLines={1}>
            {title.trim() || "Название привычки"}
          </Text>
          <Text style={styles.previewHint}>{durationValid ? `${minutes} мин каждый день` : "Длительность 1–240 мин"}</Text>
        </View>
      </View>
      <Field label="Название" value={title} onChangeText={setTitle} placeholder="Например, Растяжка" maxLength={120} autoFocus={!routine} />

      <FieldLabel icon="clock">Длительность</FieldLabel>
      <View style={styles.chips}>
        {quickDurations.map((value) => (
          <Chip key={value} label={`${value} мин`} active={minutes === value} onPress={() => setDuration(String(value))} />
        ))}
      </View>
      <Field value={duration} onChangeText={setDuration} keyboardType="number-pad" maxLength={3} hint="Минут, от 1 до 240" />

      <FieldLabel icon="image">Иконка</FieldLabel>
      <View style={styles.iconGrid}>
        {routineIcons.map((name) => {
          const active = name === icon;
          return (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              aria-selected={active}
              accessibilityLabel={name}
              onPress={() => setIcon(name)}
              style={[styles.iconCell, active && { backgroundColor: withAlpha(color, 0.22), borderColor: color }]}
            >
              <Feather name={name} size={19} color={active ? color : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>

      <FieldLabel icon="droplet">Цвет</FieldLabel>
      <View style={styles.colors}>
        {routineColors.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: value === color }}
              aria-selected={value === color}
            accessibilityLabel={`Цвет ${value}`}
            onPress={() => setColor(value)}
            style={[styles.colorDot, { backgroundColor: value }, value === color && styles.colorDotActive]}
          >
            {value === color ? <Feather name="check" size={15} color="#FFFFFF" /> : null}
          </Pressable>
        ))}
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton title={routine ? "Сохранить" : "Добавить в ритуал"} icon="check" tone="strong" onPress={() => void save()} loading={saving} disabled={!canSave} />
      {routine ? <SecondaryButton title="Удалить привычку" icon="trash-2" danger onPress={remove} /> : null}
    </ModalScreen>
  );
}

/** «Все привычки»: обзор ритуала с быстрым переходом к редактированию. */
export function RoutinesManageModal({
  visible,
  ritual,
  onClose,
  onEdit,
  onCreate,
}: {
  visible: boolean;
  ritual: Ritual | null;
  onClose: () => void;
  onEdit: (routine: Routine) => void;
  onCreate: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const routines = ritual?.routines ?? [];
  return (
    <ModalScreen visible={visible} onClose={onClose} eyebrow="Ежедневная рутина" title="Все привычки">
      <View style={styles.statsRow}>
        <Stat label="В ритуале" value={`${ritual?.total_minutes ?? 0} мин`} />
        <Stat label="Серия" value={String(ritual?.streak ?? 0)} />
        <Stat label="Рекорд" value={String(ritual?.best_streak ?? 0)} />
      </View>
      {routines.map((routine) => (
        <Pressable key={routine.id} onPress={() => onEdit(routine)} style={({ pressed }) => [pressed && styles.pressed]}>
          <GlassCard padded={false}>
            <View style={styles.manageRow}>
              <View style={[styles.manageIcon, { backgroundColor: withAlpha(routine.color, 0.2) }]}>
                <Feather name={routineIcon(routine.icon)} size={18} color={routine.color} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.manageTitle}>{routine.title}</Text>
                <Text style={styles.previewHint}>
                  {routine.duration_minutes} мин · серия {routine.streak}
                </Text>
              </View>
              <Feather name="edit-2" size={16} color={colors.textMuted} />
            </View>
          </GlassCard>
        </Pressable>
      ))}
      {routines.length === 0 ? <Text style={styles.previewHint}>Ритуал пока пуст — добавьте первую привычку.</Text> : null}
      <PrimaryButton title="Добавить привычку" icon="plus" tone="strong" onPress={onCreate} />
    </ModalScreen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pressed: { opacity: 0.75 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    switchTitle: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
    switchHint: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 3 },
    webHint: {
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-start",
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: colors.primarySoft,
    },
    webHintText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, fontFamily: fonts.medium },
    preview: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    previewIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    previewTitle: { color: colors.text, fontSize: 17, fontFamily: fonts.extrabold },
    previewHint: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium, marginTop: 2 },
    iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    iconCell: {
      width: 46,
      height: 46,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    colors: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    colorDotActive: { borderWidth: 3, borderColor: colors.surfaceSolid },
    statsRow: { flexDirection: "row", gap: 8 },
    stat: { flex: 1, padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
    statValue: { color: colors.text, fontSize: 18, fontFamily: fonts.extrabold },
    statLabel: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.semibold, marginTop: 2 },
    manageRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
    manageIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    manageTitle: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
  });
