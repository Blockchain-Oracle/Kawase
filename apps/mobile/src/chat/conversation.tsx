// One conversation with the agent (journey 14): the person's messages as bubbles, the agent's words as plain text
// with its results as cards in between, a "Thinking" line while it works, an inline error with Retry, starter
// chips when the thread is empty, and the composer pinned above the keyboard with the mic beside it (typing is
// always there; voice opens the orb overlay).
import { isToolUIPart, type UIMessage } from "ai";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeIn } from "react-native-reanimated";

import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { Composer } from "@kawase/ui-native/components/composer";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { SuggestedActions } from "@kawase/ui-native/components/suggested-actions";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useDockClearance } from "@/dock/use-dock-clearance";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";
import { useSession } from "@/session/session-provider";

import { ToolCard, type ToolPart } from "./tool-cards";
import { useAgentChat } from "./use-agent-chat";

const EDGE_INSET = 12;
const MARK_SIZE = 64;

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
  const { user } = useSession();
  const chat = useAgentChat(threadId, initialMessages);
  const [draft, setDraft] = React.useState("");
  const scroller = React.useRef<ScrollView>(null);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";

  const send = React.useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      void chat.sendMessage({ text: trimmed });
      setDraft("");
      onActivity();
    },
    [chat, onActivity],
  );

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
    <View className="flex-1">
      {chat.messages.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <KawaseMark size={MARK_SIZE} />
          <Text className="font-display text-foreground text-center text-2xl font-bold">{t("chat.emptyTitle")}</Text>
          <Text className="text-muted-foreground text-center text-base">{t("chat.emptyBodyLive")}</Text>
          <SuggestedActions className="justify-center pt-2" suggestions={chips} onSelect={send} />
        </View>
      ) : (
        <ScrollView
          ref={scroller}
          className="flex-1"
          contentContainerClassName="gap-4 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: EDGE_INSET }}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
          keyboardDismissMode="interactive"
        >
          {chat.messages.map((message) => (
            <MessageView key={message.id} message={message} onToolOutput={onToolOutput} />
          ))}
          {thinking ? (
            <Animated.View entering={FadeIn} className="flex-row items-center gap-2 py-1">
              <KawaseMark size={20} />
              <StateLabel className="text-muted-foreground">{t("home.thinking")}</StateLabel>
            </Animated.View>
          ) : null}
          {chat.error ? (
            <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
              <Text className="text-muted-foreground flex-1 text-sm">{t("common.error")}</Text>
              <Button size="sm" variant="secondary" onPress={() => void chat.regenerate()}>
                <Text>{t("common.retry")}</Text>
              </Button>
            </View>
          ) : null}
        </ScrollView>
      )}
      <KeyboardStickyView offset={{ closed: 0, opened: clearance.dock }}>
        <View className="px-5 pt-2" style={{ paddingBottom: clearance.dock + EDGE_INSET }}>
          <Composer
            value={draft}
            onValueChange={setDraft}
            onSubmit={() => send(draft)}
            onTalk={() => overlay.open("voice")}
            disabled={busy}
            labels={{
              placeholder: t("chat.placeholder"),
              attach: t("chat.placeholder"),
              talk: t("home.dockVoice"),
              send: t("home.send"),
            }}
          />
        </View>
      </KeyboardStickyView>
    </View>
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
    const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
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
