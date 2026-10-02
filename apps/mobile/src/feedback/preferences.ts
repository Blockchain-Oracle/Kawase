import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { orderedWrite } from "@/session/write-queue";

type Preferences = { sounds: boolean; haptics: boolean; narration: boolean };
const STORAGE_KEY = "kawase.feedback.v1";
let preferences: Preferences = { sounds: false, haptics: true, narration: false };
const changed = new Set<keyof Preferences>();
const listeners = new Set<() => void>();
let loading: Promise<void> | undefined;
const notify = () => {
  for (const listener of listeners) listener();
};

export function loadFeedbackPreferences(): Promise<void> {
  loading ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      let stored: Partial<Preferences>;
      try {
        stored = JSON.parse(raw) as Partial<Preferences>;
      } catch {
        return;
      }
      if (!stored || typeof stored !== "object") return;
      const next = { ...preferences };
      for (const key of ["sounds", "haptics", "narration"] as const)
        if (!changed.has(key) && typeof stored[key] === "boolean") next[key] = stored[key];
      preferences = next;
      notify();
    })
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

export const feedbackPreferences = () => preferences;

export function setFeedbackPreference(key: keyof Preferences, enabled: boolean): Promise<void> {
  changed.add(key);
  preferences = { ...preferences, [key]: enabled };
  notify();
  return orderedWrite(STORAGE_KEY, async () => {
    await loadFeedbackPreferences();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  });
}

export function useFeedbackPreferences() {
  useEffect(() => {
    void loadFeedbackPreferences().catch(() => undefined);
  }, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    feedbackPreferences,
    feedbackPreferences,
  );
}
