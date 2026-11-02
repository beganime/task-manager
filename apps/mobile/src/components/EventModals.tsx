import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatDateTime, formatLongDate, parseDayKey } from "../lib/dates";
import { confirmAction } from "../lib/layout";
import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import type { CalendarEvent, Project } from "../types";
import { FieldLabel } from "./formParts";
import { Chip, ErrorText, Field, GlassCard, LoadingState, ModalScreen, PrimaryButton, SecondaryButton } from "./ui";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Локальное время дня → ISO UTC. Для «весь день» берём локальную полночь. */
function localIso(dayKey: string, time: string | null): string {
  const date = parseDayKey(dayKey);
  if (time) {
    const [hours, minutes] = time.split(":").map(Number);
    date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  }
  return date.toISOString();
}

export function EventFormModal({
  visible,
  day,
  onClose,
  onCreated,
}: {
  visible: boolean;
  day: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setTitle("");
    setDescription("");
    setAllDay(true);
    setStart("10:00");
    setEnd("11:00");
    setProjectId(null);
    setError("");
    if (!token) return;
    void api
      .projects(token)
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [token, visible]);

  // Событие проекта может создать только участник — сервер проверит это ещё раз.
  const memberProjects = useMemo(
    () => projects.filter((item) => !item.is_archived && user !== null && item.member_ids.includes(user.id)),
    [projects, user],
  );

  const timesValid = allDay || (TIME_RE.test(start) && TIME_RE.test(end) && end > start);
  const canSave = title.trim().length > 0 && timesValid;

  const save = async () => {
    if (!token || !canSave) return;
    setSaving(true);
    setError("");
    try {
      await api.createEvent(token, {
        title: title.trim(),
        description: description.trim(),
        all_day: allDay,
        starts_at: localIso(day, allDay ? null : start),
        ends_at: allDay ? null : localIso(day, end),
        project_id: projectId,
      });
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать событие");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalScreen visible={visible} onClose={onClose} eyebrow={formatLongDate(parseDayKey(day))} title="Новое событие">
      <Field label="Название" value={title} onChangeText={setTitle} placeholder="Встреча, день рождения, поездка" maxLength={200} autoFocus />
      <Field label="Описание" value={description} onChangeText={setDescription} multiline placeholder="Необязательно" />
      <GlassCard>
        <View style={styles.switchRow}>
          <Text style={styles.switchTitle}>Весь день</Text>
          <Switch value={allDay} onValueChange={setAllDay} trackColor={{ false: colors.surfaceMuted, true: colors.primary }} thumbColor="#FFFFFF" />
        </View>
      </GlassCard>
      {!allDay ? (
        <View style={styles.timeRow}>
          <View style={styles.flex}>
            <Field label="Начало" value={start} onChangeText={setStart} placeholder="ЧЧ:ММ" maxLength={5} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.flex}>
            <Field label="Конец" value={end} onChangeText={setEnd} placeholder="ЧЧ:ММ" maxLength={5} keyboardType="numbers-and-punctuation" />
          </View>
        </View>
      ) : null}
      {!timesValid ? <ErrorText>Время в формате ЧЧ:ММ, конец позже начала</ErrorText> : null}
      <FieldLabel icon="grid">Где показать</FieldLabel>
      <View style={styles.chips}>
        <Chip label="Только мне" icon="lock" active={projectId === null} onPress={() => setProjectId(null)} />
        {memberProjects.map((project) => (
          <Chip
            key={project.id}
            label={project.name}
            color={project.color}
            active={projectId === project.id}
            onPress={() => setProjectId(project.id)}
          />
        ))}
      </View>
      {projectId !== null ? <Text style={styles.hint}>Участники проекта увидят событие и получат уведомление.</Text> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton title="Создать событие" icon="calendar" tone="strong" onPress={() => void save()} loading={saving} disabled={!canSave} />
    </ModalScreen>
  );
}

export function EventDetailModal({
  eventId,
  onClose,
  onDeleted,
}: {
  eventId: number | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { token } = useAuth();
  const styles = useStyles(makeStyles);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setEvent(null);
    setError("");
    if (!token || eventId === null) return;
    void api
      .event(token, eventId)
      .then(setEvent)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Не удалось загрузить событие"));
  }, [eventId, token]);

  const remove = () => {
    if (!token || !event) return;
    confirmAction("Удалить событие?", `«${event.title}» исчезнет из календаря.`, "Удалить", () => {
      void api
        .deleteEvent(token, event.id)
        .then(onDeleted)
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Не удалось удалить"));
    });
  };

  return (
    <ModalScreen visible={eventId !== null} onClose={onClose} eyebrow="Событие" title={event?.title ?? "Событие"}>
      {!event && !error ? <LoadingState /> : null}
      {event ? (
        <GlassCard>
          <View style={styles.detail}>
            <View style={[styles.colorBar, { backgroundColor: event.color }]} />
            <View style={styles.flex}>
              <Text style={styles.detailLine}>
                {event.all_day
                  ? `${formatLongDate(new Date(event.starts_at))} · весь день`
                  : `${formatDateTime(event.starts_at)}${event.ends_at ? ` — ${formatDateTime(event.ends_at)}` : ""}`}
              </Text>
              <Text style={styles.hint}>{event.project_name ? `Проект «${event.project_name}»` : "Личное событие"}</Text>
              {event.description ? <Text style={styles.description}>{event.description}</Text> : null}
            </View>
          </View>
        </GlassCard>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {event?.can_edit ? <SecondaryButton title="Удалить событие" icon="trash-2" danger onPress={remove} /> : null}
    </ModalScreen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    switchTitle: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
    timeRow: { flexDirection: "row", gap: spacing.sm },
    hint: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 4 },
    detail: { flexDirection: "row", gap: 12 },
    colorBar: { width: 5, borderRadius: radius.pill },
    detailLine: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
    description: { color: colors.text, fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, marginTop: spacing.sm },
  });
