// propose_lp in the conversation: an Aero deposit quoted (the pool, the range around today's price, what goes in of
// each side, Merkl's reward rate) with the Advanced note, or the person's positions and rewards to withdraw or claim;
// one button opens the LP screen, where they confirm with Face ID. Nothing moves from the card itself (R5).
import { useRouter } from "expo-router";
import { View } from "react-native";
import { formatUnits } from "viem";

import type { ProposeLpOutput } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { LpPositions, LpRiskNote, PairMark, PoolRow, useLpFormat } from "@/lp/lp-parts";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { AgentCard } from "./card";

const MARK = 32;

export function LpCard({ output }: { output: ProposeLpOutput }) {
  const { t } = useT();
  const router = useRouter();
  const { status } = useSession();
  const signIn = useSignIn();
  const format = useLpFormat();
  const { quote } = output;
  const go = (href: string) => (status === "account" ? router.push(href as never) : signIn.open());
  const eyebrow = `${t("lp.title")} · ${t("network.realMoney")}`;

  if (output.action === "deposit" && quote) {
    const { pool } = quote;
    const decimals = pool.token0.symbol === quote.asset ? pool.token0.decimals : pool.token1.decimals;
    const href = `/lp?pool=${encodeURIComponent(pool.address)}&asset=${encodeURIComponent(quote.asset)}&amount=${encodeURIComponent(formatUnits(BigInt(quote.amount), decimals))}`;
    return (
      <AgentCard eyebrow={eyebrow}>
        <View className="flex-row items-center gap-3">
          <PairMark pool={pool} size={MARK} />
          <View className="min-w-0 flex-1">
            <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{`${pool.token0.symbol} · ${pool.token1.symbol}`}</Text>
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("lp.cardRewards", { apr: format.rate(pool.rewardApr) })}</Text>
          </View>
        </View>
        <Text className={cn("text-foreground text-sm", TEXT_START)}>
          {t("lp.cardGoesIn", {
            amount0: format.amount(quote.deposit.amount0, pool.token0.decimals, pool.token0.symbol),
            amount1: format.amount(quote.deposit.amount1, pool.token1.decimals, pool.token1.symbol),
          })}
        </Text>
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("lp.rangeLine", { base: pool.base, range: format.range(quote.range), price: format.price(quote.range.price) })}</Text>
        {quote.reason ? <Text className={cn("text-destructive text-sm", TEXT_START)}>{t(`lp.reason_${quote.reason}`)}</Text> : null}
        <LpRiskNote />
        <Button disabled={Boolean(quote.reason)} onPress={() => go(href)}>
          <Text>{t("lp.reviewDeposit")}</Text>
        </Button>
      </AgentCard>
    );
  }

  return (
    <AgentCard eyebrow={eyebrow}>
      {output.positions ? <LpPositions view={output.positions} busy={false} /> : null}
      {output.action === "deposit" && output.pools.length > 0 ? (
        <View className="border-border overflow-hidden rounded-2xl border">
          {output.pools.map((pool) => (
            <PoolRow key={pool.address} pool={pool} onPress={() => go(`/lp?pool=${encodeURIComponent(pool.address)}`)} />
          ))}
        </View>
      ) : null}
      <Button onPress={() => go("/lp")}>
        <Text>{t(output.action === "claim" ? "lp.openClaim" : output.action === "withdraw" ? "lp.openWithdraw" : "lp.open")}</Text>
      </Button>
    </AgentCard>
  );
}
