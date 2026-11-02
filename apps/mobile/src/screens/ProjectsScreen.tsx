import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TaskCard } from "../components/TaskCard";
import { TaskFormModal } from "../components/TaskFormModal";
import {
  Avatar,
  Chip,
  EmptyState,
  ErrorState,
  ErrorText,
  Field,
  GlassCard,
  IconButton,
  LoadingState,
  ModalScreen,
  PageHeader,
  PrimaryButton,
  Screen,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Segmented,
} from "../components/ui";
import { plural } from "../lib/dates";
import { confirmAction, useLayout } from "../lib/layout";
import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import { isCompanyManager, roleLabels, type Me, type Project, type TaskListItem, type User } from "../types";

const projectColors = ["#F07A2B", "#2F7D5B", "#4570B8", "#8A5CC7", "#D4554F", "#B97A12"] as const;

/**
 * Право управлять проектом (участники, архив) окончательно проверяет сервер;
 * здесь только прячем кнопки, которые всё равно вернули бы 403.
 */
function canManageProject(project: Project, user: Me | null): boolean {
  if (!user) return false;
  if (project.is_personal) return project.owner_id === user.id;
  return isCompanyManager(user.role);
}

function membersLabel(count: number): string {
  return `${count} ${plural(count, ["участник", "участника", "участников"])}`;
}

export function ProjectsScreen({ openTask }: { openTask: (taskId: number) => void }) {
  const { token, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;
  if (selected) {
    return (
      <ProjectDetail
        project={selected}
        openTask={openTask}
        onBack={() => setSelectedId(null)}
        onChanged={(updated) => setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)))}
        onArchived={() => {
          setSelectedId(null);
          void loadProjects();
        }}
      />
    );
  }

  const personal = projects.filter((project) => project.is_personal);
  const corporate = projects.filter((project) => !project.is_personal);

  return (
    <Screen>
      <PageHeader
        eyebrow="Рабочие пространства"
        title="Проекты"
        action={<PrimaryButton compact icon="plus" title="Проект" onPress={() => setCreating(true)} />}
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retry={() => void loadProjects()} />
      ) : (
        <ScreenScroll
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadProjects();
              }}
            />
          }
        >
          {!projects.length ? (
            <EmptyState icon="grid" title="Проектов нет" text="Создайте личный проект — например, «Дом» или «Учёба»." />
          ) : null}
          {personal.length ? <ProjectGroup title="Личные" projects={personal} onOpen={setSelectedId} /> : null}
          {corporate.length ? <ProjectGroup title="Компания" projects={corporate} onOpen={setSelectedId} /> : null}
        </ScreenScroll>
      )}
      <CreateProjectModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(project) => {
          setCreating(false);
          setProjects((current) => [...current, project]);
          setSelectedId(project.id);
        }}
      />
    </Screen>
  );
}

