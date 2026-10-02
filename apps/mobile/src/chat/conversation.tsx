// One conversation with the agent (journey 14): the person's messages as bubbles, the agent's words as plain text
// with its results as cards in between, a "Thinking" line while it works, an inline error with Retry, starter
// chips when the thread is empty, and the composer pinned above the keyboard with the mic beside it (typing is
// always there; voice opens the orb overlay). The view follows a reply only while the person is at the latest
// message; scrolled up, they stay where they are and a "New messages" pill takes them down (Codex review R14).
// The half-written message survives a thread switch or a reconnect. Retry first reads what the api kept, because an
// answer can move money (inside the allowance the agent just sends): a reply it already has is shown; a question it
// kept with nothing after it is shown without being repeated; a question it never got goes back into the box for
// the person to send again. A saved question alone cannot establish whether a tool acted.
import { isToolUIPart, type UIMessage } from "ai";
import { ArrowDown } from "lucide-react-native";
import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { KeyboardAvoidingView, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { FadeIn, interpolate, useAnimatedStyle } from "react-native-reanimated";

import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { Composer } from "@kawase/ui-native/components/composer";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { SuggestedActions } from "@kawase/ui-native/components/suggested-actions";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useDockClearance } from "@/dock/use-dock-clearance";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

import { draftKey, readDraft, saveDraft } from "./drafts";
import { ChatResumeProvider } from "./resume";
import { storedThread } from "./stored-thread";
import { ToolCard, type ToolPart } from "./tool-cards";
import { useAgentChat } from "./use-agent-chat";

const EDGE_INSET = 12;
const MARK_SIZE = 64;
/** How far from the end still counts as "reading the latest" (about two lines). */
const NEAR_END = 64;
/** A scroll that moved up by more than this is the person's own, not a layout nudge. */
const SCROLLED_UP = 2;
const SCROLL_THROTTLE_MS = 32;

const textOf = (message: UIMessage) => message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

type ConversationProps = {
  threadId: string;
  initialMessages: UIMessage[];
  /** A starter chip's text from home: sent as soon as the thread opens. */
  initialPrompt?: string | undefined;
  onActivity: () => void;
};

