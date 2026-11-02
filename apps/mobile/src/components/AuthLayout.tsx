import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { useLayout } from "../lib/layout";
import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import { GlassCard, Screen, type IconName } from "./ui";

const highlights: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "sunrise", title: "Утренний ритуал", text: "Привычки с таймером и сериями, которые считает сервер" },
  { icon: "calendar", title: "Календарь", text: "События, сроки задач и калькулятор рабочих дней" },
  { icon: "users", title: "Команда и личное", text: "Проекты компании и личные списки в одном месте" },
];

/** Каркас экранов входа/регистрации: на широком экране слева — презентация, справа — форма. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { isWide } = useLayout();

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.hero, isWide && styles.heroWide]}>
            <View style={styles.logo}>
              <Feather name="sunrise" size={26} color={colors.onStrong} />
            </View>
            <Text style={[styles.brand, isWide && styles.brandWide]}>Elite Task</Text>
            <Text style={styles.tagline}>Спокойное утро, ясный день и задачи команды без хаоса.</Text>
            {isWide ? (
              <View style={styles.highlights}>
                {highlights.map((item) => (
                  <View key={item.title} style={styles.highlight}>
                    <View style={styles.highlightIcon}>
                      <Feather name={item.icon} size={18} color={colors.primaryText} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.highlightTitle}>{item.title}</Text>
                      <Text style={styles.highlightText}>{item.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <GlassCard style={[styles.form, isWide && styles.formWide]} intensity={60}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            <View style={styles.fields}>{children}</View>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.md, paddingVertical: spacing.xl, gap: spacing.lg },
    scrollWide: { flexDirection: "row", alignItems: "center", gap: 64, paddingHorizontal: 48 },
    hero: { alignItems: "center", gap: spacing.sm },
    heroWide: { flex: 1, alignItems: "flex-start", maxWidth: 520 },
    logo: {
      width: 60,
      height: 60,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.strong,
      marginBottom: spacing.sm,
    },
    brand: { color: colors.text, fontSize: 34, fontFamily: fonts.extrabold, letterSpacing: -1 },
    brandWide: { fontSize: 52, letterSpacing: -1.8 },
    tagline: { color: colors.textMuted, fontSize: 15, lineHeight: 22, fontFamily: fonts.medium, textAlign: "center", maxWidth: 420 },
    highlights: { marginTop: spacing.lg, gap: spacing.md, alignSelf: "stretch" },
    highlight: { flexDirection: "row", alignItems: "center", gap: 14 },
    highlightIcon: {
      width: 44,
      height: 44,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primarySoft,
    },
    highlightTitle: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
    highlightText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.medium, marginTop: 2 },
    form: { width: "100%", maxWidth: 460, alignSelf: "center", borderRadius: radius.lg + 4 },
    formWide: { flex: 1 },
    title: { color: colors.text, fontSize: 24, fontFamily: fonts.extrabold, letterSpacing: -0.5 },
    subtitle: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.medium, marginTop: 4 },
    fields: { gap: spacing.sm + 4, marginTop: spacing.md },
  });
