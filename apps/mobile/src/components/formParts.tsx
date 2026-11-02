import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { addDays, formatLongDate, isValidDayKey, parseDayKey, toDayKey } from "../lib/dates";
import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import { priorityLabels, type TaskPriority } from "../types";
import { Chip, Field, type IconName } from "./ui";

export function FieldLabel({ icon, children }: { icon?: IconName; children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.label}>
      {icon ? <Feather name={icon} size={14} color={colors.textMuted} /> : null}
      <Text style={styles.labelText}>{children}</Text>
    </View>
  );
}

export function Choice({ active, label, hint, onPress }: { active: boolean; label: string; hint?: string; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.choiceMain}>
        <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
        {hint ? <Text style={styles.choiceHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Ввод даты: быстрые варианты + ручной ввод ГГГГ-ММ-ДД (одинаково работает на телефоне и в браузере). */
export function DayPicker({
  value,
  onChange,
  label = "Срок",
  allowEmpty = true,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  allowEmpty?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const today = new Date();
  const quick: Array<{ label: string; value: string }> = [
    { label: "Сегодня", value: toDayKey(today) },
    { label: "Завтра", value: toDayKey(addDays(today, 1)) },
    { label: "Через неделю", value: toDayKey(addDays(today, 7)) },
  ];
  const valid = value === "" || isValidDayKey(value);
  return (
    <View style={styles.block}>
      <FieldLabel icon="calendar">{label}</FieldLabel>
      <View style={styles.chips}>
        {allowEmpty ? <Chip label="Без срока" active={value === ""} onPress={() => onChange("")} /> : null}
        {quick.map((item) => (
          <Chip key={item.label} label={item.label} active={value === item.value} onPress={() => onChange(item.value)} />
        ))}
      </View>
      <Field
        value={value}
        onChangeText={onChange}
        placeholder="ГГГГ-ММ-ДД"
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        hint={value && valid ? formatLongDate(parseDayKey(value)) : valid ? undefined : "Формат даты: ГГГГ-ММ-ДД"}
      />
    </View>
  );
}

const estimates = [15, 30, 60, 90, 120, 240] as const;

export function EstimatePicker({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.block}>
      <FieldLabel icon="clock">Оценка времени</FieldLabel>
      <View style={styles.chips}>
        <Chip label="Не знаю" active={value === null} onPress={() => onChange(null)} />
        {estimates.map((minutes) => (
          <Chip
            key={minutes}
            label={minutes < 60 ? `${minutes} мин` : `${minutes / 60} ч`}
            active={value === minutes}
            onPress={() => onChange(minutes)}
          />
        ))}
      </View>
    </View>
  );
}

const priorities = Object.keys(priorityLabels) as TaskPriority[];

export function PriorityPicker({ value, onChange }: { value: TaskPriority; onChange: (value: TaskPriority) => void }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.block}>
      <FieldLabel icon="flag">Приоритет</FieldLabel>
      <View style={styles.chips}>
        {priorities.map((item) => (
          <Chip key={item} label={priorityLabels[item]} active={value === item} onPress={() => onChange(item)} />
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    block: { gap: spacing.sm },
    label: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: spacing.sm },
    labelText: { color: colors.text, fontSize: 13, fontFamily: fonts.bold },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    choice: {
      minHeight: 50,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
    },
    choiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: colors.textSubtle,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    radioActive: { borderColor: colors.primary },
    radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
    choiceMain: { flex: 1 },
    choiceText: { color: colors.text, fontSize: 14, fontFamily: fonts.semibold },
    choiceTextActive: { color: colors.text, fontFamily: fonts.bold },
    choiceHint: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
  });
