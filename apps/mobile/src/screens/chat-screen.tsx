// The Chat tab (journey 14, Stage 4): the agent, live. It opens on the most recent conversation (threads are kept
// on the api, so they follow the account across devices); the clock icon lists past threads (M1), each of which can be
// renamed or deleted from its … button, and the pen starts a new one. A starter chip from home starts a new thread with its question already asked. The network
// strip and the agent both follow the session's network. A conversation or a list that could not be read says so
// with Retry — never an empty new conversation or "no conversations" in its place — and only the newest open
// request is shown, so a slow read cannot replace a thread opened after it (Codex review R14).
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CloudOff, Ellipsis, History, ScanLine, SquarePen } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { toast } from "sonner-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { UIMessage } from "ai";

import type { ThreadSummary } from "@kawase/api-client";
import { HoldToConfirm } from "@kawase/ui-native/components/hold-to-confirm";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { useWide } from "@kawase/ui-native/lib/wide";

import { Conversation } from "@/chat/conversation";
import { HistoryHitRow } from "@/chat/insight-cards";
import { useHistorySearch } from "@/chat/use-history-search";
import { ScanModal } from "@/scan/scan-modal";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const STRIP_INSET = 6;
/** A conversation's title, as the api keeps it. */
const TITLE_MAX = 60;
const EDGE_INSET = 12;
const FAILED_ICON = 36;
/** The conversation's width on a desktop window, and the air above it there (no status bar). */
const CHAT_COLUMN_PX = 760;
const WIDE_TOP = 24;

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
  const wide = useWide();
  const { user } = useSession();
  const { prompt, thread } = useLocalSearchParams<{ prompt?: string; thread?: string }>();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const [open, setOpen] = React.useState<Open>({ status: "loading" });
  const [threads, setThreads] = React.useState<ThreadSummary[]>([]);
  const [threadsFailed, setThreadsFailed] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const matches = threads.filter((entry) =>
    (entry.title ?? t("chat.untitled")).toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)),
  );
  // Every conversation's words are searched on the server; until it answers, the loaded titles stand in.
  const found = useHistorySearch(search);
  // Scan to pay from chat: the code becomes the first words of a new conversation, and the agent reads it.
  const [scanning, setScanning] = React.useState(false);
  // Every open bumps this; a read that finishes after a newer open is dropped.
  const latestOpen = React.useRef(0);
  // A conversation's options in the history sheet: rename it, or delete it (capability matrix, Thread).
  const [managing, setManaging] = React.useState<ThreadSummary | null>(null);
  const [newTitle, setNewTitle] = React.useState("");
  const [savingTitle, setSavingTitle] = React.useState(false);
  const [deleteAttempt, setDeleteAttempt] = React.useState(0);

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

  const manage = (thread: ThreadSummary) => {
    setManaging(thread);
    setNewTitle(thread.title ?? "");
  };
  const rename = async () => {
    if (!managing || !newTitle.trim()) return;
    setSavingTitle(true);
    try {
      const { thread: renamed } = await api.agent.renameThread(managing.id, newTitle.trim());
      setThreads((current) =>
        current.map((entry) => (entry.id === renamed.id ? { ...entry, title: renamed.title } : entry)),
      );
      setManaging(null);
      toast(t("chat.threadRenamed"));
    } catch {
      toast(t("common.error"));
    } finally {
      setSavingTitle(false);
    }
  };
  const removeThread = async () => {
    if (!managing) return;
    const gone = managing.id;
    try {
      await api.agent.deleteThread(gone);
      setThreads((current) => current.filter((entry) => entry.id !== gone));
      setManaging(null);
      toast(t("chat.threadDeleted"));
      // The conversation on screen was the one deleted: a new one takes its place.
      if (open.status === "ready" && open.id === gone) fresh();
    } catch {
      toast(t("common.error"));
      setDeleteAttempt((count) => count + 1);
    }
  };

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
      new Date(iso),
    );

  return (
    <View className="bg-background flex-1">
      {testnet ? (
        <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} />
      ) : null}
      {/* A desktop window: the conversation in a centred column of comfortable reading width (Stage 13). */}
      <View className="w-full flex-1 self-center" style={wide ? { maxWidth: CHAT_COLUMN_PX } : undefined}>
        <View
          className="flex-row items-center gap-2 px-5"
          style={{ paddingTop: wide ? WIDE_TOP : testnet ? EDGE_INSET : insets.top + EDGE_INSET }}
        >
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
          <Button
            variant="secondary"
            size="icon"
            className="size-11"
            accessibilityLabel={t("scan.title")}
            onPress={() => setScanning(true)}
          >
            <Icon as={ScanLine} className="size-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="size-11"
            accessibilityLabel={t("chat.newChat")}
            onPress={() => fresh()}
          >
            <Icon as={SquarePen} className="size-5" />
          </Button>
        </View>

        {open.status === "ready" ? (
          <Conversation
            key={open.id}
            threadId={open.id}
            initialMessages={open.messages}
            initialPrompt={open.prompt}
            onActivity={() => void loadThreads()}
          />
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
      </View>

      <Sheet
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setManaging(null);
        }}
        title={managing ? t("chat.manageThread") : t("chat.history")}
        colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
        closeLabel={t("common.close")}
        bottomInset={insets.bottom}
        className="gap-3"
      >
        {managing ? (
          <View className="gap-3">
            <SheetInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={t("chat.renamePlaceholder")}
              accessibilityLabel={t("chat.rename")}
              maxLength={TITLE_MAX}
              onSubmitEditing={() => void rename()}
            />
            <Button disabled={savingTitle || !newTitle.trim()} onPress={() => void rename()}>
              <Text>{t("chat.rename")}</Text>
            </Button>
            <HoldToConfirm
              onConfirm={() => void removeThread()}
              confirmLabel={t("chat.deletingThread")}
              done={false}
              resetKey={deleteAttempt}
              hint={t("limits.holdHint")}
            >
              {t("chat.holdToDeleteThread")}
            </HoldToConfirm>
            <Button variant="ghost" onPress={() => setManaging(null)}>
              <Text className="text-muted-foreground">{t("common.back")}</Text>
            </Button>
          </View>
        ) : (
          <>
            <SheetInput
              value={search}
              onChangeText={setSearch}
              placeholder={t("chat.search")}
              accessibilityLabel={t("chat.search")}
              autoCorrect={false}
            />
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
            {found.failed ? (
              <Text accessibilityRole="alert" className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>
                {t("insight.searchOffline")}
              </Text>
            ) : null}
            {found.hits ? (
              found.hits.length > 0 ? (
                <ListGroup>
                  {found.hits.map((hit) => (
                    <HistoryHitRow
                      key={hit.threadId}
                      hit={hit}
                      onOpen={(id) => {
                        setHistoryOpen(false);
                        void openThread(id);
                      }}
                    />
                  ))}
                </ListGroup>
              ) : (
                <Text className="text-muted-foreground py-2 text-center text-sm">{t("chat.noMatches")}</Text>
              )
            ) : matches.length > 0 ? (
              <ListGroup>
                {matches.map((thread) => (
                  <ListRow
                    key={thread.id}
                    title={thread.title ?? t("chat.untitled")}
                    subtitle={`${thread.network === "testnet" ? t("network.arcTestnet") : t("network.arc")} · ${when(thread.lastMessageAt)}`}
                    selected={open.status === "ready" && thread.id === open.id}
                    onPress={() => {
                      setHistoryOpen(false);
                      void openThread(thread.id);
                    }}
                    trailing={
                      <Button
                        size="icon"
                        variant="ghost"
                        accessibilityLabel={t("chat.threadOptions", { title: thread.title ?? t("chat.untitled") })}
                        onPress={() => manage(thread)}
                      >
                        <Icon as={Ellipsis} className="text-muted-foreground size-5" />
                      </Button>
                    }
                  />
                ))}
              </ListGroup>
            ) : threadsFailed ? null : (
              <Text className="text-muted-foreground py-2 text-center text-sm">
                {search.trim() ? t("chat.noMatches") : t("chat.noHistory")}
              </Text>
            )}
          </>
        )}
      </Sheet>
      <ScanModal
        open={scanning}
        origin="chat"
        onClose={() => setScanning(false)}
        onCode={(code) => {
          setScanning(false);
          fresh(t("scan.chatPrompt", { code }));
          return true;
        }}
      />
    </View>
  );
}
