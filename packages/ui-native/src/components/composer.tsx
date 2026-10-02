// Native twin of the composer built from ui-web's prompt-input (21st.dev ibelick/prompt-input):
// a growing text field with attach, talk and send.
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { cn, INPUT_TEXT_START } from "@kawase/ui-native/lib/utils";
import { ArrowUp, Mic, Paperclip, Square } from "lucide-react-native";

import { MOTION } from "@kawase/config";
import Animated, { Easing, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";

const WEB_NO_RESIZE = { resize: "none" } as object;
import * as React from "react";
import { Platform, TextInput, View } from "react-native";

type ComposerLabels = {
  placeholder: string;
  attach: string;
  talk: string;
  send: string;
  stop?: string;
};

type ComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  /** All visible and spoken text, so the caller can translate it. */
  labels: ComposerLabels;
  onAttach?: () => void;
  onTalk?: () => void;
  disabled?: boolean;
  generating?: boolean;
  onStop?: () => void;
  className?: string;
};

/** How long after a send a returning whole message counts as iOS's autocorrect echo. */
const AUTOCORRECT_ECHO_MS = 400;
/** An autocorrection can shorten a word or two. */
const ECHO_SLACK_CHARS = 4;
const INPUT_MIN_HEIGHT = 44;
const INPUT_MAX_HEIGHT = 128;
const IDLE_WIDTH = 78;
const FULL_WIDTH = 100;
const IDLE_RADIUS = 36;
const EXPANDED_RADIUS = 24;

function Composer({
  value,
  onValueChange,
  onSubmit,
  labels,
  onAttach,
  onTalk,
  disabled = false,
  generating = false,
  onStop,
  className,
}: ComposerProps) {
  const canSend = !disabled && value.trim().length > 0;
  const [focused, setFocused] = React.useState(false);
  const [contentHeight, setContentHeight] = React.useState(INPUT_MIN_HEIGHT);
  const expanded = focused || value.length > 0;
  const reduced = useReducedMotionLive();
  const shape = useAnimatedStyle(() => ({
    width: withTiming(`${expanded ? FULL_WIDTH : IDLE_WIDTH}%` as `${number}%`, {
      duration: reduced ? 0 : MOTION.composerMs,
      easing: Easing.out(Easing.cubic),
    }),
    borderRadius: withTiming(expanded ? EXPANDED_RADIUS : IDLE_RADIUS, { duration: reduced ? 0 : MOTION.composerMs }),
  }));
  // iOS commits a pending autocorrection after the field was cleared on send, which would put the sent message
  // back ("arbitrum" returning as "Arboretum"). A change that brings back a whole message right after a send is
  // that echo, not typing, and is ignored.
  const sent = React.useRef<{ at: number; text: string } | undefined>(undefined);
  const submit = () => {
    sent.current = { at: Date.now(), text: value };
    onSubmit();
  };
  const change = (next: string) => {
    const last = sent.current;
    if (last && Date.now() - last.at < AUTOCORRECT_ECHO_MS && next.length >= last.text.trim().length - ECHO_SLACK_CHARS)
      return;
    onValueChange(next);
  };
  return (
    <Animated.View style={shape} className={cn("border-border bg-card self-center border p-2", className)}>
      <View className="flex-row items-end gap-1">
        <TextInput
          value={value}
          onChangeText={change}
          placeholder={labels.placeholder}
          accessibilityLabel={labels.placeholder}
          placeholderTextColorClassName="accent-muted-foreground"
          editable={!disabled || generating}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onContentSizeChange={(event) =>
            setContentHeight(
              Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, event.nativeEvent.contentSize.height)),
            )
          }
          scrollEnabled={contentHeight >= INPUT_MAX_HEIGHT}
          multiline
          style={[
            Platform.OS === "web" ? WEB_NO_RESIZE : undefined,
            { height: value ? contentHeight : INPUT_MIN_HEIGHT },
          ]}
          className={cn("text-foreground flex-1 px-2 py-2 font-sans text-base leading-6", INPUT_TEXT_START)}
        />
        <View className="flex-row items-center gap-1">
          {onAttach && expanded ? (
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel={labels.attach}
              onPress={onAttach}
              className="size-11"
            >
              <Icon as={Paperclip} className="size-5" />
            </Button>
          ) : null}
          {onTalk && !generating ? (
            <Button variant="ghost" size="icon" accessibilityLabel={labels.talk} onPress={onTalk} className="size-11">
              <Icon as={Mic} className="size-5" />
            </Button>
          ) : null}
          {generating && onStop ? (
            <Button
              size="icon"
              variant="secondary"
              accessibilityLabel={labels.stop}
              onPress={onStop}
              className="size-11"
            >
              <Icon as={Square} className="size-4" />
            </Button>
          ) : expanded ? (
            <Button
              size="icon"
              accessibilityLabel={labels.send}
              disabled={!canSend}
              onPress={submit}
              className="size-11"
            >
              <Icon as={ArrowUp} className="text-primary-foreground size-5" />
            </Button>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

export { Composer };
export type { ComposerLabels, ComposerProps };
