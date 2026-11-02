import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../auth/AuthContext";
import { AuthLayout } from "../components/AuthLayout";
import { ErrorText, Field, PrimaryButton } from "../components/ui";
import { fonts, radius, spacing, useStyles, type Palette } from "../theme";

const demoAccounts = [
  { email: "mira@elite-task.ru", label: "Мира", hint: "личный аккаунт, утренний ритуал" },
  { email: "leader@elite-task.ru", label: "Алишер", hint: "руководитель компании" },
] as const;

export function LoginScreen({ onRegister }: { onRegister: () => void }) {
  const { login } = useAuth();
  const styles = useStyles(makeStyles);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      await login(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось войти");
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="С возвращением" subtitle="Войдите, чтобы продолжить свой день">
      <Field
        label="Почта"
        value={email}
        onChangeText={setEmail}
        placeholder="name@example.ru"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label="Пароль"
        value={password}
        onChangeText={setPassword}
        placeholder="Не менее 8 символов"
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        onSubmitEditing={() => void submit()}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton title="Войти" icon="log-in" onPress={() => void submit()} loading={loading} disabled={!email.trim() || !password} />

      <View style={styles.demo}>
        <Text style={styles.demoTitle}>Демо-доступ · пароль demo12345</Text>
        {demoAccounts.map((account) => (
          <Pressable
            key={account.email}
            onPress={() => {
              setEmail(account.email);
              setPassword("demo12345");
              setError("");
            }}
            style={({ pressed }) => [styles.demoRow, pressed && styles.pressed]}
          >
            <Text style={styles.demoName}>{account.label}</Text>
            <Text style={styles.demoHint} numberOfLines={1}>
              {account.hint}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={onRegister} style={styles.switch} hitSlop={8}>
        <Text style={styles.switchText}>
          Нет аккаунта? <Text style={styles.switchLink}>Зарегистрироваться</Text>
        </Text>
      </Pressable>
    </AuthLayout>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    demo: { marginTop: spacing.sm, padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, gap: 6 },
    demoTitle: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.bold },
    demoRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
    demoName: { color: colors.primaryText, fontSize: 14, fontFamily: fonts.extrabold },
    demoHint: { flex: 1, color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium },
    pressed: { opacity: 0.6 },
    switch: { alignItems: "center", paddingVertical: spacing.sm },
    switchText: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.medium },
    switchLink: { color: colors.primaryText, fontFamily: fonts.bold },
  });
