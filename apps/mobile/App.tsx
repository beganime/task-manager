import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { api } from "./src/api/client";
import { useRealtime, type RealtimeMessage } from "./src/api/realtime";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { BottomBar, SideNav, type TabKey } from "./src/components/BottomBar";
import { Backdrop } from "./src/components/ui";
import { useLayout } from "./src/lib/layout";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { InboxScreen } from "./src/screens/InboxScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { TaskDetailScreen } from "./src/screens/TaskDetailScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { fonts, radius, spacing, ThemeProvider, useStyles, useTheme, type Palette } from "./src/theme";
import { roleLabels } from "./src/types";

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Общая оболочка: фон, статус-бар и выбор между входом и приложением. */
function Shell() {
  const { colors } = useTheme();
  const { token, initializing } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  // Если шрифт не загрузился (нет сети на вебе), продолжаем с системным — приложение важнее типографики.
  const ready = (fontsLoaded || fontError !== null) && !initializing;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.statusBar} />
      <Backdrop />
      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : token ? (
        <AuthenticatedApp />
      ) : (
        <AuthScreens />
      )}
    </View>
  );
}

function AuthScreens() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return mode === "login" ? (
    <LoginScreen onRegister={() => setMode("register")} />
  ) : (
    <RegisterScreen onLogin={() => setMode("login")} />
  );
}

function AuthenticatedApp() {
  const { token, user } = useAuth();
  const { isWide } = useLayout();
  const appStyles = useStyles(makeStyles);
  const [tab, setTab] = useState<TabKey>("home");
  const [taskStack, setTaskStack] = useState<number[]>([]);
  const [liveMessage, setLiveMessage] = useState("");
  const [unread, setUnread] = useState(0);
  // Счётчик обновлений: экраны перезагружают данные, когда приходит событие по WebSocket.
  const [liveVersion, setLiveVersion] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!token) return;
    try {
      const items = await api.notifications(token);
      setUnread(items.filter((item) => !item.is_read).length);
    } catch {
      // Счётчик не критичен: ошибку покажет сам экран входящих.
    }
  }, [token]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread]);

  const onLive = useCallback(
    (message: RealtimeMessage) => {
      setLiveMessage(message.data?.title ?? "Новое уведомление");
      setLiveVersion((value) => value + 1);
      void refreshUnread();
    },
    [refreshUnread],
  );
  useRealtime(token, onLive);

  useEffect(() => {
    if (!liveMessage) return;
    const timeout = setTimeout(() => setLiveMessage(""), 4000);
    return () => clearTimeout(timeout);
  }, [liveMessage]);

  const openTask = useCallback((taskId: number) => {
    setTaskStack((current) => (current[current.length - 1] === taskId ? current : [...current, taskId]));
  }, []);

  const changeTab = useCallback((next: TabKey) => {
    setTaskStack([]);
    setTab(next);
  }, []);

  const selectedTaskId = taskStack[taskStack.length - 1];

  const content = selectedTaskId ? (
    <TaskDetailScreen
      key={selectedTaskId}
      taskId={selectedTaskId}
      onBack={() => setTaskStack((current) => current.slice(0, -1))}
      openTask={openTask}
    />
  ) : (
    <>
      {tab === "home" ? <HomeScreen openTask={openTask} onNavigate={changeTab} liveVersion={liveVersion} /> : null}
      {tab === "tasks" ? <TasksScreen openTask={openTask} onNavigate={changeTab} liveVersion={liveVersion} /> : null}
      {tab === "calendar" ? <CalendarScreen openTask={openTask} liveVersion={liveVersion} /> : null}
      {tab === "projects" ? <ProjectsScreen openTask={openTask} /> : null}
      {tab === "search" ? <SearchScreen openTask={openTask} /> : null}
      {tab === "inbox" ? (
        <InboxScreen openTask={openTask} onNavigate={changeTab} onUnreadChange={setUnread} liveVersion={liveVersion} />
      ) : null}
      {tab === "settings" ? <SettingsScreen onNavigate={changeTab} /> : null}
    </>
  );

  return (
    <View style={[styles.flex, isWide && styles.row]}>
      {isWide ? (
        <SideNav
          active={tab}
          onChange={changeTab}
          unread={unread}
          userName={user?.full_name ?? ""}
          roleLabel={user ? roleLabels[user.role] : ""}
        />
      ) : null}
      <View style={styles.flex}>{content}</View>
      {!isWide ? <BottomBar active={tab} onChange={changeTab} unread={unread} /> : null}
      {liveMessage ? (
        <Pressable onPress={() => setLiveMessage("")} style={[appStyles.banner, isWide && appStyles.bannerWide]}>
          <Feather name="bell" size={16} color={appStyles.bannerText.color} />
          <Text style={appStyles.bannerText} numberOfLines={2}>
            {liveMessage}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    banner: {
      position: "absolute",
      zIndex: 20,
      top: 52,
      left: spacing.md,
      right: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      borderRadius: radius.md,
      backgroundColor: colors.strong,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    bannerWide: { left: undefined, right: spacing.lg, top: spacing.lg, width: 360 },
    bannerText: { flex: 1, color: colors.onStrong, fontSize: 13, fontFamily: fonts.bold },
  });
