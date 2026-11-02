import { Feather } from "@expo/vector-icons";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "../auth/AuthContext";
import type { TabKey } from "../components/BottomBar";
import { ReminderModal } from "../components/RoutineForms";
import {
  Avatar,
  Chip,
  ErrorText,
  Field,
  GlassCard,
  IconButton,
  PageHeader,
  PrimaryButton,
  Screen,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Segmented,
  type IconName,
} from "../components/ui";
import { deviceTimeZone, minutesLabel } from "../lib/dates";
import { confirmAction, useLayout } from "../lib/layout";
import { fonts, spacing, useStyles, useTheme, type Palette, type ThemeMode } from "../theme";
import { roleLabels } from "../types";

const workdayOptions = [240, 360, 480, 540, 600] as const;

export function SettingsScreen({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  const { user, updateProfile, changePassword, logout, logoutEverywhere } = useAuth();
  const { mode, setMode, colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { isWide, gutter } = useLayout();
  const [reminderOpen, setReminderOpen] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    setFullName(user?.full_name ?? "");
  }, [user?.full_name]);

  if (!user) return null;
  const zone = deviceTimeZone();
  const zoneDiffers = zone !== user.timezone;

  const saveProfile = async (payload: Parameters<typeof updateProfile>[0], message: string) => {
    setProfileSaving(true);
    setProfileError("");
    setProfileMessage("");
    try {
      await updateProfile(payload);
      setProfileMessage(message);
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : "Не удалось сохранить");
    } finally {
      setProfileSaving(false);
    }
  };

  const submitPassword = async () => {
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordMessage("");
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Пароль изменён. Остальные устройства вышли из аккаунта.");
    } catch (caught) {
      setPasswordError(caught instanceof Error ? caught.message : "Не удалось сменить пароль");
    } finally {
      setPasswordSaving(false);
    }
  };

  const appearance = (
    <>
      <SectionHeader title="Оформление" />
      <GlassCard style={{ marginHorizontal: gutter }}>
        <View style={styles.cardBody}>
          <Text style={styles.label}>Тема</Text>
          <Segmented<ThemeMode>
            options={[
              { value: "light", label: "Светлая", icon: "sun" },
              { value: "dark", label: "Тёмная", icon: "moon" },
              { value: "system", label: "Системная", icon: "smartphone" },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Text style={styles.hint}>
            {mode === "system" ? "Повторяет настройку устройства." : "Выбор сохраняется на этом устройстве."}
          </Text>
        </View>
      </GlassCard>

      <SectionHeader title="Ритм дня" />
      <GlassCard style={{ marginHorizontal: gutter }}>
        <View style={styles.cardBody}>
          <Row
            icon="bell"
            title="Утреннее напоминание"
            value={user.reminder_enabled && user.reminder_time ? `Каждый день в ${user.reminder_time}` : "Выключено"}
            action={<SecondaryButton title="Настроить" onPress={() => setReminderOpen(true)} />}
          />
          <View style={styles.separator} />
          <Text style={styles.label}>Рабочий день</Text>
          <View style={styles.chips}>
            {workdayOptions.map((minutes) => (
              <Chip
                key={minutes}
                label={minutesLabel(minutes)}
                active={user.workday_minutes === minutes}
                onPress={() => void saveProfile({ workday_minutes: minutes }, "Рабочий день обновлён")}
              />
            ))}
          </View>
          <Text style={styles.hint}>Используется для расчёта нагрузки в «Моём дне» вместе с ритуалом и оценками задач.</Text>
          <View style={styles.separator} />
          <Row
            icon="globe"
            title="Часовой пояс"
            value={zoneDiffers ? `${user.timezone} · на устройстве ${zone}` : user.timezone}
            action={
              zoneDiffers ? (
                <SecondaryButton title="Взять с устройства" onPress={() => void saveProfile({ timezone: zone }, "Часовой пояс обновлён")} />
              ) : (
                <Feather name="check-circle" size={18} color={colors.success} />
              )
            }
          />
        </View>
      </GlassCard>
    </>
  );

  const account = (
    <>
      <SectionHeader title="Профиль" />
      <GlassCard style={{ marginHorizontal: gutter }}>
        <View style={styles.cardBody}>
          <View style={styles.profile}>
            <Avatar name={user.full_name} size={56} />
            <View style={styles.flex}>
              <Text style={styles.profileName}>{user.full_name}</Text>
              <Text style={styles.hint}>
                {user.email} · {roleLabels[user.role]}
              </Text>
            </View>
          </View>
          <Field label="Имя" value={fullName} onChangeText={setFullName} maxLength={160} />
          <PrimaryButton
            title="Сохранить имя"
            compact
            onPress={() => void saveProfile({ full_name: fullName.trim() }, "Имя сохранено")}
            loading={profileSaving}
            disabled={fullName.trim().length < 2 || fullName.trim() === user.full_name}
          />
          {profileError ? <ErrorText>{profileError}</ErrorText> : null}
          {profileMessage ? <Text style={styles.success}>{profileMessage}</Text> : null}
        </View>
      </GlassCard>

      <SectionHeader title="Безопасность" />
      <GlassCard style={{ marginHorizontal: gutter }}>
        <View style={styles.cardBody}>
          <Field label="Текущий пароль" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="password" />
          <Field
            label="Новый пароль"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoComplete="new-password"
            hint="Минимум 8 символов"
          />
          <PrimaryButton
            title="Сменить пароль"
            compact
            icon="lock"
            onPress={() => void submitPassword()}
            loading={passwordSaving}
            disabled={currentPassword.length < 8 || newPassword.length < 8}
          />
          {passwordError ? <ErrorText>{passwordError}</ErrorText> : null}
          {passwordMessage ? <Text style={styles.success}>{passwordMessage}</Text> : null}
          <View style={styles.separator} />
          <SecondaryButton
            title="Выйти со всех устройств"
            icon="shield-off"
            danger
            onPress={() =>
              confirmAction("Выйти со всех устройств?", "Все активные сессии, включая эту, будут завершены.", "Выйти", () => void logoutEverywhere())
            }
          />
          <SecondaryButton title="Выйти из аккаунта" icon="log-out" onPress={() => void logout()} />
        </View>
      </GlassCard>
    </>
  );

  return (
    <Screen>
      <ScreenScroll>
        <PageHeader
          eyebrow="Профиль и приложение"
          title="Настройки"
          action={!isWide ? <IconButton icon="arrow-left" label="Назад" onPress={() => onNavigate("inbox")} /> : undefined}
        />
        {isWide ? (
          <View style={styles.columns}>
            <View style={styles.flex}>{appearance}</View>
            <View style={styles.flex}>{account}</View>
          </View>
        ) : (
          <>
            {appearance}
            {account}
          </>
        )}
        <Text style={styles.footer}>Elite Task · веб и мобильная версия</Text>
      </ScreenScroll>
      <ReminderModal visible={reminderOpen} onClose={() => setReminderOpen(false)} />
    </Screen>
  );
}

function Row({ icon, title, value, action }: { icon: IconName; title: string; value: string; action: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={17} color={colors.primaryText} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.hint}>{value}</Text>
      </View>
      {action}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    columns: { flexDirection: "row", alignItems: "flex-start" },
    cardBody: { gap: spacing.sm + 4 },
    label: { color: colors.text, fontSize: 13, fontFamily: fonts.bold },
    hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontFamily: fonts.medium },
    success: { color: colors.success, fontSize: 13, fontFamily: fonts.semibold },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primarySoft,
    },
    rowTitle: { color: colors.text, fontSize: 14, fontFamily: fonts.bold },
    profile: { flexDirection: "row", alignItems: "center", gap: 14 },
    profileName: { color: colors.text, fontSize: 18, fontFamily: fonts.extrabold },
    footer: { color: colors.textSubtle, fontSize: 11, fontFamily: fonts.medium, textAlign: "center", marginTop: spacing.xl },
  });
