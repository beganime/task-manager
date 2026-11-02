import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Секреты (JWT) на устройстве храним в Keychain/Keystore через expo-secure-store.
 * В браузере SecureStore недоступен — используем localStorage: это стандарт для SPA,
 * а защиту от XSS обеспечивают CSP и отсутствие dangerouslySetInnerHTML.
 */
const isWeb = Platform.OS === "web";

function webStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function getSecret(key: string): Promise<string | null> {
  if (isWeb) return webStorage()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/** Несекретные настройки интерфейса (тема и т. п.). */
export async function getPreference(key: string): Promise<string | null> {
  if (isWeb) return webStorage()?.getItem(key) ?? null;
  return AsyncStorage.getItem(key);
}

export async function setPreference(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}
