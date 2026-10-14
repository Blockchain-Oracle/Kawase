// The composer, "the orb capsule": a native twin of 21st.dev zochory/prompt-input-dynamic-grow (grow on focus, a
// subtle glow, a ripple where the finger lands, shrink back when empty and unfocused), joined to Kawase's voice
// button. At rest it is a compact glass capsule beside the round voice button; focused, the capsule springs to full
// width, the voice button folds into a mic inside it, Send scales in once there is text, and the field grows up to
// about five lines. Optional action chips ride above while focused and insert a template. Stop replaces Send while
// the agent is answering. Layout changes run as UI-thread layout animations, never a per-frame width tween.
import { ArrowUp, AudioLines, Mic, Square, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, ScrollView, TextInput, View, type GestureResponderEvent } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";

import { COMPOSER, MOTION, SPRING } from "@kawase/config";
import { tokens } from "@kawase/ui-tokens";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, INPUT_TEXT_START } from "@kawase/ui-native/lib/utils";

const WEB_NO_RESIZE = { resize: "none" } as object;
/** How long after a send a returning whole message counts as iOS's autocorrect echo. */
const AUTOCORRECT_ECHO_MS = 400;
/** An autocorrection can shorten a word or two. */
const ECHO_SLACK_CHARS = 4;
const HALF = 2;

type ComposerLabels = {
  placeholder: string;
  talk: string;
  send: string;
  stop?: string;
  /** Accessible name of the action-chip row. */
  actions?: string;
};

type ComposerAction = {
  label: string;
  /** Text put in the field; the cursor lands at the end so the person types the blank. */
  template: string;
  icon?: LucideIcon;
};

type ComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  /** All visible and spoken text, so the caller can translate it. */
  labels: ComposerLabels;
  onTalk?: () => void;
  disabled?: boolean;
  generating?: boolean;
  onStop?: () => void;
  /** Shown above the capsule while it is focused and empty. */
  actions?: ComposerAction[];
  /** Theme colours as hex (the caller passes the active theme's tokens). */
  colors?: { glow: string; border: string; card: string; send: string; onSend: string };
  /** Light haptic, sound, etc. on send; the caller owns feedback. */
  onSent?: () => void;
  className?: string;
};

const DEFAULT_COLORS = {
  glow: tokens.themes.dark.ring,
  border: tokens.themes.dark.border,
  card: tokens.themes.dark.card,
  send: tokens.themes.dark.primary,
  onSend: tokens.themes.dark["primary-foreground"],
};

