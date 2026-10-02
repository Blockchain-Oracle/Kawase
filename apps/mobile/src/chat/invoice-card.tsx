// The invoice the agent just made ("invoice Acme 500 USDC"): number, client, total and due date, with Send link, PDF
// and Open. A guest or someone without a wallet sees what to do first.
import { useRouter } from "expo-router";
import { FileDown, Share2 } from "lucide-react-native";
import { View } from "react-native";

import type { InvoiceView } from "@kawase/api-client";
import { amount as toAmount, formatAmount, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { shareInvoiceLink, shareInvoicePdf } from "@/business/share-invoice";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { AgentCard } from "./card";

export function InvoiceCard({ output }: { output: { invoice: InvoiceView | null; summary: { status?: unknown } } }) {
  const { t } = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const signIn = useSignIn();
  const invoice = output.invoice;
  if (!invoice) {
    const guest = output.summary.status === "needs_sign_in";
    return (
      <AgentCard eyebrow={t("business.invoice")}>
        <Text className={cn("text-foreground text-base", TEXT_START)}>{guest ? t("request.signInTitle") : t("receive.setUpFirst")}</Text>
        <Button onPress={() => (guest ? signIn.open() : router.push("/wallet"))}>
          <Text>{guest ? t("signIn.title") : t("wallet.setUp")}</Text>
        </Button>
      </AgentCard>
    );
  }
  const money = formatAmount(toAmount(invoice.asset as AssetId, BigInt(invoice.total)), locale);
  const due = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(invoice.dueAt));
  return (
    <AgentCard eyebrow={`${t("business.invoice")} · ${invoice.network === "testnet" ? t("network.arcTestnet") : t("network.arc")}`}>
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className={cn("text-foreground flex-1 text-base font-semibold", TEXT_START)}>{`${invoice.number} · ${invoice.clientName}`}</Text>
        <Amount className="text-foreground text-lg font-semibold">{money}</Amount>
      </View>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("business.dueOn", { date: due })}</Text>
      {invoice.link && invoice.token ? (
        <View className="flex-row gap-2">
          <Button className="flex-1" onPress={() => void shareInvoiceLink({ number: invoice.number, link: invoice.link!, message: t("business.shareMessage", { number: invoice.number, amount: money }) })}>
            <Icon as={Share2} className="text-primary-foreground size-4" />
            <Text>{t("business.sendLink")}</Text>
          </Button>
          <Button className="flex-1" variant="secondary" onPress={() => void shareInvoicePdf({ token: invoice.token!, number: invoice.number })}>
            <Icon as={FileDown} className="size-4" />
            <Text>{t("business.pdf")}</Text>
          </Button>
        </View>
      ) : null}
      <Button variant="ghost" size="sm" onPress={() => router.push({ pathname: "/business/invoice/[id]", params: { id: invoice.id } })}>
        <Text className="text-muted-foreground">{t("business.openInvoice")}</Text>
      </Button>
    </AgentCard>
  );
}
