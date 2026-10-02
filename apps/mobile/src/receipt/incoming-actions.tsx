// Money that came in (I3, plan §A.4.11): save the sender as a contact — the address from the payment itself, marked
// "received" so its trust starts from that — or show who it already is, and share the receipt. Never offered as a
// suggestion to pay back automatically (I3: recipients are never picked from history for the person).
import { UserPlus } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { Contact } from "@kawase/api-client";
import { amount, formatAmount, type AssetId } from "@kawase/money";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

import { ShareReceiptButton } from "./share-receipt";

const HEAD = 6;
const TAIL = 4;

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
  return (
    <View className="gap-2">
      {known ? (
        <Text className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>{t("receipt.savedAs", { name: known.displayName })}</Text>
      ) : known === null && status === "account" ? (
        <Button variant="secondary" onPress={() => setSaving(true)}>
          <Icon as={UserPlus} className="size-4" />
          <Text>{t("receipt.saveSender")}</Text>
        </Button>
      ) : null}
      <ShareReceiptButton receipt={{ direction: "received", amount: money, counterparty: known?.displayName ?? short, network, at, txHash, explorerUrl }} />
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
