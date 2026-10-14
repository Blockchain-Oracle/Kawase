// Aero LP (earn-borrow.md "Aero LP + Merkl rewards"; surfaces.md:181): the three pools with Merkl's reward rate and
// size, the person's positions (value, range, in or out of it) with Withdraw, and Merkl's rewards with Claim. A pool
// opens the deposit: which side of the pair to pay in (USDC by default), the amount on the keypad, and the quote as it
// is typed — the range around today's price, what goes in of each side (the other side bought in the same batch), the
// reward rate and the fee — with the Advanced note on impermanent loss and range risk. One Face ID, one batch. Arc
// mainnet only; on testnet it says so and offers the switch.
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { LpPoolView } from "@kawase/api-client";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { providerKey } from "@kawase/identity";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { LpPositions, LpRiskNote, PoolRow, useLpFormat } from "@/lp/lp-parts";
import { useLpActions, useLpPools, useLpPositions, useLpQuote } from "@/lp/use-lp";
import { applyKey, decimalSeparator, displayAmount, Keypad } from "@/send/keypad";
import { useSession } from "@/session/session-provider";
import { MainnetConsentSheet } from "@/components/network-pill";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

const EDGE_INSET = 12;
const FOOTER_GAP = 16;
const PROVIDER_MARK = 28;
const SKELETON_ROWS = 3;
const SKELETON_HEIGHT = 64;
const AMOUNT_SIZE = 44;
/** The keypad takes at most this many decimals, whatever the asset carries (WETH has 18). */
const INPUT_DECIMALS = 8;
const USDC_DECIMALS = 6;
const NONE = 0n;

export type LpPrefill = { pool?: string | undefined; asset?: string | undefined; amount?: string | undefined };

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{label}</Text>
      <Text className={cn("text-foreground flex-1 text-end text-sm", strong ? "font-semibold" : "")}>{value}</Text>
    </View>
  );
}

