// Money that came in (I3, plan §A.4.11): the receipt slip itself, then who sent it — the contact it already is, or the
// address with Save beside it (saved from the payment itself, marked "received" so its trust starts from that) — and
// share the receipt. Never offered as a
// suggestion to pay back automatically (I3: recipients are never picked from history for the person).
import { BadgeCheck, UserPlus } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { Contact } from "@kawase/api-client";
import { amount, formatAmount, type AssetId } from "@kawase/money";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

import { ReceiptSlip } from "./receipt-slip";
import { ShareReceiptButton } from "./share-receipt";

const HEAD = 6;
const TAIL = 4;
const AVATAR = 40;

export function IncomingActions({
  from,
  amountBase,
  asset,
  network,
  at,
  txHash,
  explorerUrl,
}: {
  from: string;
  amountBase: string;
  asset: string;
  network: "mainnet" | "testnet";
  at: string;
  txHash: string;
  explorerUrl: string | null;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const { status } = useSession();
  const [known, setKnown] = React.useState<Contact | null>();
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (status !== "account") return;
    api.contacts
      .list()
      .then(({ contacts }) => setKnown(contacts.find((contact) => contact.addresses.some((entry) => entry.address.toLowerCase() === from.toLowerCase())) ?? null))
      .catch(() => setKnown(null));
  }, [from, status]);

  const short = `${from.slice(0, HEAD)}…${from.slice(-TAIL)}`;
  const money = asset === "USDC" || asset === "EURC" ? formatAmount(amount(asset as AssetId, BigInt(amountBase)), locale) : `${amountBase} ${asset}`;
  const receipt = { direction: "received" as const, amount: money, counterparty: known?.displayName ?? short, network, at, txHash, explorerUrl };
  return (
    <View className="gap-4">
      <ReceiptSlip receipt={receipt} />
      {/* Who sent it, always named: the contact it already is, or the address with Save beside it. */}
      <View className="gap-2">
        <Text className={cn("text-muted-foreground px-1 text-sm font-medium", TEXT_START)}>{t("receipt.sender")}</Text>
        <View className="bg-card flex-row items-center gap-3 rounded-3xl px-4 py-3">
          <DefaultAvatar seed={from.toLowerCase()} size={AVATAR} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
              {known ? known.displayName : short}
            </Text>
            <Text numberOfLines={1} className={cn("text-muted-foreground text-sm", TEXT_START)}>
              {known ? short : t("receipt.notSaved")}
            </Text>
          </View>
          {known ? (
            <View className="bg-muted flex-row items-center gap-1 rounded-full px-2.5 py-1">
              <Icon as={BadgeCheck} className="text-foreground size-3.5" />
              <Text className="text-foreground text-xs font-semibold">{t("receipt.saved")}</Text>
            </View>
          ) : known === null && status === "account" ? (
            <Button size="sm" variant="secondary" accessibilityLabel={t("receipt.saveSender")} onPress={() => setSaving(true)}>
              <Icon as={UserPlus} className="size-4" />
              <Text>{t("receipt.saveAs")}</Text>
            </Button>
          ) : null}
        </View>
      </View>
      <ShareReceiptButton receipt={receipt} />
      <AddContactSheet
        open={saving}
        onClose={() => setSaving(false)}
        initialAddress={from}
        initialSource="received"
        onSaved={(contact) => {
          setSaving(false);
          setKnown(contact);
        }}
      />
    </View>
  );
}