function ProjectGroup({ title, projects, onOpen }: { title: string; projects: Project[]; onOpen: (id: number) => void }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { gutter, isTablet } = useLayout();
  return (
    <View>
      <SectionHeader title={title} count={projects.length} />
      <View style={[styles.grid, { paddingHorizontal: gutter }]}>
        {projects.map((project) => (
          <Pressable
            key={project.id}
            onPress={() => onOpen(project.id)}
            style={({ pressed }) => [styles.gridItem, isTablet && styles.gridItemHalf, pressed && styles.pressed]}
          >
            <GlassCard>
              <View style={styles.projectRow}>
                <View style={[styles.projectIcon, { backgroundColor: project.color || colors.primary }]}>
                  <Text style={styles.projectIconText}>{project.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.projectContent}>
                  <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                  <Text style={styles.projectDescription} numberOfLines={2}>{project.description || "Без описания"}</Text>
                  <Text style={styles.members}>{membersLabel(project.member_ids.length)}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textSubtle} />
              </View>
            </GlassCard>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ProjectDetail({
  project,
  openTask,
  onBack,
  onChanged,
  onArchived,
}: {
  project: Project;
  openTask: (taskId: number) => void;
  onBack: () => void;
  onChanged: (project: Project) => void;
  onArchived: () => void;
}) {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { gutter, isWide } = useLayout();
  const canManage = canManageProject(project, user);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [directory, setDirectory] = useState<User[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [projectTasks, projectMembers, users] = await Promise.all([
        api.projectTasks(token, project.id),
        api.projectMembers(token, project.id),
        // Корпоративный справочник нужен только тому, кто может добавлять сотрудников.
        canManage && !project.is_personal ? api.users(token) : Promise.resolve<User[]>([]),
      ]);
      setTasks(projectTasks);
      setMembers(projectMembers);
      setDirectory(users);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки проекта");
    } finally {
      setLoading(false);
    }
  }, [canManage, project.id, project.is_personal, token]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const addMember = async (member: { user_id: number } | { email: string }) => {
    if (!token) return;
    setActionError("");
    setInviting(true);
    try {
      const updated = await api.addProjectMember(token, project.id, member);
      onChanged(updated);
      setMembers(await api.projectMembers(token, project.id));
      setInviteEmail("");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Не удалось добавить участника");
    } finally {
      setInviting(false);
    }
  };

  const removeMember = (member: User) => {
    confirmAction("Убрать участника?", `${member.full_name} потеряет доступ к задачам проекта.`, "Убрать", () => {
      void (async () => {
        if (!token) return;
        setActionError("");
        try {
          await api.removeProjectMember(token, project.id, member.id);
          setMembers((current) => current.filter((item) => item.id !== member.id));
          onChanged({ ...project, member_ids: project.member_ids.filter((id) => id !== member.id) });
        } catch (caught) {
          setActionError(caught instanceof Error ? caught.message : "Не удалось убрать участника");
        }
      })();
    });
  };

  const archive = () => {
    confirmAction("Архивировать проект?", "Он исчезнет из активного списка, но данные сохранятся.", "Архивировать", () => {
      void (async () => {
        if (!token) return;
        try {
          await api.updateProject(token, project.id, { is_archived: true });
          onArchived();
        } catch (caught) {
          setActionError(caught instanceof Error ? caught.message : "Не удалось архивировать проект");
        }
      })();
    });
  };

  const candidates = directory.filter((item) => !members.some((member) => member.id === item.id));
  const emailValid = /^\S+@\S+\.\S+$/.test(inviteEmail.trim());

  const membersBlock = (
    <View>
      <SectionHeader title="Участники" count={members.length} />
      <View style={{ paddingHorizontal: gutter }}>
        <GlassCard padded={false}>
          {members.map((member, index) => (
            <View key={member.id} style={[styles.memberRow, index > 0 && styles.memberDivider]}>
              <Avatar name={member.full_name} size={36} />
              <View style={styles.memberMain}>
                <Text style={styles.memberName}>{member.full_name}</Text>
                <Text style={styles.memberRole}>
                  {member.id === project.owner_id ? "Владелец" : roleLabels[member.role]}
                </Text>
              </View>
              {canManage && member.id !== project.owner_id ? (
                <IconButton icon="x" label={`Убрать ${member.full_name}`} size={34} color={colors.danger} onPress={() => removeMember(member)} />
              ) : null}
            </View>
          ))}
        </GlassCard>
        {canManage && project.is_personal ? (
          <View style={styles.invite}>
            <Field
              label="Пригласить по email"
              value={inviteEmail}
              onChangeText={(value) => {
                setInviteEmail(value);
                setActionError("");
              }}
              placeholder="friend@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              hint="Человек должен быть зарегистрирован в Elite Task."
            />
            <PrimaryButton
              compact
              icon="user-plus"
              title="Пригласить"
              loading={inviting}
              disabled={!emailValid}
              onPress={() => void addMember({ email: inviteEmail.trim().toLowerCase() })}
            />
          </View>
        ) : null}
        {canManage && !project.is_personal && candidates.length ? (
          <View style={styles.candidates}>
            <Text style={styles.candidatesTitle}>Добавить сотрудника</Text>
            <View style={styles.chips}>
              {candidates.map((candidate) => (
                <Chip key={candidate.id} icon="plus" label={candidate.full_name} onPress={() => void addMember({ user_id: candidate.id })} />
              ))}
            </View>
          </View>
        ) : null}
        {actionError ? <ErrorText>{actionError}</ErrorText> : null}
        {canManage ? (
          <View style={styles.archive}>
            <SecondaryButton danger icon="archive" title="Архивировать проект" onPress={archive} />
          </View>
        ) : null}
      </View>
    </View>
  );

  const tasksBlock = (
    <View style={styles.flex}>
      <SectionHeader title="Задачи" count={tasks.length} actionLabel="+ Задача" onAction={() => setCreatingTask(true)} />
      {tasks.length ? (
        tasks.map((item) => <TaskCard key={item.id} task={item} onPress={() => openTask(item.id)} />)
      ) : (
        <EmptyState title="Проект пуст" text="Создайте первую задачу — она сразу появится и в вашем списке." />
      )}
    </View>
  );

  return (
    <Screen>
      <PageHeader
        eyebrow={project.is_personal ? "Личный проект" : "Проект компании"}
        title={project.name}
        subtitle={project.description || undefined}
        action={<IconButton icon="arrow-left" label="Назад к проектам" onPress={onBack} />}
      />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : (
        <ScreenScroll>
          {isWide ? (
            <View style={styles.columns}>
              <View style={styles.mainColumn}>{tasksBlock}</View>
              <View style={styles.sideColumn}>{membersBlock}</View>
            </View>
          ) : (
            <>
              {tasksBlock}
              {membersBlock}
            </>
          )}
        </ScreenScroll>
      )}
      <TaskFormModal
        visible={creatingTask}
        initialProjectId={project.id}
        onClose={() => setCreatingTask(false)}
        onCreated={(taskId) => {
          setCreatingTask(false);
          openTask(taskId);
        }}
      />
    </Screen>
  );
}

function CreateProjectModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const { token, user } = useAuth();
  const styles = useStyles(makeStyles);
  // Корпоративные проекты создают только leader/admin; остальным — сразу личный.
  const canCreateCorporate = isCompanyManager(user?.role);
  const [kind, setKind] = useState<"personal" | "company">(canCreateCorporate ? "company" : "personal");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(projectColors[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!token || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const project = await api.createProject(token, {
        name: name.trim(),
        description: description.trim(),
        is_personal: !canCreateCorporate || kind === "personal",
        color,
      });
      setName("");
      setDescription("");
      onCreated(project);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать проект");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalScreen visible={visible} onClose={onClose} title="Новый проект">
      {canCreateCorporate ? (
        <Segmented
          options={[
            { value: "company", label: "Компания", icon: "briefcase" },
            { value: "personal", label: "Личный", icon: "user" },
          ]}
          value={kind}
          onChange={setKind}
        />
      ) : null}
      <Field label="Название" value={name} onChangeText={setName} placeholder="Например, Дом или Поступление 2028" />
      <Field
        label="Описание"
        value={description}
        onChangeText={setDescription}
        placeholder="Цель и границы проекта"
        multiline
        style={styles.multiline}
      />
      <Text style={styles.colorLabel}>Цвет</Text>
      <View style={styles.colors}>
        {projectColors.map((item) => (
          <Pressable
            key={item}
            accessibilityLabel={`Цвет ${item}`}
            onPress={() => setColor(item)}
            style={[styles.swatch, { backgroundColor: item }, color === item && styles.swatchActive]}
          />
        ))}
      </View>
      <Text style={styles.hint}>
        {!canCreateCorporate || kind === "personal"
          ? "Личным проектом управляете только вы. Пригласить можно по email."
          : "Проект компании: участников добавляют руководитель и администратор."}
      </Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton title="Создать проект" onPress={() => void submit()} loading={saving} disabled={!name.trim()} />
    </ModalScreen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pressed: { opacity: 0.8 },
    grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 },
    gridItem: { width: "100%", paddingHorizontal: 6, marginBottom: spacing.sm + 4 },
    gridItemHalf: { width: "50%" },
    projectRow: { flexDirection: "row", alignItems: "center", gap: 14 },
    projectIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    projectIconText: { color: "#FFFFFF", fontSize: 19, fontFamily: fonts.extrabold },
    projectContent: { flex: 1 },
    projectName: { color: colors.text, fontSize: 16, fontFamily: fonts.bold },
    projectDescription: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: fonts.medium, marginTop: 3 },
    members: { color: colors.primaryText, fontSize: 12, fontFamily: fonts.bold, marginTop: 6 },
    columns: { flexDirection: "row", gap: spacing.md },
    mainColumn: { flex: 3 },
    sideColumn: { flex: 2 },
    memberRow: { minHeight: 60, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
    memberDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    memberMain: { flex: 1 },
    memberName: { color: colors.text, fontSize: 14, fontFamily: fonts.bold },
    memberRole: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium, marginTop: 2 },
    invite: { marginTop: spacing.md, gap: spacing.sm, alignItems: "flex-start" },
    candidates: { marginTop: spacing.md },
    candidatesTitle: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.bold, marginBottom: spacing.sm },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    archive: { marginTop: spacing.lg, alignItems: "flex-start" },
    multiline: { minHeight: 96, paddingTop: 14, textAlignVertical: "top" },
    colorLabel: { color: colors.text, fontSize: 13, fontFamily: fonts.bold },
    colors: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
    swatch: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 3, borderColor: "transparent" },
    swatchActive: { borderColor: colors.text },
    hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, fontFamily: fonts.medium },
  });