export function Conversation({ threadId, initialMessages, initialPrompt, onActivity }: ConversationProps) {
  const { t } = useT();
  const clearance = useDockClearance();
  const keyboard = useReanimatedKeyboardAnimation();
  const composerSpace = useAnimatedStyle(() => ({
    paddingBottom: interpolate(keyboard.progress.value, [0, 1], [clearance.dock + EDGE_INSET, EDGE_INSET]),
  }));
  const overlay = useOverlay();
  const { user } = useSession();
  const colors = useThemeColors();
  const chat = useAgentChat(threadId, initialMessages);
  const key = draftKey(threadId, chat.messages.length > 0);
  const [draft, setDraft] = React.useState(() => readDraft(draftKey(threadId, initialMessages.length > 0)));
  const scroller = React.useRef<ScrollView>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";

  // Following the latest: on while the person is at the end, off once they scroll up, on again when they come back.
  const following = React.useRef(true);
  const lastOffset = React.useRef(0);
  const placed = React.useRef(false);
  const [unseen, setUnseen] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [interrupted, setInterrupted] = React.useState(false);

  const toLatest = React.useCallback(() => {
    following.current = true;
    setUnseen(false);
    scroller.current?.scrollToEnd({ animated: true });
  }, []);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const fromEnd = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (fromEnd <= NEAR_END) {
      following.current = true;
      setUnseen(false);
    } else if (contentOffset.y < lastOffset.current - SCROLLED_UP) following.current = false;
    lastOffset.current = contentOffset.y;
  };

  const onContentSizeChange = () => {
    if (!placed.current) {
      // Opening a thread lands on its latest message without a long animated scroll.
      placed.current = true;
      scroller.current?.scrollToEnd({ animated: false });
    } else if (following.current) scroller.current?.scrollToEnd({ animated: true });
    else if (busy) setUnseen(true);
  };

  const editDraft = (text: string) => {
    setDraft(text);
    saveDraft(key, text);
  };

  const send = React.useCallback(
    (text: string, typed = false) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setInterrupted(false);
      void chat.sendMessage({ text: trimmed });
      if (typed) {
        setDraft("");
        saveDraft(key, "");
      } else if (draft) {
        // A chip asked instead: what the person was typing stays, now under this thread.
        saveDraft(key, "");
        saveDraft(threadId, draft);
      }
      onActivity();
      toLatest();
    },
    [chat, onActivity, key, draft, threadId, toLatest],
  );

  const retry = async () => {
    setRetrying(true);
    try {
      const stored = await storedThread(threadId);
      // Still can't reach the api: the error stays, with everything on screen kept.
      if (!stored) return;
      const asked = chat.messages.findLast((message) => message.role === "user");
      const kept = asked ? stored.findIndex((message) => message.id === asked.id) : -1;
      chat.setMessages(stored);
      chat.clearError();
      // A saved question alone does not prove that its tool never acted. Never regenerate it automatically.
      if (asked && kept < 0) {
        const text = textOf(asked);
        setDraft(text);
        saveDraft(draftKey(threadId, stored.length > 0), text);
      }
    } finally {
      setRetrying(false);
    }
  };

  // A chip from home opens a fresh thread with its question already asked.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (initialPrompt && !asked.current && chat.messages.length === 0) {
      asked.current = true;
      send(initialPrompt);
    }
  }, [initialPrompt, chat.messages.length, send]);

  const onToolOutput = React.useCallback(
    (tool: string, toolCallId: string, output: unknown) => {
      void chat.addToolOutput({ tool, toolCallId, output } as Parameters<typeof chat.addToolOutput>[0]);
    },
    [chat],
  );

  const chips = [
    { label: t("home.chipWhatCanYouDo"), prompt: t("home.chipWhatCanYouDo") },
    { label: t("chat.chipBalance"), prompt: t("chat.chipBalance") },
    ...(testnet ? [{ label: t("home.chipTestUsdc"), prompt: t("home.chipTestUsdc") }] : []),
    { label: t("chat.chipAddress"), prompt: t("chat.chipAddress") },
    { label: t("chat.chipAuthority"), prompt: t("chat.chipAuthority") },
  ];

  const last = chat.messages.at(-1);
  // "Thinking" until the agent's first words or card arrive.
  const thinking =
    chat.status === "submitted" ||
    (chat.status === "streaming" &&
      last?.role === "assistant" &&
      !last.parts.some((part) => (part.type === "text" && part.text.length > 0) || isToolUIPart(part)));

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {chat.messages.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <KawaseMark size={MARK_SIZE} />
          <Text className="font-display text-foreground text-center text-2xl font-bold">{t("chat.emptyTitle")}</Text>
          <Text className="text-muted-foreground text-center text-base">{t("chat.emptyBodyLive")}</Text>
          <SuggestedActions className="justify-center pt-2" suggestions={chips} onSelect={send} />
        </View>
      ) : (
        <View className="flex-1">
          <ScrollView
            ref={scroller}
            className="flex-1"
            contentContainerClassName="gap-4 px-5 pt-4"
            contentContainerStyle={{ paddingBottom: EDGE_INSET }}
            onContentSizeChange={onContentSizeChange}
            onScroll={onScroll}
            scrollEventThrottle={SCROLL_THROTTLE_MS}
            keyboardDismissMode="interactive"
          >
            <ChatResumeProvider send={send}>
              {chat.messages.map((message) => (
                <MessageView key={message.id} message={message} onToolOutput={onToolOutput} />
              ))}
            </ChatResumeProvider>
            {thinking ? (
              <Animated.View entering={FadeIn} className="flex-row items-center gap-2 py-1">
                <KawaseMark size={20} />
                <StateLabel className="text-muted-foreground">{t("home.thinking")}</StateLabel>
              </Animated.View>
            ) : null}
            {chat.error ? (
              <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
                <Text accessibilityRole="alert" className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>
                  {t("chat.answerFailed")}
                </Text>
                <Button size="sm" variant="secondary" disabled={retrying} onPress={() => void retry()}>
                  {retrying ? (
                    <ActivityIndicator color={colors["muted-foreground"]} />
                  ) : (
                    <Text>{t("common.retry")}</Text>
                  )}
                </Button>
              </View>
            ) : null}
          </ScrollView>
          {unseen ? (
            <Animated.View entering={FadeIn} className="absolute bottom-3 self-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("chat.toLatest")}
                onPress={toLatest}
                className="bg-foreground active:opacity-80 min-h-11 flex-row items-center gap-1.5 rounded-full px-4"
              >
                <Text className="text-background text-sm font-semibold">{t("chat.newMessages")}</Text>
                <Icon as={ArrowDown} className="text-background size-4" />
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      )}
      <Animated.View className="px-5 pt-2" style={composerSpace}>
        {interrupted ? (
          <Text accessibilityRole="alert" className="text-muted-foreground pb-2 text-center text-sm">
            {t("chat.stopped")}
          </Text>
        ) : null}
        <Composer
          value={draft}
          onValueChange={editDraft}
          onSubmit={() => send(draft, true)}
          onTalk={() => overlay.open("voice")}
          disabled={busy}
          generating={busy}
          onStop={() => {
            void chat.stop();
            setInterrupted(true);
          }}
          labels={{
            placeholder: t("chat.placeholder"),
            attach: t("chat.placeholder"),
            talk: t("home.dockVoice"),
            send: t("home.send"),
            stop: t("common.stop"),
          }}
        />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

/** The model is told to write plain text; if it still marks **emphasis**, show it as weight, never as asterisks. */
const EMPHASIS = "**";

function emphasis(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((piece, i) =>
    piece.startsWith(EMPHASIS) && piece.endsWith(EMPHASIS) ? (
      <Text key={i} className="text-foreground font-semibold">
        {piece.slice(EMPHASIS.length, -EMPHASIS.length)}
      </Text>
    ) : (
      piece
    ),
  );
}

function MessageView({
  message,
  onToolOutput,
}: {
  message: UIMessage;
  onToolOutput: (tool: string, toolCallId: string, output: unknown) => void;
}) {
  if (message.role === "user") {
    const text = textOf(message);
    return (
      <View className="bg-secondary max-w-[85%] self-end rounded-3xl rounded-ee-md px-4 py-3">
        <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{text}</Text>
      </View>
    );
  }
  return (
    <View className="gap-3">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return part.text.length > 0 ? (
            <Text key={i} className={cn("text-foreground text-base leading-6", TEXT_START)}>
              {emphasis(part.text)}
            </Text>
          ) : null;
        }
        if (isToolUIPart(part))
          return <ToolCard key={part.toolCallId} part={part as unknown as ToolPart} onToolOutput={onToolOutput} />;
        return null;
      })}
    </View>
  );
}
