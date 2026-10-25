// What you hold, on Home itself (Abu, 10-25: "I didn't know that I have this token" — a coin bought from its page showed
// only behind the balance's portfolio sheet). Under the balance, the wallet's biggest holdings on Arc as the same asset
// rows the portfolio sheet draws (real mark, amount, value, the day's change), each opening its token page; "See all"
// opens the sheet with the rest, the hidden ones and other chains. Nothing held, nothing shown: the balance's own empty
// state and the markets speak for an empty wallet.
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import type { HoldingView, PortfolioView } from "@kawase/api-client";
import { AssetRow } from "@kawase/ui-native/components/asset-row";
import { ListGroup } from "@kawase/ui-native/components/list-row";

import { Button, SectionLabel, SIZE, SPACE } from "@/components/kit";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { change, holdingAmount, money } from "@/portfolio/format";
import { tokenChip } from "@/portfolio/token-chip";

/** Rows Home shows before "See all". */
const SHOWN = 4;

export function HomeHoldings({ portfolio, onSeeAll }: { portfolio: PortfolioView | undefined; onSeeAll: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  // Already sorted by value, as the portfolio sheet lists them.
  const held = portfolio?.assets ?? [];
  if (!portfolio || held.length === 0) return null;
  const fx = portfolio.fx;
  const open = (holding: HoldingView) => router.push(`/token/${holding.token.chainId}/${holding.token.address}`);
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <SectionLabel>{t("assets.yourAssets")}</SectionLabel>
        {held.length > SHOWN ? <Button size="sm" block={false} variant="ghost" label={t("feed.home.seeAll")} onPress={onSeeAll} /> : null}
      </View>
      <ListGroup>
        {held.slice(0, SHOWN).map((holding) => {
          const chip = tokenChip(holding.token, t);
          const changeLabel = change(holding.change24hPct, locale);
          return (
            <AssetRow
              key={`${holding.token.chainId}:${holding.token.address}`}
              token={holding.token}
              amount={holdingAmount(holding, locale)}
              value={money(holding.valueUsd, fx, locale)}
              change24hPct={holding.change24hPct}
              {...(changeLabel ? { changeLabel } : {})}
              {...(chip ? { chip } : {})}
              onPress={() => open(holding)}
            />
          );
        })}
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: SIZE.touch },
});
