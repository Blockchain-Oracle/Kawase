// The receipt (Fomo F13/F14 tall detail sheet): the amount large and signed, who it was with, then the facts —
// network, time, status and the transaction, which copies and opens on ArcScan. Everything comes from the chain's
// own record; nothing about the account's internals is shown.
import * as Clipboard from "expo-clipboard";
import { Copy, ExternalLink } from "lucide-react-native";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { ActivityItem } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { Amount } from "@kawase/ui-native/components/amount";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { CounterpartyAvatar, shortAddress, useCounterpartyName, useSignedAmount } from "@/activity/activity-row";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useThemeColors } from "@/theme/use-theme-colors";

const AVATAR = 64;
const NETWORK_MARK = 22;

export function ReceiptSheet({ item, onClose }: { item: ActivityItem | undefined; onClose: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const name = useCounterpartyName();
  const signed = useSignedAmount();

  const copyHash = async () => {
    if (!item) return;
    await Clipboard.setStringAsync(item.txHash);
    toast(t("activity.hashCopied"));
  };

  return (
    <Sheet
      open={Boolean(item)}
      onClose={onClose}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
      className="gap-5"
    >
      {item ? (
        <>
          <View className="items-center gap-3 pt-2">
            <CounterpartyAvatar item={item} size={AVATAR} />
            <Text className="text-muted-foreground text-base">{item.direction === "in" ? t("activity.fromName", { name: name(item) }) : t("activity.toName", { name: name(item) })}</Text>
            <Amount className={item.direction === "in" ? "text-success text-4xl font-semibold" : "text-foreground text-4xl font-semibold"}>{signed(item)}</Amount>
          </View>
          <ListGroup>
            <ListRow
              title={t("settings.network")}
              trailing={
                <View className="flex-row items-center gap-2">
                  <Mark entity={arcIdentity(item.network).chain} size={NETWORK_MARK} />
                  <Text className="text-foreground text-base">{item.network === "testnet" ? t("network.arcTestnet") : t("network.arc")}</Text>
                </View>
              }
            />
            <ListRow title={t("activity.when")} trailing={<Text className="text-foreground text-base">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.at))}</Text>} />
            <ListRow
              title={t("activity.status")}
              trailing={
                <View className="bg-success/15 rounded-full px-2.5 py-1">
                  <Text className="text-success text-xs font-semibold">{t("activity.confirmed")}</Text>
                </View>
              }
            />
            {item.counterpartyLabel === null ? <ListRow title={item.direction === "in" ? t("activity.fromAddress") : t("activity.toAddress")} trailing={<Amount className="text-foreground text-sm">{shortAddress(item.counterparty)}</Amount>} /> : null}
            <ListRow
              title={t("activity.transaction")}
              trailing={
                <View className="flex-row items-center gap-1.5">
                  <Amount className="text-foreground text-sm">{shortAddress(item.txHash)}</Amount>
                  <Icon as={Copy} className="text-muted-foreground size-4" />
                </View>
              }
              accessibilityLabel={t("activity.copyHash")}
              onPress={() => void copyHash()}
            />
          </ListGroup>
          <Button variant="secondary" onPress={() => void Linking.openURL(item.explorerUrl)}>
            <Icon as={ExternalLink} className="size-4" />
            <Text>{t("activity.viewExplorer")}</Text>
          </Button>
        </>
      ) : null}
    </Sheet>
  );
}
