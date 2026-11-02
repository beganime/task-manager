import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { colors, radius, spacing } from "../theme";
import { priorityLabels, type Project, type TaskPriority, type User } from "../types";
import { PageHeader, PrimaryButton, Screen, SecondaryButton } from "./ui";

const priorities = Object.keys(priorityLabels) as TaskPriority[];

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (taskId: number) => void;
  initialProjectId?: number;
  parentTaskId?: number;
}

export function TaskFormModal({
  visible,
  onClose,
  onCreated,
  initialProjectId,
  parentTaskId,
}: Props) {
  const { token, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [projectId, setProjectId] = useState<number | null>(initialProjectId ?? null);
  const [assigneeId, setAssigneeId] = useState<number | null>(user?.id ?? null);
  const [collaboratorIds, setCollaboratorIds] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || !token) return;
    void api.projects(token).then((items) => {
      setProjects(items);
      setProjectId(initialProjectId ?? items[0]?.id ?? null);
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить проекты");
    });
  }, [initialProjectId, token, visible]);

  useEffect(() => {
    if (!visible || !token || !projectId) return;
    void api.projectMembers(token, projectId).then((items) => {
      setMembers(items);
      const defaultAssignee = user?.role === "manager"
        ? user.id
        : items.find((item) => item.role === "manager")?.id ?? user?.id ?? null;
      setAssigneeId((current) => current && items.some((item) => item.id === current) ? current : defaultAssignee);
      setCollaboratorIds((current) => current.filter((id) => items.some((item) => item.id === id)));
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить участников");
    });
  }, [projectId, token, user, visible]);

  const toggleCollaborator = (id: number) => {
    setCollaboratorIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  };

  const reset = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("medium");
    setCollaboratorIds([]);
    setError("");
  };

  const submit = async () => {
    if (!token || !projectId || !assigneeId || !title.trim()) return;
    let dueAt: string | null = null;
    if (dueDate.trim()) {
      const parsed = new Date(`${dueDate.trim()}T18:00:00+03:00`);
      if (Number.isNaN(parsed.getTime())) {
        setError("Укажите срок в формате ГГГГ-ММ-ДД");
        return;
      }
      dueAt = parsed.toISOString();
    }
    setSaving(true);
    setError("");
    try {
      const task = await api.createTask(token, {
        project_id: projectId,
        primary_assignee_id: assigneeId,
        collaborator_ids: collaboratorIds.filter((id) => id !== assigneeId),
        parent_task_id: parentTaskId ?? null,
        title: title.trim(),
        description: description.trim(),
        due_at: dueAt,
        priority,
      });
      reset();
      onCreated(task.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать задачу");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <Screen>
        <PageHeader
          eyebrow={parentTaskId ? "Подзадача" : "Новая задача"}
          title={parentTaskId ? "Добавить подзадачу" : "Создать задачу"}
          action={<SecondaryButton title="Закрыть" onPress={onClose} />}
        />
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <FieldLabel icon="type" label="Название" />
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Коротко и конкретно" placeholderTextColor={colors.textMuted} />

          <FieldLabel icon="align-left" label="Описание" />
          <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline placeholder="Контекст, результат и важные детали" placeholderTextColor={colors.textMuted} />

          {!initialProjectId ? (
            <>
              <FieldLabel icon="grid" label="Проект" />
              <View style={styles.choices}>
                {projects.map((project) => <Choice key={project.id} active={projectId === project.id} label={project.name} onPress={() => setProjectId(project.id)} />)}
              </View>
            </>
          ) : null}

          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <FieldLabel icon="calendar" label="Срок" />
              <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="2026-11-15" placeholderTextColor={colors.textMuted} autoCapitalize="none" />
            </View>
            <View style={styles.column}>
              <FieldLabel icon="flag" label="Приоритет" />
              <View style={styles.priorityRow}>
                {priorities.map((item) => (
                  <Pressable key={item} onPress={() => setPriority(item)} style={[styles.priorityChoice, priority === item && styles.priorityActive]}>
                    <Text style={[styles.priorityText, priority === item && styles.priorityTextActive]}>{priorityLabels[item].slice(0, 1)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <FieldLabel icon="user" label="Ответственный" />
          <View style={styles.choices}>
            {members.filter((item) => user?.role !== "manager" || item.id === user.id).map((item) => (
              <Choice key={item.id} active={assigneeId === item.id} label={item.full_name} onPress={() => setAssigneeId(item.id)} />
            ))}
          </View>

          {user?.role !== "manager" ? (
            <>
              <FieldLabel icon="users" label="Соисполнители" />
              <View style={styles.chips}>
                {members.filter((item) => item.id !== assigneeId).map((item) => {
                  const active = collaboratorIds.includes(item.id);
                  return (
                    <Pressable key={item.id} onPress={() => toggleCollaborator(item.id)} style={[styles.chip, active && styles.chipActive]}>
                      <Feather name={active ? "check" : "plus"} size={13} color={active ? colors.accent : colors.textMuted} />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.full_name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton title={parentTaskId ? "Создать подзадачу" : "Создать задачу"} onPress={() => void submit()} loading={saving} disabled={!projectId || !assigneeId || !title.trim()} />
        </ScrollView>
      </Screen>
    </Modal>
  );
}

function FieldLabel({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  return <View style={styles.fieldLabel}><Feather name={icon} size={15} color={colors.textMuted} /><Text style={styles.label}>{label}</Text></View>;
}

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { padding: spacing.md, paddingBottom: 48, gap: spacing.sm },
  fieldLabel: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: spacing.sm },
  label: { color: colors.text, fontSize: 13, fontWeight: "800" },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.text, fontSize: 15 },
  multiline: { minHeight: 108, paddingTop: 14, textAlignVertical: "top" },
  choices: { gap: 7, marginBottom: 2 },
  choice: { minHeight: 48, paddingHorizontal: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center" },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginRight: 10 },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  choiceText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  choiceTextActive: { color: colors.primary, fontWeight: "800" },
  twoColumns: { flexDirection: "row", gap: spacing.sm },
  column: { flex: 1, gap: spacing.sm },
  priorityRow: { flexDirection: "row", gap: 5 },
  priorityChoice: { flex: 1, height: 50, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  priorityActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  priorityText: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
  priorityTextActive: { color: colors.accent },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: colors.accent },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginVertical: spacing.sm },
});
