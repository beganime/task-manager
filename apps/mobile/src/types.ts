export type UserRole = "leader" | "admin" | "manager";
export type TaskStatus =
  | "new"
  | "in_progress"
  | "waiting"
  | "review"
  | "done"
  | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface UserBrief {
  id: number;
  full_name: string;
  role: UserRole;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  owner_id: number;
  is_archived: boolean;
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
  checklist: ChecklistItem[];
  notes: AuthorEntry[];
  comments: AuthorEntry[];
  activities: Activity[];
  attachments: Attachment[];
  created_at: string;
  updated_at: string;
}

export interface Dashboard {
  today: number;
  overdue: number;
  waiting: number;
  done_this_week: number;
  priorities: TaskListItem[];
}

export interface TeamSummary {
  user: UserBrief;
  total: number;
  in_progress: number;
  overdue: number;
  waiting: number;
}

export interface NotificationItem {
  id: number;
  task_id: number | null;
  kind: "assigned" | "comment" | "deadline" | "status" | "mention";
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

