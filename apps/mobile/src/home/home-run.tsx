// Home's live run (D37: the agent is the front door). What the person types in Home's composer goes to the agent in
// one conversation, and the answer is drawn right here as one object: a money run as the run card (race → approve →
// steps → receipt), anything else as the agent's own words and cards. The conversation is the same thread the chat
// screen opens ("Open conversation"); a follow-up typed while the run is open continues it, and closing it (×) files
// it into the feed. A run survives an app kill: the thread is read back and drawn from what was stored, and an
// approval is never acted on again. While the agent is offline the composer's question stays in the box.
import { isToolUIPart, type UIMessage } from "ai";
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";

import { MessageCircle, X } from "lucide-react-native";

import { diagnose, ErrorState, Icon, LoadingState, SIZE, SPACE, TIMING, TYPE, useTheme, type Diagnosis } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { AgentOffline, isAgentOffline, useAgentHealth } from "@/chat/agent-offline";
import { MessageText } from "@/chat/message-text";
import { ChatResumeProvider } from "@/chat/resume";
import { RunCard, runPiecesOf, type RunPhase } from "@/chat/run-card";
import { storedThread } from "@/chat/stored-thread";
import { ToolCard, type ToolPart } from "@/chat/tool-cards";
import { useAgentChat } from "@/chat/use-agent-chat";
import { useT } from "@/i18n";
import { api } from "@/session/api";

import { invalidateAgentFeed } from "./use-agent-feed";
import type { RunPointer } from "./run-store";

const textOf = (message: UIMessage | undefined) => (message ? message.parts.map((part) => (part.type === "text" ? part.text : "")).join("").trim() : "");

/** What the live strip says: the phase, and whether the agent is still talking. */
export type RunStatus = { phase: RunPhase; busy: boolean; asked: string };

export type HomeRunHandle = { send: (text: string) => void; stop: () => void };

type HomeRunProps = {
  pointer: RunPointer;
  /** Called once the first question went out (it is never asked again from Home). */
  onAsked: (threadId: string) => void;
  onClose: () => void;
  onStatus: (status: RunStatus | null) => void;
  /** The question could not go (the agent offline): it goes back into the composer, unsent. */
  onRestore: (text: string) => void;
};

/** Loads the thread (a run from before a restart), then draws it. */
export const HomeRun = React.forwardRef<HomeRunHandle, HomeRunProps>(function HomeRun(props, ref) {
  const { pointer } = props;
  const [loaded, setLoaded] = React.useState<UIMessage[] | null>(pointer.prompt ? [] : null);
  const [error, setError] = React.useState<Diagnosis | null>(null);
  const read = React.useCallback(async () => {
    setError(null);
    try {
      const { messages } = await api.agent.thread(pointer.threadId);
      setLoaded(messages as UIMessage[]);
    } catch (failure) {
      setError(diagnose(failure));
    }
  }, [pointer.threadId]);
  React.useEffect(() => {
    if (!pointer.prompt) void read();
  }, [pointer.prompt, read]);

  if (error)
    return (
      <View style={styles.wrap}>
        <ErrorState diagnosis={error} retry={() => void read()} variant="strip" />
      </View>
    );
  if (!loaded) return <LoadingState shape="routes" />;
  return <RunThread ref={ref} {...props} initial={loaded} />;
});

