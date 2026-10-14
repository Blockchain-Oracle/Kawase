// The Add money hub on the Senryo kit (money-in.md; D42; Fomo F20/F21 method rows, 21st Item Action List #28284 and
// cnippet-dev payment-method rows #24917): every way money gets into the wallet, each row with its real marks and its
// availability said in words (R2). On testnet, Test money (Circle's faucet to the person's own address) comes first, with
// every state drawn: ready · sending · sent · claimed today · refused (Circle's own faucet as the way out) · no wallet.
// Then Buy (Apple Pay / Google Pay / card inside Kawase, D42), Receive (the bare QR and the amount QR), From an exchange
// (their marks, then that exchange's own three steps, with the address to copy), From another chain (Bring to Arc: the
// route race on /move picks the venue). Exchanges and other chains move real money: on testnet they say so and offer
// the switch. Nested panels come back to where they were.
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import * as React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { ApiError, type ElsewhereView, type ExchangeView, type FaucetStatus } from "@kawase/api-client";
import { arcIdentity, CHAIN_IDS, entitiesOfKind, exchangeKey } from "@kawase/identity";
import { amount, formatAmount } from "@kawase/money";
import { Mark } from "@kawase/ui-native/components/mark";

import { Button, EmptyState, LoadingState, Skeleton, WaitingText } from "@/components/kit";
import { Check, Icon } from "@/components/kit/icons";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { SheetRow } from "@/components/sheet/SheetRow";
import { notify } from "@/components/toast/notify";
import { MainnetConsentSheet } from "@/components/network-pill";
import { fire } from "@/feedback/fire";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useBuy } from "@/onramp/buy-provider";
import { useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { useWalletStatus } from "@/wallet/use-wallet-status";

import { MarkStack, SheetHeaderRow } from "./sheet-parts";

const CIRCLE_FAUCET = "https://faucet.circle.com";
const TILE_COLUMNS = 3;
const PERCENT = 100;
const TILE_GUTTER_PERCENT = 2;
const TILE_WIDTH = `${Math.floor(PERCENT / TILE_COLUMNS) - TILE_GUTTER_PERCENT}%` as const;
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
  if (!open) return null;
  return (
    <Sheet onClose={onClose} closeLabel={t("fund.closeNamed")} maxHeight={0.92}>
      <FundBody onClose={onClose} onFunded={onFunded} />
    </Sheet>
  );
}

