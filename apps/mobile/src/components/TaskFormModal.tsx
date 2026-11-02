import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { dayToDueIso, isValidDayKey } from "../lib/dates";
import { spacing } from "../theme";
import { roleLabels, type Project, type TaskPriority, type User } from "../types";
import { Choice, DayPicker, EstimatePicker, FieldLabel, PriorityPicker } from "./formParts";
import { Chip, ErrorText, Field, ModalScreen, PrimaryButton } from "./ui";

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (taskId: number) => void;
  initialProjectId?: number;
  parentTaskId?: number;
  initialDay?: string;
}

export function TaskFormModal({ visible, onClose, onCreated, initialProjectId, parentTaskId, initialDay }: Props) {
  const { token, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [projectId, setProjectId] = useState<number | null>(initialProjectId ?? null);
  const [assigneeId, setAssigneeId] = useState<number | null>(user?.id ?? null);
  const [collaboratorIds, setCollaboratorIds] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDay, setDueDay] = useState(initialDay ?? "");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) setDueDay(initialDay ?? "");
  }, [initialDay, visible]);

  useEffect(() => {
    if (!visible || !token) return;
    void api
      .projects(token)
      .then((items) => {
        setProjects(items);
        setProjectId((current) => initialProjectId ?? (current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null));
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Не удалось загрузить проекты"));
  }, [initialProjectId, token, visible]);

  const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projectId, projects]);
  // Менеджер в проекте компании назначает задачи только себе — это же правило проверяет сервер.
  const selfOnly = user?.role === "manager" && project !== null && !project.is_personal;

  useEffect(() => {
    if (!visible || !token || !projectId) return;
    void api
      .projectMembers(token, projectId)
      .then((items) => {
        setMembers(items);
        setAssigneeId((current) => (current && items.some((item) => item.id === current) ? current : user?.id ?? items[0]?.id ?? null));
        setCollaboratorIds((current) => current.filter((id) => items.some((item) => item.id === id)));
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Не удалось загрузить участников"));
  }, [projectId, token, user, visible]);

  const assignable = members.filter((item) => (selfOnly ? item.id === user?.id : item.role !== "personal" || project?.is_personal));

  const reset = () => {
    setTitle("");
    setDescription("");
    setDueDay(initialDay ?? "");
    setEstimate(null);
    setPriority("medium");
    setCollaboratorIds([]);
    setError("");
  };

  const submit = async () => {
    if (!token || !projectId || !assigneeId || title.trim().length < 2) return;
    if (dueDay && !isValidDayKey(dueDay)) {
      setError("Укажите срок в формате ГГГГ-ММ-ДД");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const task = await api.createTask(token, {
        project_id: projectId,
        primary_assignee_id: assigneeId,
        collaborator_ids: selfOnly ? [] : collaboratorIds.filter((id) => id !== assigneeId),
        parent_task_id: parentTaskId ?? null,
        title: title.trim(),
        description: description.trim(),
        due_at: dueDay ? dayToDueIso(dueDay) : null,
        priority,
        estimate_minutes: estimate,
      });
      reset();
      onCreated(task.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать задачу");
    } finally {
      setSaving(false);
    }
  };

  const toggleCollaborator = (id: number) =>
    setCollaboratorIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  return (
    <ModalScreen
      visible={visible}
      onClose={onClose}
      eyebrow={parentTaskId ? "Подзадача" : "Новая задача"}
      title={parentTaskId ? "Добавить подзадачу" : "Создать задачу"}
    >
      <Field label="Название" value={title} onChangeText={setTitle} placeholder="Коротко и конкретно" autoFocus />
      <Field label="Описание" value={description} onChangeText={setDescription} multiline placeholder="Контекст, результат и важные детали" />

      {!initialProjectId ? (
        <>
          <FieldLabel icon="grid">Проект</FieldLabel>
          <View style={styles.chips}>
            {projects.map((item) => (
              <Chip
                key={item.id}
                label={item.is_personal ? `${item.name} · личный` : item.name}
                active={projectId === item.id}
                color={item.color}
                onPress={() => setProjectId(item.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      <DayPicker value={dueDay} onChange={setDueDay} />
      <EstimatePicker value={estimate} onChange={setEstimate} />
      <PriorityPicker value={priority} onChange={setPriority} />

      {assignable.length > 1 || !selfOnly ? (
        <>
          <FieldLabel icon="user">Ответственный</FieldLabel>
          <View style={styles.list}>
            {assignable.map((item) => (
              <Choice
                key={item.id}
                active={assigneeId === item.id}
                label={item.id === user?.id ? `${item.full_name} (я)` : item.full_name}
                hint={roleLabels[item.role]}
                onPress={() => setAssigneeId(item.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      {!selfOnly && members.length > 1 ? (
        <>
          <FieldLabel icon="users">Соисполнители</FieldLabel>
          <View style={styles.chips}>
            {members
              .filter((item) => item.id !== assigneeId)
              .map((item) => (
                <Chip
                  key={item.id}
                  icon={collaboratorIds.includes(item.id) ? "check" : "plus"}
                  label={item.full_name}
                  active={collaboratorIds.includes(item.id)}
                  onPress={() => toggleCollaborator(item.id)}
                />
              ))}
          </View>
        </>
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}
      <View style={styles.submit}>
        <PrimaryButton
          title={parentTaskId ? "Создать подзадачу" : "Создать задачу"}
          icon="plus"
          onPress={() => void submit()}
          loading={saving}
          disabled={!projectId || !assigneeId || title.trim().length < 2}
        />
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  list: { gap: 8 },
  submit: { marginTop: spacing.md },
});
