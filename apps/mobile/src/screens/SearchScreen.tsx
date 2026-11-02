import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TaskCard } from "../components/TaskCard";
import { EmptyState, LoadingState, PageHeader, Screen, SectionTitle } from "../components/ui";
import { colors, radius, spacing } from "../theme";
import type { SearchResponse } from "../types";

export function SearchScreen({ openTask }: { openTask: (taskId: number) => void }) {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      void api.search(token, query.trim())
        .then(setResults)
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Ошибка поиска"))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, token]);

  const total = results ? results.tasks.length + results.projects.length + results.users.length : 0;
  return (
    <Screen>
      <PageHeader eyebrow="По всем доступным данным" title="Поиск" />
      <View style={styles.searchBox}>
        <Feather name="search" size={20} color={colors.textMuted} />
        <TextInput
          autoFocus
          value={query}
          onChangeText={(value) => { setQuery(value); setError(""); }}
          placeholder="Задача, проект или сотрудник"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
        />
        {query ? <Feather name="x" size={19} color={colors.textMuted} onPress={() => setQuery("")} /> : null}
      </View>
      {loading ? <LoadingState label="Ищем…" /> : null}
      {!loading && query.trim().length < 2 ? <EmptyState title="Найдите что угодно" text="Введите минимум два символа. Поиск учитывает ваши права доступа." /> : null}
      {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
      {!loading && results && total === 0 ? <EmptyState title="Ничего не найдено" text="Попробуйте изменить запрос или проверить написание." /> : null}
      {!loading && results && total > 0 ? (
        <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
          {results.tasks.length ? <SectionTitle>Задачи</SectionTitle> : null}
          {results.tasks.map((task) => <TaskCard key={task.id} task={task} onPress={() => openTask(task.id)} />)}
          {results.projects.length ? <SectionTitle>Проекты</SectionTitle> : null}
          {results.projects.map((project) => (
            <View key={project.id} style={styles.resultCard}>
              <View style={[styles.icon, styles.projectIcon]}><Feather name="grid" size={17} color={colors.accent} /></View>
              <View style={styles.resultMain}><Text style={styles.resultTitle}>{project.name}</Text><Text style={styles.resultSubtitle} numberOfLines={2}>{project.description || `${project.member_ids.length} участников`}</Text></View>
            </View>
          ))}
          {results.users.length ? <SectionTitle>Сотрудники</SectionTitle> : null}
          {results.users.map((item) => (
            <View key={item.id} style={styles.resultCard}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.full_name.slice(0, 1)}</Text></View>
              <View style={styles.resultMain}><Text style={styles.resultTitle}>{item.full_name}</Text><Text style={styles.resultSubtitle}>{item.role === "leader" ? "Руководитель" : item.role === "admin" ? "Администратор" : "Менеджер"}</Text></View>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: { marginHorizontal: spacing.md, marginBottom: spacing.md, minHeight: 52, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, color: colors.text, fontSize: 15 },
  results: { paddingBottom: spacing.xl },
  error: { color: colors.danger, fontSize: 13, margin: spacing.md, textAlign: "center" },
  resultCard: { marginHorizontal: spacing.md, marginBottom: spacing.sm, minHeight: 64, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center" },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  projectIcon: { backgroundColor: colors.accentSoft },
  avatar: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
  avatarText: { color: colors.primary, fontSize: 16, fontWeight: "900" },
  resultMain: { flex: 1, marginLeft: 11 },
  resultTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  resultSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
