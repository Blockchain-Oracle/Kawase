// The network pill is the toggle (D15 / A3): one tap switches between Arc and Arc Testnet. It is a switch to
// assistive technology, its label says where a tap goes, and the first switch to mainnet raises the consent
// sheet (S25, in C12's acknowledgment shape: read, tick, then the button). The pill never disappears because the
// user signed in; Settings → Network repeats the same toggle with the explanation. Holding the pill opens both
// networks with their own totals (surfaces.md "Network pill sheet"); assistive tech gets it as a named action.
import { Check } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NetworkChip } from "@kawase/ui-native/components/network-chip";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { NetworksSheet } from "@/components/networks-sheet";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

type NetworkPillProps = {
  className?: string;
};

/** The pill is drawn 24 pt tall; the touch target reaches 44 pt above and below it (not sideways, where the
 * language pill sits close by). */
export const PILL_HIT_SLOP = { top: 10, bottom: 10 } as const;

export function NetworkPill({ className }: NetworkPillProps) {
  const { t } = useT();
  const { network, nextName, busy, toggle, switchNetwork, consentNeeded, acceptMainnet, dismissConsent } = useNetworkSwitch();
  const { availableNetworks } = useSession();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const testnet = network === "testnet";
  return (
    <>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={t("network.switchTo", { network: nextName })}
        accessibilityState={{ checked: !testnet, busy }}
        accessibilityActions={[{ name: "longpress", label: t("network.sheetTitle") }]}
        onAccessibilityAction={(event) => event.nativeEvent.actionName === "longpress" && setSheetOpen(true)}
        hitSlop={PILL_HIT_SLOP}
        onPress={toggle}
        onLongPress={() => setSheetOpen(true)}
        className={cn("active:opacity-70", className)}
      >
        <NetworkChip label={testnet ? t("network.arcTestnet") : t("network.arc")} />
      </Pressable>
      <NetworksSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        network={network}
        available={availableNetworks}
        onSwitch={(target) => {
          // The sheet steps aside first, so the real-money consent (when it is the first time) is the only sheet up.
          setSheetOpen(false);
          void switchNetwork(target);
        }}
      />
      <MainnetConsentSheet open={consentNeeded} busy={busy} onAccept={() => void acceptMainnet()} onClose={dismissConsent} />
    </>
  );
}

type MainnetConsentSheetProps = {
  open: boolean;
  busy: boolean;
  onAccept: () => void;
  onClose: () => void;
};

const CHECK_SIZE = 24;

export function MainnetConsentSheet({ open, busy, onAccept, onClose }: MainnetConsentSheetProps) {
  const { t } = useT();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = React.useState(false);

  // A fresh sheet each time: the tick is not remembered between openings.
  React.useEffect(() => {
    if (!open) setChecked(false);
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("wallet.mainnetConsentTitle")}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }} closeLabel={t("common.close")}
      bottomInset={insets.bottom}
      className="gap-4"
    >
      <StateLabel className="text-muted-foreground text-start">{t("network.realMoney")}</StateLabel>
      <Text className="text-foreground text-base leading-6">{t("wallet.mainnetConsentBody")}</Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={t("network.consentCheck")}
        onPress={() => setChecked((value) => !value)}
        className="flex-row items-center gap-3 py-1"
      >
        <View
          className={cn("items-center justify-center rounded-md border-2", checked ? "bg-primary border-primary" : "border-border")}
          style={{ width: CHECK_SIZE, height: CHECK_SIZE }}
        >
          {checked ? <Icon as={Check} className="text-primary-foreground size-4" strokeWidth={3} /> : null}
        </View>
        <Text className="text-foreground flex-1 text-base">{t("network.consentCheck")}</Text>
      </Pressable>
      <Button size="lg" disabled={!checked || busy} onPress={onAccept}>
        <Text>{t("wallet.mainnetConsentAccept")}</Text>
      </Button>
      <Button variant="ghost" onPress={onClose}>
        <Text className="text-muted-foreground">{t("common.cancel")}</Text>
      </Button>
    </Sheet>
  );
}
