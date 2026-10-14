// The conversation, full screen (D37: Home is the agent; this is the whole thread behind a run, opened with "Open
// conversation", from the history drop-down, from voice's "Type instead", or from a link). It opens on the thread
// asked for (`?thread=`), else the most recent one (threads live on the api and follow the account), else a new one;
// `?prompt=` starts a new thread with that question asked. A money run inside it is the same run card as on Home.
// Back returns to where it was opened from; the clock opens the history sheet (search, rename, delete), the pen starts
// a new conversation, the scanner reads a pay code into a new one. A thread or list that could not be read says so
// with Retry (never an empty new conversation in its place), and only the newest open request is shown, so a slow
// read never replaces a thread opened after it (Codex review R14).
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, History, ScanLine, SquarePen, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { UIMessage } from "ai";

import { useWide } from "@kawase/ui-native/lib/wide";

import { Conversation } from "@/chat/conversation";
import { ThreadHistorySheet } from "@/chat/thread-history-sheet";
import { diagnose, ErrorState, Icon, LoadingState, SIZE, SPACE, TYPE, useHeldLoading, useTheme, type Diagnosis } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { ScanModal } from "@/scan/scan-modal";
import { api } from "@/session/api";

/** The conversation's width on a desktop window. */
const CHAT_COLUMN_PX = 760;

type Open =
  | { status: "ready"; id: string; messages: UIMessage[]; prompt?: string | undefined }
  | { status: "loading" }
  /** The thread that could not be read, or no id: the list of conversations itself. */
  | { status: "failed"; id?: string; diagnosis: Diagnosis };

function HeaderButton({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={({ pressed }) => [styles.round, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <Icon icon={icon} size={SIZE.iconSm} />
    </Pressable>
  );
}

export function ChatScreen() {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { prompt, thread } = useLocalSearchParams<{ prompt?: string; thread?: string }>();
  const [open, setOpen] = React.useState<Open>({ status: "loading" });
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const latestOpen = React.useRef(0);
  const loading = useHeldLoading(open.status === "loading");

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
    } catch (failure) {
      if (ticket === latestOpen.current) setOpen({ status: "failed", id, diagnosis: diagnose(failure) });
    }
  }, []);

  // Continue the latest conversation, or start one when there is none; a list that could not be read says so.
  const start = React.useCallback(async () => {
    latestOpen.current += 1;
    const ticket = latestOpen.current;
    setOpen({ status: "loading" });
    try {
      const { threads } = await api.agent.threads();
      if (ticket !== latestOpen.current) return;
      const latest = threads[0];
      if (latest) void openThread(latest.id);
      else fresh();
    } catch (failure) {
      if (ticket === latestOpen.current) setOpen({ status: "failed", diagnosis: diagnose(failure) });
    }
  }, [openThread, fresh]);

  // First open: the thread or the question asked for, else the latest conversation.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!prompt && !thread) void start();
  }, [prompt, thread, start]);
  React.useEffect(() => {
    if (!thread) return;
    void openThread(thread);
    router.setParams({ thread: undefined });
  }, [thread, openThread, router]);
  React.useEffect(() => {
    if (!prompt) return;
    fresh(prompt);
    router.setParams({ prompt: undefined });
  }, [prompt, fresh, router]);

  return (
    <View style={[styles.page, { backgroundColor: color.background }]}>
      <View style={[styles.column, wide ? styles.wide : null]}>
        <View style={[styles.header, { paddingTop: wide ? SPACE.xl : insets.top + SPACE.md }]}>
          {router.canGoBack() ? <HeaderButton icon={ChevronLeft} label={t("common.back")} onPress={() => router.back()} /> : null}
          <HeaderButton icon={History} label={t("chat.history")} onPress={() => setHistoryOpen(true)} />
          <Text accessibilityRole="header" style={[TYPE.sectionTitle, styles.title, { color: color.ink }]}>
            {t("chat.title")}
          </Text>
          <HeaderButton icon={ScanLine} label={t("scan.title")} onPress={() => setScanning(true)} />
          <HeaderButton icon={SquarePen} label={t("chat.newChat")} onPress={() => fresh()} />
        </View>

        {open.status === "ready" ? (
          <Conversation key={open.id} threadId={open.id} initialMessages={open.messages} initialPrompt={open.prompt} onActivity={() => undefined} />
        ) : open.status === "failed" ? (
          <View style={styles.center}>
            <ErrorState
              diagnosis={open.diagnosis}
              retry={() => void (open.id ? openThread(open.id) : start())}
              stillWorks={t("feed.chat.stillWorks")}
            />
          </View>
        ) : loading ? (
          <View style={styles.loading}>
            <LoadingState shape="feed" />
          </View>
        ) : null}
      </View>

      {historyOpen ? (
        <ThreadHistorySheet
          onClose={() => setHistoryOpen(false)}
          onOpen={(id) => void openThread(id)}
          onNew={() => fresh()}
          current={open.status === "ready" ? open.id : null}
          onDeleted={(id) => {
            if (open.status === "ready" && open.id === id) fresh();
          }}
        />
      ) : null}
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

const styles = StyleSheet.create({
  page: { flex: 1 },
  column: { flex: 1, width: "100%", alignSelf: "center" },
  wide: { maxWidth: CHAT_COLUMN_PX },
  header: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.lgPlus, paddingBottom: SPACE.sm },
  title: { flex: 1, textAlign: "center" },
  round: { width: SIZE.touch, height: SIZE.touch, borderRadius: SIZE.touch / 2, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: SPACE.lgPlus },
  loading: { paddingHorizontal: SPACE.lgPlus, paddingTop: SPACE.md },
});
