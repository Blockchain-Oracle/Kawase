// The receipt (Fomo F13/F14 tall detail sheet): the amount large and signed, who it was with, then the facts —
// network, time, status and the transaction, which copies and opens on ArcScan. Everything comes from the chain's
// own record; nothing about the account's internals is shown. An address that is not a contact and not a wallet
// Kawase knows can be saved as a contact from here (I3: save a contact from a received payment) — the receipt closes
// and the add-contact sheet opens with the address filled in and "from a payment you received" as its source.
import * as Clipboard from "expo-clipboard";
import { Copy, ExternalLink, UserPlus } from "lucide-react-native";
import * as React from "react";
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

import { CounterpartyAvatar, shortAddress, useActivityTitle, useSignedAmount, useSwapPaid } from "@/activity/activity-row";
import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const AVATAR = 64;
const NETWORK_MARK = 22;

export function ReceiptSheet({
  item,
  onClose,
  onContactSaved,
}: {
  item: ActivityItem | undefined;
  onClose: () => void;
  /** After a counterparty was saved as a contact, so the list can show the new name. */
  onContactSaved?: () => void;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const { status } = useSession();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const title = useActivityTitle();
  const paid = useSwapPaid();
  const signed = useSignedAmount();
  const [saving, setSaving] = React.useState<string>();
  const canSave = Boolean(item) && status === "account" && item?.counterpartyLabel === null && !item?.contactName;

  const copyHash = async () => {
    if (!item) return;
    await Clipboard.setStringAsync(item.txHash);
    toast(t("activity.hashCopied"));
  };

  return (
    <>
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
              <Text className="text-muted-foreground text-base">{title(item)}</Text>
              <Amount
                className={
                  item.direction === "in"
                    ? "text-success text-4xl font-semibold"
                    : "text-foreground text-4xl font-semibold"
                }
              >
                {signed(item)}
              </Amount>
              {paid(item) ? <Text className="text-muted-foreground text-base">{paid(item)}</Text> : null}
            </View>
            <ListGroup>
              <ListRow
                title={t("settings.network")}
                trailing={
                  <View className="flex-row items-center gap-2">
                    <Mark entity={arcIdentity(item.network).chain} size={NETWORK_MARK} />
                    <Text className="text-foreground text-base">
                      {item.network === "testnet" ? t("network.arcTestnet") : t("network.arc")}
                    </Text>
                  </View>
                }
              />
              <ListRow
                title={t("activity.when")}
                trailing={
                  <Text className="text-foreground text-base">
                    {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
                      new Date(item.at),
                    )}
                  </Text>
                }
              />
              <ListRow
                title={t("activity.status")}
                trailing={
                  <View className="bg-success/15 rounded-full px-2.5 py-1">
                    <Text className="text-success text-xs font-semibold">{t("activity.confirmed")}</Text>
                  </View>
                }
              />
              {item.counterpartyLabel === null ? (
                <ListRow
                  title={item.direction === "in" ? t("activity.fromAddress") : t("activity.toAddress")}
                  trailing={<Amount className="text-foreground text-sm">{shortAddress(item.counterparty)}</Amount>}
                />
              ) : null}
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
            {canSave ? (
              <Button
                variant="secondary"
                onPress={() => {
                  setSaving(item.counterparty);
                  onClose();
                }}
              >
                <Icon as={UserPlus} className="size-4" />
                <Text>{t("send.saveContact")}</Text>
              </Button>
            ) : null}
            <Button variant="secondary" onPress={() => void Linking.openURL(item.explorerUrl)}>
              <Icon as={ExternalLink} className="size-4" />
              <Text>{t("activity.viewExplorer")}</Text>
            </Button>
          </>
        ) : null}
      </Sheet>
      <AddContactSheet
        open={Boolean(saving)}
        onClose={() => setSaving(undefined)}
        initialAddress={saving}
        initialSource="received"
        onSaved={() => {
          setSaving(undefined);
          onContactSaved?.();
        }}
      />
    </>
  );
}
