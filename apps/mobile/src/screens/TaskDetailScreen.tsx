import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { statusTone, TaskCard } from "../components/TaskCard";
import { TaskEditModal } from "../components/TaskEditModal";
import { TaskFormModal } from "../components/TaskFormModal";
import {
  ErrorState,
  ErrorText,
  GlassCard,
  IconButton,
  LoadingState,
  PageHeader,
  PrimaryButton,
  Screen,
  ScreenScroll,
  SectionHeader,
} from "../components/ui";
import { formatDateTime, formatLongDate, minutesLabel } from "../lib/dates";
import { confirmAction, useLayout } from "../lib/layout";
import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import {
  isCompanyManager,
  priorityLabels,
  statusLabels,
  type Activity,
  type Project,
  type TaskDetail,
  type TaskListItem,
  type TaskStatus,
} from "../types";

const statuses = Object.keys(statusLabels) as TaskStatus[];

function activityLabel(activity: Activity): string {
  switch (activity.action) {
    case "task.created":
      return "Задача создана";
    case "task.updated":
      return "Задача обновлена";
    default:
      return "Изменение";
  }
}

export function TaskDetailScreen({
  taskId,
  onBack,
  openTask,
}: {
  taskId: number;
  onBack: () => void;
  openTask: (taskId: number) => void;
}) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { gutter, isWide } = useLayout();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [subtasks, setSubtasks] = useState<TaskListItem[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus>("new");
  const [waitingReason, setWaitingReason] = useState("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [creatingSubtask, setCreatingSubtask] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [value, childTasks] = await Promise.all([api.task(token, taskId), api.subtasks(token, taskId)]);
      setTask(value);
      setSubtasks(childTasks);
      setSelectedStatus(value.status);
      setWaitingReason(value.waiting_reason ?? "");
      // Проект нужен только чтобы понять, личный ли он (от этого зависят права в UI).
      try {
        setProject(await api.project(token, value.project_id));
      } catch {
        setProject(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId, token]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    }
  };

  const saveStatus = async () => {
    if (!token || !task) return;
    setSaving(true);
    await run(async () => {
      const updated = await api.updateTask(token, task.id, {
        status: selectedStatus,
        waiting_reason: selectedStatus === "waiting" ? waitingReason.trim() : null,
      });
      setTask(updated);
    }, "Не удалось обновить задачу");
    setSaving(false);
  };

  const toggleChecklist = (itemId: number, isDone: boolean) =>
    run(async () => {
      if (!token || !task) return;
      await api.updateChecklist(token, task.id, itemId, !isDone);
      setTask((current) =>
        current
          ? { ...current, checklist: current.checklist.map((item) => (item.id === itemId ? { ...item, is_done: !isDone } : item)) }
          : current,
      );
    }, "Не удалось обновить пункт");

  const addChecklist = () =>
    run(async () => {
      if (!token || !task || !checklistTitle.trim()) return;
      const item = await api.addChecklist(token, task.id, checklistTitle.trim(), task.checklist.length + 1);
      setTask((current) => (current ? { ...current, checklist: [...current.checklist, item] } : current));
      setChecklistTitle("");
    }, "Не удалось добавить пункт");

  const deleteChecklist = (itemId: number, title: string) => {
    confirmAction("Удалить пункт?", title, "Удалить", () => {
      void run(async () => {
        if (!token || !task) return;
        await api.deleteChecklist(token, task.id, itemId);
        setTask((current) => (current ? { ...current, checklist: current.checklist.filter((item) => item.id !== itemId) } : current));
      }, "Не удалось удалить пункт");
    });
  };

  const toggleFavorite = () =>
    run(async () => {
      if (!token || !task) return;
      setTask(await api.updateTask(token, task.id, { is_favorite: !task.is_favorite }));
    }, "Не удалось обновить избранное");

  const uploadFile = async () => {
    if (!token || !task) return;
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setUploading(true);
    await run(async () => {
      const attachment = await api.uploadAttachment(token, task.id, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? "application/octet-stream",
        // В браузере у ассета есть настоящий File — его и отправляем.
        file: asset.file,
      });
      setTask((current) => (current ? { ...current, attachments: [...current.attachments, attachment] } : current));
    }, "Не удалось загрузить файл");
    setUploading(false);
  };

  const submitText = (kind: "note" | "comment") =>
    run(async () => {
      if (!token || !task) return;
      const value = kind === "note" ? note.trim() : comment.trim();
      if (!value) return;
      if (kind === "note") {
        await api.addNote(token, task.id, value);
        setNote("");
      } else {
        await api.addComment(token, task.id, value);
        setComment("");
      }
      await load();
    }, "Не удалось сохранить запись");

  if (loading) return <Screen><LoadingState /></Screen>;
  if (!task) {
    return (
      <Screen>
        <PageHeader title="Задача" action={<IconButton icon="arrow-left" label="Назад" onPress={onBack} />} />
        <ErrorState message={error || "Задача не найдена"} retry={() => void load()} />
      </Screen>
    );
  }

  // Подсказка для интерфейса; настоящую проверку делает сервер (ensure_task_editor и ограничения менеджера).
  const isPersonalProject = project?.is_personal ?? false;
  const isCompany = isCompanyManager(user?.role);
  const ownsTask = !!user && task.creator.id === user.id && task.primary_assignee.id === user.id;
  const canEdit = isCompany || isPersonalProject || ownsTask;
  const canReassign = isCompany || isPersonalProject;
  const tone = statusTone(colors, task.status);

  const summary = (
    <View style={{ paddingHorizontal: gutter }}>
      <View style={styles.summary}>
        <View style={[styles.statusBadge, { backgroundColor: tone.background }]}>
          <Text style={[styles.statusBadgeText, { color: tone.text }]}>{statusLabels[task.status]}</Text>
        </View>
        <SummaryRow label="Ответственный" value={task.primary_assignee.full_name} />
        <SummaryRow label="Приоритет" value={priorityLabels[task.priority]} />
        <SummaryRow label="Срок" value={task.due_at ? formatLongDate(new Date(task.due_at)) : "Не задан"} />
        {task.estimate_minutes ? <SummaryRow label="Оценка" value={minutesLabel(task.estimate_minutes)} /> : null}
        {task.collaborators.length ? (
          <SummaryRow label="Соисполнители" value={task.collaborators.map((item) => item.full_name).join(", ")} />
        ) : null}
        {task.status === "waiting" && task.waiting_reason ? <SummaryRow label="Ожидает" value={task.waiting_reason} /> : null}
      </View>
      {task.description ? <Text style={styles.description}>{task.description}</Text> : null}
    </View>
  );

  const statusBlock = (
    <View>
      <SectionHeader title="Статус" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.statuses, { paddingHorizontal: gutter }]}>
        {statuses.map((status) => {
          const active = selectedStatus === status;
          return (
            <Pressable key={status} onPress={() => setSelectedStatus(status)} style={[styles.status, active && styles.statusActive]}>
              <Text style={[styles.statusText, active && styles.statusTextActive]}>{statusLabels[status]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ paddingHorizontal: gutter }}>
        {selectedStatus === "waiting" ? (
          <TextInput
            value={waitingReason}
            onChangeText={setWaitingReason}
            style={styles.reasonInput}
            placeholder="Почему задача ожидает?"
            placeholderTextColor={colors.textSubtle}
            multiline
          />
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <View style={styles.actionRow}>
          <PrimaryButton
            compact
            title="Сохранить статус"
            onPress={() => void saveStatus()}
            loading={saving}
            disabled={selectedStatus === task.status || (selectedStatus === "waiting" && !waitingReason.trim())}
          />
        </View>
      </View>
    </View>
  );

  const checklistBlock = (
    <View>
      <SectionHeader
        title="Чек-лист"
        count={task.checklist.length ? task.checklist.filter((item) => item.is_done).length : undefined}
      />
      <View style={{ paddingHorizontal: gutter }}>
        <GlassCard>
          {task.checklist.length ? (
            task.checklist.map((item) => (
              <View key={item.id} style={styles.checkRow}>
                <Pressable onPress={() => void toggleChecklist(item.id, item.is_done)} style={styles.checkMain}>
                  <View style={[styles.checkbox, item.is_done && styles.checkboxDone]}>
                    {item.is_done ? <Feather name="check" size={14} color={colors.onPrimary} /> : null}
                  </View>
                  <Text style={[styles.checkText, item.is_done && styles.checkTextDone]}>{item.title}</Text>
                </Pressable>
                <IconButton icon="trash-2" size={32} color={colors.textSubtle} label={`Удалить «${item.title}»`} onPress={() => deleteChecklist(item.id, item.title)} />
              </View>
            ))
          ) : (
            <Text style={styles.muted}>Чек-лист пока пуст.</Text>
          )}
          <View style={styles.inlineComposer}>
            <TextInput
              value={checklistTitle}
              onChangeText={setChecklistTitle}
              style={styles.inlineInput}
              placeholder="Добавить пункт"
              placeholderTextColor={colors.textSubtle}
              onSubmitEditing={() => void addChecklist()}
            />
            <Pressable
              accessibilityLabel="Добавить пункт"
              onPress={() => void addChecklist()}
              disabled={!checklistTitle.trim()}
              style={[styles.addIcon, !checklistTitle.trim() && styles.disabled]}
            >
              <Feather name="plus" size={19} color={colors.onPrimary} />
            </Pressable>
          </View>
        </GlassCard>
      </View>
    </View>
  );

  const subtasksBlock = (
    <View>
      <SectionHeader title="Подзадачи" count={subtasks.length || undefined} actionLabel="+ Добавить" onAction={() => setCreatingSubtask(true)} />
      {subtasks.length ? (
        subtasks.map((item) => <TaskCard key={item.id} task={item} onPress={() => openTask(item.id)} />)
      ) : (
        <View style={{ paddingHorizontal: gutter }}>
          <GlassCard>
            <Text style={styles.muted}>Разбейте большую работу на понятные шаги.</Text>
          </GlassCard>
        </View>
      )}
    </View>
  );

  const filesBlock = (
    <View>
      <SectionHeader
        title="Файлы"
        count={task.attachments.length || undefined}
        actionLabel={uploading ? "Загрузка…" : "Прикрепить"}
        onAction={() => {
          if (!uploading) void uploadFile();
        }}
      />
      <View style={{ paddingHorizontal: gutter }}>
        <GlassCard>
          {task.attachments.length ? (
            task.attachments.map((file, index) => (
              <View key={file.id} style={[styles.fileRow, index > 0 && styles.divider]}>
                <View style={styles.fileIcon}>
                  <Feather name="file-text" size={17} color={colors.primaryText} />
                </View>
                <View style={styles.fileMain}>
                  <Text style={styles.fileName} numberOfLines={1}>{file.original_name}</Text>
                  <Text style={styles.muted}>{Math.max(1, Math.round(file.size / 1024))} КБ · {formatDateTime(file.created_at)}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>Документы и фотографии ещё не добавлены.</Text>
          )}
        </GlassCard>
      </View>
    </View>
  );

  const notesBlock = (
    <View>
      <SectionHeader title="Рабочие заметки" count={task.notes.length || undefined} />
      <Composer value={note} onChange={setNote} placeholder="Зафиксировать ход работы" action="Добавить" onSubmit={() => void submitText("note")} />
      {task.notes.map((entry) => (
        <Entry key={entry.id} name={entry.author.full_name} body={entry.body} date={entry.created_at} />
      ))}
    </View>
  );

  const commentsBlock = (
    <View>
      <SectionHeader title="Комментарии" count={task.comments.length || undefined} />
      <Composer value={comment} onChange={setComment} placeholder="Обсудить задачу" action="Отправить" onSubmit={() => void submitText("comment")} />
      {task.comments.map((entry) => (
        <Entry key={entry.id} name={entry.author.full_name} body={entry.body} date={entry.created_at} />
      ))}
    </View>
  );

  const historyBlock = (
    <View>
      <SectionHeader title="История" />
      <View style={{ paddingHorizontal: gutter }}>
        <GlassCard>
          {task.activities.map((activity) => (
            <View key={activity.id} style={styles.activity}>
              <View style={styles.activityDot} />
              <View style={styles.flex}>
                <Text style={styles.activityTitle}>{activityLabel(activity)}</Text>
                <Text style={styles.muted}>
                  {activity.actor.full_name} · {formatDateTime(activity.created_at)}
                </Text>
              </View>
            </View>
          ))}
        </GlassCard>
      </View>
    </View>
  );

  return (
    <Screen>
      <PageHeader
        eyebrow={task.project_name}
        title={task.title}
        action={
          <View style={styles.headerActions}>
            <IconButton
              icon="star"
              label={task.is_favorite ? "Убрать из избранного" : "В избранное"}
              active={task.is_favorite}
              onPress={() => void toggleFavorite()}
            />
            {canEdit ? <IconButton icon="edit-2" label="Редактировать" onPress={() => setEditing(true)} /> : null}
            <IconButton icon="arrow-left" label="Назад" onPress={onBack} />
          </View>
        }
      />
      <ScreenScroll
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {isWide ? (
          <View style={styles.columns}>
            <View style={styles.mainColumn}>
              {summary}
              {statusBlock}
              {checklistBlock}
              {subtasksBlock}
              {commentsBlock}
            </View>
            <View style={styles.sideColumn}>
              {filesBlock}
              {notesBlock}
              {historyBlock}
            </View>
          </View>
        ) : (
          <>
            {summary}
            {statusBlock}
            {checklistBlock}
            {subtasksBlock}
            {filesBlock}
            {notesBlock}
            {commentsBlock}
            {historyBlock}
          </>
        )}
      </ScreenScroll>
      <TaskFormModal
        visible={creatingSubtask}
        initialProjectId={task.project_id}
        parentTaskId={task.id}
        onClose={() => setCreatingSubtask(false)}
        onCreated={(createdTaskId) => {
          setCreatingSubtask(false);
          openTask(createdTaskId);
        }}
      />
      <TaskEditModal
        task={task}
        visible={editing}
        canReassign={canReassign}
        onClose={() => setEditing(false)}
        onSaved={(updated) => {
          setTask(updated);
          setEditing(false);
        }}
      />
    </Screen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function Composer({
  value,
  onChange,
  placeholder,
  action,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  action: string;
  onSubmit: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { gutter } = useLayout();
  return (
    <View style={[styles.composer, { paddingHorizontal: gutter }]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.composerInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        multiline
      />
      <View style={styles.actionRow}>
        <PrimaryButton compact title={action} onPress={onSubmit} disabled={!value.trim()} />
      </View>
    </View>
  );
}

function Entry({ name, body, date }: { name: string; body: string; date: string }) {
  const styles = useStyles(makeStyles);
  const { gutter } = useLayout();
  return (
    <View style={[styles.entryWrap, { paddingHorizontal: gutter }]}>
      <GlassCard>
        <Text style={styles.entryAuthor}>{name}</Text>
        <Text style={styles.entryBody}>{body}</Text>
        <Text style={styles.muted}>{formatDateTime(date)}</Text>
      </GlassCard>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    disabled: { opacity: 0.45 },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    columns: { flexDirection: "row", gap: spacing.md },
    mainColumn: { flex: 3 },
    sideColumn: { flex: 2 },
    summary: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.highlight, gap: spacing.sm },
    statusBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginBottom: 2 },
    statusBadgeText: { fontSize: 12, fontFamily: fonts.bold },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
    summaryLabel: { color: colors.highlightText, opacity: 0.7, fontSize: 13, fontFamily: fonts.medium },
    summaryValue: { color: colors.highlightText, fontSize: 13, fontFamily: fonts.bold, flexShrink: 1, textAlign: "right" },
    description: { color: colors.text, fontSize: 15, lineHeight: 22, fontFamily: fonts.medium, marginTop: spacing.md },
    statuses: { gap: spacing.sm },
    status: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
    statusActive: { backgroundColor: colors.dayActive },
    statusText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.semibold },
    statusTextActive: { color: colors.onDayActive },
    reasonInput: {
      marginTop: spacing.md,
      minHeight: 72,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.warning,
      backgroundColor: colors.warningSoft,
      color: colors.text,
      fontFamily: fonts.medium,
      textAlignVertical: "top",
    },
    actionRow: { alignItems: "flex-start", marginTop: spacing.sm + 4 },
    checkRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    checkMain: { flex: 1, flexDirection: "row", alignItems: "center", paddingVertical: 9 },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.textSubtle,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.sm + 2,
    },
    checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
    checkText: { flex: 1, color: colors.text, fontSize: 14, fontFamily: fonts.medium },
    checkTextDone: { color: colors.textMuted, textDecorationLine: "line-through" },
    inlineComposer: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.sm,
      paddingTop: spacing.sm + 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    inlineInput: {
      flex: 1,
      height: 42,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceMuted,
      color: colors.text,
      fontFamily: fonts.medium,
    },
    addIcon: { width: 42, height: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
    muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18, fontFamily: fonts.medium },
    fileRow: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingVertical: 6 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    fileIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
    fileMain: { flex: 1, marginLeft: 10 },
    fileName: { color: colors.text, fontSize: 13, fontFamily: fonts.bold },
    composer: { gap: 0 },
    composerInput: {
      minHeight: 78,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      fontFamily: fonts.medium,
      textAlignVertical: "top",
    },
    entryWrap: { marginTop: spacing.sm },
    entryAuthor: { color: colors.primaryText, fontSize: 12, fontFamily: fonts.bold },
    entryBody: { color: colors.text, fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, marginVertical: spacing.sm },
    activity: { flexDirection: "row", paddingVertical: 6 },
    activityDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 4, marginRight: spacing.sm + 2 },
    activityTitle: { color: colors.text, fontSize: 13, fontFamily: fonts.bold, marginBottom: 2 },
  });
