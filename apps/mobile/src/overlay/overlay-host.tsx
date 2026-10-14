// The layer above the tab pages and the dock: the fan's blur, the plus button with its actions, and the voice overlay.
// Order matters — the fan sits above its own blur, and the voice overlay above everything, so the plus is blurred away
// while the orb is up. Rendered once: by the (tabs) layout, or on a desktop window by the signed-in area's layout over
// the rail and every page (no plus there: the rail lists the same actions). The plus is the quiet glass circle at the
// trailing edge above the dock, and its actions rise from it in one column (Add money · Send · Receive · Swap ·
// Bridge). It steps aside on Chat and while Home's composer is open, where the composer takes the bottom of the screen.
// Every action goes through the account gate, so a guest's first money tap opens the sign-in sheet in place and the
// action follows it. Opening the fan commits to nothing, so it has no haptic.
import { useSegments } from "expo-router";
import { BlurOverlay } from "@kawase/ui-native/components/blur-overlay";
import { FAN_EXIT_MS, QuickActionFan } from "@kawase/ui-native/components/quick-action-fan";
import { useWide } from "@kawase/ui-native/lib/wide";

import { useDockClearance } from "@/dock/use-dock-clearance";
import { useT } from "@/i18n";
import { useAccountGate, type DeferredVerb } from "@/onboarding/account-gate";
import { useFanActions } from "@/overlay/fan-actions";
import { useOverlay } from "@/overlay/overlay-provider";
import { VoiceOverlay } from "@/overlay/voice-overlay";
import { useTheme } from "@/theme/theme-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

/** The plus's gap above the dock. */
export const FAN_GAP = 12;
/** Pages whose own bottom control (the composer) owns the plus button's spot. */
const PAGES_WITHOUT_PLUS = new Set(["chat"]);

export function OverlayHost() {
  const { t } = useT();
  const overlay = useOverlay();
  const gate = useAccountGate();
  const { mode } = useTheme();
  const colors = useThemeColors();
  const clearance = useDockClearance();
  const segments = useSegments();
  const wide = useWide();
  const fanOpen = overlay.current === "fan";
  const showPlus = !wide && !overlay.composing && !PAGES_WITHOUT_PLUS.has(segments[segments.length - 1] ?? "");

  const actions = useFanActions().map((action) => ({ key: action.verb, label: action.label, icon: action.icon }));

  return (
    <>
      <BlurOverlay
        open={fanOpen}
        onClose={overlay.close}
        scheme={mode}
        scrim={colors.scrim}
        closeLabel={t("common.close")}
        close="none"
        modal={false}
        exitMs={FAN_EXIT_MS}
      />
      {showPlus ? (
        <QuickActionFan
          open={fanOpen}
          actions={actions}
          onToggle={() => overlay.toggle("fan")}
          onAction={(key) => {
            overlay.close();
            gate(key as DeferredVerb);
          }}
          toggleLabel={fanOpen ? t("shell.fan.close") : t("shell.dock.actions")}
          bottom={clearance.dock + FAN_GAP}
          glass={{ scheme: mode, tint: colors.glass }}
          covered={overlay.shown === "voice"}
        />
      ) : null}
      <VoiceOverlay open={overlay.current === "voice"} />
    </>
  );
}
