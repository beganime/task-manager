import type {
  AuthorEntry,
  ChecklistItem,
  Dashboard,
  NotificationItem,
  Project,
  SearchResponse,
  TaskDetail,
  TaskListItem,
  TaskPriority,
  TaskStatus,
  TeamSummary,
  TokenResponse,
  User,
} from "../types";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = "Не удалось выполнить запрос";
    try {
      const body = (await response.json()) as { detail?: string | Array<{ msg: string }> };
      if (typeof body.detail === "string") message = body.detail;
      if (Array.isArray(body.detail)) message = body.detail.map((item) => item.msg).join("; ");
    } catch {
      message = `Ошибка сервера ${response.status}`;
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: (token: string) => request<User>("/auth/me", token),
  users: (token: string) => request<User[]>("/users", token),
  dashboard: (token: string) => request<Dashboard>("/dashboard/my-day", token),
  projects: (token: string) => request<Project[]>("/projects", token),
  projectTasks: (token: string, projectId: number) =>
    request<TaskListItem[]>(`/projects/${projectId}/tasks`, token),
  projectMembers: (token: string, projectId: number) =>
    request<User[]>(`/projects/${projectId}/members`, token),
  createProject: (token: string, payload: { name: string; description: string }) =>
    request<Project>("/projects", token, { method: "POST", body: JSON.stringify(payload) }),
  updateProject: (
    token: string,
    projectId: number,
    payload: Partial<{ name: string; description: string; is_archived: boolean }>,
  ) => request<Project>(`/projects/${projectId}`, token, { method: "PATCH", body: JSON.stringify(payload) }),
  addProjectMember: (token: string, projectId: number, userId: number) =>
    request<Project>(`/projects/${projectId}/members`, token, { method: "POST", body: JSON.stringify({ user_id: userId }) }),
  removeProjectMember: (token: string, projectId: number, userId: number) =>
    request<void>(`/projects/${projectId}/members/${userId}`, token, { method: "DELETE" }),
  tasks: (token: string, view: string) =>
    request<TaskListItem[]>(`/tasks?view=${encodeURIComponent(view)}`, token),
  task: (token: string, taskId: number) => request<TaskDetail>(`/tasks/${taskId}`, token),
  createTask: (
    token: string,
    payload: {
      project_id: number;
      title: string;
      description: string;
      primary_assignee_id: number;
      collaborator_ids?: number[];
      parent_task_id?: number | null;
      due_at?: string | null;
      priority?: TaskPriority;
    },
  ) => request<TaskDetail>("/tasks", token, { method: "POST", body: JSON.stringify(payload) }),
  updateTask: (
    token: string,
    taskId: number,
    payload: Partial<{
      title: string;
      description: string;
      primary_assignee_id: number;
      collaborator_ids: number[];
      due_at: string | null;
      priority: TaskPriority;
      status: TaskStatus;
      waiting_reason: string | null;
      is_favorite: boolean;
    }>,
  ) =>
    request<TaskDetail>(`/tasks/${taskId}`, token, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateChecklist: (
    token: string,
    taskId: number,
    itemId: number,
    isDone: boolean,
  ) =>
    request<ChecklistItem>(`/tasks/${taskId}/checklist/${itemId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ is_done: isDone }),
    }),
  addChecklist: (token: string, taskId: number, title: string, position: number) =>
    request<ChecklistItem>(`/tasks/${taskId}/checklist`, token, {
      method: "POST",
      body: JSON.stringify({ title, position }),
    }),
  subtasks: (token: string, taskId: number) =>
    request<TaskListItem[]>(`/tasks/${taskId}/subtasks`, token),
  addNote: (token: string, taskId: number, body: string) =>
    request<AuthorEntry>(`/tasks/${taskId}/notes`, token, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  addComment: (token: string, taskId: number, body: string) =>
    request<AuthorEntry>(`/tasks/${taskId}/comments`, token, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  team: (token: string) => request<TeamSummary[]>("/team/summary", token),
  teamTasks: (token: string, userId: number) => request<TaskListItem[]>(`/team/${userId}/tasks`, token),
  notifications: (token: string) => request<NotificationItem[]>("/notifications", token),
  markNotificationRead: (token: string, notificationId: number) =>
    request<NotificationItem>(`/notifications/${notificationId}/read`, token, { method: "POST" }),
  search: (token: string, query: string) =>
    request<SearchResponse>(`/search?query=${encodeURIComponent(query)}`, token),
  uploadAttachment: (
    token: string,
    taskId: number,
    file: { uri: string; name: string; mimeType: string },
  ) => {
    const formData = new FormData();
    formData.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);
    return request<{ id: number; original_name: string; content_type: string; size: number; created_at: string }>(
      `/tasks/${taskId}/attachments`,
      token,
      { method: "POST", body: formData },
    );
  },
};

export function websocketUrl(token: string): string {
  const base = API_URL.replace(/^http/, "ws");
  return `${base}/notifications/ws?token=${encodeURIComponent(token)}`;
}

