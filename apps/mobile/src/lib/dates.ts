/**
 * Даты без часового пояса («день») передаются как строки YYYY-MM-DD и
 * разбираются в локальном времени устройства. Моменты времени (due_at, starts_at)
 * всегда уходят на сервер в UTC через toISOString() — никаких зашитых «+03:00».
 */

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const pad = (value: number) => String(value).padStart(2, "0");

export function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDayKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function isValidDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseDayKey(value);
  return toDayKey(parsed) === value;
}

export function todayKey(): string {
  return toDayKey(new Date());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date): Date {
  const weekday = (date.getDay() + 6) % 7; // понедельник = 0
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -weekday);
}

/** Сетка месяца: 6 недель по 7 дней, начиная с понедельника. */
export function monthGrid(year: number, month: number): Date[] {
  const first = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

/** Срок задачи «до конца дня» в локальном времени → ISO UTC. */
export function dayToDueIso(dayKey: string, hour = 18): string {
  const date = parseDayKey(dayKey);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function isoToDayKey(value: string | null): string {
  return value ? toDayKey(new Date(value)) : "";
}

export const weekdayShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function formatLongDate(date: Date): string {
  const text = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function monthTitle(year: number, month: number): string {
  const text = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  return text.charAt(0).toUpperCase() + text.slice(1).replace(" г.", "");
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 17) return "Добрый день";
  if (hour >= 17 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

/** «1 день», «3 дня», «5 дней». */
export function plural(value: number, forms: readonly [string, string, string]): string {
  const mod10 = Math.abs(value) % 10;
  const mod100 = Math.abs(value) % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function daysLabel(value: number): string {
  return `${value} ${plural(value, ["день", "дня", "дней"])}`;
}

export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}
