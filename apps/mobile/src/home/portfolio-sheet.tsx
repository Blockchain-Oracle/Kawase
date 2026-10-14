// The portfolio behind Home's balance (D37 decision 1): one sheet at the list rests (0.62 → 0.88 → full) holding
// what used to fill Home — your assets (with the hidden ones and those on other chains, each with Bring to Arc) and
// your positions (earn, borrow with health, long/short with P&L) — reusing home/{your-assets,positions}. Its states
// are the sections' own (skeleton rows, the stale line, Retry).
import * as React from "react";
import { StyleSheet, View } from "react-native";

import type { PortfolioView } from "@kawase/api-client";

import { SPACE } from "@/components/kit";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { LIST_DETENTS } from "@/components/sheet/constants";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { money } from "@/portfolio/format";

import { Positions } from "./positions";
import { YourAssets } from "./your-assets";

export function PortfolioSheet({
  portfolio,
  loading,
  error,
  onRetry,
  onAddMoney,
  onVisibility,
  onClose,
}: {
  portfolio: PortfolioView | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onAddMoney: () => void;
  onVisibility: React.ComponentProps<typeof YourAssets>["onVisibility"];
  onClose: () => void;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const total = portfolio ? money(portfolio.totalUsd, portfolio.fx, locale) : undefined;
  return (
    <Sheet onClose={onClose} closeLabel={t("shell.kit.closeNamed", { name: t("feed.home.portfolio") })} detents={LIST_DETENTS}>
      <SheetHeading title={t("feed.home.portfolio")} {...(total ? { body: total } : {})} />
      <View style={styles.body}>
        <YourAssets portfolio={portfolio} loading={loading} error={error} onRetry={onRetry} onAddMoney={onAddMoney} onVisibility={onVisibility} />
        <Positions portfolio={portfolio} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.xl, paddingTop: SPACE.md },
});
