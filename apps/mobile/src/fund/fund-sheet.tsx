// The fund hub (journey 9; Fomo F20/F21 / M12 / M16, Solflare S15's method rows): every way money gets into the
// wallet, as one compact sheet. Receive on Arc and "from another wallet or exchange" lead to the live QR; Bridge
// opens a nested panel (back chevron, the parent comes back as it was) listing the real source chains with their
// marks and the capability registry's honest state; on testnet, "Get test USDC" is Circle's faucet dripping to the
// person's own address, with every state drawn: ready · sending · sent · claimed today · refused (with Circle's
// own faucet as the way out) · no wallet yet.
import { useRouter } from "expo-router";
import { ArrowDownToLine, ArrowLeftRight, ChevronRight, ExternalLink, QrCode, Wallet as WalletIcon } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, type CapabilityState, type FaucetStatus } from "@kawase/api-client";
import { arcIdentity, entitiesOfKind } from "@kawase/identity";
import { amount, formatAmount } from "@kawase/money";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const ROW_MARK = 36;
const CHAIN_MARK = 28;
const ART_WIDTH = 40;

type Panel = "root" | "bridge";
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
  const { status, user } = useSession();
  const { wallet } = useWalletStatus();
  const [panel, setPanel] = React.useState<Panel>("root");
  const [faucet, setFaucet] = React.useState<Faucet>({ state: "loading" });
  const [bridgeState, setBridgeState] = React.useState<{ state: CapabilityState; reason?: string }>();

  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const account = status === "account";
  const hasWallet = Boolean(wallet?.address && wallet.networks[network]?.setUp);
  const networkName = testnet ? t("network.arcTestnet") : t("network.arc");
  const ids = arcIdentity(network);
  const sources = entitiesOfKind("chain").filter((entity) => entity.role === "bridge-source" && (entity.environment ?? "mainnet") === network);

  // Each opening starts at the top panel with fresh faucet and capability states.
  React.useEffect(() => {
    if (!open) return;
    setPanel("root");
    void api
      .capabilities()
      .then(({ capabilities }) => setBridgeState(capabilities.bridge?.[network]))
      .catch(() => setBridgeState(undefined));
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

  const bridgeBadge = bridgeState?.state === "available" ? undefined : t("fund.coming");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={panel === "root" ? t("fund.title") : t("fund.bridgeTitle")}
      subtitle={panel === "root" ? t("fund.subtitle", { network: networkName }) : t("fund.bridgeSubtitle")}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
      onBack={panel === "bridge" ? () => setPanel("root") : undefined}
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
                  <Icon as={WalletIcon} className="size-5" />
                </View>
              }
              title={t("fund.walletTitle")}
              subtitle={t("fund.walletBody")}
              chevron
              onPress={() => go("/wallet/receive")}
            />
            <ListRow
              leading={
                <View className="bg-secondary items-center justify-center rounded-full" style={{ width: ROW_MARK, height: ROW_MARK }}>
                  <Icon as={ArrowLeftRight} className="size-5" />
                </View>
              }
              title={t("fund.bridgeTitle")}
              subtitle={t("fund.bridgeBody")}
              trailing={bridgeBadge ? <Badge label={bridgeBadge} /> : undefined}
              chevron
              onPress={() => setPanel("bridge")}
            />
          </ListGroup>
        </>
      ) : (
        <>
          <ListGroup>
            {sources.map((entity) => (
              <ListRow
                key={entity.id}
                leading={<Mark entity={entity} size={CHAIN_MARK} variant="mono" tint={colors.foreground} disc />}
                title={entity.name}
                trailing={bridgeBadge ? <Badge label={bridgeBadge} /> : <Icon as={ChevronRight} className="text-muted-foreground size-4 rtl:-scale-x-100" />}
                disabled={bridgeState?.state !== "available"}
              />
            ))}
          </ListGroup>
          {bridgeState?.state !== "available" ? <Text className={cn("text-muted-foreground px-1 text-sm leading-5", TEXT_START)}>{t("fund.bridgeComingBody")}</Text> : null}
          <Button variant="secondary" onPress={() => go("/wallet/receive")}>
            <Icon as={QrCode} className="size-5" />
            <Text>{t("fund.receiveTitle")}</Text>
          </Button>
        </>
      )}
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
