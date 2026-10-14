// Home's way to ask the agent (D37: the agent is the front door), after Senryo's floating launcher (R6.9, the owner's
// review 13 Oct) and 21st.dev zochory/prompt-input-dynamic-grow for the open field.
//
// At rest it is one capsule in the dock's own material, beside the + (white on the light page, the dock's glass on the
// dark one; never a glowing slab). Its words walk through what Kawase can do right now, the mic inside it opens voice,
// and while a run is working it says so and offers Stop. Reading down the page tucks it behind the dock; scrolling up
// brings it back (`useLauncherScroll`). A press shrinks it, a short magenta halo blooms, and it opens.
//
// Open, it is the typing bar riding the keyboard: past conversations on its leading side, a field that grows to about
// five lines, Send once there is text (Enter on a keyboard), the suggestions above it while it is empty. The + steps
// aside while it is open. Leaving it empty closes it back into the capsule.
import { useIsFocused, useRouter } from "expo-router";
import { ArrowUp, AudioLines, History, Mic, Square } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { FAN_END_INSET, FAN_PLUS_SIZE } from "@kawase/ui-native/components/quick-action-fan";
import { useWide, WIDE_COLUMN_PX } from "@kawase/ui-native/lib/wide";

import { ELEVATION, FONT, HAIRLINE_PX, Icon, ShimmerText, SIZE, SPACE, TIMING, TYPE, usePressScale, useTheme } from "@/components/kit";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { cue } from "@/feedback/feedback";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { FAN_GAP } from "@/overlay/overlay-host";
import { useOverlay } from "@/overlay/overlay-provider";

const HALF = 2;
/** The capsule at rest: a little shorter than the + beside it, centred on it. */
const LAUNCHER_H = 48;
const MARK = 22;
const ACTION = 36;
const HALO = 18;
const HALO_PEAK = 0.24;
const TUCK_SCALE = 0.9;
const SHOWN_AT = 0.5;
const HINT_MS = 3_200;
/** The open field: one line at rest, up to about five as you type. */
const FIELD_MIN = 24;
const FIELD_MAX = 120;
const DESKTOP_END_GAP = SPACE.xl;

type Chip = { key: string; label: string; prompt?: string; href?: "/move" };

/** The room Home leaves under its last row for the capsule (and the + beside it). */
export function useComposerClearance(): number {
  const clearance = useDockClearance();
  const wide = useWide();
  if (wide) return DESKTOP_END_GAP + LAUNCHER_H + SPACE.xl;
  return clearance.dock + FAN_GAP + FAN_PLUS_SIZE + SPACE.xl;
}

export function HomeComposer({
  value,
  onChange,
  onSubmit,
  busy,
  busyLabel,
  onStop,
  onHistory,
  shown,
  showChips,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void;
  busy: boolean;
  /** What the run is doing, said in the capsule while it works ("Comparing venues"). */
  busyLabel?: string | undefined;
  onStop: () => void;
  onHistory: () => void;
  /** 1 shown, 0 tucked behind the dock: Home's scroll drives it. */
  shown: SharedValue<number>;
  /** The suggestions while the field is open and empty (hidden while a run is on screen, so the run has the room). */
  showChips: boolean;
}) {
  const overlay = useOverlay();
  const focusedTab = useIsFocused();
  const [open, setOpen] = React.useState(false);
  // A request put in from another screen ("Ask Kawase") opens the field with it, unsent.
  const typing = open || value.length > 0;

  // The + steps aside while the field is open — only while Home is the page on screen.
  const { setComposing } = overlay;
  React.useEffect(() => {
    setComposing(typing && focusedTab);
    return () => setComposing(false);
  }, [typing, focusedTab, setComposing]);

  if (!typing)
    return (
      <Launcher
        shown={shown}
        busy={busy}
        busyLabel={busyLabel}
        onOpen={() => setOpen(true)}
        onTalk={() => overlay.open("voice")}
        onStop={onStop}
      />
    );
  return (
    <OpenField
      value={value}
      onChange={onChange}
      onSubmit={(text) => {
        onSubmit(text);
        setOpen(false);
      }}
      busy={busy}
      onStop={onStop}
      onHistory={onHistory}
      onTalk={() => overlay.open("voice")}
      onClose={() => setOpen(false)}
      showChips={showChips}
    />
  );
}

