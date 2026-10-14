// Home's composer, docked above the dock (D37: the agent is the front door): the orb capsule (21st 23594
// zochory/prompt-input-dynamic-grow, ported in ui-native's Composer: compact at rest, it grows when you type, the mic
// beside it opens voice, Send appears with text, Stop while the agent answers), the conversation drop-down on its
// left (the history sheet the owner liked) and the suggestion chips above it — Bring USDC to Arc · Put idle USDC to
// work · Buy $50 · Send to a contact · Bridge. A chip asks the agent in words (Bridge opens Move itself). It rides the
// keyboard; typing is always there next to voice.
import { useRouter } from "expo-router";
import { History } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";

import { Composer } from "@kawase/ui-native/components/composer";

import { Icon, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { cue } from "@/feedback/feedback";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";

const EDGE = SPACE.md;

type Chip = { key: string; label: string; prompt?: string; href?: "/move" };

export function HomeComposer({
  value,
  onChange,
  onSubmit,
  busy,
  onStop,
  onHistory,
  onLayout,
  showChips,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void;
  busy: boolean;
  onStop: () => void;
  onHistory: () => void;
  /** The composer block's height, so the page above can end clear of it. */
  onLayout: (height: number) => void;
  /** The chips at rest (hidden while a run is on screen, so the run has the room). */
  showChips: boolean;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const overlay = useOverlay();
  const clearance = useDockClearance();

  const chips: Chip[] = [
    { key: "bring", label: t("feed.home.chipBring"), prompt: t("feed.home.chipBringPrompt") },
    { key: "idle", label: t("feed.home.chipIdle"), prompt: t("feed.home.chipIdlePrompt") },
    { key: "buy", label: t("feed.home.chipBuy"), prompt: t("feed.home.chipBuyPrompt") },
    { key: "send", label: t("feed.home.chipSend"), prompt: t("feed.home.chipSendPrompt") },
    { key: "bridge", label: t("feed.home.chipBridge"), href: "/move" },
  ];
  const pick = (chip: Chip) => {
    fire("tick");
    if (chip.href) return router.push(chip.href);
    // "Send to a contact" leaves the name to type; the others are whole requests.
    if (chip.key === "send") return onChange(chip.prompt ?? "");
    onSubmit(chip.prompt ?? chip.label);
  };

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: clearance.dock - EDGE }} style={styles.dock} pointerEvents="box-none">
      <View onLayout={(event) => onLayout(event.nativeEvent.layout.height)} style={[styles.block, { paddingBottom: clearance.dock + EDGE }]} pointerEvents="box-none">
        {showChips ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips} accessibilityLabel={t("feed.home.chipsLabel")}>
            {chips.map((chip) => (
              <Pressable
                key={chip.key}
                accessibilityRole="button"
                onPress={() => pick(chip)}
                style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? color.rowPressed : color.glassOpaque }]}
              >
                <Text style={[TYPE.chipLabel, { color: color.ink }]}>{chip.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("feed.home.history")}
            onPress={() => {
              fire("tick");
              onHistory();
            }}
            style={({ pressed }) => [styles.round, { backgroundColor: pressed ? color.rowPressed : color.glassOpaque }]}
          >
            <Icon icon={History} size={SIZE.iconSm} />
          </Pressable>
          <View style={styles.grow}>
            <Composer
              value={value}
              onValueChange={onChange}
              onSubmit={() => onSubmit(value)}
              onSent={() => void cue("send")}
              onTalk={() => overlay.open("voice")}
              disabled={busy}
              generating={busy}
              onStop={onStop}
              colors={{ glow: color.ring, border: color.border, card: color.card, send: color.primary, onSend: color.primaryForeground }}
              labels={{ placeholder: t("feed.home.placeholder"), talk: t("home.dockVoice"), send: t("home.send"), stop: t("common.stop") }}
            />
          </View>
        </View>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", start: 0, end: 0, bottom: 0 },
  block: { gap: SPACE.sm, paddingTop: SPACE.sm },
  chips: { gap: SPACE.sm, paddingHorizontal: SPACE.lgPlus },
  chip: { height: SIZE.chipHeight, borderRadius: SIZE.chipHeight / 2, paddingHorizontal: SPACE.md, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: SPACE.sm, paddingHorizontal: SPACE.lg },
  round: { width: SIZE.touch, height: SIZE.touch, borderRadius: SIZE.touch / 2, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1 },
});
