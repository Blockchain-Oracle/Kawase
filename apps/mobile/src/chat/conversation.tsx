// One conversation with the agent (journey 14, plan §1.2). The person's messages are raised ink bubbles that rise
// from the composer when sent; the agent's turns open with the 為替 mark, its words fade in block by block, and its
// results are cards in between (tool steps show as live chips that become the card). A new thread shows a greeting
// and state-aware suggestion tiles. The composer (the orb capsule) sits above the dock and rides the keyboard; the
// thread lifts with the keyboard only while the person is reading the latest message (KeyboardChatScrollView,
// "whenAtEnd" — the ChatGPT pattern). Long-press a message to copy it.
//
// Safety notes kept from the previous version: the half-written message survives a thread switch or a reconnect;
// Retry first reads what the api kept, because an answer can move money (inside the allowance the agent just sends):
// a reply it already has is shown; a question it kept with nothing after it is shown without being repeated; a
// question it never got goes back into the box. A saved question alone cannot establish whether a tool acted.
import { isToolUIPart, type UIMessage } from "ai";
import * as Clipboard from "expo-clipboard";
import { ArrowDown, ArrowLeftRight, ArrowUpRight, CalendarClock, HandCoins, Route, Sprout } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, Pressable, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { KeyboardChatScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeIn, LinearTransition, SlideInDown } from "react-native-reanimated";
import { toast } from "sonner-native";

import { MOTION, SPRING } from "@kawase/config";
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { Composer, type ComposerAction } from "@kawase/ui-native/components/composer";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useDockClearance } from "@/dock/use-dock-clearance";
import { cue, tapFeedback } from "@/feedback/feedback";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

import { draftKey, readDraft, saveDraft } from "./drafts";
import { EmptyThread } from "./empty-thread";
import { MessageText } from "./message-text";
import { ChatResumeProvider } from "./resume";
import { storedThread } from "./stored-thread";
import { ToolCard, type ToolPart } from "./tool-cards";
import { useAgentChat } from "./use-agent-chat";

