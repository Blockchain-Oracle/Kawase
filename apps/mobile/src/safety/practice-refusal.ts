// Practice mode refused a real move (409 practice_mode: the api lets drafting through and stops anything that would
// sign or move money). Said plainly, with the way to turn practice off, instead of a generic failure.
import { router } from "expo-router";
import { toast } from "sonner-native";

import { ApiError } from "@kawase/api-client";

export const isPracticeRefusal = (error: unknown) => error instanceof ApiError && error.code === "practice_mode";

/** True when it was practice mode (and the person was told); the caller says its own failure otherwise. */
export function sayIfPractice(error: unknown, t: (key: string) => string): boolean {
  if (!isPracticeRefusal(error)) return false;
  toast(t("safety.practiceRefused"), { action: { label: t("safety.practiceOpen"), onClick: () => router.push("/limits") } });
  return true;
}
