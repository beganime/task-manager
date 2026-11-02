export type UserRole = "leader" | "admin" | "manager" | "personal";
export type TaskStatus =
  | "new"
  | "in_progress"
  | "waiting"
  | "review"
  | "done"
  | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface UserBrief {
  id: number;
  full_name: string;
  role: UserRole;
}

export interface User extends UserBrief {
  /** Email виден только leader/admin и самому пользователю. */
  email: string | null;
  is_active: boolean;
}

export interface Me extends User {
  email: string;
  timezone: string;
  reminder_time: string | null;
  reminder_enabled: boolean;
  workday_minutes: number;
}

export interface MeUpdate {
  full_name?: string;
  timezone?: string;
  reminder_time?: string | null;
  reminder_enabled?: boolean;
  workday_minutes?: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: Me;
}

export interface WsTicket {
  ticket: string;
  expires_in: number;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  owner_id: number;
  is_archived: boolean;
  is_personal: boolean;
  color: string;
  member_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface TaskListItem {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  primary_assignee: UserBrief;
  is_favorite: boolean;
  estimate_minutes: number | null;
  completed_at: string | null;
  updated_at: string;
}

export interface ChecklistItem {
  id: number;
  title: string;
  is_done: boolean;
  position: number;
}

export interface AuthorEntry {
  id: number;
  body: string;
  author: UserBrief;
  created_at: string;
}

export interface Activity {
  id: number;
  action: string;
  details: Record<string, unknown>;
  actor: UserBrief;
  created_at: string;
}

export interface Attachment {
  id: number;
  original_name: string;
  content_type: string;
  size: number;
  created_at: string;
}

export interface TaskDetail {
  id: number;
  project_id: number;
  project_name: string;
  parent_task_id: number | null;
  creator: UserBrief;
  primary_assignee: UserBrief;
  collaborators: UserBrief[];
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  waiting_reason: string | null;
  is_favorite: boolean;
  estimate_minutes: number | null;
  completed_at: string | null;
  checklist: ChecklistItem[];
  notes: AuthorEntry[];
  comments: AuthorEntry[];
  activities: Activity[];
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface Workload {
  workday_minutes: number;
  ritual_minutes: number;
  free_minutes: number;
  planned_minutes: number;
  deadlines_today: number;
  overloaded: boolean;
  message: string | null;
}

export interface Dashboard {
  today: number;
  overdue: number;
  waiting: number;
  done_this_week: number;
  priorities: TaskListItem[];
  local_date: string | null;
  timezone: string | null;
  workload: Workload | null;
}

export interface TeamSummary {
  user: UserBrief;
  total: number;
  in_progress: number;
  overdue: number;
  waiting: number;
}

export type NotificationKind = "assigned" | "comment" | "deadline" | "status" | "mention" | "event";

export interface NotificationItem {
  id: number;
  task_id: number | null;
  kind: NotificationKind;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface SearchResponse {
  tasks: TaskListItem[];
  projects: Project[];
  users: User[];
}

export interface Routine {
  id: number;
  title: string;
  icon: string;
  color: string;
  duration_minutes: number;
  position: number;
  done: boolean;
  streak: number;
}

export interface RoutineDay {
  day: string;
  done: number;
  total: number;
}

export interface Ritual {
  day: string;
  timezone: string;
  routines: Routine[];
  total_minutes: number;
  done_minutes: number;
  streak: number;
  best_streak: number;
  week: RoutineDay[];
  reminder_time: string | null;
  reminder_enabled: boolean;
}

export interface RoutineInput {
  title: string;
  icon: string;
  color: string;
  duration_minutes: number;
}

export type DateCalcMode = "calendar" | "business";

export interface DateCalcResult {
  start_date: string;
  result_date: string;
  days: number;
  mode: DateCalcMode;
  weekday: number;
  calendar_days: number;
  business_days: number;
  timezone: string;
}

export interface CalendarItem {
  kind: "event" | "task";
  id: number;
  title: string;
  day: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  color: string;
  project_id: number | null;
  project_name: string | null;
  task_id: number | null;
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
}

export interface CalendarRange {
  from_date: string;
  to_date: string;
  timezone: string;
  items: CalendarItem[];
}

export interface CalendarEvent {
  id: number;
  owner_id: number;
  project_id: number | null;
  project_name: string | null;
  task_id: number | null;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  color: string;
  can_edit: boolean;
  created_at: string;
}

export interface EventInput {
  title: string;
  description?: string;
  starts_at: string;
  ends_at?: string | null;
  all_day: boolean;
  project_id?: number | null;
  color?: string | null;
}

export const statusLabels: Record<TaskStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  waiting: "Ожидание",
  review: "На проверке",
  done: "Выполнена",
  cancelled: "Отменена",
};

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  critical: "Критический",
};

export const roleLabels: Record<UserRole, string> = {
  leader: "Руководитель",
  admin: "Администратор",
  manager: "Менеджер",
  personal: "Личный аккаунт",
};

export function isCompanyManager(role: UserRole | undefined): boolean {
  return role === "leader" || role === "admin";
}
