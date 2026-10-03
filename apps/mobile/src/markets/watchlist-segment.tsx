// The Markets "Watchlist" segment: the tokens the person starred on their pages, with today's price and 24 h change
// (21st Asset Card rows). Guests are asked to sign in in place (R13); an empty list says how to add one.
import { useFocusEffect, useRouter } from "expo-router";
import { Star } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { WatchRow } from "@kawase/api-client";
import { AssetRow } from "@kawase/ui-native/components/asset-row";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { change, price, USD_FX } from "@/portfolio/format";
import { tokenChip } from "@/portfolio/token-chip";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

const SKELETON_ROWS = 3;
const SKELETON_HEIGHT = 64;

export function WatchlistSegment() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { status } = useSession();
  const signIn = useSignIn();
  const [rows, setRows] = React.useState<WatchRow[]>();
  const [failed, setFailed] = React.useState(false);
  const account = status === "account";

  const load = React.useCallback(async () => {
    if (!account) return;
    try {
      // Markets read mainnet; the stars are the ones made there.
      setRows((await api.markets.watchlist("mainnet")).rows);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [account]);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  if (!account)
    return (
      <View className="bg-card border-border rounded-2xl border">
        <EmptyState
          layout="section"
          title={t("markets.watchlist")}
          body={t("markets.watchSignIn")}
          action={
            <Button onPress={() => signIn.open()}>
              <Text>{t("signIn.title")}</Text>
            </Button>
          }
        />
      </View>
    );
  if (!rows)
    return failed ? (
      <Button variant="secondary" onPress={() => void load()}>
        <Text>{t("common.retry")}</Text>
      </Button>
    ) : (
      <View className="gap-2">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="rounded-2xl" style={{ height: SKELETON_HEIGHT }} />
        ))}
      </View>
    );
  if (rows.length === 0)
    return (
      <View className="bg-card border-border rounded-2xl border">
        <EmptyState layout="section" title={t("markets.watchEmptyTitle")} body={t("markets.watchEmptyBody")} art={<Icon as={Star} className="text-muted-foreground size-8" />} />
      </View>
    );
  return (
    <ListGroup>
      {rows.map((row) => {
        const chip = tokenChip(row.token, t);
        const changeLabel = change(row.change24hPct, locale);
        return (
          <AssetRow
            key={row.token.address}
            token={row.token}
            amount={row.held ? t("markets.watchHeld") : row.token.symbol}
            value={price(row.priceUsd, USD_FX, locale)}
            change24hPct={row.change24hPct}
            {...(changeLabel ? { changeLabel } : {})}
            {...(chip ? { chip } : {})}
            onPress={() => router.push(`/token/${row.token.chainId}/${row.token.address}`)}
          />
        );
      })}
    </ListGroup>
  );
}