/** The capsule at rest. */
function Launcher({
  shown,
  busy,
  busyLabel,
  onOpen,
  onTalk,
  onStop,
}: {
  shown: SharedValue<number>;
  busy: boolean;
  busyLabel?: string | undefined;
  onOpen: () => void;
  onTalk: () => void;
  onStop: () => void;
}) {
  const { t } = useT();
  const { name, color } = useTheme();
  const wide = useWide();
  const clearance = useDockClearance();
  const press = usePressScale();
  const halo = useSharedValue(0);
  const [interactive, setInteractive] = React.useState(true);
  useAnimatedReaction(
    () => shown.value > SHOWN_AT,
    (now, before) => {
      if (now !== before) runOnJS(setInteractive)(now);
    },
  );
  const hint = useHint(interactive && !busy);
  const tuck = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * LAUNCHER_H }, { scale: TUCK_SCALE + (1 - TUCK_SCALE) * shown.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));
  const dark = name === "dark";

  // Beside the + on a phone (centred on it); centred in the page's column on a desktop window, where there is no dock.
  const place = wide
    ? { bottom: DESKTOP_END_GAP, start: SPACE.lgPlus, end: SPACE.lgPlus }
    : { bottom: clearance.dock + FAN_GAP + (FAN_PLUS_SIZE - LAUNCHER_H) / HALF, start: SPACE.lgPlus, end: FAN_END_INSET + FAN_PLUS_SIZE + SPACE.md };

  return (
    <Animated.View
      pointerEvents={interactive ? "box-none" : "none"}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? "auto" : "no-hide-descendants"}
      style={[styles.launcherWrap, place, tuck]}
    >
      <View style={[styles.launcherColumn, wide ? styles.wideColumn : null]}>
        <Animated.View pointerEvents="none" style={[styles.halo, { boxShadow: `0 0 ${HALO}px ${HALO / HALF}px ${color.accent}` }, haloStyle]} />
        <Animated.View style={[styles.pill, ELEVATION.dock, { backgroundColor: dark ? color.glassOpaque : color.card }, press.style]}>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel={t("feed.home.placeholder")}
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            onPress={() => {
              fire("press", { sound: "sheetOpen" });
              halo.value = withSequence(withTiming(HALO_PEAK, { duration: TIMING.press }), withTiming(0, { duration: TIMING.selection }));
              onOpen();
            }}
            style={styles.pillPress}
          >
            <KawaseMark size={MARK} />
            {busy ? (
              <Animated.View key="busy" entering={FadeIn.duration(TIMING.selection)} style={styles.grow}>
                <ShimmerText style={[TYPE.body, { color: color.ink }]}>{busyLabel ?? t("feed.run.strip_steps")}</ShimmerText>
              </Animated.View>
            ) : (
              <Animated.View key={hint} entering={FadeInDown} exiting={FadeOutUp} style={styles.grow}>
                <Text numberOfLines={1} style={[TYPE.body, { color: hint === t("feed.home.placeholder") ? color.text3 : color.ink }]}>
                  {hint}
                </Text>
              </Animated.View>
            )}
          </Pressable>
          {busy ? (
            <RoundAction label={t("common.stop")} onPress={onStop} filled>
              <Icon icon={Square} size={SIZE.iconSm} tint={color.ink} />
            </RoundAction>
          ) : (
            <RoundAction label={t("home.dockVoice")} onPress={onTalk}>
              <Icon icon={AudioLines} size={SIZE.icon} tint={color.ink} />
            </RoundAction>
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** The words the capsule walks through: the base line, then what Kawase can do right now. */
function useHint(active: boolean): string {
  const { t } = useT();
  const reduce = useReducedMotion();
  const hints = React.useMemo(
    () => [t("feed.home.placeholder"), t("feed.home.chipBring"), t("feed.home.chipIdle"), t("feed.home.chipBuy"), t("feed.home.chipSend"), t("feed.home.chipBridge")],
    [t],
  );
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    if (reduce || !active) {
      setIndex(0);
      return undefined;
    }
    const timer = setInterval(() => setIndex((n) => n + 1), HINT_MS);
    return () => clearInterval(timer);
  }, [reduce, active]);
  return hints[index % hints.length] ?? t("feed.home.placeholder");
}

