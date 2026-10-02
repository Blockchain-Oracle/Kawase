// Why (surfaces.md Activity "row → receipt → why"; cards/automate-safety.md): the decision record behind one
// movement, as a timeline: what was asked and where (or which automation ran), the checks (all clear, warnings, what
// it needed), the route and what else was compared, the approval and how it was given, what was sent and by whom,
// what it matched (a request, an invoice by its reference), and each recorded step. A transfer Kawase took no part in
// (someone paid you from elsewhere) says so plainly.
import { useLocalSearchParams } from "expo-router";
import { CheckCircle2, CircleDot, ExternalLink } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";

import { ApiError, type WhyStep, type WhyView } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page } from "@/account/page";
import { IncomingActions } from "@/receipt/incoming-actions";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";

const SKELETON_HEIGHT = 220;
const HTTP_NOT_FOUND = 404;

function useStepText() {
  const { t } = useT();
  const policy = (code: string) => t(`policy.${code}`, { defaultValue: code });
  return (step: WhyStep): { title: string; detail?: string } => {
    switch (step.step) {
      case "asked":
        return { title: t(`why.asked.${step.surface}`), detail: Object.values(step.words).filter((value) => typeof value === "string" || typeof value === "number").join(" · ") || undefined };
      case "automation":
        return { title: t("why.automation", { kind: t(`why.automationKind.${step.kind}`) }) };
      case "checked":
        return {
          title: step.blocking ? t("why.checkedBlocked") : step.warnings.length > 0 ? t("why.checkedWarnings") : t("why.checkedClear"),
          detail: [...(step.blocking ? [policy(step.blocking)] : []), ...step.warnings.map(policy), ...step.open.map(policy)].join(" · ") || undefined,
        };
      case "route":
        return {
          title: step.provider ? t("why.routeVia", { provider: step.provider }) : t(`why.route.${step.route ?? "none"}`),
          detail: step.alternatives.length > 0 ? t("why.compared", { providers: step.alternatives.map((entry) => entry.provider).join(", ") }) : undefined,
        };
      case "approved":
        return { title: t(`why.approved.${step.route}`), detail: t(`why.asked.${step.via}`) };
      case "sent":
        return { title: t(`why.sentBy.${step.by}`), detail: t(`why.status.${step.status}`) };
      case "matched":
        return { title: step.what === "invoice" ? t("why.matchedInvoice") : t("why.matchedRequest"), detail: step.reference ? t("why.byReference") : undefined };
      case "audit":
        return { title: t(`why.audit.${step.action.replace(/[^a-z_.]/gi, "_")}`, { defaultValue: t("why.recorded") }) };
    }
  };
}

export function WhyScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const text = useStepText();
  const { tx, network } = useLocalSearchParams<{ tx: string; network: "mainnet" | "testnet" }>();
  const [why, setWhy] = React.useState<WhyView | null>();

  React.useEffect(() => {
    void api.history
      .why(tx, network === "mainnet" ? "mainnet" : "testnet")
      .then((result) => setWhy(result.why))
      .catch((error: unknown) => setWhy(error instanceof ApiError && error.status === HTTP_NOT_FOUND ? null : undefined));
  }, [tx, network]);

  const time = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(iso));

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
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t(`why.kind.${why.kind}`, Object.fromEntries(Object.entries(why.facts).map(([key, value]) => [key, String(value ?? "")])))}</Text>
          <View className="gap-0">
            {/* Per-request rows ("POST /…") are the raw audit trail; the timeline shows what each step meant. */}
            {why.steps.filter((step) => !(step.step === "audit" && step.action.includes(" "))).map((step, index, steps) => {
              const { title, detail } = text(step);
              const last = index === steps.length - 1;
              return (
                <View key={`${step.step}-${index}`} className="flex-row gap-3">
                  <View className="items-center">
                    <Icon as={step.step === "sent" || step.step === "matched" ? CheckCircle2 : CircleDot} className={cn("size-5", step.step === "sent" || step.step === "matched" ? "text-success" : "text-muted-foreground")} />
                    {!last ? <View className="bg-border w-px flex-1" /> : null}
                  </View>
                  <View className="min-w-0 flex-1 gap-0.5 pb-5">
                    <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{title}</Text>
                    {detail ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{detail}</Text> : null}
                    <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{time(step.at)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
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