export function LpScreen({ prefill }: { prefill: LpPrefill }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const networkSwitch = useNetworkSwitch();
  const format = useLpFormat();
  const pools = useLpPools();
  const positions = useLpPositions();
  const actions = useLpActions(() => void positions.refresh());
  const [chosen, setChosen] = React.useState<string | undefined>(prefill.pool);
  const pool = pools?.find((entry) => (chosen ? sameAddress(entry.address, chosen) || entry.pair.toLowerCase() === chosen.toLowerCase() : false));
  const [asset, setAsset] = React.useState<string | undefined>(prefill.asset);
  const [amount, setAmount] = React.useState(prefill.amount ?? "");
  const side = pool ? ([pool.token0, pool.token1].find((token) => token.symbol === asset) ?? ([pool.token0, pool.token1].find((token) => token.symbol === "USDC") ?? pool.token0)) : undefined;
  const { quote, loading } = useLpQuote(pool && side && amount ? { pool: pool.address, asset: side.symbol, amount } : undefined);
  const testnet = user?.activeNetwork === "testnet";

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const back = () => (pool ? setChosen(undefined) : leave());
  const open = (next: LpPoolView) => {
    setChosen(next.address);
    setAsset(undefined);
  };
  const deposit = async () => {
    if (!pool || !side || !quote || quote.reason) return;
    if ((await actions.deposit({ pool: pool.address, asset: side.symbol, amount })) === "done") {
      setChosen(undefined);
      setAmount("");
    }
  };

  const header = (
    <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: insets.top + EDGE_INSET }}>
      <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={back}>
        <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
      </Button>
      <View className="flex-1">
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {pool ? `${pool.token0.symbol} · ${pool.token1.symbol}` : t("lp.title")}
        </Text>
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lp.subtitle")}</Text>
      </View>
      <Mark entity={providerKey("aero")} size={PROVIDER_MARK} />
    </View>
  );

  if (testnet) {
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="gap-3 px-5 py-6">
          <Text className={cn("text-foreground text-base", TEXT_START)}>{t("lp.mainnetOnly")}</Text>
          {networkSwitch.nextAvailable ? (
            <Button disabled={networkSwitch.busy} onPress={() => void networkSwitch.switchNetwork("mainnet")}>
              <Text>{t("lp.switchToMainnet")}</Text>
            </Button>
          ) : null}
        </View>
        <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />
      </View>
    );
  }

  if (pool && side) {
    const other = sameAddress(side.address, pool.token0.address) ? pool.token1 : pool.token0;
    return (
      <View className="bg-background flex-1">
        {header}
        <ScrollView contentContainerClassName="gap-4 px-5 py-4">
          <View className="flex-row gap-2">
            {[pool.token0, pool.token1].map((token) => (
              <Button key={token.address} size="sm" variant={token.address === side.address ? "default" : "secondary"} onPress={() => setAsset(token.symbol)}>
                <Text>{t("lp.payIn", { symbol: token.symbol })}</Text>
              </Button>
            ))}
          </View>
          <Text className="font-display text-foreground text-center font-bold" style={{ fontSize: AMOUNT_SIZE, fontVariant: ["tabular-nums"] }}>
            {`${displayAmount(amount || "0", locale)} ${side.symbol}`}
          </Text>
          {loading ? <Skeleton className="h-28 rounded-2xl" /> : null}
          {quote ? (
            <View className="border-border gap-2 rounded-2xl border px-4 py-3">
              <Row label={t("lp.range")} value={`${pool.base} ${format.range(quote.range)}`} strong />
              <Row label={t("lp.priceNow")} value={format.price(quote.range.price)} />
              <Row label={t("lp.goesIn")} value={`${format.amount(quote.deposit.amount0, pool.token0.decimals, pool.token0.symbol)} + ${format.amount(quote.deposit.amount1, pool.token1.decimals, pool.token1.symbol)}`} />
              {quote.swap ? (
                <Row
                  label={t("lp.buys")}
                  value={t("lp.buysValue", {
                    amount: format.amount(quote.swap.amountIn, quote.swap.decimalsIn, quote.swap.symbolIn),
                    symbol: other.symbol,
                    venues: quote.swap.venues.join(", ") || "KyberSwap",
                  })}
                />
              ) : null}
              <Row label={t("lp.rewardsApr")} value={format.rate(pool.rewardApr)} />
              <Row label={t("margin.networkFee")} value={format.amount(quote.fees.network, USDC_DECIMALS, "USDC")} />
              {quote.reason ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{t(`lp.reason_${quote.reason}`)}</Text> : null}
            </View>
          ) : null}
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lp.howItEarns", { base: pool.base })}</Text>
          <LpRiskNote />
        </ScrollView>
        <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <Keypad decimal={decimalSeparator(locale)} backspaceLabel={t("send.deleteDigit")} onKey={(key) => setAmount((value) => applyKey(value, key, Math.min(side.decimals, INPUT_DECIMALS)))} />
          <Button size="lg" disabled={!quote || Boolean(quote.reason) || actions.busy} onPress={() => void deposit()}>
            <Text>{actions.busy ? t("common.loading") : t("lp.addLiquidity")}</Text>
          </Button>
        </View>
      </View>
    );
  }

  const claimable = (positions.view?.rewards ?? []).some((reward) => BigInt(reward.claimable) > NONE);
  return (
    <View className="bg-background flex-1">
      {header}
      <ScrollView contentContainerClassName="gap-4 px-5 py-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <LpPositions view={positions.view} busy={actions.busy} onWithdraw={(id) => void actions.withdraw(id)} onClaim={claimable ? () => void actions.claim() : undefined} />
        {pools ? (
          <ListGroup label={t("lp.pools")}>
            {pools.map((entry) => (
              <PoolRow key={entry.address} pool={entry} onPress={() => open(entry)} />
            ))}
          </ListGroup>
        ) : (
          <View className="gap-2">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <Skeleton key={index} className="rounded-2xl" style={{ height: SKELETON_HEIGHT }} />
            ))}
          </View>
        )}
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lp.poolsNote")}</Text>
        <LpRiskNote />
      </ScrollView>
    </View>
  );
}
