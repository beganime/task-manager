import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TaskEditModal } from "../components/TaskEditModal";
import { TaskFormModal } from "../components/TaskFormModal";
import { TaskCard } from "../components/TaskCard";
import { ErrorState, LoadingState, PageHeader, PrimaryButton, Screen, SectionTitle } from "../components/ui";
import { colors, radius, spacing } from "../theme";
import { priorityLabels, statusLabels, type TaskDetail, type TaskListItem, type TaskStatus } from "../types";

const statuses = Object.keys(statusLabels) as TaskStatus[];

export function TaskDetailScreen({ taskId, onBack, openTask }: { taskId: number; onBack: () => void; openTask: (taskId: number) => void }) {
  const { token, user } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [taskId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveStatus = async () => {
    if (!token || !task) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateTask(token, task.id, {
        status: selectedStatus,
        waiting_reason: selectedStatus === "waiting" ? waitingReason.trim() : null,
      });
      setTask(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обновить задачу");
    } finally {
      setSaving(false);
    }
  };

  const toggleChecklist = async (itemId: number, isDone: boolean) => {
    if (!token || !task) return;
    await api.updateChecklist(token, task.id, itemId, !isDone);
    setTask({ ...task, checklist: task.checklist.map((item) => item.id === itemId ? { ...item, is_done: !isDone } : item) });
  };

  const addChecklist = async () => {
    if (!token || !task || !checklistTitle.trim()) return;
    const item = await api.addChecklist(token, task.id, checklistTitle.trim(), task.checklist.length + 1);
    setTask({ ...task, checklist: [...task.checklist, item] });
    setChecklistTitle("");
  };

  const toggleFavorite = async () => {
    if (!token || !task) return;
    const updated = await api.updateTask(token, task.id, { is_favorite: !task.is_favorite });
    setTask(updated);
  };

  const uploadFile = async () => {
    if (!token || !task) return;
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    setError("");
    try {
      const attachment = await api.uploadAttachment(token, task.id, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? "application/octet-stream",
      });
      setTask({ ...task, attachments: [...task.attachments, attachment] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить файл");
    } finally {
      setUploading(false);
    }
  };

  const submitText = async (kind: "note" | "comment") => {
    if (!token || !task) return;
    const value = kind === "note" ? note.trim() : comment.trim();
    if (!value) return;
    try {
      if (kind === "note") {
        await api.addNote(token, task.id, value);
        setNote("");
      } else {
        await api.addComment(token, task.id, value);
        setComment("");
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить запись");
    }
  };

  if (loading) return <LoadingState />;
  if (!task) return <ErrorState message={error} retry={() => void load()} />;

  const canEdit = user?.role !== "manager" || (task.creator.id === user.id && task.primary_assignee.id === user.id);

  return (
    <Screen>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        <PageHeader eyebrow={task.project_name} title={task.title} action={<View style={styles.headerActions}><Pressable onPress={() => void toggleFavorite()} style={[styles.favoriteButton, task.is_favorite && styles.favoriteActive]}><Feather name="star" size={18} color={task.is_favorite ? colors.accent : colors.textMuted} /></Pressable>{canEdit ? <Pressable onPress={() => setEditing(true)} style={styles.favoriteButton}><Feather name="edit-2" size={17} color={colors.textMuted} /></Pressable> : null}<Pressable onPress={onBack} style={styles.favoriteButton}><Feather name="arrow-left" size={19} color={colors.text} /></Pressable></View>} />
        <View style={styles.summary}>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Ответственный</Text><Text style={styles.summaryValue}>{task.primary_assignee.full_name}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Приоритет</Text><Text style={styles.summaryValue}>{priorityLabels[task.priority]}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Срок</Text><Text style={styles.summaryValue}>{task.due_at ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(task.due_at)) : "Не задан"}</Text></View>
          {task.collaborators.length ? <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Соисполнители</Text><Text style={styles.summaryValue}>{task.collaborators.map((item) => item.full_name).join(", ")}</Text></View> : null}
        </View>
        {task.description ? <Text style={styles.description}>{task.description}</Text> : null}

        <SectionTitle>Статус</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statuses}>
          {statuses.map((status) => <Pressable key={status} onPress={() => setSelectedStatus(status)} style={[styles.status, selectedStatus === status && styles.statusActive]}><Text style={[styles.statusText, selectedStatus === status && styles.statusTextActive]}>{statusLabels[status]}</Text></Pressable>)}
        </ScrollView>
        {selectedStatus === "waiting" ? <TextInput value={waitingReason} onChangeText={setWaitingReason} style={styles.reasonInput} placeholder="Почему задача ожидает?" placeholderTextColor={colors.textMuted} multiline /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actionRow}><PrimaryButton compact title="Сохранить статус" onPress={() => void saveStatus()} loading={saving} disabled={selectedStatus === "waiting" && !waitingReason.trim()} /></View>

        <SectionTitle>Чек-лист</SectionTitle>
        <View style={styles.sectionCard}>
          {task.checklist.length ? task.checklist.map((item) => (
            <Pressable key={item.id} onPress={() => void toggleChecklist(item.id, item.is_done)} style={styles.checkRow}>
              <View style={[styles.checkbox, item.is_done && styles.checkboxDone]}><Text style={styles.checkmark}>{item.is_done ? "✓" : ""}</Text></View>
              <Text style={[styles.checkText, item.is_done && styles.checkTextDone]}>{item.title}</Text>
            </Pressable>
          )) : <Text style={styles.muted}>Чек-лист пока пуст.</Text>}
          <View style={styles.inlineComposer}><TextInput value={checklistTitle} onChangeText={setChecklistTitle} style={styles.inlineInput} placeholder="Добавить пункт" placeholderTextColor={colors.textMuted} onSubmitEditing={() => void addChecklist()} /><Pressable onPress={() => void addChecklist()} disabled={!checklistTitle.trim()} style={styles.addIcon}><Feather name="plus" size={19} color="#FFFFFF" /></Pressable></View>
        </View>

        <View style={styles.sectionHeadingRow}><SectionTitle>Подзадачи</SectionTitle><Pressable onPress={() => setCreatingSubtask(true)} style={styles.sectionAction}><Feather name="plus" size={15} color={colors.primary} /><Text style={styles.sectionActionText}>Добавить</Text></Pressable></View>
        {subtasks.length ? subtasks.map((item) => <TaskCard key={item.id} task={item} onPress={() => openTask(item.id)} />) : <Text style={styles.emptyInline}>Разбейте большую работу на понятные шаги.</Text>}

        <View style={styles.sectionHeadingRow}><SectionTitle>Файлы</SectionTitle><Pressable onPress={() => void uploadFile()} style={styles.sectionAction}><Feather name="paperclip" size={15} color={colors.primary} /><Text style={styles.sectionActionText}>{uploading ? "Загрузка…" : "Прикрепить"}</Text></Pressable></View>
        <View style={styles.sectionCard}>
          {task.attachments.length ? task.attachments.map((file) => <View key={file.id} style={styles.fileRow}><View style={styles.fileIcon}><Feather name="file-text" size={17} color={colors.accent} /></View><View style={styles.fileMain}><Text style={styles.fileName} numberOfLines={1}>{file.original_name}</Text><Text style={styles.muted}>{Math.max(1, Math.round(file.size / 1024))} КБ</Text></View></View>) : <Text style={styles.muted}>Документы и фотографии ещё не добавлены.</Text>}
        </View>

        <SectionTitle>Рабочие заметки</SectionTitle>
        <View style={styles.composer}>
          <TextInput value={note} onChangeText={setNote} style={styles.composerInput} placeholder="Зафиксировать ход работы" placeholderTextColor={colors.textMuted} multiline />
          <PrimaryButton compact title="Добавить" onPress={() => void submitText("note")} disabled={!note.trim()} />
        </View>
        {task.notes.map((entry) => <Entry key={entry.id} name={entry.author.full_name} body={entry.body} date={entry.created_at} />)}

        <SectionTitle>Комментарии</SectionTitle>
        <View style={styles.composer}>
          <TextInput value={comment} onChangeText={setComment} style={styles.composerInput} placeholder="Обсудить задачу" placeholderTextColor={colors.textMuted} multiline />
          <PrimaryButton compact title="Отправить" onPress={() => void submitText("comment")} disabled={!comment.trim()} />
        </View>
        {task.comments.map((entry) => <Entry key={entry.id} name={entry.author.full_name} body={entry.body} date={entry.created_at} />)}

        <SectionTitle>История</SectionTitle>
        <View style={styles.sectionCard}>
          {task.activities.map((activity) => <View key={activity.id} style={styles.activity}><View style={styles.activityDot} /><View style={styles.activityMain}><Text style={styles.activityTitle}>{activity.action === "task.created" ? "Задача создана" : "Задача обновлена"}</Text><Text style={styles.muted}>{activity.actor.full_name} · {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.created_at))}</Text></View></View>)}
        </View>
        <View style={styles.bottomSpace} />
      </ScrollView>
      <TaskFormModal visible={creatingSubtask} initialProjectId={task.project_id} parentTaskId={task.id} onClose={() => setCreatingSubtask(false)} onCreated={(createdTaskId) => { setCreatingSubtask(false); openTask(createdTaskId); }} />
      <TaskEditModal task={task} visible={editing} onClose={() => setEditing(false)} onSaved={(updated) => { setTask(updated); setEditing(false); }} />
    </Screen>
  );
}

