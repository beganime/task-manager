import type {
  Attachment,
  AuthorEntry,
  CalendarEvent,
  CalendarRange,
  ChecklistItem,
  Dashboard,
  DateCalcMode,
  DateCalcResult,
  EventInput,
  Me,
  MeUpdate,
  NotificationItem,
  Project,
  Ritual,
  Routine,
  RoutineInput,
  SearchResponse,
  TaskDetail,
  TaskListItem,
  TaskPriority,
  TaskStatus,
  TeamSummary,
  TokenResponse,
  User,
  WsTicket,
} from "../types";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Глобальный обработчик 401: протухший или отозванный токен (смена пароля,
 * «выйти со всех устройств») сразу разлогинивает пользователя, а не оставляет
 * его на экране с бесконечными ошибками.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function errorMessage(status: number, body: unknown): string {
  if (status === 429) return "Слишком много попыток. Подождите немного и попробуйте снова";
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => (item && typeof item === "object" && "msg" in item ? String((item as { msg: unknown }).msg) : ""))
        .filter(Boolean)
        .join("; ");
    }
  }
  return `Ошибка сервера ${status}`;
}

async function request<T>(path: string, token?: string | null, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("Нет связи с сервером. Проверьте подключение", 0);
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response.status === 401 && token) unauthorizedHandler?.();
    throw new ApiError(errorMessage(response.status, body), response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (method: string, payload?: unknown): RequestInit => ({
  method,
  ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
});

export interface TaskCreateInput {
  project_id: number;
  title: string;
  description: string;
  primary_assignee_id: number;
  collaborator_ids?: number[];
  parent_task_id?: number | null;
  due_at?: string | null;
  priority?: TaskPriority;
  estimate_minutes?: number | null;
}

export type TaskUpdateInput = Partial<{
  title: string;
  description: string;
  primary_assignee_id: number;
  collaborator_ids: number[];
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  waiting_reason: string | null;
  is_favorite: boolean;
  estimate_minutes: number;
}>;

export const api = {
  // --- авторизация и профиль ---
  login: (email: string, password: string, timezone: string) =>
    request<TokenResponse>("/auth/login", null, json("POST", { email, password, timezone })),
  register: (payload: { email: string; password: string; full_name: string; timezone: string }) =>
    request<TokenResponse>("/auth/register", null, json("POST", payload)),
  me: (token: string) => request<Me>("/auth/me", token),
  updateMe: (token: string, payload: MeUpdate) => request<Me>("/auth/me", token, json("PATCH", payload)),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<TokenResponse>(
      "/auth/change-password",
      token,
      json("POST", { current_password: currentPassword, new_password: newPassword }),
    ),
  logoutAll: (token: string) => request<void>("/auth/logout-all", token, json("POST")),
  wsTicket: (token: string) => request<WsTicket>("/auth/ws-ticket", token, json("POST")),

  // --- люди и проекты ---
  users: (token: string) => request<User[]>("/users", token),
  dashboard: (token: string) => request<Dashboard>("/dashboard/my-day", token),
  projects: (token: string, includeArchived = false) =>
    request<Project[]>(`/projects${includeArchived ? "?include_archived=true" : ""}`, token),
  project: (token: string, projectId: number) => request<Project>(`/projects/${projectId}`, token),
  projectTasks: (token: string, projectId: number) => request<TaskListItem[]>(`/projects/${projectId}/tasks`, token),
  projectMembers: (token: string, projectId: number) => request<User[]>(`/projects/${projectId}/members`, token),
  createProject: (
    token: string,
    payload: { name: string; description: string; is_personal?: boolean; color?: string },
  ) => request<Project>("/projects", token, json("POST", payload)),
  updateProject: (
    token: string,
    projectId: number,
    payload: Partial<{ name: string; description: string; is_archived: boolean; color: string }>,
  ) => request<Project>(`/projects/${projectId}`, token, json("PATCH", payload)),
  addProjectMember: (token: string, projectId: number, member: { user_id: number } | { email: string }) =>
    request<Project>(`/projects/${projectId}/members`, token, json("POST", member)),
  removeProjectMember: (token: string, projectId: number, userId: number) =>
    request<void>(`/projects/${projectId}/members/${userId}`, token, json("DELETE")),

  // --- задачи ---
  tasks: (token: string, view: string) => request<TaskListItem[]>(`/tasks?view=${encodeURIComponent(view)}`, token),
  task: (token: string, taskId: number) => request<TaskDetail>(`/tasks/${taskId}`, token),
  createTask: (token: string, payload: TaskCreateInput) => request<TaskDetail>("/tasks", token, json("POST", payload)),
  updateTask: (token: string, taskId: number, payload: TaskUpdateInput) =>
    request<TaskDetail>(`/tasks/${taskId}`, token, json("PATCH", payload)),
  updateChecklist: (token: string, taskId: number, itemId: number, isDone: boolean) =>
    request<ChecklistItem>(`/tasks/${taskId}/checklist/${itemId}`, token, json("PATCH", { is_done: isDone })),
  addChecklist: (token: string, taskId: number, title: string, position: number) =>
    request<ChecklistItem>(`/tasks/${taskId}/checklist`, token, json("POST", { title, position })),
  deleteChecklist: (token: string, taskId: number, itemId: number) =>
    request<void>(`/tasks/${taskId}/checklist/${itemId}`, token, json("DELETE")),
  subtasks: (token: string, taskId: number) => request<TaskListItem[]>(`/tasks/${taskId}/subtasks`, token),
  addNote: (token: string, taskId: number, body: string) =>
    request<AuthorEntry>(`/tasks/${taskId}/not