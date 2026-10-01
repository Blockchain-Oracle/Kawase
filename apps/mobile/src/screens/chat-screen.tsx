// The Chat tab (journey 14, Stage 4): the agent, live. It opens on the most recent conversation (threads are kept
// on the api, so they follow the account across devices); the clock icon lists past threads (M1) and the pen
// starts a new one. A starter chip from home starts a new thread with its question already asked. The network
// strip and the agent both follow the session's network. A conversation or a list that could not be read says so
// with Retry — never an empty new conversation or "no conversations" in its place — and only the newest open
// request is shown, so a slow read cannot replace a thread opened after it (Codex review R14).
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CloudOff, History, SquarePen } from "lucide-react-native";
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
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Conversation } from "@/chat/conversation";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FAILED_ICON = 36;

type Open =
  | { status: "ready"; id: string; messages: UIMessage[]; prompt?: string | undefined }
  | { status: "loading" }
  /** The thread that could not be read, or no id: the list of conversations itself. */
  | { status: "failed"; id?: string };

export function ChatScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { user } = useSession();
  const { prompt, thread } = useLocalSearchParams<{ prompt?: string; thread?: string }>();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const [open, setOpen] = React.useState<Open>({ status: "loading" });
  const [threads, setThreads] = React.useState<ThreadSummary[]>([]);
  const [threadsFailed, setThreadsFailed] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  // Every open bumps this; a read that finishes after a newer open is dropped.
  const latestOpen = React.useRef(0);

  const fresh = React.useCallback((first?: string) => {
    latestOpen.current += 1;
    setOpen({ status: "ready", id: Crypto.randomUUID(), messages: [], prompt: first });
  }, []);

  const openThread = React.useCallback(async (id: string) => {
    latestOpen.current += 1;
    const ticket = latestOpen.current;
    setOpen({ status: "loading" });
    try {
      const { messages } = await api.agent.thread(id);
      if (ticket === latestOpen.current) setOpen({ status: "ready", id, messages: messages as UIMessage[] });
    } catch {
      if (ticket === latestOpen.current) setOpen({ status: "failed", id });
    }
  }, []);

  /** The conversations, newest first; undefined when they could not be read (the last list stays). */
  const loadThreads = React.useCallback(async () => {
    try {
      const result = await api.agent.threads();
      setThreads(result.threads);
      setThreadsFailed(false);
      return result.threads;
    } catch {
      setThreadsFailed(true);
      return undefined;
    }
  }, []);

  // Continue the latest conversation, or start one when there is none; a list that could not be read says so.
  const start = React.useCallback(async () => {
    latestOpen.current += 1;
    const ticket = latestOpen.current;
    setOpen({ status: "loading" });
    const list = await loadThreads();
    if (ticket !== latestOpen.current) return;
    const latest = list?.[0];
    if (!list) setOpen({ status: "failed" });
    else if (latest) void openThread(latest.id);
    else fresh();
  }, [loadThreads, openThread, fresh]);

  // First open (a chip's question starts its own thread instead, below).
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (prompt) void loadThreads();
    else void start();
  }, [prompt, loadThreads, start]);

  // From voice ("Type instead"): the thread the conversation was saved in, to carry on typing.
  React.useEffect(() => {
    if (!thread) return;
    void openThread(thread);
    router.setParams({ thread: undefined });
  }, [thread, openThread, router]);

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

      {open.status === "ready" ? (
        <Conversation key={open.id} threadId={open.id} initialMessages={open.messages} initialPrompt={open.prompt} onActivity={() => void loadThreads()} />
      ) : open.status === "failed" ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Icon as={CloudOff} className="text-muted-foreground" size={FAILED_ICON} />
          <Text accessibilityRole="alert" className="text-foreground text-center text-base">
            {open.id ? t("chat.threadFailed") : t("chat.historyFailed")}
          </Text>
          <View className="flex-row gap-3">
            <Button variant="secondary" onPress={() => void (open.id ? openThread(open.id) : start())}>
              <Text>{t("common.retry")}</Text>
            </Button>
            <Button variant="ghost" onPress={() => fresh()}>
              <Text>{t("chat.newChat")}</Text>
            </Button>
          </View>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator accessibilityLabel={t("common.loading")} color={colors["muted-foreground"]} />
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
        {threadsFailed ? (
          <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
            <Text accessibilityRole="alert" className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>
              {threads.length > 0 ? t("chat.historyStale") : t("chat.historyFailed")}
            </Text>
            <Button size="sm" variant="secondary" onPress={() => void loadThreads()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          </View>
        ) : null}
        {threads.length > 0 ? (
          <ListGroup>
            {threads.map((thread) => (
              <ListRow
                key={thread.id}
                title={thread.title ?? t("chat.untitled")}
                subtitle={`${thread.network === "testnet" ? t("network.arcTestnet") : t("network.arc")} · ${when(thread.lastMessageAt)}`}
                selected={open.status === "ready" && thread.id === open.id}
                onPress={() => {
                  setHistoryOpen(false);
                  void openThread(thread.id);
                }}
              />
            ))}
          </ListGroup>
        ) : threadsFailed ? null : (
          <Text className="text-muted-foreground py-2 text-center text-sm">{t("chat.noHistory")}</Text>
        )}
      </Sheet>
    </View>
  );
}
