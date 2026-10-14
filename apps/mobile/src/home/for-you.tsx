// "For you" (surfaces.md Home §8; cards/agent-business.md, Proactive suggestions): the agent's proactive cards,
// computed by the api from the person's holdings, positions and events on the active network. Each card states one
// fact, says why it appears, and offers one action (open chat with the request already written, open the conversation or screen it is
// about, or share a link). The × hides it (for a week, or until its situation changes) or hides its whole kind.
// Builder A places `ForYouSection` on Home; the chat's get_for_you card reuses `ForYouCard`.
import { useFocusEffect, useRouter } from "expo-router";
import { Flame, HandCoins, HeartPulse, Route, ShoppingBag, Sprout, TrendingDown, TrendingUp, Waypoints, X, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable, Share, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { toast } from "sonner-native";

import type { Suggestion, SuggestionKind, SuggestionsView } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const ICONS: Record<SuggestionKind, LucideIcon> = {
  idle_cash: Sprout,
  expiring_request: HandCoins,
  stuck_bridge: Route,
  health_drop: HeartPulse,
  big_move: TrendingUp,
  better_route: Waypoints,
  trending_token: Flame,
  service_pick: ShoppingBag,
};

type Copy = { title: string; body: string; action: string; prompt?: string };

/** The kind's sentence keys in the `forYou` namespace. */
const COPY: Record<SuggestionKind, Copy> = {
  idle_cash: { title: "forYou.idleTitle", body: "forYou.idleBody", action: "forYou.idleAction", prompt: "forYou.idlePrompt" },
  expiring_request: { title: "forYou.requestTitle", body: "forYou.requestBody", action: "forYou.requestAction" },
  stuck_bridge: { title: "forYou.bridgeTitle", body: "forYou.bridgeBody", action: "forYou.bridgeAction" },
  health_drop: { title: "forYou.healthTitle", body: "forYou.healthBody", action: "forYou.healthAction", prompt: "forYou.healthPrompt" },
  big_move: { title: "forYou.moveTitle", body: "forYou.moveBody", action: "forYou.moveAction", prompt: "forYou.movePrompt" },
  better_route: { title: "forYou.routeTitleCheaper", body: "forYou.routeBodyCheaper", action: "forYou.routeAction", prompt: "forYou.routePrompt" },
  trending_token: { title: "forYou.trendingTitle", body: "forYou.trendingBodyListed", action: "forYou.trendingAction" },
  service_pick: { title: "forYou.serviceTitle", body: "forYou.serviceBody", action: "forYou.serviceAction" },
};

/**
 * The words for one card: its kind's, with the reason it appears where a kind has more than one (a faster route rather
 * than a cheaper one; a trending token that is not on a verified list).
 */
export function copyFor(suggestion: Suggestion): Copy {
  const copy = COPY[suggestion.kind];
  if (suggestion.kind === "better_route" && suggestion.facts.why === "faster") return { ...copy, title: "forYou.routeTitleFaster", body: "forYou.routeBodyFaster" };
  if (suggestion.kind === "trending_token" && suggestion.facts.status !== "canonical" && suggestion.facts.status !== "listed") return { ...copy, body: "forYou.trendingBodyUnverified" };
  return copy;
}

/** One proactive card. `onHidden` runs after it was dismissed or its kind muted. */
export function ForYouCard({ suggestion, onHidden }: { suggestion: Suggestion; onHidden?: (kindMuted: boolean) => void }) {
  const { t } = useT();
  const router = useRouter();
  const [choosing, setChoosing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const copy = copyFor(suggestion);
  const facts = suggestion.facts;
  const falling = suggestion.kind === "big_move" && facts.change?.startsWith("-");

  const act = async () => {
    const action = suggestion.action;
    if (action.type === "chat" && copy.prompt) router.navigate({ pathname: "/chat", params: { prompt: t(copy.prompt, facts) } });
    else if (action.type === "thread") router.navigate({ pathname: "/chat", params: { thread: action.threadId } });
    else if (action.type === "route") router.push(action.path as never);
    else if (action.type === "share") await Share.share({ message: action.url, url: action.url }).catch(() => undefined);
  };

  const hide = async (kind: boolean) => {
    setBusy(true);
    try {
      if (kind) await api.suggestions.mute(suggestion.kind, true);
      else await api.suggestions.dismiss(suggestion.id);
      onHidden?.(kind);
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="bg-card border-border gap-3 rounded-[26px] border p-4">
      <View className="flex-row items-start gap-3">
        <View className="bg-secondary size-10 items-center justify-center rounded-full">
          <Icon as={falling ? TrendingDown : ICONS[suggestion.kind]} className={cn("size-5", falling ? "text-destructive" : "text-ring")} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className={cn("text-foreground text-base font-semibold leading-6", TEXT_START)}>{t(copy.title, facts)}</Text>
          <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t(copy.body, facts)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("forYou.hide")}
          hitSlop={12}
          onPress={() => setChoosing((open) => !open)}
          className="active:opacity-60 -me-1 -mt-1 p-1"
        >
          <Icon as={X} className="text-muted-foreground size-4" />
        </Pressable>
      </View>
      {choosing ? (
        <Animated.View entering={FadeIn} className="flex-row gap-2">
          <Button className="flex-1" size="sm" variant="secondary" disabled={busy} onPress={() => void hide(false)}>
            <Text>{t("forYou.hideThis")}</Text>
          </Button>
          <Button className="flex-1" size="sm" variant="ghost" disabled={busy} onPress={() => void hide(true)}>
            <Text className="text-muted-foreground">{t("forYou.muteKind")}</Text>
          </Button>
        </Animated.View>
      ) : (
        <Button size="sm" className="self-start" onPress={() => void act()}>
          <Text>{t(copy.action, facts)}</Text>
        </Button>
      )}
    </View>
  );
}

/** The cards as a list (Home and chat): a hidden card leaves with a fade, the rest close the gap. */
export function ForYouList({ view, onChange }: { view: SuggestionsView; onChange?: () => void }) {
  const reduced = useReducedMotionLive();
  const [gone, setGone] = React.useState<Set<string>>(() => new Set());
  const shown = view.suggestions.filter((entry) => !gone.has(entry.id));
  return (
    <View className="gap-3">
      {shown.map((suggestion) => (
        <Animated.View
          key={suggestion.id}
          exiting={reduced ? undefined : FadeOut.duration(MOTION.sheetMs)}
          layout={reduced ? undefined : LinearTransition.duration(MOTION.sheetMs)}
        >
          <ForYouCard
            suggestion={suggestion}
            onHidden={(kindMuted) => {
              setGone((current) => {
                const next = new Set(current);
                for (const entry of view.suggestions) if (entry.id === suggestion.id || (kindMuted && entry.kind === suggestion.kind)) next.add(entry.id);
                return next;
              });
              onChange?.();
            }}
          />
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * Home's "For you" section: nothing for guests or when there is nothing to say (no empty box); refreshed whenever
 * Home comes into view and when the network changes. Kinds the person muted can be shown again from its footer.
 */
export function ForYouSection({ className }: { className?: string }) {
  const { t } = useT();
  const { status, user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const [view, setView] = React.useState<SuggestionsView>();

  const load = React.useCallback(async () => {
    try {
      const next = await api.suggestions.list();
      setView(next);
    } catch {
      // Suggestions are a bonus: a failed read leaves the last cards (or none), never an error on Home.
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (status === "account") void load();
    }, [load, status]),
  );
  React.useEffect(() => {
    if (status === "account") void load();
  }, [network, status, load]);

  if (status !== "account" || !view || view.network !== network) return null;
  if (view.suggestions.length === 0 && view.muted.length === 0) return null;
  return (
    <View className={cn("gap-3", className)}>
      <Eyebrow className="px-1">{t("forYou.title")}</Eyebrow>
      {view.suggestions.length > 0 ? <ForYouList key={view.suggestions.map((entry) => entry.id).join()} view={view} /> : null}
      {view.muted.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onPress={() =>
            void Promise.all(view.muted.map((kind) => api.suggestions.mute(kind, false)))
              .then(load)
              .catch(() => toast(t("common.error")))
          }
        >
          <Text className="text-muted-foreground">{t("forYou.showAgain", { count: view.muted.length })}</Text>
        </Button>
      ) : null}
    </View>
  );
}
