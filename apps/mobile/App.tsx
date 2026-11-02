import { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from "react-native";

import { websocketUrl } from "./src/api/client";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { BottomBar, type TabKey } from "./src/components/BottomBar";
import { LoginScreen } from "./src/screens/LoginScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { TaskDetailScreen } from "./src/screens/TaskDetailScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { colors, radius, spacing } from "./src/theme";

export default function App() {
  return (
    <AuthProvider>
      <StatusBar barStyle="dark-content" />
      <Root />
    </AuthProvider>
  );
}

function Root() {
  const { token, initializing } = useAuth();
  if (initializing) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (!token) return <LoginScreen />;
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { token } = useAuth();
  const [tab, setTab] = useState<TabKey>("home");
  const [taskStack, setTaskStack] = useState<number[]>([]);
  const [liveMessage, setLiveMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    const socket = new WebSocket(websocketUrl(token));
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { data?: { title?: string } };
        setLiveMessage(payload.data?.title ?? "Получено новое уведомление");
      } catch {
        setLiveMessage("Получено новое уведомление");
      }
    };
    return () => socket.close();
  }, [token]);

  useEffect(() => {
    if (!liveMessage) return;
    const timeout = setTimeout(() => setLiveMessage(""), 3500);
    return () => clearTimeout(timeout);
  }, [liveMessage]);

  const selectedTaskId = taskStack[taskStack.length - 1];
  const openTask = (taskId: number) => setTaskStack((current) => current[current.length - 1] === taskId ? current : [...current, taskId]);
  if (selectedTaskId) {
    return <TaskDetailScreen taskId={selectedTaskId} onBack={() => setTaskStack((current) => current.slice(0, -1))} openTask={openTask} />;
  }

  return (
    <View style={styles.app}>
      {liveMessage ? <View style={styles.banner}><Text style={styles.bannerText}>{liveMessage}</Text></View> : null}
      <View style={styles.content}>
        {tab === "home" ? <HomeScreen openTask={openTask} /> : null}
        {tab === "projects" ? <ProjectsScreen openTask={openTask} /> : null}
        {tab === "tasks" ? <TasksScreen openTask={openTask} /> : null}
        {tab === "search" ? <SearchScreen openTask={openTask} /> : null}
        {tab === "more" ? <MoreScreen openTask={openTask} /> : null}
      </View>
      <BottomBar active={tab} onChange={setTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  banner: { position: "absolute", zIndex: 20, top: 48, left: spacing.md, right: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary },
  bannerText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", textAlign: "center" },
});

