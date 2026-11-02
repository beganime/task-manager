import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type ReminderResult = "scheduled" | "denied" | "unsupported" | "cancelled";

export const remindersSupported = true;

const REMINDER_ID = "elite-task-morning-ritual";
const CHANNEL_ID = "morning-ritual";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Ежедневное локальное уведомление в HH:MM по времени устройства. Сервер для этого не нужен. */
export async function scheduleDailyReminder(time: string): Promise<ReminderResult> {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "unsupported";
  if (!(await ensurePermission())) return "denied";

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Утренний ритуал",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: "Время утреннего ритуала",
      body: "Пара минут для себя — и день пойдёт легче. Серия ждёт продолжения!",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
  });
  return "scheduled";
}

export async function cancelDailyReminder(): Promise<ReminderResult> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  return "cancelled";
}
