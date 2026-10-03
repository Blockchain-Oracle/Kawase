// Home's "Your assets" and "Positions" (surfaces.md Home §6–7; R1): every token the wallet holds on Arc with its real
// mark, amount, value and 24-hour change, sorted by value; then "On other chains" (Bring to Arc), "Hidden (N)"
// (spam, dust, lookalikes, the person's own choices — each can be shown again), and Explore. Positions are their own
// section (home/positions.tsx). Empty: "Nothing yet" with the ways in.
import { useRouter } from "expo-router";
import { ArrowDownToLine, Compass, Eye, EyeOff, QrCode } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { HoldingView, PortfolioView } from "@kawase/api-client";
import { CHAIN_IDS, getChainIdentity, chainKey } from "@kawase/identity";
import { AssetRow } from "@kawase/ui-native/components/asset-row";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { change, holdingAmount, money } from "@/portfolio/format";
import { tokenChip } from "@/portfolio/token-chip";

type YourAssetsProps = {
  portfolio: PortfolioView | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onAddMoney: () => void;
  onVisibility: (address: string, visibility: "auto" | "shown" | "hidden") => Promise<void>;
};

const SKELETON_ROWS = 3;
const SKELETON_ROW_HEIGHT = 64;
const HIDDEN_KEYS = { spam: "assets.hiddenSpam", dust: "assets.hiddenDust", lookalike: "assets.hiddenLookalike", impersonator: "assets.hiddenImpersonator", chosen: "assets.hiddenChosen" } as const;

export function YourAssets({ portfolio, loading, error, onRetry, onAddMoney, onVisibility }: YourAssetsProps) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [hiddenOpen, setHiddenOpen] = React.useState(false);
  const fx = portfolio?.fx ?? { currency: "USD", perUsd: 1 };
  const openToken = (holding: HoldingView) => router.push(`/token/${holding.token.chainId}/${holding.token.address}`);

  const row = (holding: HoldingView, options: { other?: boolean; hidden?: boolean } = {}) => {
    const chip = options.other
      ? { label: holding.chainName, tone: "muted" as const }
      : options.hidden && holding.hiddenReason
        ? { label: t(HIDDEN_KEYS[holding.hiddenReason]), tone: holding.hiddenReason === "impersonator" ? ("danger" as const) : ("muted" as const) }
        : tokenChip(holding.token, t);
    const changeLabel = change(holding.change24hPct, locale);
    const badge = options.other && getChainIdentity(holding.token.chainId) ? chainKey(holding.token.chainId) : undefined;
    return (
      <AssetRow
        key={`${holding.token.chainId}:${holding.token.address}`}
        token={holding.token}
        amount={holdingAmount(holding, locale)}
        value={money(holding.valueUsd, fx, locale)}
        change24hPct={holding.change24hPct}
        {...(changeLabel ? { changeLabel } : {})}
        {...(chip ? { chip } : {})}
        {...(badge ? { chainBadge: badge } : {})}
        {...(options.other ? {} : { onPress: () => openToken(holding) })}
      />
    );
  };

  if (!portfolio) {
    if (error)
      return (
        <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
          <Text className="text-muted-foreground flex-1 text-sm">{t("assets.loadFailed")}</Text>
          <Button size="sm" variant="secondary" onPress={onRetry}>
            <Text>{t("common.retry")}</Text>
          </Button>
        </View>
      );
    if (!loading) return null;
    return (
      <View className="gap-2">
        <Eyebrow className="px-1">{t("assets.yourAssets")}</Eyebrow>
        <View className="bg-card border-border gap-px overflow-hidden rounded-2xl border">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="rounded-none" style={{ height: SKELETON_ROW_HEIGHT }} />
          ))}
        </View>
      </View>
    );
  }

  const empty = portfolio.assets.length === 0 && portfolio.otherChains.length === 0 && portfolio.positions.length === 0;

  return (
    <>
      <View className="gap-2">
        <Eyebrow className="px-1">{t("assets.yourAssets")}</Eyebrow>
        {empty ? (
          <View className="bg-card border-border gap-3 rounded-2xl border p-5">
            <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("assets.nothingYet")}</Text>
            <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("assets.nothingYetBody")}</Text>
            <View className="flex-row gap-2">
              <Button className="flex-1" onPress={onAddMoney}>
                <Icon as={ArrowDownToLine} className="text-primary-foreground size-5" />
                <Text>{t("assets.addMoney")}</Text>
              </Button>
              <Button variant="secondary" className="flex-1" onPress={() => router.push("/wallet/receive")}>
                <Icon as={QrCode} className="size-5" />
                <Text>{t("assets.receive")}</Text>
              </Button>
            </View>
          </View>
        ) : portfolio.assets.length > 0 ? (
          <ListGroup>{portfolio.assets.map((holding) => row(holding))}</ListGroup>
        ) : null}
        {portfolio.stale ? <Text className="text-muted-foreground px-1 text-xs">{t("assets.pricesFrom", { time: new Date(portfolio.pricedAt).toLocaleTimeString(locale) })}</Text> : null}
      </View>

      {portfolio.otherChains.length > 0 ? (
        <ListGroup label={t("assets.onOtherChains")}>
          {portfolio.otherChains.map((holding) => row(holding, { other: true }))}
          {/* Bring to Arc: from the chain holding the most (gasless where the route allows). */}
          <ListRow title={t("assets.bringToArc")} leading={<Icon as={ArrowDownToLine} className="text-foreground size-5" />} chevron onPress={() => router.push({ pathname: "/move", params: { direction: "in" } })} />
        </ListGroup>
      ) : null}

      {portfolio.hidden.length > 0 ? (
        <View className="gap-2">
          <ListRow
            standalone
            title={t("assets.hiddenCount", { count: portfolio.hidden.length })}
            leading={<Icon as={hiddenOpen ? Eye : EyeOff} className="text-muted-foreground size-5" />}
            onPress={() => setHiddenOpen((open) => !open)}
          />
          {hiddenOpen ? (
            <ListGroup>
              {portfolio.hidden.map((holding) => (
                <View key={`${holding.token.chainId}:${holding.token.address}`} className="flex-row items-center">
                  <View className="flex-1">{row(holding, { hidden: true })}</View>
                  {holding.token.chainId === (portfolio.isTest ? CHAIN_IDS.arcTestnet : CHAIN_IDS.arc) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() => void onVisibility(holding.token.address, "shown")}
                      accessibilityLabel={`${t("assets.show")} ${holding.token.symbol}`}
                    >
                      <Text className="text-foreground">{t("assets.show")}</Text>
                    </Button>
                  ) : null}
                </View>
              ))}
            </ListGroup>
          ) : null}
        </View>
      ) : null}

      <ListRow standalone title={t("assets.explore")} leading={<Icon as={Compass} className="text-foreground size-5" />} chevron onPress={() => router.navigate("/markets")} />
    </>
  );
}