/** The typing bar, open. */
function OpenField({
  value,
  onChange,
  onSubmit,
  busy,
  onStop,
  onHistory,
  onTalk,
  onClose,
  showChips,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void;
  busy: boolean;
  onStop: () => void;
  onHistory: () => void;
  onTalk: () => void;
  onClose: () => void;
  showChips: boolean;
}) {
  const { t } = useT();
  const { name, color } = useTheme();
  const router = useRouter();
  const wide = useWide();
  const clearance = useDockClearance();
  const reduce = useReducedMotion();
  const input = React.useRef<TextInput>(null);
  const [height, setHeight] = React.useState(FIELD_MIN);
  const canSend = !busy && value.trim().length > 0;
  const dark = name === "dark";

  const chips: Chip[] = [
    { key: "bring", label: t("feed.home.chipBring"), prompt: t("feed.home.chipBringPrompt") },
    { key: "idle", label: t("feed.home.chipIdle"), prompt: t("feed.home.chipIdlePrompt") },
    { key: "buy", label: t("feed.home.chipBuy"), prompt: t("feed.home.chipBuyPrompt") },
    { key: "send", label: t("feed.home.chipSend"), prompt: t("feed.home.chipSendPrompt") },
    { key: "bridge", label: t("feed.home.chipBridge"), href: "/move" },
  ];
  const pick = (chip: Chip) => {
    fire("tick");
    if (chip.href) {
      onClose();
      return router.push(chip.href);
    }
    // "Send to a contact" leaves the name to type; the others are whole requests.
    if (chip.key === "send") {
      onChange(chip.prompt ?? "");
      return input.current?.focus();
    }
    onSubmit(chip.prompt ?? chip.label);
  };

  const submit = () => {
    if (!canSend) return;
    onSubmit(value);
    void cue("send");
  };
  // On a keyboard (web and desktop) Enter sends and Shift+Enter starts a new line; never while an input method is
  // composing (Chinese, Japanese, Korean…). A phone's return key stays a new line.
  const sendOnEnter = (event: { nativeEvent: { key: string }; preventDefault: () => void }) => {
    const key = event.nativeEvent as unknown as KeyboardEvent;
    if (key.key === "Escape" && value.length === 0) return onClose();
    if (key.key !== "Enter" || key.shiftKey || key.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: wide ? 0 : clearance.dock - SPACE.md }} style={styles.openDock} pointerEvents="box-none">
      <Animated.View
        entering={reduce ? undefined : FadeInDown.duration(TIMING.selection)}
        exiting={reduce ? undefined : FadeOut.duration(TIMING.press)}
        style={[styles.openBlock, { paddingBottom: wide ? DESKTOP_END_GAP : clearance.dock + SPACE.md }, wide ? styles.wideColumn : null]}
        pointerEvents="box-none"
      >
        {showChips && value.length === 0 && !busy ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.chips}
            accessibilityLabel={t("feed.home.chipsLabel")}
          >
            {chips.map((chip) => (
              <Pressable
                key={chip.key}
                accessibilityRole="button"
                onPress={() => pick(chip)}
                style={({ pressed }) => [styles.chip, ELEVATION.button, { backgroundColor: pressed ? color.rowPressed : dark ? color.glassOpaque : color.card }]}
              >
                <Text style={[TYPE.chipLabel, { color: color.ink }]}>{chip.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.openRow}>
          <RoundAction
            label={t("feed.home.history")}
            onPress={() => {
              fire("tick");
              onHistory();
            }}
            plate
          >
            <Icon icon={History} size={SIZE.iconSm} tint={color.ink} />
          </RoundAction>
          <View style={[styles.field, ELEVATION.dock, { backgroundColor: dark ? color.glassOpaque : color.card, borderColor: color.border }]}>
            <TextInput
              ref={input}
              autoFocus
              value={value}
              onChangeText={onChange}
              placeholder={t("feed.home.placeholder")}
              placeholderTextColor={color.text3}
              accessibilityLabel={t("feed.home.placeholder")}
              onBlur={() => {
                if (value.trim().length === 0) onClose();
              }}
              onContentSizeChange={(event) => setHeight(Math.min(FIELD_MAX, Math.max(FIELD_MIN, event.nativeEvent.contentSize.height)))}
              multiline
              scrollEnabled
              submitBehavior="newline"
              {...(Platform.OS === "web" ? { onKeyPress: sendOnEnter } : {})}
              style={[styles.input, { color: color.ink, height, fontFamily: FONT.sans }, Platform.OS === "web" ? WEB_INPUT : null]}
            />
            {busy ? (
              <RoundAction label={t("common.stop")} onPress={onStop} filled>
                <Icon icon={Square} size={SIZE.iconSm} tint={color.ink} />
              </RoundAction>
            ) : canSend ? (
              <Animated.View entering={reduce ? undefined : FadeIn.duration(TIMING.press)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("home.send")}
                  onPress={submit}
                  style={({ pressed }) => [styles.send, { backgroundColor: color.primary, opacity: pressed ? PRESSED : 1 }]}
                >
                  <ArrowUp size={SIZE.iconSm} color={color.primaryForeground} strokeWidth={2.5} />
                </Pressable>
              </Animated.View>
            ) : (
              <RoundAction label={t("home.dockVoice")} onPress={onTalk}>
                <Icon icon={Mic} size={SIZE.iconSm} tint={color.text2} />
              </RoundAction>
            )}
          </View>
        </View>
      </Animated.View>
    </KeyboardStickyView>
  );
}

const PRESSED = 0.8;
const WEB_INPUT = { outlineStyle: "none", resize: "none" } as object;

function RoundAction({ label, onPress, children, filled, plate }: { label: string; onPress: () => void; children: React.ReactNode; filled?: boolean; plate?: boolean }) {
  const { name, color } = useTheme();
  const background = plate ? (name === "dark" ? color.glassOpaque : color.card) : filled ? color.raised2 : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={SPACE.xs}
      onPress={onPress}
      style={({ pressed }) => [plate ? [styles.plate, ELEVATION.dock] : styles.round, { backgroundColor: pressed ? color.rowPressed : background }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  launcherWrap: { position: "absolute", alignItems: "center" },
  launcherColumn: { width: "100%", height: LAUNCHER_H, justifyContent: "center" },
  wideColumn: { width: "100%", maxWidth: WIDE_COLUMN_PX, alignSelf: "center" },
  halo: { position: "absolute", start: 0, end: 0, height: LAUNCHER_H, borderRadius: LAUNCHER_H / HALF },
  pill: {
    height: LAUNCHER_H,
    borderRadius: LAUNCHER_H / HALF,
    flexDirection: "row",
    alignItems: "center",
    paddingStart: SPACE.md,
    paddingEnd: SPACE.xs + HAIRLINE_PX,
    overflow: "hidden",
  },
  pillPress: { flex: 1, height: "100%", flexDirection: "row", alignItems: "center", gap: SPACE.md, overflow: "hidden" },
  round: { width: ACTION, height: ACTION, borderRadius: ACTION / HALF, alignItems: "center", justifyContent: "center" },
  plate: { width: SIZE.touch, height: SIZE.touch, borderRadius: SIZE.touch / HALF, alignItems: "center", justifyContent: "center" },
  openDock: { position: "absolute", start: 0, end: 0, bottom: 0 },
  openBlock: { gap: SPACE.sm, paddingTop: SPACE.sm },
  chips: { gap: SPACE.sm, paddingHorizontal: SPACE.lgPlus, paddingVertical: SPACE.xs },
  chip: { height: SIZE.chipHeight, borderRadius: SIZE.chipHeight / HALF, paddingHorizontal: SPACE.md, justifyContent: "center" },
  openRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACE.sm, paddingHorizontal: SPACE.lg },
  field: {
    flex: 1,
    minHeight: SIZE.touch,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACE.xs,
    borderRadius: SIZE.touch / HALF,
    borderWidth: HAIRLINE_PX,
    paddingStart: SPACE.lg,
    paddingEnd: SPACE.xs,
    paddingVertical: SPACE.xs,
  },
  input: { flex: 1, ...TYPE.body, paddingVertical: SPACE.xs, marginVertical: SPACE.xxs },
  send: { width: ACTION, height: ACTION, borderRadius: ACTION / HALF, alignItems: "center", justifyContent: "center" },
});
