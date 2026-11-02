import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, setUnauthorizedHandler } from "../api/client";
import { deviceTimeZone } from "../lib/dates";
import { deleteSecret, getSecret, setSecret } from "../lib/storage";
import type { Me, MeUpdate, TokenResponse } from "../types";

const TOKEN_KEY = "elite-task-token";

interface AuthState {
  token: string | null;
  user: Me | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (payload: MeUpdate) => Promise<Me>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logoutEverywhere: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Me | null>(null);
  const [initializing, setInitializing] = useState(true);

  const clearSession = useCallback(async () => {
    await deleteSecret(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  /** Часовой пояс берём с устройства: если пользователь переехал, сервер узнает об этом при входе. */
  const syncTimezone = useCallback(async (sessionToken: string, current: Me): Promise<Me> => {
    const zone = deviceTimeZone();
    if (current.timezone === zone) return current;
    try {
      return await api.updateMe(sessionToken, { timezone: zone });
    } catch {
      return current;
    }
  }, []);

  const applySession = useCallback(async (response: TokenResponse) => {
    await setSecret(TOKEN_KEY, response.access_token);
    setToken(response.access_token);
    setUser(response.user);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    void (async () => {
      const savedToken = await getSecret(TOKEN_KEY);
      if (!savedToken) {
        setInitializing(false);
        return;
      }
      try {
        const currentUser = await api.me(savedToken);
        setToken(savedToken);
        setUser(await syncTimezone(savedToken, currentUser));
      } catch {
        await deleteSecret(TOKEN_KEY);
      } finally {
        setInitializing(false);
      }
    })();
  }, [syncTimezone]);

  const login = useCallback(
    async (email: string, password: string) => {
      await applySession(await api.login(email, password, deviceTimeZone()));
    },
    [applySession],
  );

  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      await applySession(await api.register({ full_name: fullName, email, password, timezone: deviceTimeZone() }));
    },
    [applySession],
  );

  const updateProfile = useCallback(
    async (payload: MeUpdate) => {
      if (!token) throw new Error("Нет активной сессии");
      const updated = await api.updateMe(token, payload);
      setUser(updated);
      return updated;
    },
    [token],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!token) throw new Error("Нет активной сессии");
      // Сервер отзывает все старые токены и выдаёт новый — сохраняем его.
      await applySession(await api.changePassword(token, currentPassword, newPassword));
    },
    [applySession, token],
  );

  const logoutEverywhere = useCallback(async () => {
    if (token) await api.logoutAll(token).catch(() => undefined);
    await clearSession();
  }, [clearSession, token]);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      initializing,
      login,
      register,
      logout: clearSession,
      updateProfile,
      changePassword,
      logoutEverywhere,
    }),
    [token, user, initializing, login, register, clearSession, updateProfile, changePassword, logoutEverywhere],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
