// The Add money hub (money-in.md; surfaces.md "Add money"; journey 9; Fomo F20/F21 / M12 / M16, Solflare S15's
// method rows, 21st Item Action List 28284): every way money gets into the wallet, each row with its availability
// (R2). Buy with Apple Pay / Google Pay / card (Circle Onramp) first; Receive (any token on Arc, the bare-address
// QR); From an exchange — the exchange table's logos, then that exchange's own steps (network "Arc", or Coinbase's
// Base followed by Bring to Arc), with the address to copy; From another chain — Bring to Arc (B1's gasless Relay
// permit), listing the chains where USDC is waiting at the same address; on testnet, "Get test USDC" is Circle's
// faucet dripping to the person's own address, with every state drawn: ready · sending · sent · claimed today ·
// refused (with Circle's own faucet as the way out) · no wallet yet. Nested panels come back as they were.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ArrowDownToLine, ArrowLeftRight, Building2, ChevronRight, Copy, ExternalLink, QrCode } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, type ElsewhereView, type ExchangeView, type FaucetStatus } from "@kawase/api-client";
import { arcIdentity, CHAIN_IDS, entitiesOfKind, exchangeKey } from "@kawase/identity";
import { amount, formatAmount } from "@kawase/money";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { toast } from "sonner-native";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useBuy } from "@/onramp/buy-provider";
import { useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const ROW_MARK = 36;
const CHAIN_MARK = 28;
const ART_WIDTH = 40;
const TILE_MARK = 40;
/** Bring to Arc's chain keys (the /move route and the crosschain api name chains so). */
const CHAIN_KEYS: Record<number, string> = {
  [CHAIN_IDS.base]: "base",
  [CHAIN_IDS.ethereum]: "ethereum",
  [CHAIN_IDS.arbitrum]: "arbitrum",
  [CHAIN_IDS.optimism]: "optimism",
  [CHAIN_IDS.polygon]: "polygon",
  [CHAIN_IDS.avalanche]: "avalanche",
};

type Panel = "root" | "bridge" | "exchanges" | "exchange";
type Faucet =
  | { state: "loading" }
  | { state: "ready"; status: FaucetStatus }
  | { state: "sending" }
  | { state: "sent"; nextAt: string }
  | { state: "claimed"; nextAt: string }
  | { state: "failed"; fallbackUrl: string };

type FundSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Called after test money was sent, so the page behind can watch for the credit. */
  onFunded: () => void;
};