const RunThread = React.forwardRef<HomeRunHandle, HomeRunProps & { initial: UIMessage[] }>(function RunThread({ pointer, initial, onAsked, onClose, onStatus, onRestore }, ref) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const chat = useAgentChat(pointer.threadId, initial);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const health = useAgentHealth(chat.error);
  const [phase, setPhase] = React.useState<RunPhase>("understand");
  const [retrying, setRetrying] = React.useState(false);
  // Messages already stored when Home opened are history: their approvals are never acted on again.
  const seen = React.useRef(new Set(initial.map((message) => message.id)));

  const send = React.useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      void chat.sendMessage({ text: trimmed });
      fire("press");
    },
    [chat],
  );
  React.useImperativeHandle(ref, () => ({ send, stop: () => void chat.stop() }), [send, chat]);

  // The composer's first question, once.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (!pointer.prompt || asked.current || chat.messages.length > 0) return;
    asked.current = true;
    send(pointer.prompt);
    onAsked(pointer.threadId);
  }, [pointer.prompt, pointer.threadId, chat.messages.length, send, onAsked]);

  // The agent offline: the question goes back into the composer, unsent.
  React.useEffect(() => {
    if (!isAgentOffline(chat.error)) return;
    const last = chat.messages.at(-1);
    if (last?.role === "user") {
      chat.setMessages(chat.messages.slice(0, -1));
      onRestore(textOf(last));
    }
    chat.clearError();
  }, [chat, chat.error, onRestore]);

  // The latest exchange: the last question and everything the agent said after it.
  const lastUser = chat.messages.findLastIndex((message) => message.role === "user");
  const question = lastUser >= 0 ? textOf(chat.messages[lastUser]) : (pointer.prompt ?? "");
  const answers = chat.messages.slice(lastUser + 1).filter((message) => message.role === "assistant");
  const answer = answers.at(-1);
  const pieces = answer ? runPiecesOf(answer) : null;
  const live = answer ? !seen.current.has(answer.id) : true;

  React.useEffect(() => {
    onStatus({ phase: pieces ? phase : busy ? "understand" : "answer", busy, asked: question });
  }, [phase, busy, question, pieces, onStatus]);
  React.useEffect(() => () => onStatus(null), [onStatus]);
  // The turn ended: the feed reads again (a receipt, a held step).
  const wasBusy = React.useRef(busy);
  React.useEffect(() => {
    if (wasBusy.current && !busy) invalidateAgentFeed();
    wasBusy.current = busy;
  }, [busy]);
  React.useEffect(() => {
    if (phase === "receipt" || phase === "failed") invalidateAgentFeed();
  }, [phase]);

  const onToolOutput = React.useCallback(
    (tool: string, toolCallId: string, output: unknown) => void chat.addToolOutput({ tool, toolCallId, output } as Parameters<typeof chat.addToolOutput>[0]),
    [chat],
  );
  const onApproval = React.useCallback((id: string, approved: boolean) => void chat.addToolApprovalResponse({ id, approved }), [chat]);

  // An answer that did not come: what the api kept is shown; a question it never got goes back into the composer.
  const retry = async () => {
    setRetrying(true);
    try {
      const stored = await storedThread(pointer.threadId);
      if (!stored) return;
      const mine = chat.messages.findLast((message) => message.role === "user");
      chat.setMessages(stored);
      chat.clearError();
      if (mine && !stored.some((message) => message.id === mine.id)) onRestore(textOf(mine));
    } finally {
      setRetrying(false);
    }
  };

  const otherParts = (message: UIMessage) => message.parts.filter((part) => isToolUIPart(part)) as unknown as ToolPart[];

  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(TIMING.selection)} exiting={reduced ? undefined : FadeOut.duration(TIMING.press)} style={styles.wrap}>
      <View style={styles.head}>
        <Text numberOfLines={2} style={[TYPE.caption, styles.grow, { color: color.text3 }]}>
          {question ? t("feed.run.youAsked", { text: question }) : ""}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("feed.run.openThread")}
          hitSlop={SPACE.sm}
          onPress={() => router.push({ pathname: "/chat", params: { thread: pointer.threadId } })}
          style={styles.icon}
        >
          <Icon icon={MessageCircle} size={SIZE.iconSm} tint={color.text2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("feed.run.close")} hitSlop={SPACE.sm} onPress={onClose} disabled={busy} style={styles.icon}>
          <Icon icon={X} size={SIZE.iconSm} tint={busy ? color.text3 : color.text2} />
        </Pressable>
      </View>

      <ChatResumeProvider send={send}>
        {pieces && answer ? (
          <RunCard pieces={pieces} asked={question} live={live} streaming={busy} onToolOutput={onToolOutput} onApproval={onApproval} onPhase={setPhase} />
        ) : answer && (textOf(answer) || otherParts(answer).length > 0) ? (
          <View style={[styles.answer, { backgroundColor: color.card }]}>
            {textOf(answer) ? <MessageText text={textOf(answer)} /> : null}
            {otherParts(answer).map((part) => (
              <ToolCard key={part.toolCallId} part={part} onToolOutput={onToolOutput} onApproval={onApproval} />
            ))}
          </View>
        ) : busy ? (
          <RunCard pieces={{ race: null, step: null, text: "" }} asked={question} live streaming onToolOutput={onToolOutput} onApproval={onApproval} />
        ) : null}
      </ChatResumeProvider>

      {chat.error && !isAgentOffline(chat.error) ? (
        <ErrorState diagnosis={diagnose(chat.error)} retry={retrying ? undefined : () => void retry()} stillWorks={t("feed.run.stillWorks")} variant="strip" />
      ) : null}
      {health.offline ? <AgentOffline checking={health.checking} onCheck={() => void health.check()} /> : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  grow: { flex: 1 },
  icon: { width: SIZE.touch, height: SIZE.touch, alignItems: "center", justifyContent: "center" },
  answer: { borderRadius: SPACE.xl, padding: SPACE.lg, gap: SPACE.md },
});
