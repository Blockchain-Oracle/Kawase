// One invoice (cards/agent-business.md): its number and status (open, partly paid, paid, overdue, cancelled), the
// client, the lines, what is paid and what is left, each payment with how it was matched (its on-chain reference or
// the link) and its transaction; Send link, PDF, and Cancel. While it is open it is read again every few seconds.
import { useLocalSearchParams } from "expo-router";
import { ExternalLink, FileDown, Share2 } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import { toast } from "sonner-native";
import { arc, arcTestnet } from "viem/chains";

import type { InvoiceView } from "@kawase/api-client";
import { amount as toAmount, formatAmount, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { shareInvoiceLink, shareInvoicePdf } from "@/business/share-invoice";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";

import { useInvoiceStatus } from "./business-screen";

const POLL_MS = 5_000;
const SKELETON_HEIGHT = 200;
const EXPLORER = { testnet: `${arcTestnet.blockExplorers?.default.url ?? ""}/tx/`, mainnet: `${arc.blockExplorers?.default.url ?? ""}/tx/` } as const;

export function InvoiceScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const status = useInvoiceStatus();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [invoice, setInvoice] = React.useState<InvoiceView>();
  const [busy, setBusy] = React.useState(false);

  const read = React.useCallback(async () => {
    const found = await api.business.invoice(id).catch(() => undefined);
    if (found) setInvoice(found.invoice);
  }, [id]);
  React.useEffect(() => {
    void read();
  }, [read]);
  const open = invoice?.status === "open" || invoice?.status === "partially_paid";
  React.useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => void read(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, read]);

  if (!invoice) {
    return (
      <Page title={t("business.invoice")}>
        <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
      </Page>
    );
  }
  const money = (baseUnits: string) => formatAmount(toAmount(invoice.asset as AssetId, BigInt(baseUnits)), locale);
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

  const cancel = async () => {
    setBusy(true);
    try {
      setInvoice((await api.business.cancelInvoice(invoice.id)).invoice);
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={invoice.number}>
      <View className="bg-card border-border gap-2 rounded-3xl border p-5">
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("business.billedTo", { name: invoice.clientName, date: day(invoice.dueAt) })}</Text>
        <Amount className="text-foreground text-4xl font-semibold">{money(invoice.total)}</Amount>
        <Text className={cn("text-sm font-semibold", invoice.status === "paid" ? "text-success" : invoice.overdue ? "text-destructive" : "text-muted-foreground", TEXT_START)}>
          {status(invoice)}
          {invoice.status === "partially_paid" ? ` · ${t("business.paidSoFar", { paid: money(invoice.paid), left: money(invoice.remaining) })}` : ""}
        </Text>
      </View>
      <Section title={t("business.lines")}>
        <ListGroup>
          {invoice.lines.map((line, index) => (
            <ListRow
              key={`${index}-${line.description}`}
              title={line.description}
              subtitle={line.quantity > 1 ? `${line.quantity} × ${money(line.unitAmount)}` : undefined}
              trailing={<Amount className="text-foreground text-sm">{money((BigInt(line.unitAmount) * BigInt(line.quantity)).toString())}</Amount>}
            />
          ))}
        </ListGroup>
      </Section>
      {invoice.payments.length > 0 ? (
        <Section title={t("business.payments")}>
          <ListGroup>
            {invoice.payments.map((payment) => (
              <ListRow
                key={payment.txHash}
                title={money(payment.amount)}
                subtitle={`${day(payment.at)} · ${payment.via === "memo" ? t("business.viaReference") : t("business.viaLink")}`}
                trailing={<Icon as={ExternalLink} className="text-muted-foreground size-4" />}
                onPress={() => void Linking.openURL(`${EXPLORER[invoice.network]}${payment.txHash}`)}
              />
            ))}
          </ListGroup>
        </Section>
      ) : null}
      {invoice.status !== "canceled" && invoice.link && invoice.token ? (
        <View className="gap-2">
          <View className="flex-row gap-2">
            <Button className="flex-1" onPress={() => void shareInvoiceLink({ number: invoice.number, link: invoice.link!, message: t("business.shareMessage", { number: invoice.number, amount: money(invoice.remaining) }) })}>
              <Icon as={Share2} className="text-primary-foreground size-4" />
              <Text>{t("business.sendLink")}</Text>
            </Button>
            <Button className="flex-1" variant="secondary" onPress={() => void shareInvoicePdf({ token: invoice.token!, number: invoice.number }).catch(() => toast(t("common.error")))}>
              <Icon as={FileDown} className="size-4" />
              <Text>{t("business.pdf")}</Text>
            </Button>
          </View>
          {open ? (
            <Button variant="ghost" disabled={busy} onPress={() => void cancel()}>
              <Text className="text-destructive">{t("business.cancelInvoice")}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
      <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("business.referenceNote")}</Text>
    </Page>
  );
}
