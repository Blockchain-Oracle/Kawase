// The network pill's sheet (surfaces.md "Network pill sheet"; R8, the Senryo pattern): both networks as two rows,
// each with its own total, the one in use ticked. A row switches to it — the first switch to real money asks for the
// consent first, as the pill does — and the note says what happens to something under review: it stays on the
// network it was made on (the api refuses it from the other one). Opened by holding the pill; a tap on the pill
// stays the one-tap toggle (D15).
import { Check } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NetworkId, NetworkTotalsView } from "@kawase/api-client";
import { CHAIN_IDS, getChainIdentity } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { money } from "@/portfolio/format";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const MARK = 40;
const ORDER: NetworkId[] = ["mainnet", "testnet"];
/** A total older than this says when it was read. */
const STALE_MS = 60_000;
/** The testnet row's mark is a little quieter than the real-money one. */
const TESTNET_MARK_OPACITY = 0.7;

type NetworksSheetProps = {
  open: boolean;
  onClose: () => void;
  network: NetworkId;
  available: NetworkId[];
  onSwitch: (network: NetworkId) => void;
};

export function NetworksSheet({ open, onClose, network, available, onSwitch }: NetworksSheetProps) {
  const { t } = useT();
  const { locale } = useLocale();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { status } = useSession();
  const account = status === "account";
  const [totals, setTotals] = React.useState<NetworkTotalsView>();
  const [failed, setFailed] = React.useState(false);

  // Read each time it opens: the totals are live (a snapshot with its time when a network is slow).
  React.useEffect(() => {
    if (!open || !account) return;
    let alive = true;
    setFailed(false);
    api.portfolio
      .networks()
      .then((view) => alive && setTotals(view))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, account]);

  const arc = getChainIdentity(CHAIN_IDS.arc);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("network.sheetTitle")}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
      className="gap-4"
    >
      <View className="bg-background border-border overflow-hidden rounded-2xl border">
        {ORDER.map((id, index) => {
          const active = id === network;
          const on = available.includes(id);
          const row = totals?.networks.find((entry) => entry.network === id);
          const testnet = id === "testnet";
          const total = !account ? null : row?.totalUsd !== null && row?.totalUsd !== undefined && totals ? (
            <Amount className="text-foreground text-base font-semibold">
              {money(row.totalUsd, totals.fx, locale)}
            </Amount>
          ) : !on ? null : failed || (row && row.totalUsd === null) ? (
            <Text className="text-muted-foreground text-sm">—</Text>
          ) : (
            <Skeleton className="h-5 w-20" />
          );
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, disabled: !on }}
              accessibilityLabel={[
                testnet ? t("network.arcTestnet") : t("network.arc"),
                testnet ? t("network.testMoney") : t("network.realMoney"),
              ].join(", ")}
              disabled={!on || active}
              onPress={() => onSwitch(id)}
              className={cn(
                "active:bg-muted flex-row items-center gap-3 px-4 py-3.5",
                index > 0 && "border-border border-t",
                !on && "opacity-60",
              )}
            >
              <View style={{ opacity: testnet ? TESTNET_MARK_OPACITY : 1 }}>
                {arc ? <Mark entity={arc} size={MARK} /> : null}
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>
                  {testnet ? t("network.arcTestnet") : t("network.arc")}
                </Text>
                <Text className={cn(testnet ? "text-network" : "text-muted-foreground", "text-sm", TEXT_START)}>
                  {!on ? t("network.notYet") : testnet ? t("network.testMoney") : t("network.realMoney")}
                </Text>
              </View>
              <View className="items-end gap-0.5">
                {total}
                {row?.at && row.totalUsd !== null && Date.now() - new Date(row.at).getTime() > STALE_MS ? (
                  <Text className="text-muted-foreground text-xs">
                    {t("network.totalAt", {
                      time: new Date(row.at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }),
                    })}
                  </Text>
                ) : null}
              </View>
              {active ? (
                <Icon as={Check} className="text-primary size-5" strokeWidth={3} />
              ) : (
                <View className="size-5" />
              )}
            </Pressable>
          );
        })}
      </View>
      <Text className={cn("text-muted-foreground px-1 text-sm leading-5", TEXT_START)}>
        {account ? t("network.sheetDrafts") : t("network.signInForMainnet")}
      </Text>
    </Sheet>
  );
}
