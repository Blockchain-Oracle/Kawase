// The Chat tab (journey 14, Stage 4): the agent, live. It opens on the most recent conversation (threads are kept
// on the api, so they follow the account across devices); the clock icon lists past threads (M1) and the pen
// starts a new one. A starter chip from home starts a new thread with its question already asked. The network
// strip and the agent both follow the session's network.
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { History, SquarePen } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { UIMessage } from "ai";

import type { ThreadSummary } from "@kawase/api-client";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { Conversation } from "@/chat/conversation";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const STRIP_INSET = 6;
const EDGE_INSET = 12;

type Open = { id: string; messages: UIMessage[]; prompt?: string | undefined };

export function ChatScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useSession();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const [open, setOpen] = React.useState<Open>();
  const [threads, setThreads] = React.useState<ThreadSummary[]>([]);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const fresh = React.useCallback((first?: string) => setOpen({ id: Crypto.randomUUID(), messages: [], prompt: first }), []);

  const openThread = React.useCallback(async (id: string) => {
    try {
      const { messages } = await api.agent.thread(id);
      setOpen({ id, messages: messages as UIMessage[] });
    } catch {
      setOpen({ id: Crypto.randomUUID(), messages: [] });
    }
  }, []);

  const loadThreads = React.useCallback(async () => {
    try {
      const result = await api.agent.threads();
      setThreads(result.threads);
      return result.threads;
    } catch {
      return [];
    }
  }, []);

  // First open: continue the latest conversation, or start one (a chip's question starts its own, below).
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    const arrivedWithPrompt = Boolean(prompt);
    void loadThreads().then((list) => {
      if (arrivedWithPrompt) return;
      const latest = list[0];
      if (latest) void openThread(latest.id);
      else fresh();
    });
  }, [prompt, loadThreads, openThread, fresh]);

  // A chip from home: a new thread with that question.
  React.useEffect(() => {
    if (!prompt) return;
    fresh(prompt);
    router.setParams({ prompt: undefined });
  }, [prompt, fresh, router]);

  const when = (iso: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-2 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button
          variant="secondary"
          size="icon"
          className="size-11"
          accessibilityLabel={t("chat.history")}
          onPress={() => {
            void loadThreads();
            setHistoryOpen(true);
          }}
        >
          <Icon as={History} className="size-5" />
        </Button>
        <Text className="font-display text-foreground flex-1 text-center text-xl font-bold">{t("chat.title")}</Text>
        <Button variant="secondary" size="icon" className="size-11" accessibilityLabel={t("chat.newChat")} onPress={() => fresh()}>
          <Icon as={SquarePen} className="size-5" />
        </Button>
      </View>

      {open ? (
        <Conversation key={open.id} threadId={open.id} initialMessages={open.messages} initialPrompt={open.prompt} onActivity={() => void loadThreads()} />
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors["muted-foreground"]} />
        </View>
      )}

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title={t("chat.history")} colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }} closeLabel={t("common.close")} bottomInset={insets.bottom} className="gap-3">
        <Button
          variant="secondary"
          onPress={() => {
            setHistoryOpen(false);
            fresh();
          }}
        >
          <Icon as={SquarePen} className="size-4" />
          <Text>{t("chat.newChat")}</Text>
        </Button>
        {threads.length > 0 ? (
          <ListGroup>
            {threads.map((thread) => (
              <ListRow
                key={thread.id}
                title={thread.title ?? t("chat.untitled")}
                subtitle={`${thread.network === "testnet" ? t("network.arcTestnet") : t("network.arc")} · ${when(thread.lastMessageAt)}`}
                selected={thread.id === open?.id}
                onPress={() => {
                  setHistoryOpen(false);
                  void openThread(thread.id);
                }}
              />
            ))}
          </ListGroup>
        ) : (
          <Text className="text-muted-foreground py-2 text-center text-sm">{t("chat.noHistory")}</Text>
        )}
      </Sheet>
    </View>
  );
}
