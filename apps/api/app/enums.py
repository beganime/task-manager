from enum import StrEnum


class UserRole(StrEnum):
    LEADER = "leader"
    ADMIN = "admin"
    MANAGER = "manager"
    # Личный аккаунт: человек вне компании, работает только со своими
    # личными проектами и проектами, куда его пригласили.
    PERSONAL = "personal"


CORPORATE_ROLES = (UserRole.LEADER, UserRole.ADMIN, UserRole.MANAGER)
COMPANY_MANAGERS = (UserRole.LEADER, UserRole.ADMIN)


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
    EVENT = "event"


class DateCalcMode(StrEnum):
    CALENDAR = "calendar"
    BUSINESS = "business"
