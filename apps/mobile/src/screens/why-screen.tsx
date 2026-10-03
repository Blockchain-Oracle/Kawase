// Why (surfaces.md Activity "row → receipt → why"; cards/automate-safety.md): the decision record behind one
// movement, as a timeline: what was asked and where (or which automation ran), the checks (all clear, warnings, what
// it needed), the route and what else was compared, the approval and how it was given, what was sent and by whom,
// what it matched (a request, an invoice by its reference), and each recorded step. A transfer Kawase took no part in
// (someone paid you from elsewhere) says so plainly.
import { useLocalSearchParams } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";

import { ApiError, type WhyView } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page } from "@/account/page";
import { IncomingActions } from "@/receipt/incoming-actions";
import { useWhyHeadline, WhyTimeline } from "@/history/why-timeline";
import { useT } from "@/i18n";
import { api } from "@/session/api";

const SKELETON_HEIGHT = 220;
const HTTP_NOT_FOUND = 404;

export function WhyScreen({ runId }: { runId?: string | undefined } = {}) {
  const { t } = useT();
  const headline = useWhyHeadline();
  const { tx, network } = useLocalSearchParams<{ tx: string; network: "mainnet" | "testnet" }>();
  const [why, setWhy] = React.useState<WhyView | null>();

  React.useEffect(() => {
    // A transaction's decision record, or (an automation run that needed none) the run's own (A3).
    const read = runId ? api.activityFeed.runWhy(runId) : api.history.why(tx, network === "mainnet" ? "mainnet" : "testnet");
    void read
      .then((result) => setWhy(result.why))
      .catch((error: unknown) => setWhy(error instanceof ApiError && error.status === HTTP_NOT_FOUND ? null : undefined));
  }, [tx, network, runId]);

  return (
    <Page title={t("why.title")}>
      {why === undefined ? (
        <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
      ) : why === null ? (
        <View className="bg-card border-border gap-2 rounded-3xl border p-4">
          <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("why.noRecordTitle")}</Text>
          <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("why.noRecordBody")}</Text>
        </View>
      ) : (
        <>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{headline(why)}</Text>
          <WhyTimeline why={why} />
          {why.explorerUrl ? (
            <Button variant="secondary" onPress={() => void Linking.openURL(why.explorerUrl!)}>
              <Icon as={ExternalLink} className="size-4" />
              <Text>{t("activity.viewExplorer")}</Text>
            </Button>
          ) : null}
          {/* Money that came in: save the sender, share the receipt (A5-2). */}
          {why.kind === "incoming" && typeof why.facts.from === "string" && why.facts.amount !== null && why.facts.amount !== undefined ? (
            <IncomingActions
              from={why.facts.from}
              amountBase={String(why.facts.amount)}
              asset={String(why.facts.asset ?? "USDC")}
              network={why.network}
              at={typeof why.facts.at === "string" ? why.facts.at : (why.steps[0]?.at ?? new Date().toISOString())}
              txHash={why.txHash}
              explorerUrl={why.explorerUrl}
            />
          ) : null}
        </>
      )}
    </Page>
  );
}
