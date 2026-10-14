// A guest's Home has no money yet, so it shows what is real without an account (value first, sign last): the markets
// trending on Arc, each with its real mark, price and a sparkline, opening its token page — and one quiet plate that
// says the person's own money appears here after they sign in (never a fake balance). Copycats are left out.
import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { Button, ErrorState, ListRow, LoadingState, Panel, SectionLabel, SIZE, SPACE, Sparkline, TYPE, useTheme } from "@/components/kit";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useMarket } from "@/markets/use-markets";
import { price } from "@/portfolio/format";
import { useFx } from "@/portfolio/use-fx";
import { useSignIn } from "@/sign-in/sign-in-provider";

const ROWS = 5;

export function MarketsGlance() {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const router = useRouter();
  const fx = useFx();
  const { market, loading, error, refresh } = useMarket("trending", "mainnet");
  const rows = (market?.rows ?? []).filter((row) => row.token.status !== "impersonator" && row.token.status !== "lookalike").slice(0, ROWS);
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <SectionLabel>{t("feed.home.markets")}</SectionLabel>
        <Button size="sm" block={false} variant="ghost" label={t("feed.home.seeMarkets")} onPress={() => router.navigate("/markets")} />
      </View>
      {loading && rows.length === 0 ? (
        <LoadingState shape="list" />
      ) : error && rows.length === 0 ? (
        <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={() => void refresh()} variant="strip" />
      ) : (
        <Panel>
          {rows.map((row) => (
            <ListRow
              key={row.token.address}
              title={row.token.symbol}
              detail={row.token.name}
              leading={<TokenMark token={{ chainId: row.token.chainId, address: row.token.address, symbol: row.token.symbol }} size={SIZE.markToken} />}
              trailing={
                <View style={styles.end}>
                  {row.spark ? <Sparkline points={row.spark} /> : null}
                  <Text style={[TYPE.rowPrice, { color: color.ink }]}>{price(row.priceUsd, fx, locale)}</Text>
                </View>
              }
              onPress={() => router.push(`/token/${row.token.chainId}/${row.token.address}`)}
            />
          ))}
        </Panel>
      )}
    </View>
  );
}

/** Where the person's balance and feed will be, once they sign in. */
export function SignInPlate() {
  const { t } = useT();
  const { color } = useTheme();
  const signIn = useSignIn();
  return (
    <Panel>
      <View style={styles.plate}>
        <Text style={[TYPE.bodyStrong, { color: color.ink }]}>{t("feed.home.guestMoney")}</Text>
        <Button label={t("feed.home.signIn")} onPress={signIn.open} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  end: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  plate: { gap: SPACE.md, padding: SPACE.lg },
});
