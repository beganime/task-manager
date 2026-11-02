/**
 * Веб-версия: локальные push в браузере без service worker ненадёжны,
 * поэтому на сайте время напоминания только сохраняется на сервере
 * и срабатывает на телефоне пользователя. Нативная реализация — reminder.native.ts.
 */
export type ReminderResult = "scheduled" | "denied" | "unsupported" | "cancelled";

export const remindersSupported = false;

export async function scheduleDailyReminder(_time: string): Promise<ReminderResult> {
  return "unsupported";
}

export async function cancelDailyReminder(): Promise<ReminderResult> {
  return "cancelled";
}