function FundBody({ onClose, onFunded }: Omit<FundSheetProps, "open">) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { color } = useTheme();
  const signIn = useSignIn();
  const buy = useBuy();
  const money = useMoney();
  const { status, user } = useSession();
  const { wallet } = useWalletStatus();
  const networkSwitch = useNetworkSwitch();
  const [panel, setPanel] = React.useState<Panel>("root");
  const [faucet, setFaucet] = React.useState<Faucet>({ state: "loading" });
  const [exchanges, setExchanges] = React.useState<{ state: "loading" } | { state: "ready"; list: ExchangeView[] } | { state: "failed" }>({ state: "loading" });
  const [exchange, setExchange] = React.useState<ExchangeView>();
  const [elsewhere, setElsewhere] = React.useState<ElsewhereView>();

  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const account = status === "account";
  const hasWallet = Boolean(wallet?.address && wallet.networks[network]?.setUp);
  const ids = arcIdentity(network);
  const sources = entitiesOfKind("chain").filter((entity) => entity.role === "bridge-source" && (entity.environment ?? "mainnet") === "mainnet");
  const address = wallet?.address;
  const waiting = elsewhere?.chains ?? [];

  const loadExchanges = React.useCallback(() => {
    setExchanges({ state: "loading" });
    api.withdrawals
      .exchanges()
      .then((result) => setExchanges({ state: "ready", list: result.exchanges }))
      .catch(() => setExchanges({ state: "failed" }));
  }, []);

  // Each opening reads fresh faucet and capability states.
  React.useEffect(() => {
    loadExchanges();
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
      .catch(() => setFaucet({ state: "failed", fallbackUrl: CIRCLE_FAUCET }));
  }, [account, testnet, network, loadExchanges]);

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
    // The move screen races the bridges (RouteList) and brings it to Arc.
    router.push({ pathname: "/move", params: { direction: "in", chain } });
  };
  const copyAddress = () => {
    if (!address) return;
    void Clipboard.setStringAsync(address).then(() => notify.success(t("fund.copied")));
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
      fire("filled", { sound: "received", identity: `faucet:${result.nextAt}` });
      onFunded();
    } catch (failure) {
      fire("fail");
      if (failure instanceof ApiError && failure.code === "faucet_claimed_today") {
        setFaucet({ state: "claimed", nextAt: String(failure.problem.nextAt ?? "") });
      } else {
        setFaucet({ state: "failed", fallbackUrl: failure instanceof ApiError && typeof failure.problem.fallbackUrl === "string" ? failure.problem.fallbackUrl : CIRCLE_FAUCET });
      }
    }
  };

  const time = (iso: string) => (iso ? new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "");
  const drip = (asset: "USDC" | "EURC", status: FaucetStatus) => formatAmount(amount(asset, BigInt(status.amounts[asset] ?? "0")), locale, { withSymbol: false, fractionDigits: 0 });
  const wallets = Platform.OS === "android" ? ["pay:googlepay"] : Platform.OS === "ios" ? ["pay:applepay"] : ["pay:applepay", "pay:googlepay"];
  const exchangeList = exchanges.state === "ready" ? exchanges.list : [];
  const back = { label: t("buy.back"), onPress: () => setPanel(panel === "exchange" ? "exchanges" : "root") };
  const switchButton = testnet ? <Button label={t("fund.switchMainnet")} variant="secondary" loading={networkSwitch.busy} onPress={() => void networkSwitch.switchNetwork("mainnet")} /> : null;

  let body: React.ReactNode;
  if (panel === "root") {
    body = (
      <>
        <SheetHeading title={t("fund.title")} body={t("fund.subtitle", { network: testnet ? t("network.arcTestnet") : t("network.arc") })} />
        {testnet ? <FaucetRow faucet={faucet} account={account} hasWallet={hasWallet} drip={drip} time={time} onClaim={() => void claim()} /> : null}
        <SheetRow
          index={1}
          title={t("buy.rowTitle")}
          detail={t("fund.buyDetail")}
          leading={<MarkStack entities={wallets} />}
          onPress={() => {
            onClose();
            buy.open();
          }}
        />
        <SheetRow index={2} title={t("fund.receiveTitle")} detail={t("fund.receiveBody")} leading={<Mark entity={ids.chain} size={SIZE.markToken} />} onPress={() => go("/wallet/receive")} />
        <SheetRow
          index={3}
          title={t("fund.exchangeTitle")}
          detail={testnet ? t("fund.mainnetOnly") : t("fund.exchangeBody")}
          leading={exchangeList.length > 0 ? <MarkStack entities={exchangeList.map((entry) => exchangeKey(entry.slug))} /> : <Skeleton width={SIZE.markToken} height={SIZE.markToken} radius={RADIUS.pill} />}
          onPress={() => setPanel("exchanges")}
        />
        <SheetRow
          index={4}
          title={t("fund.bridgeTitle")}
          detail={testnet ? t("fund.mainnetOnly") : waiting.length > 0 ? t("fund.chainWaitingRow", { amount: money("USDC", waiting[0]!.balance), chain: waiting[0]!.name }) : t("fund.bridgeBody")}
          leading={<MarkStack entities={sources.map((entity) => entity.id)} />}
          onPress={() => setPanel("bridge")}
        />
      </>
    );
  } else if (panel === "bridge") {
    body = (
      <>
        <SheetHeaderRow title={t("fund.bridgeTitle")} back={back} />
        {sources.map((entity, index) => {
          const key = CHAIN_KEYS[entity.chainId ?? 0] ?? String(entity.chainId);
          const found = waiting.find((row) => row.chainId === entity.chainId);
          return (
            <SheetRow
              key={entity.id}
              index={index}
              title={entity.name}
              detail={found ? t("fund.chainWaiting", { amount: money("USDC", found.balance) }) : testnet ? t("fund.mainnetOnly") : t("fund.bringRow")}
              leading={<Mark entity={entity.id} size={SIZE.markToken} />}
              disabled={testnet}
              onPress={() => bringFrom(found?.key ?? key)}
            />
          );
        })}
        <Text style={[TYPE.meta, styles.center, { color: color.text3 }]}>{testnet ? t("fund.chainsTestnet") : t("fund.chainsHow")}</Text>
        {switchButton}
      </>
    );
  } else if (panel === "exchanges") {
    body = (
      <>
        <SheetHeaderRow title={t("fund.exchangeTitle")} back={back} />
        {exchanges.state === "loading" ? <LoadingState shape="list" /> : null}
        {exchanges.state === "failed" ? <EmptyState why={t("fund.exchangesFailed")} action={{ label: t("common.retry"), onPress: loadExchanges }} size="inline" /> : null}
        <View style={styles.tiles}>
          {exchangeList.map((entry) => {
            const badge = entry.unavailable ? t("fund.mainnetOnly") : entry.withdraw === "live" ? undefined : t(`fund.support_${entry.withdraw}`);
            return (
              <Pressable
                key={entry.slug}
                accessibilityRole="button"
                accessibilityLabel={badge ? `${entry.name}. ${badge}` : entry.name}
                onPress={() => {
                  fire("tick");
                  setExchange(entry);
                  setPanel("exchange");
                }}
                style={({ pressed }) => [styles.tile, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
              >
                <Mark entity={exchangeKey(entry.slug)} size={SIZE.markDetail - SPACE.sm} />
                <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>
                  {entry.name}
                </Text>
                {badge ? (
                  <Text numberOfLines={1} style={[TYPE.meta, { color: color.text3 }]}>
                    {badge}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={[TYPE.meta, styles.center, { color: color.text3 }]}>{testnet ? t("fund.exchangesTestnet") : t("fund.exchangeNoEurc")}</Text>
        {switchButton}
      </>
    );
  } else if (exchange) {
    const onArc = exchange.chain.key === "arc";
    body = (
      <>
        <SheetHeaderRow title={exchange.name} back={back} />
        <View style={styles.exchangeHead}>
          <Mark entity={exchangeKey(exchange.slug)} size={SIZE.markDetail} />
          <Text style={[TYPE.rowTitle, styles.grow, { color: color.ink }]}>
            {onArc ? t("fund.exchangeOnArc", { asset: exchange.asset, network: exchange.networkLabel }) : t("fund.exchangeOnChain", { asset: exchange.asset, chain: exchange.chain.name })}
          </Text>
        </View>
        <View style={[styles.steps, { backgroundColor: color.raised2 }]}>
          {onArc ? (
            <>
              <Text style={[TYPE.body, { color: color.ink }]}>{t("fund.exchangeStep1", { exchange: exchange.name, asset: exchange.asset })}</Text>
              <Text style={[TYPE.body, { color: color.ink }]}>{t("fund.exchangeStep2", { network: exchange.networkLabel })}</Text>
              <Text style={[TYPE.body, { color: color.ink }]}>{t("fund.exchangeStep3")}</Text>
            </>
          ) : (
            <Text style={[TYPE.body, { color: color.ink }]}>{t("fund.exchangeViaChain", { exchange: exchange.name, asset: exchange.asset, chain: exchange.chain.name })}</Text>
          )}
        </View>
        {address ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t("fund.copy")} onPress={copyAddress} style={({ pressed }) => [styles.address, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}>
            <Text selectable style={[TYPE.rowDetail, styles.grow, styles.mono, { color: color.ink }]}>
              {address}
            </Text>
            <Text style={[TYPE.chipLabel, { color: color.link }]}>{t("fund.copy")}</Text>
          </Pressable>
        ) : (
          <Text style={[TYPE.body, { color: color.text2 }]}>{account ? t("fund.testSetUpFirst") : t("fund.testSignIn")}</Text>
        )}
        {exchange.withdraw !== "live" && !exchange.unavailable ? <Text style={[TYPE.rowDetail, { color: color.warn }]}>{t(`fund.supportNote_${exchange.withdraw}`, { exchange: exchange.name })}</Text> : null}
        <Text style={[TYPE.meta, { color: color.text3 }]}>{exchange.unavailable ? t("fund.exchangesTestnet") : t("fund.exchangeNoMemo")}</Text>
        {onArc ? (
          <Button label={t("fund.showQr")} variant="secondary" onPress={() => go("/wallet/receive")} />
        ) : testnet ? (
          switchButton
        ) : (
          <Button label={t("fund.bringFrom", { chain: exchange.chain.name })} onPress={() => bringFrom(exchange.chain.key)} />
        )}
      </>
    );
  }

  return (
    <>
      {body}
      <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />
    </>
  );
}

/** Test money from Circle's faucet: one row with its state in words and the one action it allows. */
function FaucetRow({
  faucet,
  account,
  hasWallet,
  drip,
  time,
  onClaim,
}: {
  faucet: Faucet;
  account: boolean;
  hasWallet: boolean;
  drip: (asset: "USDC" | "EURC", status: FaucetStatus) => string;
  time: (iso: string) => string;
  onClaim: () => void;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const { user } = useSession();
  const ids = arcIdentity(user?.activeNetwork ?? "testnet");
  const line = !account
    ? t("fund.testSignIn")
    : !hasWallet
      ? t("fund.testSetUpFirst")
      : faucet.state === "ready"
        ? t("fund.testBody", { usdc: drip("USDC", faucet.status), eurc: drip("EURC", faucet.status) })
        : faucet.state === "sent"
          ? t("fund.testSent")
          : faucet.state === "claimed"
            ? t("fund.testClaimed", { time: time(faucet.nextAt) })
            : faucet.state === "failed"
              ? t("fund.testFailed")
              : "";
  return (
    <View style={[styles.faucet, { backgroundColor: color.raised2 }]}>
      <View style={styles.faucetHead}>
        <MarkStack entities={[ids.usdc, ids.eurc]} />
        <View style={styles.grow}>
          <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t("fund.testTitle")}</Text>
          {faucet.state === "loading" && account && hasWallet ? (
            <Skeleton width="70%" height={SIZE.skeletonSmall} />
          ) : faucet.state === "sending" ? (
            <WaitingText>{t("fund.testSending")}</WaitingText>
          ) : (
            <Text accessibilityLiveRegion="polite" style={[TYPE.rowDetail, { color: faucet.state === "failed" ? color.down : color.text3 }]}>
              {line}
            </Text>
          )}
        </View>
        {faucet.state === "sent" ? <Icon icon={Check} size={SIZE.icon} tint={color.up} /> : null}
      </View>
      {faucet.state === "failed" ? (
        <View style={styles.faucetActions}>
          <View style={styles.grow}>
            <Button label={t("common.retry")} variant="secondary" size="sm" onPress={onClaim} />
          </View>
          <View style={styles.grow}>
            <Button label={t("fund.openCircle")} variant="secondary" size="sm" onPress={() => void Linking.openURL(faucet.fallbackUrl)} />
          </View>
        </View>
      ) : faucet.state === "sent" || faucet.state === "claimed" ? null : (
        <Button
          label={!account ? t("signIn.title") : !hasWallet ? t("wallet.setUp") : t("fund.testClaim")}
          loading={faucet.state === "sending"}
          disabled={account && hasWallet && faucet.state === "loading"}
          onPress={onClaim}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  center: { textAlign: "center" },
  mono: { fontVariant: ["tabular-nums"] },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm, justifyContent: "space-between" },
  tile: { width: TILE_WIDTH, alignItems: "center", gap: SPACE.xs, paddingVertical: SPACE.md, borderRadius: RADIUS.md },
  exchangeHead: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  steps: { gap: SPACE.sm, padding: SPACE.lg, borderRadius: RADIUS.md },
  address: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.lg, borderRadius: RADIUS.md },
  faucet: { gap: SPACE.md, padding: SPACE.lg, borderRadius: RADIUS.md },
  faucetHead: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  faucetActions: { flexDirection: "row", gap: SPACE.sm },
});
