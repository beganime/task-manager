import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { colors, radius, spacing } from "../theme";
import { priorityLabels, type TaskDetail, type TaskPriority, type User } from "../types";
import { PageHeader, PrimaryButton, Screen, SecondaryButton } from "./ui";

const priorities = Object.keys(priorityLabels) as TaskPriority[];

export function TaskEditModal({
  task,
  visible,
  onClose,
  onSaved,
}: {
  task: TaskDetail;
  visible: boolean;
  onClose: () => void;
  onSaved: (task: TaskDetail) => void;
}) {
  const { token } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [dueDate, setDueDate] = useState(task.due_at?.slice(0, 10) ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assigneeId, setAssigneeId] = useState(task.primary_assignee.id);
  const [collaboratorIds, setCollaboratorIds] = useState(task.collaborators.map((item) => item.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || !token) return;
    setTitle(task.title);
    setDescription(task.description);
    setDueDate(task.due_at?.slice(0, 10) ?? "");
    setPriority(task.priority);
    setAssigneeId(task.primary_assignee.id);
    setCollaboratorIds(task.collaborators.map((item) => item.id));
    void api.projectMembers(token, task.project_id).then(setMembers);
  }, [task, token, visible]);

  const toggleCollaborator = (id: number) => {
    setCollaboratorIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  };

  const save = async () => {
    if (!token || !title.trim()) return;
    let dueAt: string | null = null;
    if (dueDate.trim()) {
      const parsed = new Date(`${dueDate.trim()}T18:00:00+03:00`);
      if (Number.isNaN(parsed.getTime())) {
        setError("Срок должен быть в формате ГГГГ-ММ-ДД");
        return;
      }
      dueAt = parsed.toISOString();
    }
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateTask(token, task.id, {
        title: title.trim(),
        description: description.trim(),
        due_at: dueAt,
        priority,
        primary_assignee_id: assigneeId,
        collaborator_ids: collaboratorIds.filter((id) => id !== assigneeId),
      });
      onSaved(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить задачу");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen>
        <PageHeader eyebrow={task.project_name} title="Редактировать задачу" action={<SecondaryButton title="Закрыть" onPress={onClose} />} />
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Label>Название</Label>
          <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholderTextColor={colors.textMuted} />
          <Label>Описание</Label>
          <TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.multiline]} multiline placeholder="Контекст и ожидаемый результат" placeholderTextColor={colors.textMuted} />
          <Label>Срок</Label>
          <TextInput value={dueDate} onChangeText={setDueDate} style={styles.input} placeholder="2026-11-15" placeholderTextColor={colors.textMuted} />
          <Label>Приоритет</Label>
          <View style={styles.priorityRow}>{priorities.map((item) => <Pressable key={item} onPress={() => setPriority(item)} style={[styles.priority, priority === item && styles.priorityActive]}><Text style={[styles.priorityText, priority === item && styles.priorityTextActive]}>{priorityLabels[item]}</Text></Pressable>)}</View>
          <Label>Ответственный</Label>
          <View style={styles.choices}>{members.map((member) => <Choice key={member.id} label={member.full_name} active={assigneeId === member.id} onPress={() => setAssigneeId(member.id)} />)}</View>
          <Label>Соисполнители</Label>
          <View style={styles.choices}>{members.filter((member) => member.id !== assigneeId).map((member) => <Choice key={member.id} label={member.full_name} active={collaboratorIds.includes(member.id)} onPress={() => toggleCollaborator(member.id)} />)}</View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton title="Сохранить изменения" onPress={() => void save()} loading={saving} disabled={!title.trim()} />
        </ScrollView>
      </Screen>
    </Modal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><View style={[styles.checkbox, active && styles.checkboxActive]} /><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  form: { padding: spacing.md, paddingBottom: 48, gap: spacing.sm },
  label: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: spacing.sm },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 15 },
  multiline: { minHeight: 110, paddingTop: 14, textAlignVertical: "top" },
  priorityRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  priority: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  priorityActive: { backgroundColor: colors.accentSoft },
  priorityText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  priorityTextActive: { color: colors.accent },
  choices: { gap: 7 },
  choice: { minHeight: 46, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center" },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  checkbox: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border, marginRight: 9 },
  checkboxActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  choiceText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  choiceTextActive: { color: colors.primary, fontWeight: "800" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginVertical: spacing.sm },
});
