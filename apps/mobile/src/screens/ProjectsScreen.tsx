import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TaskFormModal } from "../components/TaskFormModal";
import { TaskCard } from "../components/TaskCard";
import { EmptyState, ErrorState, LoadingState, PageHeader, PrimaryButton, Screen, SecondaryButton } from "../components/ui";
import { colors, radius, spacing } from "../theme";
import type { Project, TaskListItem, User } from "../types";

export function ProjectsScreen({ openTask }: { openTask: (taskId: number) => void }) {
  const { token, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [projectTasks, setProjectTasks] = useState<TaskListItem[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  const loadProjects = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      setProjects(await api.projects(token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const openProject = async (project: Project) => {
    if (!token) return;
    setSelected(project);
    setLoading(true);
    try {
      const [tasks, projectMembers, users] = await Promise.all([
        api.projectTasks(token, project.id),
        api.projectMembers(token, project.id),
        api.users(token),
      ]);
      setProjectTasks(tasks);
      setMembers(projectMembers);
      setAllUsers(users);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки задач");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  if (selected) {
    const canManage = user?.role !== "manager";
    const availableUsers = allUsers.filter((item) => !members.some((member) => member.id === item.id));
    const addMember = async (memberId: number) => {
      if (!token) return;
      await api.addProjectMember(token, selected.id, memberId);
      setMembers(await api.projectMembers(token, selected.id));
    };
    const removeMember = async (memberId: number) => {
      if (!token) return;
      await api.removeProjectMember(token, selected.id, memberId);
      setMembers((current) => current.filter((item) => item.id !== memberId));
    };
    const archiveProject = () => {
      Alert.alert("Архивировать проект?", "Он исчезнет из активного списка, но данные сохранятся.", [
        { text: "Отмена", style: "cancel" },
        {
          text: "Архивировать",
          style: "destructive",
          onPress: () => void (async () => {
            if (!token) return;
            await api.updateProject(token, selected.id, { is_archived: true });
            setSelected(null);
            await loadProjects();
          })(),
        },
      ]);
    };
    return (
      <Screen>
        <PageHeader
          eyebrow="Проект"
          title={selected.name}
        />
        <Text style={styles.description}>{selected.description || "Описание пока не добавлено"}</Text>
        <View style={styles.headerActions}><SecondaryButton title="Назад к проектам" onPress={() => { setSelected(null); setError(""); }} /><PrimaryButton compact title="+ Задача" onPress={() => setCreatingTask(true)} /></View>
        {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void openProject(selected)} /> : <ScrollView contentContainerStyle={styles.projectDetail}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Участники</Text><Text style={styles.sectionCount}>{members.length}</Text></View>
          <View style={styles.memberList}>
            {members.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{member.full_name.slice(0, 1)}</Text></View>
                <View style={styles.memberMain}><Text style={styles.memberName}>{member.full_name}</Text><Text style={styles.memberRole}>{member.role === "leader" ? "Руководитель" : member.role === "admin" ? "Администратор" : "Менеджер"}</Text></View>
                {canManage && member.id !== selected.owner_id ? <Pressable onPress={() => void removeMember(member.id)} style={styles.iconButton}><Feather name="x" size={17} color={colors.danger} /></Pressable> : null}
              </View>
            ))}
          </View>
          {canManage && availableUsers.length ? <View style={styles.addMembers}><Text style={styles.addMembersTitle}>Добавить в проект</Text>{availableUsers.map((member) => <Pressable key={member.id} onPress={() => void addMember(member.id)} style={styles.addMemberChip}><Feather name="plus" size={14} color={colors.accent} /><Text style={styles.addMemberText}>{member.full_name}</Text></Pressable>)}</View> : null}
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Задачи</Text><Text style={styles.sectionCount}>{projectTasks.length}</Text></View>
          {projectTasks.length ? projectTasks.map((item) => <TaskCard key={item.id} task={item} onPress={() => openTask(item.id)} />) : <EmptyState title="Проект пуст" text="Создайте первую задачу — проект и личный список синхронизируются автоматически." />}
          {canManage ? <Pressable onPress={archiveProject} style={styles.archiveButton}><Feather name="archive" size={17} color={colors.danger} /><Text style={styles.archiveText}>Архивировать проект</Text></Pressable> : null}
        </ScrollView>}
        <TaskFormModal visible={creatingTask} initialProjectId={selected.id} onClose={() => setCreatingTask(false)} onCreated={(taskId) => { setCreatingTask(false); openTask(taskId); }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Рабочие пространства"
        title="Проекты"
        action={user?.role !== "manager" ? <PrimaryButton compact title="+ Проект" onPress={() => setCreating(true)} /> : undefined}
      />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={() => void loadProjects()} /> : (
        <FlatList
          data={projects}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadProjects(); }} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => void openProject(item)} style={({ pressed }) => [styles.project, pressed && styles.pressed]}>
              <View style={styles.projectIcon}><Text style={styles.projectIconText}>{item.name.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.projectContent}>
                <Text style={styles.projectName}>{item.name}</Text>
                <Text style={styles.projectDescription} numberOfLines={2}>{item.description || "Без описания"}</Text>
                <Text style={styles.members}>{item.member_ids.length} участников</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          contentContainerStyle={projects.length ? styles.list : styles.emptyList}
          ListEmptyComponent={<EmptyState title="Проектов нет" text="Руководитель может создать первое рабочее пространство." />}
        />
      )}
      <CreateProjectModal visible={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void loadProjects(); }} />
    </Screen>
  );
}

function CreateProjectModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!token || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.createProject(token, { name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать проект");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen>
        <PageHeader title="Новый проект" action={<SecondaryButton title="Закрыть" onPress={onClose} />} />
        <ScrollView contentContainerStyle={styles.form}>
          <Text style={styles.label}>Название</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Например, Поступление 2028" placeholderTextColor={colors.textMuted} />
          <Text style={styles.label}>Описание</Text>
          <TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.multiline]} multiline placeholder="Цель и границы проекта" placeholderTextColor={colors.textMuted} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton title="Создать проект" onPress={() => void submit()} loading={saving} disabled={!name.trim()} />
        </ScrollView>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.lg },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 20, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  headerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  projectDetail: { paddingBottom: spacing.xl },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  sectionCount: { marginLeft: 7, minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surfaceMuted, color: colors.textMuted, fontSize: 11, fontWeight: "800", textAlign: "center" },
  memberList: { marginHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
  memberRow: { minHeight: 58, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  memberAvatar: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  memberAvatarText: { color: colors.primary, fontSize: 14, fontWeight: "900" },
  memberMain: { flex: 1, marginLeft: 10 },
  memberName: { color: colors.text, fontSize: 13, fontWeight: "700" },
  memberRole: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  iconButton: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerSoft },
  addMembers: { marginHorizontal: spacing.md, marginTop: spacing.sm, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 },
  addMembersTitle: { width: "100%", color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  addMemberChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  addMemberText: { color: colors.accent, fontSize: 11, fontWeight: "700" },
  archiveButton: { margin: spacing.md, marginTop: spacing.lg, minHeight: 48, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.dangerSoft },
  archiveText: { color: colors.danger, fontSize: 13, fontWeight: "800" },
  project: { marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center" },
  pressed: { opacity: 0.7 },
  projectIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  projectIconText: { color: colors.primary, fontSize: 20, fontWeight: "900" },
  projectContent: { flex: 1, marginLeft: spacing.md },
  projectName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  projectDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  members: { color: colors.primary, fontSize: 11, fontWeight: "700", marginTop: spacing.sm },
  chevron: { color: colors.textMuted, fontSize: 28, marginLeft: spacing.sm },
  form: { padding: spacing.md, gap: spacing.sm },
  label: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: spacing.sm },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.text, fontSize: 15 },
  multiline: { minHeight: 120, paddingTop: 14, textAlignVertical: "top" },
  error: { color: colors.danger, fontSize: 13, marginVertical: spacing.sm },
});

