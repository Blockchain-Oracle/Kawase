// The composer: a native twin of 21st.dev zochory/prompt-input-dynamic-grow (the field grows with its text up to about
// five lines), in Senryo's calm material — one capsule on a hairline, no glow and no ring (the owner's review, 14 Oct:
// the glowing capsule beside a ringed voice button read as a gimmick). The mic sits inside the capsule while it is
// empty, Send scales in once there is text (Enter on a keyboard), Stop replaces it while the agent answers. Optional
// action chips ride above while it is focused and empty and insert a template.
import { ArrowUp, Mic, Square, type LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, ScrollView, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
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
  colors?: { glow: string; border: string; card: string; send: string; onSend: string; focus?: string };
  /** Before the field (Kawase's mark, as on Home's composer). */
  leading?: React.ReactNode;
  /** Drawn in place of the mic glyph on the talk button (Home's live mini orb). */
  talkIcon?: React.ReactNode;
  /** A raised capsule with no hairline (Home's shadow), passed as a style so the caller owns the elevation token. */
  raised?: StyleProp<ViewStyle>;
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
  leading,
  talkIcon,
  raised,
  onSent,
  className,
}: ComposerProps) {
  const reduced = useReducedMotionLive();
  const input = React.useRef<TextInput>(null);
  const [focused, setFocused] = React.useState(false);
  const canSend = !disabled && value.trim().length > 0;
  const layout = reduced ? undefined : LinearTransition.springify().damping(SPRING.layout.damping).stiffness(SPRING.layout.stiffness);

  // Focus: the hairline darkens a step (no glow).
  const focus = useSharedValue(0);
  React.useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: reduced ? 0 : MOTION.composerGlowMs });
  }, [focused, reduced, focus]);
  const capsuleStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [colors.border, colors.focus ?? colors.border]),
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

  const touch = () => input.current?.focus();

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
              flexGrow: 1,
              flexBasis: 0,
              flexShrink: 1,
              backgroundColor: colors.card,
            },
            raised ? [{ borderWidth: 0 }, raised] : null,
          ]}
          className={cn("rounded-[28px] border", raised ? null : "overflow-hidden")}
        >
          <Pressable onPressIn={touch} accessible={false} className={cn("flex-row items-end gap-1 py-1 pe-1.5", leading ? "ps-2.5" : "ps-4")}>
            {leading ? <View className="h-12 items-center justify-center pe-1">{leading}</View> : null}
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
              {onTalk && !generating && !canSend ? (
                <Animated.View entering={reduced ? undefined : ZoomIn.duration(MOTION.pressMs)} exiting={reduced ? undefined : ZoomOut.duration(MOTION.pressMs)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={labels.talk}
                    onPress={onTalk}
                    hitSlop={4}
                    className="size-10 items-center justify-center rounded-full active:opacity-70"
                  >
                    {talkIcon ?? <Icon as={Mic} className="text-muted-foreground size-5" />}
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
      </Animated.View>
    </View>
  );
}

export { Composer };
export type { ComposerAction, ComposerLabels, ComposerProps };
