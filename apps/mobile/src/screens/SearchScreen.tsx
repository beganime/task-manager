import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TaskCard } from "../components/TaskCard";
import {
  Avatar,
  EmptyState,
  ErrorText,
  GlassCard,
  LoadingState,
  PageHeader,
  Screen,
  ScreenScroll,
  SectionHeader,
} from "../components/ui";
import { plural } from "../lib/dates";
import { useLayout } from "../lib/layout";
import { fonts, radius, spacing, useStyles, useTheme, type Palette } from "../theme";
import { roleLabels, type SearchResponse } from "../types";

export function SearchScreen({ openTask }: { openTask: (taskId: number) => void }) {
  const { token } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const { gutter } = useLayout();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    if (!token || trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Отбрасываем ответы на устаревшие запросы, чтобы не мигали старые результаты.
    let cancelled = false;
    const timeout = setTimeout(() => {
      api
        .search(token, trimmed)
        .then((value) => {
          if (!cancelled) setResults(value);
        })
        .catch((caught: unknown) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : "Ошибка поиска");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, token]);

  const total = results ? results.tasks.length + results.projects.length + results.users.length : 0;
  const ready = !loading && query.trim().length >= 2 && results !== null;

  return (
    <Screen>
      <PageHeader eyebrow="По всем доступным данным" title="Поиск" />
      <View style={{ paddingHorizontal: gutter }}>
        <GlassCard padded={false} style={styles.searchCard}>
          <View style={styles.searchBox}>
            <Feather name="search" size={20} color={colors.textMuted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setError("");
              }}
              placeholder="Задача, проект или человек"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              returnKeyType="search"
            />
            {query ? (
              <Pressable accessibilityLabel="Очистить" hitSlop={10} onPress={() => setQuery("")}>
                <Feather name="x" size={19} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </GlassCard>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>
      {loading ? <LoadingState label="Ищем…" /> : null}
      {!loading && query.trim().length < 2 ? (
        <EmptyState icon="search" title="Найдите что угодно" text="Введите минимум два символа. Поиск учитывает ваши права доступа." />
      ) : null}
      {ready && total === 0 ? (
        <EmptyState icon="inbox" title="Ничего не найдено" text="Попробуйте изменить запрос или проверить написание." />
      ) : null}
      {ready && results && total > 0 ? (
        <ScreenScroll>
          {results.tasks.length ? <SectionHeader title="Задачи" count={results.tasks.length} /> : null}
          {results.tasks.map((task) => (
            <TaskCard key={task.id} task={task} onPress={() => openTask(task.id)} />
          ))}
          {results.projects.length ? <SectionHeader title="Проекты" count={results.projects.length} /> : null}
          {results.projects.map((project) => (
            <View key={project.id} style={[styles.resultWrap, { paddingHorizontal: gutter }]}>
              <GlassCard>
                <View style={styles.resultRow}>
                  <View style={[styles.projectIcon, { backgroundColor: project.color || colors.primary }]}>
                    <Feather name={project.is_personal ? "user" : "briefcase"} size={17} color="#FFFFFF" />
                  </View>
                  <View style={styles.resultMain}>
                    <Text style={styles.resultTitle}>{project.name}</Text>
                    <Text style={styles.resultSubtitle} numberOfLines={2}>
                      {project.description ||
                        `${project.member_ids.length} ${plural(project.member_ids.length, ["участник", "участника", "участников"])}`}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </View>
          ))}
          {results.users.length ? <SectionHeader title="Люди" count={results.users.length} /> : null}
          {results.users.map((item) => (
            <View key={item.id} style={[styles.resultWrap, { paddingHorizontal: gutter }]}>
              <GlassCard>
                <View style={styles.resultRow}>
                  <Avatar name={item.full_name} size={38} />
                  <View style={styles.resultMain}>
                    <Text style={styles.resultTitle}>{item.full_name}</Text>
                    <Text style={styles.resultSubtitle}>
                      {roleLabels[item.role]}
                      {item.email ? ` · ${item.email}` : ""}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </View>
          ))}
        </ScreenScroll>
      ) : null}
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    searchCard: { marginBottom: spacing.md, borderRadius: radius.md },
    searchBox: { minHeight: 54, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: 10 },
    input: { flex: 1, color: colors.text, fontSize: 15, fontFamily: fonts.medium, paddingVertical: 12 },
    resultWrap: { marginBottom: spacing.sm },
    resultRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    projectIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    resultMain: { flex: 1 },
    resultTitle: { color: colors.text, fontSize: 14, fontFamily: fonts.bold },
    resultSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontFamily: fonts.medium, marginTop: 3 },
  });
