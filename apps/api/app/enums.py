from enum import StrEnum


class UserRole(StrEnum):
    LEADER = "leader"
    ADMIN = "admin"
    MANAGER = "manager"


class TaskStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    WAITING = "waiting"
    REVIEW = "review"
    DONE = "done"
    CANCELLED = "cancelled"


class TaskPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class NotificationKind(StrEnum):
    ASSIGNED = "assigned"
    COMMENT = "comment"
    DEADLINE = "deadline"
    STATUS = "status"
    MENTION = "mention"

