// A guest's Home has no money yet, so it shows what is real without an account (value first, sign last): the markets
// trending on Arc, each with its real mark, price and a sparkline, opening its token page — and one quiet plate that
// says the person's own money appears here after they sign in (never a fake balance). Copycats are left out. On a wide
// desktop the guest's column is the sign-in stage instead: the venues Kawase reaches, by their real marks, and Sign in
// in the middle of the room the balance and the feed will take (Abu, 10-15: "you have to put a sign-in in the middle").
import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { TokenMark } from "@kawase/ui-native/components/token-mark";

import {
  Button,
  ErrorState,
  ListRow,
  LiveDot,
  LoadingState,
  Panel,
  SectionLabel,
  SIZE,
  SPACE,
  Sparkline,
  TYPE,
  useTheme,
} from "@/components/kit";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useMarket } from "@/markets/use-markets";
import { ArcArt } from "@/onboarding/story-art";
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
  const { market, loading, error, refresh, live } = useMarket("trending", "mainnet");
  const rows = (market?.rows ?? [])
    .filter((row) => row.token.status !== "impersonator" && row.token.status !== "lookalike")
    .slice(0, ROWS);
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.title}>
          <SectionLabel>{t("feed.home.markets")}</SectionLabel>
          {/* Every trade on these pools moves the rows as it lands (useMarket's live stream). */}
          {live ? (
            <View style={styles.live} accessibilityLabel={t("tokenPage.live")}>
              <LiveDot />
              <Text style={[TYPE.label, { color: color.text2 }]}>{t("tokenPage.live")}</Text>
            </View>
          ) : null}
        </View>
        <Button
          size="sm"
          block={false}
          variant="ghost"
          label={t("feed.home.seeMarkets")}
          onPress={() => router.navigate("/markets")}
        />
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
              detailLines={1}
              leading={
                <TokenMark
                  token={{
                    chainId: row.token.chainId,
                    address: row.token.address,
                    symbol: row.token.symbol,
                    logoUrl: row.token.logoUrl,
                  }}
                  size={SIZE.markToken}
                />
              }
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

/** The guest's column on a wide desktop: what Kawase reaches, and Sign in, centred in the room the balance will take. */
export function SignInStage() {
  const { t } = useT();
  const { color } = useTheme();
  const signIn = useSignIn();
  const reduce = useReducedMotion();
  return (
    <View style={styles.stage}>
      <ArcArt playing still={reduce} />
      <View style={styles.stageCopy}>
        <Text accessibilityRole="header" style={[TYPE.pageTitle, styles.centerText, { color: color.ink }]}>
          {t("story.arcTitle")}
        </Text>
        <Text style={[TYPE.body, styles.centerText, { color: color.text2 }]}>{t("story.arcBody")}</Text>
      </View>
      <View style={styles.stageAction}>
        <Button label={t("feed.home.signIn")} onPress={signIn.open} />
        <Text style={[TYPE.caption, styles.centerText, { color: color.text3 }]}>{t("feed.home.guestMoney")}</Text>
      </View>
    </View>
  );
}

const STAGE_MAX_PX = 440;
const STAGE_ACTION_PX = 320;

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  end: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  title: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  live: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  plate: { gap: SPACE.md, padding: SPACE.lg },
  stage: { width: "100%", maxWidth: STAGE_MAX_PX, alignSelf: "center", alignItems: "center", gap: SPACE.xl },
  stageCopy: { gap: SPACE.sm, alignItems: "center" },
  stageAction: { width: "100%", maxWidth: STAGE_ACTION_PX, gap: SPACE.sm },
  centerText: { textAlign: "center" },
});