export function FundSheet({ open, onClose, onFunded }: FundSheetProps) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const signIn = useSignIn();
  const buy = useBuy();
  const { status, user } = useSession();
  const { wallet } = useWalletStatus();
  const [panel, setPanel] = React.useState<Panel>("root");
  const [faucet, setFaucet] = React.useState<Faucet>({ state: "loading" });
  const [exchanges, setExchanges] = React.useState<ExchangeView[]>([]);
  const [exchange, setExchange] = React.useState<ExchangeView>();
  const [elsewhere, setElsewhere] = React.useState<ElsewhereView>();
  const money = useMoney();

  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const account = status === "account";
  const hasWallet = Boolean(wallet?.address && wallet.networks[network]?.setUp);
  const networkName = testnet ? t("network.arcTestnet") : t("network.arc");
  const ids = arcIdentity(network);
  const sources = entitiesOfKind("chain").filter((entity) => entity.role === "bridge-source" && (entity.environment ?? "mainnet") === network);
  const address = wallet?.address;

  // Each opening starts at the top panel with fresh faucet and capability states.
  React.useEffect(() => {
    if (!open) return;
    setPanel("root");
    void api.withdrawals
      .exchanges()
      .then((result) => setExchanges(result.exchanges))
      .catch(() => undefined);
    if (account)
      void api.crosschain
        .elsewhere()
        .then(setElsewhere)
        .catch(() => setElsewhere(undefined));
    if (!account || !testnet) return;
    setFaucet({ state: "loading" });
    void api.faucet
      .status()
      .then((result) => setFaucet(result.eligible || !result.nextAt ? { state: "ready", status: result } : { state: "claimed", nextAt: result.nextAt }))
      .catch(() => setFaucet({ state: "failed", fallbackUrl: "https://faucet.circle.com" }));
  }, [open, account, testnet, network]);

  const go = (path: "/wallet/receive" | "/wallet") => {
    onClose();
    router.push(path);
  };
  const bringFrom = (chain: string) => {
    onClose();
    if (!account) {
      signIn.open();
      return;
    }
    router.push({ pathname: "/move", params: { direction: "in", chain } });
  };
  const copyAddress = () => {
    if (!address) return;
    void Clipboard.setStringAsync(address).then(() => toast(t("fund.copied")));
  };

  const claim = async () => {
    if (!account) {
      onClose();
      signIn.open();
      return;
    }
    if (!hasWallet) {
      go("/wallet");
      return;
    }
    setFaucet({ state: "sending" });
    try {
      const result = await api.faucet.claim();
      setFaucet({ state: "sent", nextAt: result.nextAt });
      onFunded();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "faucet_claimed_today") {
        setFaucet({ state: "claimed", nextAt: String(failure.problem.nextAt ?? "") });
      } else {
        setFaucet({ state: "failed", fallbackUrl: failure instanceof ApiError && typeof failure.problem.fallbackUrl === "string" ? failure.problem.fallbackUrl : "https://faucet.circle.com" });
      }
    }
  };

  const time = (iso: string) => (iso ? new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "");
  const dripAmounts =
    faucet.state === "ready"
      ? { usdc: formatAmount(amount("USDC", BigInt(faucet.status.amounts.USDC ?? "0")), locale, { withSymbol: false, fractionDigits: 0 }), eurc: formatAmount(amount("EURC", BigInt(faucet.status.amounts.EURC ?? "0")), locale, { withSymbol: false, fractionDigits: 0 }) }
      : undefined;

  const faucetLine = (() => {
    if (!account) return t("fund.testSignIn");
    if (!hasWallet) return t("fund.testSetUpFirst");
    switch (faucet.state) {
      case "loading":
        return t("common.loading");
      case "ready":
        return t("fund.testBody", { usdc: dripAmounts?.usdc ?? "", eurc: dripAmounts?.eurc ?? "" });
      case "sending":
        return t("fund.testSending");
      case "sent":
        return t("fund.testSent");
      case "claimed":
        return t("fund.testClaimed", { time: time(faucet.nextAt) });
      case "failed":
        return t("fund.testFailed");
    }
  })();

  // Bring to Arc is Relay's gasless permit: Relay does not serve Arc Testnet (routes.md), so it is mainnet only.
  const bringBadge = testnet ? t("fund.mainnetOnly") : undefined;
  const waiting = elsewhere?.chains ?? [];
  const supportBadge = (entry: ExchangeView) =>
    entry.unavailable ? t("fund.mainnetOnly") : entry.withdraw === "live" ? undefined : t(`fund.support_${entry.withdraw}`);
  const title = panel === "root" ? t("fund.title") : panel === "bridge" ? t("fund.bridgeTitle") : panel === "exchanges" ? t("fund.exchangeTitle") : (exchange?.name ?? "");
  const subtitle = panel === "root" ? t("fund.subtitle", { network: networkName }) : panel === "bridge" ? t("fund.bridgeSubtitle") : panel === "exchanges" ? t("fund.exchangeSubtitle") : t("fund.exchangeSteps");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
      onBack={panel === "exchange" ? () => setPanel("exchanges") : panel !== "root" ? () => setPanel("root") : undefined}
      backLabel={t("common.back")}
      className="gap-3"
    >
      {panel === "root" ? (
        <>
          {testnet ? (
            <View className="bg-muted gap-3 rounded-3xl p-4">
              <View className="flex-row items-center gap-3">
                <Koban width={ART_WIDTH} id="fund-koban" />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("fund.testTitle")}</Text>
                  <Text accessibilityLiveRegion="polite" className={cn("text-sm", faucet.state === "failed" ? "text-destructive" : faucet.state === "sent" ? "text-success" : "text-muted-foreground", TEXT_START)}>
                    {faucetLine}
                  </Text>
                </View>
              </View>
              {faucet.state === "failed" ? (
                <View className="flex-row gap-2">
                  <Button className="flex-1" variant="secondary" onPress={() => void claim()}>
                    <Text>{t("common.retry")}</Text>
                  </Button>
                  <Button className="flex-1" variant="secondary" onPress={() => void Linking.openURL(faucet.fallbackUrl)}>
                    <Icon as={ExternalLink} className="size-4" />
                    <Text>{t("fund.openCircle")}</Text>
                  </Button>
                </View>
              ) : faucet.state === "sent" || faucet.state === "claimed" ? null : (
                <Button disabled={faucet.state === "sending" || (account && hasWallet && faucet.state === "loading")} onPress={() => void claim()}>
                  {faucet.state === "sending" ? <ActivityIndicator color={colors["primary-foreground"]} /> : <Icon as={ArrowDownToLine} className="text-primary-foreground size-5" />}
                  <Text>{!account ? t("signIn.title") : !hasWallet ? t("wallet.setUp") : t("fund.testClaim")}</Text>
                </Button>
              )}
            </View>
          ) : null}

          <ListGroup>
            {/* Buying is the primary way in (D36): first row, real marks, Circle's checkout. */}
            <ListRow
              leading={<Mark entity="provider:apple" size={ROW_MARK} variant="mono" tint={colors.foreground} disc />}
              title={t("buy.rowTitle")}
              subtitle={t("buy.rowBody")}
              trailing={<Icon as={ChevronRight} className="text-muted-foreground size-5 rtl:-scale-x-100" />}
              onPress={() => {
                onClose();
                buy.open();
              }}
            />
            <ListRow
              leading={<Mark entity={ids.chain} size={ROW_MARK} />}
              title={t("fund.receiveTitle")}
              subtitle={t("fund.receiveBody")}
              trailing={<Icon as={QrCode} className="text-muted-foreground size-5" />}
              onPress={() => go("/wallet/receive")}
            />
            <ListRow
              leading={
                <View className="bg-secondary items-center justify-center rounded-full" style={{ width: ROW_MARK, height: ROW_MARK }}>
                  <Icon as={Building2} className="size-5" />
                </View>
              }
              title={t("fund.exchangeTitle")}
              subtitle={t("fund.exchangeBody")}
              trailing={testnet ? <Badge label={t("fund.mainnetOnly")} /> : undefined}
              chevron
              onPress={() => setPanel("exchanges")}
            />
            <ListRow
              leading={
                <View className="bg-secondary items-center justify-center rounded-full" style={{ width: ROW_MARK, height: ROW_MARK }}>
                  <Icon as={ArrowLeftRight} className="size-5" />
                </View>
              }
              title={t("fund.bridgeTitle")}
              subtitle={waiting.length > 0 ? t("fund.chainWaitingRow", { amount: money("USDC", waiting[0]!.balance), chain: waiting[0]!.name }) : t("fund.bridgeBody")}
              trailing={bringBadge ? <Badge label={bringBadge} /> : undefined}
              chevron
              onPress={() => setPanel("bridge")}
            />
          </ListGroup>
        </>
      ) : panel === "bridge" ? (
        <>
          <ListGroup>
            {sources.map((entity) => {
              const key = CHAIN_KEYS[entity.chainId ?? 0] ?? String(entity.chainId);
              const found = waiting.find((row) => row.chainId === entity.chainId);
              return (
                <ListRow
                  key={entity.id}
                  leading={<Mark entity={entity} size={CHAIN_MARK} variant="mono" tint={colors.foreground} disc />}
                  title={entity.name}
                  subtitle={found ? t("fund.chainWaiting", { amount: money("USDC", found.balance) }) : undefined}
                  trailing={bringBadge ? <Badge label={bringBadge} /> : <Icon as={ChevronRight} className="text-muted-foreground size-4 rtl:-scale-x-100" />}
                  disabled={testnet}
                  onPress={() => bringFrom(found?.key ?? key)}
                />
              );
            })}
          </ListGroup>
          <Text className={cn("text-muted-foreground px-1 text-sm leading-5", TEXT_START)}>{testnet ? t("fund.chainsTestnet") : t("fund.chainsHow")}</Text>
          <Button variant="secondary" onPress={() => go("/wallet/receive")}>
            <Icon as={QrCode} className="size-5" />
            <Text>{t("fund.receiveTitle")}</Text>
          </Button>
        </>
      ) : panel === "exchanges" ? (
        <>
          <View className="flex-row flex-wrap gap-2">
            {exchanges.map((entry) => {
              const badge = supportBadge(entry);
              return (
                <Pressable
                  key={entry.slug}
                  accessibilityRole="button"
                  accessibilityLabel={badge ? `${entry.name}. ${badge}` : entry.name}
                  onPress={() => {
                    setExchange(entry);
                    setPanel("exchange");
                  }}
                  className={cn("bg-muted active:bg-secondary w-[31%] items-center gap-1.5 rounded-2xl py-3", entry.unavailable && "opacity-60")}
                >
                  <Mark entity={exchangeKey(entry.slug)} size={TILE_MARK} />
                  <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
                    {entry.name}
                  </Text>
                  {badge ? (
                    <Text numberOfLines={1} className="text-muted-foreground text-xs">
                      {badge}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Text className={cn("text-muted-foreground px-1 text-sm leading-5", TEXT_START)}>{testnet ? t("fund.exchangesTestnet") : t("fund.exchangeNoEurc")}</Text>
        </>
      ) : exchange ? (
        <>
          <View className="flex-row items-center gap-3">
            <Mark entity={exchangeKey(exchange.slug)} size={ROW_MARK} />
            <Text className={cn("text-foreground min-w-0 flex-1 text-base font-semibold", TEXT_START)}>
              {exchange.chain.key === "arc" ? t("fund.exchangeOnArc", { asset: exchange.asset, network: exchange.networkLabel }) : t("fund.exchangeOnChain", { asset: exchange.asset, chain: exchange.chain.name })}
            </Text>
          </View>
          {exchange.unavailable ? <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("fund.exchangesTestnet")}</Text> : null}
          {exchange.chain.key === "arc" ? (
            <View className="bg-muted gap-2 rounded-3xl p-4">
              <Text className={cn("text-foreground text-sm leading-5", TEXT_START)}>{t("fund.exchangeStep1", { exchange: exchange.name, asset: exchange.asset })}</Text>
              <Text className={cn("text-foreground text-sm leading-5", TEXT_START)}>{t("fund.exchangeStep2", { network: exchange.networkLabel })}</Text>
              <Text className={cn("text-foreground text-sm leading-5", TEXT_START)}>{t("fund.exchangeStep3")}</Text>
            </View>
          ) : (
            <View className="bg-muted gap-2 rounded-3xl p-4">
              <Text className={cn("text-foreground text-sm leading-5", TEXT_START)}>{t("fund.exchangeViaChain", { exchange: exchange.name, asset: exchange.asset, chain: exchange.chain.name })}</Text>
            </View>
          )}
          {address ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("fund.copy")} onPress={copyAddress} className="border-border active:bg-secondary flex-row items-center gap-3 rounded-2xl border px-4 py-3">
              <Text selectable className="text-foreground min-w-0 flex-1 font-mono text-sm">
                {address}
              </Text>
              <Icon as={Copy} className="text-muted-foreground size-4" />
            </Pressable>
          ) : (
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{account ? t("fund.testSetUpFirst") : t("fund.testSignIn")}</Text>
          )}
          {exchange.withdraw !== "live" && !exchange.unavailable ? <Text className={cn("text-warning text-sm leading-5", TEXT_START)}>{t(`fund.supportNote_${exchange.withdraw}`, { exchange: exchange.name })}</Text> : null}
          <Text className={cn("text-muted-foreground px-1 text-xs leading-4", TEXT_START)}>{t("fund.exchangeNoMemo")}</Text>
          {exchange.chain.key === "arc" ? (
            <Button variant="secondary" onPress={() => go("/wallet/receive")}>
              <Icon as={QrCode} className="size-5" />
              <Text>{t("fund.showQr")}</Text>
            </Button>
          ) : (
            <Button disabled={testnet} onPress={() => bringFrom(exchange.chain.key)}>
              <Icon as={ArrowLeftRight} className="text-primary-foreground size-5" />
              <Text>{t("fund.bringFrom", { chain: exchange.chain.name })}</Text>
            </Button>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <View className="bg-secondary rounded-full px-2.5 py-1">
      <Text className="text-muted-foreground text-xs font-semibold">{label}</Text>
    </View>
  );
}
