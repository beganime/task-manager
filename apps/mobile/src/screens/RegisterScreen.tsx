import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useAuth } from "../auth/AuthContext";
import { AuthLayout } from "../components/AuthLayout";
import { ErrorText, Field, PrimaryButton } from "../components/ui";
import { deviceTimeZone } from "../lib/dates";
import { fonts, spacing, useStyles, type Palette } from "../theme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterScreen({ onLogin }: { onLogin: () => void }) {
  const { register } = useAuth();
  const styles = useStyles(makeStyles);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Клиентская проверка только помогает заполнить форму; окончательные правила — на сервере.
  const validationError =
    fullName.trim().length > 0 && fullName.trim().length < 2
      ? "Имя слишком короткое"
      : email && !EMAIL_RE.test(email.trim())
        ? "Проверьте адрес почты"
        : password && password.length < 8
          ? "Пароль — минимум 8 символов"
          : repeat && repeat !== password
            ? "Пароли не совпадают"
            : "";
  const canSubmit =
    fullName.trim().length >= 2 && EMAIL_RE.test(email.trim()) && password.length >= 8 && repeat === password;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      await register(fullName.trim(), email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать аккаунт");
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Личный аккаунт" subtitle={`Ритуал, задачи и календарь · пояс ${deviceTimeZone()}`}>
      <Field label="Как вас зовут" value={fullName} onChangeText={setFullName} placeholder="Мира Соколова" autoComplete="name" />
      <Field
        label="Почта"
        value={email}
        onChangeText={setEmail}
        placeholder="name@example.ru"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Field label="Пароль" value={password} onChangeText={setPassword} placeholder="Не менее 8 символов" secureTextEntry autoComplete="new-password" />
      <Field
        label="Повторите пароль"
        value={repeat}
        onChangeText={setRepeat}
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={() => void submit()}
      />
      {validationError || error ? <ErrorText>{error || validationError}</ErrorText> : null}
      <PrimaryButton title="Создать аккаунт" icon="user-plus" onPress={() => void submit()} loading={loading} disabled={!canSubmit} />
      <Text style={styles.note}>
        Мы создадим для вас личный проект и стартовый утренний ритуал. Пригласить друзей в свои проекты можно по почте.
      </Text>
      <Pressable onPress={onLogin} style={styles.switch} hitSlop={8}>
        <Text style={styles.switchText}>
          Уже есть аккаунт? <Text style={styles.switchLink}>Войти</Text>
        </Text>
      </Pressable>
    </AuthLayout>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    note: { color: colors.textMuted, fontSize: 12, lineHeight: 18, fontFamily: fonts.medium, textAlign: "center" },
    switch: { alignItems: "center", paddingVertical: spacing.sm },
    switchText: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.medium },
    switchLink: { color: colors.primaryText, fontFamily: fonts.bold },
  });
