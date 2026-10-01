// The layer above the tab pages and the dock: the fan's blur, the plus button with its four actions, and the
// voice overlay. Order matters — the fan sits above its own blur, and the voice overlay above everything, so the
// plus is blurred away while the orb is up. Rendered once by the (tabs) layout. The plus steps aside on Chat,
// where the composer sits in its place.
import * as Haptics from "expo-haptics";
import { useRouter, useSegments } from "expo-router";
import { ArrowDownToLine, HandCoins, QrCode, Send } from "lucide-react-native";
import { Platform } from "react-native";
import { toast } from "sonner-native";

import { BlurOverlay } from "@kawase/ui-native/components/blur-overlay";
import { QuickActionFan, type FanAction } from "@kawase/ui-native/components/quick-action-fan";

import { useDockClearance } from "@/dock/use-dock-clearance";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { useOverlay } from "@/overlay/overlay-provider";
import { VoiceOverlay } from "@/overlay/voice-overlay";
import { useTheme } from "@/theme/theme-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const FAN_GAP = 12;
/** Tabs whose own bottom control (the composer) owns the plus button's spot. */
const TABS_WITHOUT_PLUS = new Set(["chat"]);

export function OverlayHost() {
  const { t } = useT();
  const router = useRouter();
  const overlay = useOverlay();
  const fund = useFund();
  const { mode } = useTheme();
  const colors = useThemeColors();
  const clearance = useDockClearance();
  const fanOpen = overlay.current === "fan";
  const segments = useSegments();
  const showPlus = !TABS_WITHOUT_PLUS.has(segments[segments.length - 1] ?? "");

  const actions: FanAction[] = [
    { key: "send", label: t("home.send"), icon: Send },
    { key: "request", label: t("home.request"), icon: HandCoins },
    { key: "receive", label: t("home.receive"), icon: QrCode },
    { key: "fund", label: t("home.fund"), icon: ArrowDownToLine },
  ];

  // Receive and Fund are built; Send and Request say so until Stage 5 lands them (never a dead tap).
  const onAction = (key: string) => {
    overlay.close();
    if (key === "receive") router.push("/wallet/receive");
    else if (key === "fund") fund.open();
    else if (key === "send") toast(t("coming.send"));
    else toast(t("coming.request"));
  };

  return (
    <>
      <BlurOverlay open={fanOpen} onClose={overlay.close} scheme={mode} scrim={colors.scrim} closeLabel={t("common.close")} close="none" />
      {showPlus ? <QuickActionFan open={fanOpen} actions={actions} onToggle={() => {
            // A light tap as the fan opens (the plan's one additive haptic, with hold-to-confirm and completion).
            if (!fanOpen && Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            overlay.toggle("fan");
          }} onAction={onAction} toggleLabel={t("home.more")} bottom={clearance.dock + FAN_GAP} /> : null}
      <VoiceOverlay open={overlay.current === "voice"} />
    </>
  );
}
