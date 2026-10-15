// The scanner (scan to pay): the camera full-bleed under a lime viewfinder whose corners breathe while it looks, a
// torch, and "Paste instead" for a code that came by message. It reads QR codes only, hands each new one to the
// caller, and shows what the code means — or why it cannot be paid here, with the fix (switch network, scan again).
// Without camera access it says how to allow it, and pasting still works (the web too).
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ClipboardPaste, Flashlight, FlashlightOff, ScanLine, X } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tokens } from "@kawase/ui-tokens";
import type { PayCodeView } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

import { useOpenPayCode, usePayCode, type ScanOrigin } from "./use-pay-code";

const FRAME = 248;
const CORNER = 34;
const CORNER_WIDTH = 4;
const BREATHE_MS = 1400;
const BREATHE_SCALE = 1.04;
const EDGE = 16;
const CORNER_RADIUS = 18;
/** Kawase magenta (ui-tokens accent): the viewfinder sits on the camera, which is always dark. */
const VIEWFINDER = tokens.themes.dark.accent;

function Viewfinder({ color }: { color: string }) {
  const reduced = useReducedMotionLive();
  const pulse = useSharedValue(1);
  React.useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withTiming(BREATHE_SCALE, { duration: BREATHE_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduced, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const corner = (position: object) => <View style={[{ position: "absolute", width: CORNER, height: CORNER, borderColor: color }, position]} />;
  return (
    <Animated.View style={[{ width: FRAME, height: FRAME }, style]} pointerEvents="none">
      {corner({ top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderTopLeftRadius: CORNER_RADIUS })}
      {corner({ top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderTopRightRadius: CORNER_RADIUS })}
      {corner({ bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderBottomLeftRadius: CORNER_RADIUS })}
      {corner({ bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderBottomRightRadius: CORNER_RADIUS })}
    </Animated.View>
  );
}

/** Why a code cannot be paid here, in the person's words, with its one fix. */
export function PayCodeProblem({ view, onAgain }: { view: Extract<PayCodeView, { status: "unsupported" }>; onAgain?: (() => void) | undefined }) {
  const { t } = useT();
  const { switchNetwork, busy } = useNetworkSwitch();
  const networkName = view.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const text =
    view.reason === "other_network"
      ? t("scan.otherNetwork", { network: networkName })
      : view.reason === "other_chain"
        ? view.chainName
          ? t("scan.otherChain", { chain: view.chainName })
          : t("scan.otherChainUnknown")
        : view.reason === "unsupported_asset"
          ? t("scan.unsupportedAsset")
          : view.reason === "request_closed"
            ? t("scan.requestClosed")
            : view.reason === "not_found"
              ? t("scan.notFound")
              : t("scan.notPayment");
  return (
    <Animated.View entering={FadeIn} className="bg-card border-border gap-3 rounded-[26px] border p-4">
      <Text accessibilityRole="alert" className={cn("text-foreground text-base leading-6", TEXT_START)}>
        {text}
      </Text>
      <View className="flex-row gap-2">
        {view.reason === "other_network" && view.network ? (
          <Button className="flex-1" disabled={busy} onPress={() => void switchNetwork(view.network!).then(() => onAgain?.())}>
            <Text>{t("network.switchTo", { network: networkName })}</Text>
          </Button>
        ) : null}
        {onAgain ? (
          <Button className="flex-1" variant="secondary" onPress={onAgain}>
            <Text>{t("scan.again")}</Text>
          </Button>
        ) : null}
      </View>
    </Animated.View>
  );
}

export function Scanner({
  origin,
  onClose,
  onOpened,
  onCode,
}: {
  origin: ScanOrigin;
  onClose: () => void;
  /** After it opened a flow (the modal closes itself; the scan page was replaced). */
  onOpened?: (() => void) | undefined;
  onCode?: ((code: string) => boolean) | undefined;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const [torch, setTorch] = React.useState(false);
  const { read, reset, busy, result, failed } = usePayCode();
  const open = useOpenPayCode(origin);

  const handle = React.useCallback(
    async (code: string) => {
      // The chat takes the code itself (the agent reads it); everywhere else Kawase resolves it here.
      if (onCode?.(code)) return;
      const view = await read(code);
      if (view && open(view)) onOpened?.();
    },
    [onCode, read, open, onOpened],
  );

  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) await handle(text);
  };

  const granted = permission?.granted === true;
  return (
    <View className="flex-1 bg-black">
      {granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={busy || result ? undefined : (scan) => void handle(scan.data)}
        />
      ) : null}
      <View className="flex-row items-center justify-between px-4" style={{ paddingTop: insets.top + EDGE }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} className="size-11 items-center justify-center rounded-full bg-black/50">
          <Icon as={X} className="size-5 text-white" />
        </Pressable>
        {granted && Platform.OS !== "web" ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel={t("scan.torch")}
            onPress={() => setTorch((on) => !on)}
            className="size-11 items-center justify-center rounded-full bg-black/50"
          >
            <Icon as={torch ? FlashlightOff : Flashlight} className="size-5 text-white" />
          </Pressable>
        ) : null}
      </View>

      <View className="flex-1 items-center justify-center px-8">
        {granted ? (
          <Viewfinder color={VIEWFINDER} />
        ) : permission ? (
          <View className="items-center gap-4">
            <Icon as={ScanLine} className="size-10 text-white" />
            <Text className="text-center text-base leading-6 text-white">{permission.canAskAgain ? t("scan.allowBody") : t("scan.deniedBody")}</Text>
            <Button onPress={() => void (permission.canAskAgain ? request() : Linking.openSettings())}>
              <Text>{permission.canAskAgain ? t("scan.allow") : t("scan.openSettings")}</Text>
            </Button>
          </View>
        ) : (
          <ActivityIndicator color="white" />
        )}
      </View>

      <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + EDGE }}>
        {result?.status === "unsupported" ? (
          <PayCodeProblem view={result} onAgain={reset} />
        ) : (
          <View className="items-center gap-1">
            <Text className="font-display text-center text-xl font-bold text-white">{t("scan.title")}</Text>
            <Text className="text-center text-sm text-white/70">{busy ? t("scan.reading") : failed ? t("scan.failed") : t("scan.body")}</Text>
          </View>
        )}
        <Button variant="secondary" onPress={() => void paste()} disabled={busy}>
          <Icon as={ClipboardPaste} className="size-4" />
          <Text>{t("scan.paste")}</Text>
        </Button>
      </View>
    </View>
  );
}
