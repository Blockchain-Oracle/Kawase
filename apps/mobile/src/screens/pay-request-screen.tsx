// A payment request link, as whoever opens it sees it — in the app (`kawase://r/<token>`) or in a browser, with or
// without an account (C3, S15). Who asks, how much and in which currency (the real mark), their note, the network
// (the testnet strip when it is test money), and the status, read again every few seconds while it is open. With an
// account the one action is Pay, which opens the send flow filled in and tied to the request; nothing is sent from
// here. Without one: sign in to pay, or pay from any other wallet by sending exactly that amount on Arc to the
// address shown. A paid, cancelled or expired request ends calmly, in words.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Check, ChevronLeft, Copy, Minus, TriangleAlert } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { ApiError, type PublicPaymentRequest } from "@kawase/api-client";
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { NetworkChip, TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { canonicalUnits } from "@/portfolio/ticket-token";
import { RequestTokenMark, requestDecimals, requestFigures } from "@/request/request-token";
import { InvoicePanel } from "@/business/invoice-panel";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { effectiveStatus, requesterName } from "@/request/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 16;
const BRAND_MARK = 28;
const ASSET_MARK = 36;
const ENDING_BADGE = 56;
const ART_WIDTH = 140;
const POLL_MS = 5_000;
const HTTP_NOT_FOUND = 404;
const LTR = { writingDirection: "ltr", textAlign: "left" } as const;

type Load = { state: "loading" } | { state: "ready"; request: PublicPaymentRequest } | { state: "missing" } | { state: "failed" };

export function PayRequestScreen({ token }: { token: string }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { wallet } = useWalletStatus();
  const [load, setLoad] = React.useState<Load>({ state: "loading" });
  const [otherWallet, setOtherWallet] = React.useState(false);

  const read = React.useCallback(async () => {
    try {
      const { request } = await api.requests.open(token);
      setLoad({ state: "ready", request });
    } catch (error) {
      setLoad((current) =>
        current.state === "ready" ? current : error instanceof ApiError && error.status === HTTP_NOT_FOUND ? { state: "missing" } : { state: "failed" },
      );
    }
  }, [token]);

  React.useEffect(() => {
    void read();
  }, [read]);
  const open = load.state === "ready" && effectiveStatus(load.request) === "open";
  React.useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => void read(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, read]);

  const request = load.state === "ready" ? load.request : undefined;
  const testnet = request?.network === "testnet";

  const header = (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        {router.canGoBack() ? (
          <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
            <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
          </Button>
        ) : null}
        <View className="flex-row items-center gap-2">
          <KawaseMark size={BRAND_MARK} />
          <Text className="font-display text-foreground text-lg font-bold">{t("common.appName")}</Text>
        </View>
      </View>
    </>
  );

  if (load.state === "loading") {
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="gap-4 px-5 pt-8">
          <Skeleton className="h-6 w-40 self-center rounded-md" />
          <Skeleton className="h-16 w-56 self-center rounded-xl" />
          <Skeleton className="h-14 rounded-2xl" />
        </View>
      </View>
    );
  }
  if (!request) {
    const missing = load.state === "missing";
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="flex-1" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <EmptyState
            art={<Koban width={ART_WIDTH} />}
            title={missing ? t("pay.notFoundTitle") : t("pay.loadFailed")}
            body={missing ? t("pay.notFoundBody") : undefined}
            action={
              missing ? undefined : (
                <Button onPress={() => void read()}>
                  <Text>{t("common.retry")}</Text>
                </Button>
              )
            }
          />
        </View>
      </View>
    );
  }

  const asset = request.asset;
  const requested = { ...request, assetToken: request.assetToken };
  const name = requesterName(request.requester);
  const amountText = requestFigures(requested, locale, true);
  const figures = requestFigures(requested, locale);
  const networkName = request.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const current = effectiveStatus(request);
  const own =
    status === "account" &&
    ((user?.handle && request.requester.handle && user.handle.toLowerCase() === request.requester.handle.toLowerCase()) ||
      (wallet?.address && wallet.address.toLowerCase() === request.requester.address.toLowerCase()));

  const pay = () =>
    router.push({
      pathname: "/send",
      params: {
        to: request.requester.handle ? `@${request.requester.handle}` : request.requester.address,
        amount: canonicalUnits(BigInt(request.amount), requestDecimals(requested)),
        asset: asset === "USDC" || asset === "EURC" ? asset : (request.assetToken?.address ?? asset),
        request: request.token,
      },
    });
  const copyAddress = async () => {
    await Clipboard.setStringAsync(request.requester.address);
    toast(t("home.addressCopied"));
  };

  const ending =
    current === "paid"
      ? { icon: Check, tone: "success", title: t("pay.paidTitle"), body: t("pay.paidBody") }
      : current === "canceled"
        ? { icon: Minus, tone: "muted", title: t("pay.canceledTitle"), body: t("pay.canceledBody", { name }) }
        : current === "expired"
          ? { icon: Minus, tone: "muted", title: t("pay.expiredTitle"), body: t("pay.expiredBody", { name }) }
          : undefined;

  return (
    <View className="bg-background flex-1">
      {header}
      <ScrollView contentContainerClassName="gap-5 px-5 pt-8" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <View className="items-center gap-2">
          <Text className="text-muted-foreground text-base">{t("request.requests", { name })}</Text>
          <View className="flex-row items-center gap-3" style={{ direction: "ltr" }}>
            <RequestTokenMark request={requested} size={ASSET_MARK} />
            <Text accessibilityLabel={amountText} className="font-display text-foreground text-5xl font-bold" style={{ fontVariant: ["tabular-nums"] }}>
              {figures}
            </Text>
            <Text className="font-display text-muted-foreground text-xl font-semibold">{asset}</Text>
          </View>
          {request.note ? <Text className="text-foreground text-center text-base">“{request.note}”</Text> : null}
          <NetworkChip label={networkName} />
        </View>
        <InvoicePanel token={request.token} payable={!ending && !own} />

        {ending ? (
          <View accessibilityLiveRegion="polite" className="items-center gap-3 py-4">
            <View
              className={cn("items-center justify-center rounded-full", ending.tone === "success" ? "bg-success/15" : "bg-muted")}
              style={{ width: ENDING_BADGE, height: ENDING_BADGE }}
            >
              <Icon as={ending.icon} className={cn("size-6", ending.tone === "success" ? "text-success" : "text-muted-foreground")} />
            </View>
            <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
              {ending.title}
            </Text>
            <Text className="text-muted-foreground text-center text-base">{ending.body}</Text>
          </View>
        ) : own ? (
          <View className="bg-muted rounded-2xl px-4 py-3">
            <Text className={cn("text-foreground text-base", TEXT_START)}>{t("pay.ownRequest")}</Text>
          </View>
        ) : (
          <View className="gap-3">
            {status === "account" ? (
              <Button size="lg" onPress={pay}>
                <Text>{t("pay.pay", { amount: amountText })}</Text>
              </Button>
            ) : (
              <Button size="lg" onPress={() => signIn.open()}>
                <Text>{t("pay.signInToPay")}</Text>
              </Button>
            )}
            <Button variant="ghost" accessibilityState={{ expanded: otherWallet }} onPress={() => setOtherWallet((shown) => !shown)}>
              <Text className="text-muted-foreground">{t("pay.otherWallet")}</Text>
            </Button>
            {otherWallet ? (
              <View className="bg-card border-border gap-3 rounded-3xl border p-4">
                <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>
                  {t("pay.otherWalletBody", { amount: amountText, network: networkName })}
                </Text>
                <View className="bg-muted flex-row items-center gap-2 rounded-2xl py-1 pe-1 ps-4">
                  {/* The whole address, selectable and left-to-right, for checking character by character. */}
                  <Text selectable className="text-foreground min-w-0 flex-1 font-mono text-sm leading-5" style={LTR}>
                    {request.requester.address}
                  </Text>
                  <Button variant="ghost" size="sm" accessibilityLabel={t("receive.copy")} onPress={() => void copyAddress()}>
                    <Icon as={Copy} className="size-4" />
                  </Button>
                </View>
                <View className="flex-row items-start gap-2">
                  <Icon as={TriangleAlert} className="text-muted-foreground mt-0.5 size-4" />
                  <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("receive.warning")}</Text>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