function Composer({
  value,
  onValueChange,
  onSubmit,
  labels,
  onTalk,
  disabled = false,
  generating = false,
  onStop,
  actions,
  colors = DEFAULT_COLORS,
  onSent,
  className,
}: ComposerProps) {
  const reduced = useReducedMotionLive();
  const input = React.useRef<TextInput>(null);
  const [focused, setFocused] = React.useState(false);
  const expanded = focused || value.length > 0;
  const canSend = !disabled && value.trim().length > 0;
  const layout = reduced ? undefined : LinearTransition.springify().damping(SPRING.layout.damping).stiffness(SPRING.layout.stiffness);

  // Focus glow: the hairline warms to the accent and a soft halo appears (on the UI thread).
  const glow = useSharedValue(0);
  React.useEffect(() => {
    glow.value = withTiming(focused ? 1 : 0, { duration: reduced ? 0 : MOTION.composerGlowMs });
  }, [focused, reduced, glow]);
  const capsuleStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(glow.value, [0, 1], [colors.border, colors.glow]),
    shadowOpacity: glow.value * COMPOSER.glowOpacity,
  }));

  // The field grows with its text up to the cap, smoothly.
  const height = useSharedValue<number>(COMPOSER.minHeightPt);
  const fieldStyle = useAnimatedStyle(() => ({ height: height.value }));
  const onContentSize = (contentHeight: number) => {
    const next = Math.min(COMPOSER.maxHeightPt, Math.max(COMPOSER.minHeightPt, contentHeight));
    height.value = reduced ? next : withSpring(next, SPRING.layout);
  };
  React.useEffect(() => {
    if (value.length === 0) height.value = reduced ? COMPOSER.minHeightPt : withSpring(COMPOSER.minHeightPt, SPRING.layout);
  }, [value.length, reduced, height]);

  // A ripple from where the finger landed (the 21st component's onFocus ripple).
  const ripple = useSharedValue(0);
  const rippleAt = useSharedValue({ x: 0, y: 0 });
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: (1 - ripple.value) * COMPOSER.glowOpacity,
    transform: [
      { translateX: rippleAt.value.x - COMPOSER.rippleSizePt / HALF },
      { translateY: rippleAt.value.y - COMPOSER.rippleSizePt / HALF },
      { scale: ripple.value * COMPOSER.rippleScale },
    ],
  }));
  const touch = (event: GestureResponderEvent) => {
    if (!reduced) {
      rippleAt.value = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
      ripple.value = 0;
      ripple.value = withTiming(1, { duration: MOTION.composerRippleMs });
    }
    input.current?.focus();
  };

  // iOS commits a pending autocorrection after the field was cleared on send, which would put the sent message
  // back ("arbitrum" returning as "Arboretum"). A change that brings back a whole message right after a send is
  // that echo, not typing, and is ignored.
  const sent = React.useRef<{ at: number; text: string } | undefined>(undefined);
  const submit = () => {
    if (!canSend) return;
    sent.current = { at: Date.now(), text: value };
    onSubmit();
    onSent?.();
  };
  // On a keyboard (web and desktop) Enter sends and Shift+Enter starts a new line, as in every chat; a phone's return
  // key stays a new line. Never while an input method is composing (Chinese, Japanese, Korean…).
  const sendOnEnter = (event: { nativeEvent: { key: string }; preventDefault: () => void }) => {
    const key = event.nativeEvent as unknown as KeyboardEvent;
    if (key.key !== "Enter" || key.shiftKey || key.isComposing) return;
    event.preventDefault();
    submit();
  };
  const change = (next: string) => {
    const last = sent.current;
    if (last && Date.now() - last.at < AUTOCORRECT_ECHO_MS && next.length >= last.text.trim().length - ECHO_SLACK_CHARS)
      return;
    onValueChange(next);
  };
  const insert = (action: ComposerAction) => {
    onValueChange(action.template);
    input.current?.focus();
  };

  const showActions = focused && value.length === 0 && !generating && (actions?.length ?? 0) > 0;

  return (
    <View className={cn("gap-2", className)}>
      {showActions ? (
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(MOTION.composerGlowMs)} exiting={reduced ? undefined : FadeOutDown.duration(MOTION.pressMs)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            accessibilityLabel={labels.actions}
            contentContainerClassName="gap-2"
          >
            {actions!.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={() => insert(action)}
                className="border-border bg-card active:opacity-80 min-h-10 flex-row items-center gap-1.5 rounded-full border px-3.5"
              >
                {action.icon ? <Icon as={action.icon} className="text-foreground size-4" /> : null}
                <Text className="text-foreground text-sm font-medium">{action.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
      <Animated.View layout={layout} className="flex-row items-end justify-center gap-2">
        <Animated.View
          layout={layout}
          style={[
            capsuleStyle,
            {
              width: expanded ? "100%" : `${COMPOSER.restWidthPct}%`,
              flexShrink: 1,
              backgroundColor: colors.card,
              shadowColor: colors.glow,
              shadowRadius: COMPOSER.glowRadiusPt,
              shadowOffset: { width: 0, height: 0 },
            },
          ]}
          className="overflow-hidden rounded-[28px] border"
        >
          <Animated.View
            pointerEvents="none"
            style={[rippleStyle, { backgroundColor: colors.glow, width: COMPOSER.rippleSizePt, height: COMPOSER.rippleSizePt }]}
            className="absolute rounded-full"
          />
          <Pressable onPressIn={touch} accessible={false} className="flex-row items-end gap-1 py-1 ps-4 pe-1.5">
            <Animated.View style={fieldStyle} className="flex-1 justify-center">
              <TextInput
                ref={input}
                value={value}
                onChangeText={change}
                placeholder={labels.placeholder}
                accessibilityLabel={labels.placeholder}
                placeholderTextColorClassName="accent-muted-foreground"
                editable={!disabled || generating}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onContentSizeChange={(event) => onContentSize(event.nativeEvent.contentSize.height)}
                multiline
                scrollEnabled
                submitBehavior="newline"
                {...(Platform.OS === "web" ? { onKeyPress: sendOnEnter } : {})}
                style={Platform.OS === "web" ? WEB_NO_RESIZE : undefined}
                className={cn("text-foreground max-h-full py-3 font-sans text-base leading-6", INPUT_TEXT_START)}
              />
            </Animated.View>
            <View className="h-12 flex-row items-center gap-1">
              {expanded && onTalk && !generating ? (
                <Animated.View entering={reduced ? undefined : ZoomIn.duration(MOTION.pressMs)} exiting={reduced ? undefined : ZoomOut.duration(MOTION.pressMs)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={labels.talk}
                    onPress={onTalk}
                    hitSlop={4}
                    className="size-10 items-center justify-center rounded-full active:opacity-70"
                  >
                    <Icon as={Mic} className="text-muted-foreground size-5" />
                  </Pressable>
                </Animated.View>
              ) : null}
              {generating && onStop ? (
                <Animated.View entering={reduced ? undefined : ZoomIn.duration(MOTION.pressMs)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={labels.stop}
                    onPress={onStop}
                    className="bg-secondary size-10 items-center justify-center rounded-full active:opacity-80"
                  >
                    <Icon as={Square} className="text-foreground size-4" />
                  </Pressable>
                </Animated.View>
              ) : canSend ? (
                <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(SPRING.layout.damping)} exiting={reduced ? undefined : ZoomOut.duration(MOTION.pressMs)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={labels.send}
                    onPress={submit}
                    style={{ backgroundColor: colors.send }}
                    className="size-10 items-center justify-center rounded-full active:opacity-80"
                  >
                    <ArrowUp size={20} color={colors.onSend} strokeWidth={2.5} />
                  </Pressable>
                </Animated.View>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
        {!expanded && onTalk ? (
          <Animated.View entering={reduced ? undefined : ZoomIn.duration(MOTION.composerMs)} exiting={reduced ? undefined : ZoomOut.duration(MOTION.pressMs)} layout={layout}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={labels.talk}
              onPress={onTalk}
              style={{ width: COMPOSER.voiceButtonPt, height: COMPOSER.voiceButtonPt, borderColor: colors.glow, backgroundColor: colors.card }}
              className="items-center justify-center rounded-full border-2 active:opacity-80"
            >
              <AudioLines size={22} color={colors.glow} strokeWidth={2.25} />
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

export { Composer };
export type { ComposerAction, ComposerLabels, ComposerProps };
