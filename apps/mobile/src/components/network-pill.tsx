// The mode capsule (Senryo's ModeCapsule, the network toggle of D15 / A3): one tap switches Mainnet and Testnet, like
// dark and light. It is a switch to assistive technology and its label says where a tap goes. The first switch to
// mainnet raises the consent sheet (S25, in C12's acknowledgment shape: read, tick, then the button). The capsule never
// disappears because the user signed in; Settings → Network repeats the same toggle. Holding it opens both networks with
// their own totals; assistive tech gets that as a named action. The mode is in the words, on neutral plates (never a hue
// wash); a testnet capsule is also outlined, so the difference reads by shape.
import { Check } from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon as KitIcon } from "@/components/kit/icons";
import { Button } from "@/components/kit/Button";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { Sheet, useSheetClose } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { ModeCapsule } from "@/components/shell/ModeCapsule";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { NetworksSheet } from "@/components/networks-sheet";
import { useSession } from "@/session/session-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

/** The capsule is drawn 34 pt tall; its touch target reaches 44 pt above and below it (not sideways, where the language pill sits close by). */
export const PILL_HIT_SLOP = { top: 5, bottom: 5 } as const;

type NetworkPillProps = {
  /** Drops the Arc mark (a ticket header, the compact rail). */
  compact?: boolean;
};

export function NetworkPill({ compact = false }: NetworkPillProps) {
  const { t } = useT();
  const { network, nextName, busy, toggle, switchNetwork, consentNeeded, acceptMainnet, dismissConsent } = useNetworkSwitch();
  const { availableNetworks } = useSession();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  return (
    <>
      <ModeCapsule
        network={network}
        label={network === "testnet" ? t("network.testnet") : t("network.mainnet")}
        switchLabel={t("network.switchTo", { network: nextName })}
        longPressLabel={t("network.sheetTitle")}
        busy={busy}
        compact={compact}
        onToggle={toggle}
        onLongPress={() => setSheetOpen(true)}
      />
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

/** The real-money consent, on the kit's sheet: read, tick, then the button. A fresh sheet each time (the tick is not kept). */
export function MainnetConsentSheet({ open, busy, onAccept, onClose }: MainnetConsentSheetProps) {
  const { t } = useT();
  if (!open) return null;
  return (
    <Sheet onClose={onClose} closeLabel={t("common.close")}>
      <ConsentBody busy={busy} onAccept={onAccept} />
    </Sheet>
  );
}

function ConsentBody({ busy, onAccept }: { busy: boolean; onAccept: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const close = useSheetClose();
  const [checked, setChecked] = React.useState(false);
  return (
    <View style={styles.body}>
      <SheetHeading title={t("wallet.mainnetConsentTitle")} body={t("wallet.mainnetConsentBody")} />
      <Text style={[TYPE.moneyMeta, styles.center, { color: color.text3 }]}>{t("network.realMoney")}</Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={t("network.consentCheck")}
        onPress={() => {
          fire("tick", { sound: "toggle" });
          setChecked((value) => !value);
        }}
        style={styles.check}
      >
        <View style={[styles.box, { borderColor: checked ? color.primary : color.border, backgroundColor: checked ? color.primary : color.transparent }]}>
          {checked ? <KitIcon icon={Check} size={SIZE.iconSm} tint={color.primaryForeground} strokeWidth={3} /> : null}
        </View>
        <Text style={[TYPE.body, styles.grow, { color: color.ink }]}>{t("network.consentCheck")}</Text>
      </Pressable>
      <Button label={t("wallet.mainnetConsentAccept")} disabled={!checked} loading={busy} onPress={onAccept} />
      <Button label={t("common.cancel")} variant="ghost" onPress={() => close()} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.lg },
  center: { textAlign: "center" },
  grow: { flex: 1 },
  check: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingVertical: SPACE.xs, minHeight: SIZE.touch },
  box: { width: CHECK_SIZE, height: CHECK_SIZE, borderRadius: RADIUS.xs, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});
