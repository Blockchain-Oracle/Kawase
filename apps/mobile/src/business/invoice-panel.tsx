// On a payment link that belongs to an invoice (cards/agent-business.md): who bills whom, the number, the lines, the
// due date, what is paid and what is left, the PDF, and — in a browser with a wallet — "Pay with your wallet", which
// sends the payment with the invoice's on-chain reference (Arc Memo) so it is matched to this invoice, partial
// payments included. A plain link (no invoice) shows nothing here.
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import type { InvoicePublicView } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";

import { hasBrowserWallet, payWithBrowserWallet } from "./browser-wallet";
import { shareInvoicePdf } from "./share-invoice";

export function InvoicePanel({ token, payable }: { token: string; payable: boolean }) {
  const { t } = useT();
  const { locale } = useLocale();
  const [invoice, setInvoice] = React.useState<InvoicePublicView>();
  const [busy, setBusy] = React.useState(false);

  const read = React.useCallback(async () => {
    const found = await api.business.publicInvoice(token).catch(() => undefined);
    if (found) setInvoice(found.invoice);
  }, [token]);
  React.useEffect(() => {
    void read();
  }, [read]);

  if (!invoice) return null;
  const money = (baseUnits: string) => formatTokenAmount(BigInt(baseUnits), invoice.decimals, invoice.asset, locale);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(invoice.dueAt));
  const partial = BigInt(invoice.paid) > BigInt(0) && invoice.status !== "paid";

  const pay = async () => {
    if (!invoice.pay) return;
    setBusy(true);
    try {
      await payWithBrowserWallet(invoice.pay);
      toast(t("business.paySent"));
      await read();
    } catch {
      toast(t("business.payFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="bg-card border-border gap-3 rounded-3xl border p-4">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className={cn("text-foreground flex-1 text-base font-semibold", TEXT_START)}>{invoice.business.name}</Text>
        <Text className="text-muted-foreground text-sm">{invoice.number}</Text>
      </View>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("business.billedTo", { name: invoice.clientName, date: day })}</Text>
      <View className="gap-1.5">
        {invoice.lines.map((line, index) => (
          <View key={`${index}-${line.description}`} className="flex-row items-center gap-3">
            <Text className={cn("text-foreground flex-1 text-sm", TEXT_START)}>{line.quantity > 1 ? `${line.description} × ${line.quantity}` : line.description}</Text>
            <Amount className="text-foreground text-sm">{money((BigInt(line.unitAmount) * BigInt(line.quantity)).toString())}</Amount>
          </View>
        ))}
      </View>
      {partial ? (
        <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t("business.paidSoFar", { paid: money(invoice.paid), left: money(invoice.remaining) })}</Text>
      ) : null}
      {payable && invoice.pay && hasBrowserWallet() ? (
        <Button disabled={busy} onPress={() => void pay()}>
          <Text>{busy ? t("common.loading") : t("business.payWithWallet", { amount: money(invoice.remaining) })}</Text>
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" onPress={() => void shareInvoicePdf({ token, number: invoice.number })}>
        <Text className="text-muted-foreground">{t("business.pdf")}</Text>
      </Button>
      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("business.referenceNote")}</Text>
    </View>
  );
}
