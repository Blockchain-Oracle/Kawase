// The Services section on Markets: the paid services the agent can call, cheapest-first as the catalog ranks them, each
// opening its drawer in the marketplace; "See all" opens the whole marketplace. The same rows, states and logos as the
// marketplace screen, so the two never disagree.
import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, EmptyState, ErrorState, LoadingState } from "@/components/kit";
import { Search } from "@/components/kit/icons";
import { SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { useT } from "@/i18n";

import { ToolRow } from "./tool-parts";
import { useCatalog } from "./use-catalog";

const SHOWN = 8;

export function ServicesSection() {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const catalog = useCatalog("", null);
  const tools = catalog.tools.slice(0, SHOWN);
  const total = catalog.view?.totals.tools ?? 0;
  return (
    <View style={styles.stack}>
      <View style={styles.head}>
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: color.ink }]}>
            {t("market402.servicesTitle")}
          </Text>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("market402.servicesBody")}</Text>
        </View>
        {total > 0 ? <Button label={t("market402.servicesSeeAll", { n: total })} variant="ghost" size="sm" block={false} onPress={() => router.push("/marketplace")} /> : null}
      </View>
      {catalog.loading && tools.length === 0 ? (
        <LoadingState shape="list" />
      ) : catalog.failed && tools.length === 0 ? (
        <ErrorState diagnosis={{ kind: "server", retryable: true }} stillWorks={t("market402.errorBody")} retry={catalog.reload} variant="strip" />
      ) : tools.length === 0 ? (
        <EmptyState why={t("market402.emptyTitle")} icon={Search} size="inline" />
      ) : (
        tools.map((tool, index) => <ToolRow key={tool.key} tool={tool} index={index} onPress={() => router.push({ pathname: "/marketplace/[id]", params: { id: tool.key } })} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1 },
});
