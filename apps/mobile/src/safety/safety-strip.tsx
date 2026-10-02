// The app-wide chip for the two states that change what every screen means (cards/automate-safety.md): paused (Kawase
// and automations spend nothing without the person) and practice (nothing real moves). It sits above every screen in
// the signed-in area, in the status-bar band, and the screens below it lay out from its bottom edge: the top inset they
// read is replaced by zero while it shows, so nothing is drawn under it. A tap opens Wallet & limits, where both end.
import { useRouter } from "expo-router";
import { FlaskConical, PauseCircle } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

const STRIP_PADDING = 6;

export function SafetyStripFrame({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const paused = Boolean(user && !user.isGuest && user.pausedAllAt);
  const practice = Boolean(user && !user.isGuest && user.practiceMode);
  const below = React.useMemo(() => ({ ...insets, top: 0 }), [insets]);
  if (!paused && !practice) return <>{children}</>;
  const label = [paused ? t("safety.stripPaused") : null, practice ? t("safety.stripPractice") : null].filter(Boolean).join("  ·  ");
  return (
    <View className="bg-background flex-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t("safety.title")}
        onPress={() => router.push("/limits")}
        className={paused ? "bg-destructive" : "bg-network-surface"}
        style={{ paddingTop: insets.top + STRIP_PADDING, paddingBottom: STRIP_PADDING }}
      >
        <View className="flex-row items-center justify-center gap-1.5 px-4">
          <Icon as={paused ? PauseCircle : FlaskConical} className={paused ? "text-destructive-foreground size-3.5" : "text-network size-3.5"} />
          <Text numberOfLines={1} className={paused ? "text-destructive-foreground text-xs font-semibold" : "text-network text-xs font-semibold"}>
            {label}
          </Text>
        </View>
      </Pressable>
      <SafeAreaInsetsContext.Provider value={below}>{children}</SafeAreaInsetsContext.Provider>
    </View>
  );
}
