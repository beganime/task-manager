import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PrimaryButton, Screen } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { colors, radius, spacing } from "../theme";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("olesya@elite-task.ru");
  const [password, setPassword] = useState("demo12345");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      await login(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>E</Text>
          </View>
          <Text style={styles.title}>Elite Task</Text>
          <Text style={styles.subtitle}>Проекты и задачи команды в одном месте</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>Вход в рабочее пространство</Text>
          <Text style={styles.label}>Рабочая почта</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="name@company.ru"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={email}
          />
          <Text style={styles.label}>Пароль</Text>
          <TextInput
            autoComplete="password"
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            placeholder="Минимум 8 символов"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton title="Войти" onPress={() => void submit()} loading={loading} />
          <Text style={styles.demo}>Для демо поля уже заполнены аккаунтом менеджера.</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: spacing.lg },
  brand: { alignItems: "center", marginBottom: spacing.xl },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    marginBottom: spacing.md,
  },
  logoText: { color: "#FFFFFF", fontSize: 32, fontWeight: "900" },
  title: { color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  subtitle: { color: colors.textMuted, fontSize: 15, marginTop: spacing.sm, textAlign: "center" },
  form: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  formTitle: { color: colors.text, fontSize: 19, fontWeight: "800", marginBottom: spacing.lg },
  label: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  input: {
    height: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, marginBottom: spacing.md },
  demo: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: spacing.md },
});

