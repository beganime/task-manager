import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api, type TaskUpdateInput } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { dayToDueIso, isoToDayKey, isValidDayKey } from "../lib/dates";
import { spacing } from "../theme";
import { roleLabels, type TaskDetail, type TaskPriority, type User } from "../types";
import { Choice, DayPicker, EstimatePicker, FieldLabel, PriorityPicker } from "./formParts";
import { Chip, ErrorText, Field, ModalScreen, PrimaryButton } from "./ui";

export function TaskEditModal({
  task,
  visible,
  onClose,
  onSaved,
  canReassign,
}: {
  task: TaskDetail;
  visible: boolean;
  onClose: () => void;
  onSaved: (task: TaskDetail) => void;
  canReassign: boolean;
}) {
  const { token, user } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [dueDay, setDueDay] = useState(isoToDayKey(task.due_at));
  const [estimate, setEstimate] = useState<number | null>(task.estimate_minutes);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assigneeId, setAssigneeId] = useState(task.primary_assignee.id);
  const [collaboratorIds, setCollaboratorIds] = useState(task.collaborators.map((item) => item.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || !token) return;
    setTitle(task.title);
    setDescription(task.description);
    setDueDay(isoToDayKey(task.due_at));
    setEstimate(task.estimate_minutes);
    setPriority(task.priority);
    setAssigneeId(task.primary_assignee.id);
    setCollaboratorIds(task.collaborators.map((item) => item.id));
    setError("");
    if (canReassign) {
      void api.projectMembers(token, task.project_id).then(setMembers).catch(() => setMembers([]));
    }
  }, [canReassign, task, token, visible]);

  const toggleCollaborator = (id: number) =>
    setCollaboratorIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const save = async () => {
    if (!token || title.trim().length < 2) return;
    if (dueDay && !isValidDayKey(dueDay)) {
      setError("Срок должен быть в формате ГГГГ-ММ-ДД");
      return;
    }
    // Сохраняем исходное время суток, если день срока не менялся.
    const sameDay = dueDay === isoToDayKey(task.due_at);
    const payload: TaskUpdateInput = {
      title: title.trim(),
      description: description.trim(),
      due_at: dueDay ? (sameDay ? task.due_at : dayToDueIso(dueDay)) : null,
      priority,
    };
    // estimate_minutes нельзя сбросить в null (сервер вернёт 422) — отправляем только число.
    if (estimate !== null) payload.estimate_minutes = estimate;
    if (canReassign) {
      payload.primary_assignee_id = assigneeId;
      payload.collaborator_ids = collaboratorIds.filter((id) => id !== assigneeId);
    }
    setSaving(true);
    setError("");
    try {
      onSaved(await api.updateTask(token, task.id, payload));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить задачу");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalScreen visible={visible} onClose={onClose} eyebrow={task.project_name} title="Редактировать задачу">
      <Field label="Название" value={title} onChangeText={setTitle} />
      <Field label="Описание" value={description} onChangeText={setDescription} multiline placeholder="Контекст и ожидаемый результат" />
      <DayPicker value={dueDay} onChange={setDueDay} />
      <EstimatePicker value={estimate} onChange={setEstimate} />
      <PriorityPicker value={priority} onChange={setPriority} />
      {canReassign && members.length ? (
        <>
          <FieldLabel icon="user">Ответственный</FieldLabel>
          <View style={styles.list}>
            {members.map((member) => (
              <Choice
                key={member.id}
                label={member.id === user?.id ? `${member.full_name} (я)` : member.full_name}
                hint={roleLabels[member.role]}
                active={assigneeId === member.id}
                onPress={() => setAssigneeId(member.id)}
              />
            ))}
          </View>
          {members.length > 1 ? (
            <>
              <FieldLabel icon="users">Соисполнители</FieldLabel>
              <View style={styles.chips}>
                {members
                  .filter((member) => member.id !== assigneeId)
                  .map((member) => (
                    <Chip
                      key={member.id}
                      icon={collaboratorIds.includes(member.id) ? "check" : "plus"}
                      label={member.full_name}
                      active={collaboratorIds.includes(member.id)}
                      onPress={() => toggleCollaborator(member.id)}
                    />
                  ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <View style={styles.submit}>
        <PrimaryButton title="Сохранить изменения" icon="check" onPress={() => void save()} loading={saving} disabled={title.trim().length < 2} />
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  list: { gap: 8 },
  submit: { marginTop: spacing.md },
});
