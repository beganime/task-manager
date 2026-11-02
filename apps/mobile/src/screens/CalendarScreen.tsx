import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { EventDetailModal, EventFormModal } from "../components/EventModals";
import { statusTone } from "../components/TaskCard";
import { TaskFormModal } from "../components/TaskFormModal";
import {
  Chip,
  ErrorText,
  Field,
  GlassCard,
  IconButton,
  PageHeader,
  PrimaryButton,
  Screen,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Segmented,
} from "../components/ui";
import {
  daysLabel,
  formatLongDate,
  formatTime,
  monthGrid,
  monthTitle,
  parseDayKey,
  plural,
  toDayKey,
  todayKey,
  weekdayShort,
} from "../lib/dates";
import { useLayout } from "../lib/layout";
import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import { statusLabels, type CalendarItem, type DateCalcMode, type DateCalcResult } from "../types";

export function CalendarScreen({ openTask, liveVersion }: { openTask: (taskId: number) => void; liveVersion: number }) {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { isWide, gutter } = useLayout();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState(todayKey());
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [openEventId, setOpenEventId] = useState<number | null>(null);

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const rangeFrom = toDayKey(grid[0] ?? new Date());
  const rangeTo = toDayKey(grid[grid.length - 1] ?? new Date());

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const range = await api.calendar(token, rangeFrom, rangeTo);
      setItems(range.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить календарь");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeFrom, rangeTo, token]);

  useEffect(() => {
    void load();
  }, [load, liveVersion]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.day);
      if (list) list.push(item);
      else map.set(item.day, [item]);
    }
    return map;
  }, [items]);

  const shiftMonth = (delta: number) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const goTo = (dayKey: string) => {
    const date = parseDayKey(dayKey);
    setCursor({ year: date.getFullYear(), month: date.getMonth() });
    setSelected(dayKey);
  };

  const dayItems = byDay.get(selected) ?? [];
  const today = todayKey();

  const monthCard = (
    <GlassCard style={{ marginHorizontal: gutter }}>
      <View style={styles.monthHead}>
        <IconButton icon="chevron-left" label="Предыдущий месяц" size={38} onPress={() => shiftMonth(-1)} />
        <Text style={styles.monthTitle}>{monthTitle(cursor.year, cursor.month)}</Text>
        <IconButton icon="chevron-right" label="Следующий месяц" size={38} onPress={() => shiftMonth(1)} />
      </View>
      <View style={styles.weekRow}>
        {weekdayShort.map((label) => (
          <Text key={label} style={styles.weekLabel}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {grid.map((date) => {
          const key = toDayKey(date);
          const inMonth = date.getMonth() === cursor.month;
          const isSelected = key === selected;
          const isToday = key === today;
          const dots = (byDay.get(key) ?? []).slice(0, 3);
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              aria-selected={isSelected}
              accessibilityLabel={formatLongDate(date)}
              onPress={() => (inMonth ? setSelected(key) : goTo(key))}
              style={styles.cell}
            >
              <View style={[styles.cellCircle, isToday && !isSelected && styles.cellToday, isSelected && styles.cellSelected]}>
                <Text style={[styles.cellText, !inMonth && styles.cellOutside, isSelected && styles.cellTextSelected]}>
                  {date.getDate()}
                </Text>
              </View>
              <View style={styles.dots}>
                {dots.map((item) => (
                  <View key={`${item.kind}-${item.id}`} style={[styles.dot, { backgroundColor: item.color }]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      {selected !== today ? (
        <View style={styles.todayLink}>
          <Chip label="Сегодня" icon="crosshair" onPress={() => goTo(today)} />
        </View>
      ) : null}
    </GlassCard>
  );

  const agenda = (
    <View>
      <SectionHeader title={formatLongDate(parseDayKey(selected))} count={dayItems.length} />
      <View style={[styles.agendaActions, { paddingHorizontal: gutter }]}>
        <View style={styles.flex}>
          <PrimaryButton title="Событие на эту дату" icon="calendar" tone="strong" compact onPress={() => setEventFormOpen(true)} />
        </View>
        <View style={styles.flex}>
          <SecondaryButton title="Задача на эту дату" icon="check-circle" onPress={() => setTaskFormOpen(true)} />
        </View>
      </View>
      {error ? (
        <View style={{ paddingHorizontal: gutter }}>
          <ErrorText>{error}</ErrorText>
        </View>
      ) : null}
      {!loading && dayItems.length === 0 ? (
        <Text style={[styles.emptyDay, { paddingHorizontal: gutter }]}>В этот день ничего не запланировано.</Text>
      ) : null}
      {dayItems.map((item) => (
        <AgendaRow
          key={`${item.kind}-${item.id}`}
          item={item}
          onPress={() => (item.kind === "task" ? openTask(item.task_id ?? item.id) : setOpenEventId(item.id))}
        />
      ))}
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
              void load();
            }}
          />
        }
      >
        <PageHeader eyebrow="Личное и проекты" title="Календарь" />
        {isWide ? (
          <View style={styles.columns}>
            <View style={styles.flex}>
              {monthCard}
              <DateCalculator startDay={selected} onOpenDate={goTo} />
            </View>
            <View style={styles.flex}>{agenda}</View>
          </View>
        ) : (
          <>
            {monthCard}
            {agenda}
            <DateCalculator startDay={selected} onOpenDate={goTo} />
          </>
        )}
      </ScreenScroll>
      <EventFormModal
        visible={eventFormOpen}
        day={selected}
        onClose={() => setEventFormOpen(false)}
        onCreated={() => {
          setEventFormOpen(false);
          void load();
        }}
      />
      <TaskFormModal
        visible={taskFormOpen}
        initialDay={selected}
        onClose={() => setTaskFormOpen(false)}
        onCreated={() => {
          setTaskFormOpen(false);
          void load();
        }}
      />
      <EventDetailModal
        eventId={openEventId}
        onClose={() => setOpenEventId(null)}
        onDeleted={() => {
          setOpenEventId(null);
          void load();
        }}
      />
    </Screen>
  );
}

function AgendaRow({ item, onPress }: { item: CalendarItem; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { gutter } = useLayout();
  const tone = item.status ? statusTone(colors, item.status) : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ marginHorizontal: gutter }, styles.agendaRow, pressed && styles.pressed]}>
      <GlassCard padded={false}>
        <View style={styles.agendaInner}>
          <View style={[styles.agendaBar, { backgroundColor: item.color }]} />
          <View style={styles.flex}>
            <View style={styles.agendaTop}>
              <Feather name={item.kind === "task" ? "check-circle" : "calendar"} size={13} color={colors.textMuted} />
              <Text style={styles.agendaMeta} numberOfLines={1}>
                {item.kind === "task" ? "Срок задачи" : item.all_day ? "Весь день" : formatTime(item.starts_at)}
                {item.project_name ? ` · ${item.project_name}` : " · личное"}
              </Text>
            </View>
            <Text style={styles.agendaTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          {tone && item.status ? (
            <View style={[styles.statusBadge, { backgroundColor: tone.background }]}>
              <Text style={[styles.statusText, { color: tone.text }]}>{statusLabels[item.status]}</Text>
            </View>
          ) : null}
        </View>
      </GlassCard>
    </Pressable>
  );
}

const quickOffsets = [7, 14, 30, 90, -7] as const;
const weekdayLong = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"] as const;

/** Калькулятор дат: считает сервер — с учётом выходных и часового пояса пользователя. */
function DateCalculator({ startDay, onOpenDate }: { startDay: string; onOpenDate: (day: string) => void }) {
  const { token } = useAuth();
  const styles = useStyles(makeStyles);
  const { gutter } = useLayout();
  const [days, setDays] = useState("10");
  const [mode, setMode] = useState<DateCalcMode>("business");
  const [result, setResult] = useState<DateCalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const value = Number.parseInt(days, 10);
  const valid = /^-?\d{1,5}$/.test(days.trim()) && Number.isFinite(value);

  const calculate = async (override?: number) => {
    const amount = override ?? value;
    if (!token || !Number.isFinite(amount)) return;
    setLoading(true);
    setError("");
    try {
      setResult(await api.calculateDate(token, { start_date: startDay, days: amount, mode }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось посчитать");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setResult(null);
  }, [mode, startDay]);

  return (
    <View>
      <SectionHeader title="Калькулятор дат" />
      <GlassCard style={{ marginHorizontal: gutter }}>
        <View style={styles.calc}>
          <Text style={styles.calcHint}>От {formatLongDate(parseDayKey(startDay))}</Text>
          <Segmented
            options={[
              { value: "business", label: "Рабочие дни", icon: "briefcase" },
              { value: "calendar", label: "Календарные", icon: "calendar" },
            ]}
            value={mode}
            onChange={setMode}
          />
          <View style={styles.chips}>
            {quickOffsets.map((offset) => (
              <Chip
                key={offset}
                label={offset > 0 ? `+${offset}` : String(offset)}
                active={value === offset}
                onPress={() => {
                  setDays(String(offset));
                  void calculate(offset);
                }}
              />
            ))}
          </View>
          <Field
            value={days}
            onChangeText={setDays}
            keyboardType="numbers-and-punctuation"
            placeholder="Сколько дней (можно с минусом)"
            hint={valid ? `${value >= 0 ? "Вперёд" : "Назад"} на ${Math.abs(value)} ${plural(Math.abs(value), mode === "business" ? ["рабочий день", "рабочих дня", "рабочих дней"] : ["день", "дня", "дней"])}` : "Целое число, например 10 или -5"}
          />
          <PrimaryButton title="Посчитать" icon="hash" compact onPress={() => void calculate()} loading={loading} disabled={!valid} />
          {error ? <ErrorText>{error}</ErrorText> : null}
          {result ? (
            <View style={styles.result}>
              <Text style={styles.resultDate}>{formatLongDate(parseDayKey(result.result_date))}</Text>
              <Text style={styles.calcHint}>
                {weekdayLong[result.weekday - 1] ?? ""} · {daysLabel(Math.abs(result.calendar_days))} календарных ·{" "}
                {Math.abs(result.business_days)} {plural(Math.abs(result.business_days), ["рабочий", "рабочих", "рабочих"])}
              </Text>
              <SecondaryButton title="Открыть в календаре" icon="arrow-right" onPress={() => onOpenDate(result.result_date)} />
            </View>
          ) : null}
        </View>
      </GlassCard>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pressed: { opacity: 0.8 },
    columns: { flexDirection: "row", alignItems: "flex-start" },
    monthHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
    monthTitle: { color: colors.text, fontSize: 18, fontFamily: fonts.extrabold },
    weekRow: { flexDirection: "row" },
    weekLabel: { width: "14.2857%", textAlign: "center", color: colors.textMuted, fontSize: 12, fontFamily: fonts.semibold, marginBottom: 6 },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: "14.2857%", alignItems: "center", paddingVertical: 3 },
    cellCircle: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    cellToday: { borderWidth: 1.5, borderColor: colors.primary },
    cellSelected: { backgroundColor: colors.dayActive },
    cellText: { color: colors.text, fontSize: 14, fontFamily: fonts.semibold },
    cellOutside: { color: colors.textSubtle },
    cellTextSelected: { color: colors.onDayActive, fontFamily: fonts.bold },
    dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 2 },
    dot: { width: 5, height: 5, borderRadius: 3 },
    todayLink: { alignItems: "center", marginTop: spacing.sm },
    agendaActions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
    emptyDay: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.medium, marginBottom: spacing.md },
    agendaRow: { marginBottom: spacing.sm },
    agendaInner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
    agendaBar: { width: 4, alignSelf: "stretch", borderRadius: radius.pill },
    agendaTop: { flexDirection: "row", alignItems: "center", gap: 6 },
    agendaMeta: { flex: 1, color: colors.textMuted, fontSize: 12, fontFamily: fonts.semibold },
    agendaTitle: { color: colors.text, fontSize: 15, fontFamily: fonts.bold, marginTop: 4 },
    statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
    statusText: { fontSize: 11, fontFamily: fonts.bold },
    calc: { gap: spacing.sm + 4 },
    calcHint: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    result: { gap: 6, padding: 14, borderRadius: radius.md, backgroundColor: colors.primarySoft },
    resultDate: { color: colors.text, fontSize: 18, fontFamily: fonts.extrabold },
  });
