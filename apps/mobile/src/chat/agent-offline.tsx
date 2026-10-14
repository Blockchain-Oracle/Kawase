// The agent offline (D10): the api checks the chat model at start and every 10 minutes; while it fails, /agent/chat
// answers a typed "agent_offline" at once and /agent/health says so before the person types. This is a designed state,
// not an error: what still works (their money, every screen), and one action (check again). It clears itself when the
// next check passes. A failed fetch of the health itself says nothing (the regular "answer failed" covers a dead network).
import { CloudOff, RotateCcw } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import type { AgentHealth } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { API_URL } from "@/session/api";
import { sessionStorage } from "@/session/storage";
import { useThemeColors } from "@/theme/use-theme-colors";

const HEALTH_PATH = "/agent/health";
/** While offline, look again this often (the api re-checks a failed model every minute). */
const OFFLINE_POLL_MS = 60_000;
const OFFLINE_PROBLEM = "problems/agent_offline";

/** Whether a chat error is the api's typed "agent offline" answer (the transport hands the body over as the message). */
export const isAgentOffline = (error: Error | undefined) => Boolean(error?.message.includes(OFFLINE_PROBLEM));

async function readHealth(): Promise<AgentHealth | null> {
  const token = await sessionStorage.getToken();
  if (!token) return null;
  const response = await fetch(`${API_URL}${HEALTH_PATH}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!response.ok) return null;
  return ((await response.json()) as { health: AgentHealth }).health;
}

/** The api's view of the model: offline only when the api says so; unknown or unreachable counts as online. */
export function useAgentHealth(chatError: Error | undefined) {
  const [offline, setOffline] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const check = React.useCallback(async () => {
    setChecking(true);
    try {
      const health = await readHealth();
      setOffline(health?.status === "offline");
      return health?.status !== "offline";
    } catch {
      return true;
    } finally {
      setChecking(false);
    }
  }, []);
  React.useEffect(() => {
    void check();
  }, [check]);
  // A chat answer that says offline counts at once, before the next look.
  React.useEffect(() => {
    if (isAgentOffline(chatError)) setOffline(true);
  }, [chatError]);
  React.useEffect(() => {
    if (!offline) return undefined;
    const timer = setInterval(() => void check(), OFFLINE_POLL_MS);
    return () => clearInterval(timer);
  }, [offline, check]);
  return { offline, checking, check };
}

/** Above the composer while the agent is offline: what still works, and one action. */
export function AgentOffline({ checking, onCheck }: { checking: boolean; onCheck: () => void }) {
  const { t } = useT();
  const colors = useThemeColors();
  const reduced = useReducedMotionLive();
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(MOTION.sheetMs)}
      exiting={reduced ? undefined : FadeOut.duration(MOTION.pressMs)}
      accessibilityRole="alert"
      className="bg-card border-border mb-2 flex-row items-center gap-3 rounded-2xl border px-4 py-3"
    >
      <View className="bg-secondary size-9 items-center justify-center rounded-full">
        <Icon as={CloudOff} className="text-muted-foreground size-4" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t("feed.offlineTitle")}</Text>
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("feed.offlineBody")}</Text>
      </View>
      <Button size="sm" variant="secondary" disabled={checking} accessibilityLabel={checking ? t("feed.offlineChecking") : t("feed.offlineCheck")} onPress={onCheck}>
        {checking ? <ActivityIndicator color={colors["muted-foreground"]} /> : <Icon as={RotateCcw} className="size-4" />}
        <Text>{t("feed.offlineCheck")}</Text>
      </Button>
    </Animated.View>
  );
}