const EDGE_INSET = 12;
const AVATAR_SIZE = 22;
/** How far from the end still counts as "reading the latest" (about two lines). */
const NEAR_END = 64;
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
  const overlay = useOverlay();
  const colors = useThemeColors();
  const chat = useAgentChat(threadId, initialMessages);
  const key = draftKey(threadId, chat.messages.length > 0);
  const [draft, setDraft] = React.useState(() => readDraft(draftKey(threadId, initialMessages.length > 0)));
  const scroller = React.useRef<Animated.ScrollView>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";

  // Messages already there when the thread opened don't animate in; new ones do.
  const shownAtOpen = React.useRef(new Set(initialMessages.map((message) => message.id)));

  // The composer block's height (it grows with multiline text), so the thread's end clears it.
  const [composerHeight, setComposerHeight] = React.useState(0);
  const onComposerLayout = (event: LayoutChangeEvent) => setComposerHeight(event.nativeEvent.layout.height);

  const [atEnd, setAtEnd] = React.useState(true);
  const [retrying, setRetrying] = React.useState(false);
  const [interrupted, setInterrupted] = React.useState(false);

  const toLatest = React.useCallback(() => {
    setAtEnd(true);
    scroller.current?.scrollToEnd({ animated: true });
  }, []);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    setAtEnd(contentSize.height - layoutMeasurement.height - contentOffset.y <= NEAR_END);
  };

  const placed = React.useRef(false);
  const onContentSizeChange = () => {
    if (!placed.current) {
      placed.current = true;
      scroller.current?.scrollToEnd({ animated: false });
    } else if (atEnd) scroller.current?.scrollToEnd({ animated: true });
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
        // A tile asked instead: what the person was typing stays, now under this thread.
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

  const actions: ComposerAction[] = [
    { label: t("chatHome.actionSend"), template: t("chatHome.actionSendTemplate"), icon: ArrowUpRight },
    { label: t("chatHome.actionRequest"), template: t("chatHome.actionRequestTemplate"), icon: HandCoins },
    { label: t("chatHome.actionSwap"), template: t("chatHome.actionSwapTemplate"), icon: ArrowLeftRight },
    { label: t("chatHome.actionBridge"), template: t("chatHome.actionBridgeTemplate"), icon: Route },
    { label: t("chatHome.actionSave"), template: t("chatHome.actionSaveTemplate"), icon: Sprout },
    { label: t("chatHome.actionAutomate"), template: t("chatHome.actionAutomateTemplate"), icon: CalendarClock },
  ];

  const last = chat.messages.at(-1);
  // "Thinking" until the agent's first words or card arrive.
  const thinking =
    chat.status === "submitted" ||
    (chat.status === "streaming" &&
      last?.role === "assistant" &&
      !last.parts.some((part) => (part.type === "text" && part.text.length > 0) || isToolUIPart(part)));

  const empty = chat.messages.length === 0;

  return (
    <View className="flex-1">
      {empty ? (
        <EmptyThread onAsk={(prompt) => send(prompt)} />
      ) : (
        <View className="flex-1">
          <KeyboardChatScrollView
            ref={scroller}
            keyboardLiftBehavior="whenAtEnd"
            offset={composerHeight}
            contentContainerClassName="gap-5 px-5 pt-4"
            contentContainerStyle={{ paddingBottom: EDGE_INSET }}
            onContentSizeChange={onContentSizeChange}
            onScroll={onScroll}
            scrollEventThrottle={SCROLL_THROTTLE_MS}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <ChatResumeProvider send={send}>
              {chat.messages.map((message) => (
                <MessageView
                  key={message.id}
                  message={message}
                  fresh={!shownAtOpen.current.has(message.id)}
                  onToolOutput={onToolOutput}
                  copiedLabel={t("chatHome.copied")}
                />
              ))}
            </ChatResumeProvider>
            {thinking ? (
              <Animated.View entering={FadeIn} className="flex-row items-center gap-2 py-1">
                <KawaseMark size={AVATAR_SIZE} />
                <StateLabel className="text-muted-foreground">{t("home.thinking")}</StateLabel>
              </Animated.View>
            ) : null}
            {chat.error ? (
              <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
                <Text accessibilityRole="alert" className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>
                  {t("chat.answerFailed")}
                </Text>
                <Button size="sm" variant="secondary" disabled={retrying} onPress={() => void retry()}>
                  {retrying ? <ActivityIndicator color={colors["muted-foreground"]} /> : <Text>{t("common.retry")}</Text>}
                </Button>
              </View>
            ) : null}
          </KeyboardChatScrollView>
          {!atEnd && busy ? (
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
      <KeyboardStickyView offset={{ closed: 0, opened: clearance.dock - EDGE_INSET }}>
        <View onLayout={onComposerLayout} className="px-4 pt-2" style={{ paddingBottom: clearance.dock + EDGE_INSET }}>
          {interrupted ? (
            <Text accessibilityRole="alert" className="text-muted-foreground pb-2 text-center text-sm">
              {t("chat.stopped")}
            </Text>
          ) : null}
          <Composer
            value={draft}
            onValueChange={editDraft}
            onSubmit={() => send(draft, true)}
            onSent={() => void cue("send")}
            onTalk={() => overlay.open("voice")}
            disabled={busy}
            generating={busy}
            onStop={() => {
              void chat.stop();
              setInterrupted(true);
            }}
            actions={actions}
            colors={{
              glow: colors.ring,
              border: colors.border,
              card: colors.card,
              send: colors.primary,
              onSend: colors["primary-foreground"],
            }}
            labels={{
              placeholder: t("chatHome.placeholder"),
              talk: t("home.dockVoice"),
              send: t("home.send"),
              stop: t("common.stop"),
              actions: t("chatHome.actionsLabel"),
            }}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function MessageView({
  message,
  fresh,
  onToolOutput,
  copiedLabel,
}: {
  message: UIMessage;
  fresh: boolean;
  onToolOutput: (tool: string, toolCallId: string, output: unknown) => void;
  copiedLabel: string;
}) {
  const reduced = useReducedMotionLive();
  const text = textOf(message);
  const copy = () => {
    if (!text) return;
    void Clipboard.setStringAsync(text);
    tapFeedback("selection");
    toast(copiedLabel);
  };

  if (message.role === "user") {
    return (
      <Animated.View
        entering={fresh && !reduced ? SlideInDown.springify().damping(SPRING.layout.damping).stiffness(SPRING.layout.stiffness) : undefined}
        className="max-w-[85%] self-end"
      >
        <Pressable onLongPress={copy} accessibilityHint={copiedLabel} className="bg-secondary rounded-[22px] rounded-ee-md px-4 py-3">
          <Text className={cn("text-foreground text-[16px] leading-6", TEXT_START)}>{text}</Text>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View layout={reduced ? undefined : LinearTransition.duration(MOTION.sheetMs)} className="flex-row gap-3">
      <View className="pt-0.5">
        <KawaseMark size={AVATAR_SIZE} />
      </View>
      <Pressable onLongPress={copy} className="min-w-0 flex-1 gap-3">
        {message.parts.map((part, i) => {
          if (part.type === "text") return part.text.length > 0 ? <MessageText key={i} text={part.text} /> : null;
          if (isToolUIPart(part))
            return (
              <Animated.View key={part.toolCallId} layout={reduced ? undefined : LinearTransition.duration(MOTION.sheetMs)}>
                <ToolCard part={part as unknown as ToolPart} onToolOutput={onToolOutput} />
              </Animated.View>
            );
          return null;
        })}
      </Pressable>
    </Animated.View>
  );
}
