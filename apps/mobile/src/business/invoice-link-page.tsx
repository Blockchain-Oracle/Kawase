// An invoice link in a token other than USDC or EURC (`/r/<invoice token>`, R1): there is no payment request behind it,
// so the page is the invoice itself — who bills, what is left in its own token (the token's real mark), the lines and
// the PDF (InvoicePanel), and the ways to pay: a browser wallet with the on-chain reference, or any wallet by sending
// that token on Arc to the address shown. Read again every few seconds while it is open; paid or cancelled ends calmly.
import * as Clipboard from "expo-clipboard";
import { Check, Copy, Minus, TriangleAlert } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { InvoicePublicView } from "@kawase/api-client";
import { arcIdentity, CHAIN_IDS } from "@kawase/identity";
import { formatTokenAmount } from "@kawase/money";
import { NetworkChip } from "@kawase/ui-native/components/network-chip";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";

import { InvoicePanel } from "./invoice-panel";

const ASSET_MARK = 36;
const ENDING_BADGE = 56;
const FOOTER_GAP = 16;
const POLL_MS = 5_000;
const LTR = { writingDirection: "ltr", textAlign: "left" } as const;

export function InvoiceLinkPage({ token, invoice: first }: { token: string; invoice: InvoicePublicView }) {
  const { t } = useT();
  const { locale } = useLocale();
  const insets = useSafeAreaInsets();
  const [invoice, setInvoice] = React.useState(first);
  const [otherWallet, setOtherWallet] = React.useState(false);
  const open = invoice.status === "open" || invoice.status === "partially_paid";

  React.useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => {
      void api.business
        .publicInvoice(token)
        .then((found) => setInvoice(found.invoice))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, token]);

  const ids = arcIdentity(invoice.network);
  const left = formatTokenAmount(BigInt(invoice.remaining), invoice.decimals, invoice.asset, locale);
  const figures = formatTokenAmount(BigInt(invoice.remaining), invoice.decimals, invoice.asset, locale, { withSymbol: false });
  const networkName = invoice.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const chainId = invoice.pay?.chainId ?? (invoice.network === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet);
  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    toast(t("home.addressCopied"));
  };
  const ending =
    invoice.status === "paid"
      ? { icon: Check, success: true, title: t("pay.paidTitle"), body: t("pay.paidBody") }
      : invoice.status === "canceled"
        ? { icon: Minus, success: false, title: t("pay.canceledTitle"), body: t("pay.canceledBody", { name: invoice.business.name }) }
        : undefined;

  return (
    <ScrollView contentContainerClassName="gap-5 px-5 pt-8" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
      <View className="items-center gap-2">
        <Text className="text-muted-foreground text-base">{t("request.requests", { name: invoice.business.name })}</Text>
        <View className="flex-row items-center gap-3" style={{ direction: "ltr" }}>
          {invoice.tokenAddress ? <TokenMark token={{ chainId, address: invoice.tokenAddress, symbol: invoice.asset }} chainBadge={ids.chain} size={ASSET_MARK} /> : null}
          <Text accessibilityLabel={left} className="font-display text-foreground text-5xl font-bold" style={{ fontVariant: ["tabular-nums"] }}>
            {figures}
          </Text>
          <Text className="font-display text-muted-foreground text-xl font-semibold">{invoice.asset}</Text>
        </View>
        <NetworkChip label={networkName} />
      </View>
      <InvoicePanel token={token} payable={!ending} />
      {ending ? (
        <View accessibilityLiveRegion="polite" className="items-center gap-3 py-4">
          <View className={cn("items-center justify-center rounded-full", ending.success ? "bg-success/15" : "bg-muted")} style={{ width: ENDING_BADGE, height: ENDING_BADGE }}>
            <Icon as={ending.icon} className={cn("size-6", ending.success ? "text-success" : "text-muted-foreground")} />
          </View>
          <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
            {ending.title}
          </Text>
          <Text className="text-muted-foreground text-center text-base">{ending.body}</Text>
        </View>
      ) : (
        <View className="gap-3">
          <Button variant="ghost" accessibilityState={{ expanded: otherWallet }} onPress={() => setOtherWallet((shown) => !shown)}>
            <Text className="text-muted-foreground">{t("pay.otherWallet")}</Text>
          </Button>
          {otherWallet ? (
            <View className="bg-card border-border gap-3 rounded-3xl border p-4">
              <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{t("pay.otherWalletBody", { amount: left, network: networkName })}</Text>
              <View className="bg-muted flex-row items-center gap-2 rounded-2xl py-1 pe-1 ps-4">
                <Text selectable className="text-foreground min-w-0 flex-1 font-mono text-sm leading-5" style={LTR}>
                  {invoice.payTo}
                </Text>
                <Button variant="ghost" size="sm" accessibilityLabel={t("receive.copy")} onPress={() => void copy(invoice.payTo)}>
                  <Icon as={Copy} className="size-4" />
                </Button>
              </View>
              {invoice.tokenAddress ? (
                <View className="gap-1">
                  <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("business.tokenContract", { asset: invoice.asset })}</Text>
                  <Text selectable className="text-muted-foreground font-mono text-xs" style={LTR}>
                    {invoice.tokenAddress}
                  </Text>
                </View>
              ) : null}
              <View className="flex-row items-start gap-2">
                <Icon as={TriangleAlert} className="text-muted-foreground mt-0.5 size-4" />
                <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("receive.warning")}</Text>
              </View>
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