function Entry({ name, body, date }: { name: string; body: string; date: string }) {
  return <View style={styles.entry}><Text style={styles.entryAuthor}>{name}</Text><Text style={styles.entryBody}>{body}</Text><Text style={styles.muted}>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date))}</Text></View>;
}

const styles = StyleSheet.create({
  summary: { marginHorizontal: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  favoriteButton: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  favoriteActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  summaryLabel: { color: "#BFD4CB", fontSize: 12 },
  summaryValue: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", maxWidth: "65%", textAlign: "right" },
  description: { color: colors.text, fontSize: 15, lineHeight: 22, margin: spacing.md },
  statuses: { paddingHorizontal: spacing.md, gap: spacing.sm },
  status: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  statusActive: { backgroundColor: colors.primary },
  statusText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  statusTextActive: { color: "#FFFFFF" },
  reasonInput: { margin: spacing.md, minHeight: 72, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft, color: colors.text, textAlignVertical: "top" },
  error: { color: colors.danger, fontSize: 13, marginHorizontal: spacing.md, marginTop: spacing.sm },
  actionRow: { alignItems: "flex-start", marginHorizontal: spacing.md, marginTop: spacing.md },
  sectionCard: { marginHorizontal: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  checkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  checkmark: { color: "#FFFFFF", fontWeight: "900" },
  checkText: { flex: 1, color: colors.text, fontSize: 14 },
  checkTextDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  inlineComposer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  inlineInput: { flex: 1, height: 42, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: colors.background, color: colors.text },
  addIcon: { width: 42, height: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: spacing.md },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.primarySoft },
  sectionActionText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  emptyInline: { marginHorizontal: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  fileRow: { minHeight: 52, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  fileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  fileMain: { flex: 1, marginLeft: 10 },
  fileName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  composer: { marginHorizontal: spacing.md, gap: spacing.sm },
  composerInput: { minHeight: 78, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, textAlignVertical: "top" },
  entry: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  entryAuthor: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  entryBody: { color: colors.text, fontSize: 14, lineHeight: 20, marginVertical: spacing.sm },
  activity: { flexDirection: "row", marginBottom: spacing.md },
  activityDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 4, marginRight: spacing.sm },
  activityMain: { flex: 1 },
  activityTitle: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 3 },
  bottomSpace: { height: spacing.xl },
});

