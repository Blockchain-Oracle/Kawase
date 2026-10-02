// The intelligence layer's cards (A5): earlier conversations that match a search. Each card renders the tool's real
// result; a row opens what it names.
import { useRouter } from "expo-router";
import { ArrowRight, BookOpen, Check, ExternalLink, MessagesSquare } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import { toast } from "sonner-native";

import type {
  ChartOutput,
  ChartRangeId,
  DecisionView,
  DependencyLine,
  HistoryHit,
  HistorySearchOutput,
  SettingDiff,
  StatusView,
  SuggestionsView,
} from "@kawase/api-client";
import { LANGUAGE_NAMES } from "@kawase/i18n";
import { Amount } from "@kawase/ui-native/components/amount";
import { AreaChart, RangePills, type ChartPoint } from "@kawase/ui-native/components/area-chart";
import { ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { ForYouList } from "@/home/for-you";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { change, money, price } from "@/portfolio/format";
import { useFx } from "@/portfolio/use-fx";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

import { AgentCard } from "./card";

/** One matching conversation: its title, when, and the words around the match. Shared with the history sheet. */
export function HistoryHitRow({ hit, onOpen }: { hit: HistoryHit; onOpen: (threadId: string) => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(hit.at));
  const network = hit.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const who = hit.role === "user" ? t("insight.you") : hit.role === "assistant" ? "Kawase" : undefined;
  return (
    <ListRow
      title={hit.title ?? t("chat.untitled")}
      subtitle={`${who ? `${who}: ` : ""}${hit.snippet}`}
      accessibilityLabel={`${hit.title ?? t("chat.untitled")}, ${hit.snippet}, ${network}, ${when}`}
      trailing={<Text className="text-muted-foreground text-xs">{when}</Text>}
      onPress={() => onOpen(hit.threadId)}
    />
  );
}

export function HistorySearchCard({ output }: { output: HistorySearchOutput }) {
  const { t } = useT();
  const router = useRouter();
  const open = (thread: string) => router.navigate({ pathname: "/chat", params: { thread } });
  return (
    <AgentCard eyebrow={t("insight.searchTitle")} className="pb-1">
      {output.hits.length === 0 ? (
        <View className="flex-row items-start gap-3 pb-3">
          <Icon as={MessagesSquare} className="text-muted-foreground mt-0.5 size-5" />
          <Text className={cn("text-muted-foreground flex-1 text-sm leading-6", TEXT_START)}>
            {t("insight.searchNone", { query: output.query })}
          </Text>
        </View>
      ) : (
        <View className="-mx-4">
          {output.hits.slice(0, CARD_HITS).map((hit) => (
            <HistoryHitRow key={hit.threadId} hit={hit} onOpen={open} />
          ))}
        </View>
      )}
    </AgentCard>
  );
}

/** Conversations listed on the card (the history sheet shows all of them). */
const CARD_HITS = 5;

/** arc_knowledge: where the answer came from — each passage's title, opening its source. */
export function KnowledgeCard({ output }: { output: { passages: { title: string; source: string }[] } }) {
  const { t } = useT();
  if (output.passages.length === 0) return null;
  const host = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  return (
    <AgentCard eyebrow={t("insight.sources")} className="pb-1">
      <View className="-mx-4">
        {output.passages.map((passage) => (
          <ListRow
            key={`${passage.source}:${passage.title}`}
            leading={<Icon as={BookOpen} className="text-muted-foreground size-4" />}
            title={passage.title}
            subtitle={host(passage.source)}
            trailing={<Icon as={ExternalLink} className="text-muted-foreground size-4" />}
            onPress={() => void Linking.openURL(passage.source)}
          />
        ))}
      </View>
    </AgentCard>
  );
}

const CHART_RANGES: readonly ChartRangeId[] = ["1D", "1W", "1M", "1Y"];
const CHART_HEIGHT = 140;
const RANGE_MS: Record<ChartRangeId, number> = { "1D": 86_400_000, "1W": 604_800_000, "1M": 2_592_000_000, "1Y": 31_536_000_000 };
const SECONDS_BEFORE = 1e12;
const MS_PER_SECOND = 1_000;
const MIN_POINTS = 2;
const PERCENT = 100;

/** show_chart: the portfolio's value or a token's price, with its range pills (other ranges are fetched here). */
export function ChartCard({ output }: { output: ChartOutput }) {
  const fx = useFx();
  const { t } = useT();
  const { locale } = useLocale();
  const colors = useThemeColors();
  const ready = output.status === "ready" ? output : undefined;
  const [range, setRange] = React.useState<ChartRangeId>(ready?.range ?? "1W");
  const [points, setPoints] = React.useState(ready?.points ?? []);
  const [scrub, setScrub] = React.useState<ChartPoint | null>(null);

  const pick = async (next: ChartRangeId) => {
    setRange(next);
    if (!ready) return;
    try {
      if (ready.kind === "token" && ready.token) {
        const { candles } = await api.tokens.chart(ready.token.chainId, ready.token.address, next);
        setPoints(candles.map((candle) => ({ t: candle.t < SECONDS_BEFORE ? candle.t * MS_PER_SECOND : candle.t, v: candle.c })));
      } else {
        const { portfolio } = await api.portfolio.get();
        const all = portfolio.history.map((point) => ({ t: new Date(point.t).getTime(), v: point.usd }));
        const inRange = all.filter((point) => point.t >= Date.now() - RANGE_MS[next]);
        setPoints(inRange.length >= MIN_POINTS ? inRange : all);
      }
    } catch {
      toast(t("common.error"));
    }
  };

  if (output.status !== "ready")
    return (
      <AgentCard eyebrow={output.status === "empty" ? (output.kind === "portfolio" ? t("insight.chartPortfolio") : output.title) : undefined}>
        <Text className={cn("text-muted-foreground text-sm leading-6", TEXT_START)}>
          {output.status === "not_found" ? t("insight.chartNotFound", { query: output.query }) : t("insight.chartEmpty")}
        </Text>
      </AgentCard>
    );

  const format = (value: number) => (output.kind === "token" ? price(value, fx, locale) : money(value, fx, locale));
  const first = points[0]?.v;
  const last = points.at(-1)?.v;
  const pct = first && last !== undefined ? change(((last - first) / first) * PERCENT, locale) : undefined;
  const up = (last ?? 0) >= (first ?? 0);
  const title = output.kind === "portfolio" ? t("insight.chartPortfolio") : output.title;
  const network = output.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  return (
    <AgentCard eyebrow={`${title} · ${network}`}>
      <View className="flex-row items-baseline gap-2">
        <Amount className="text-foreground text-2xl font-semibold">{format(scrub?.v ?? last ?? 0)}</Amount>
        {pct ? <Text className={cn("text-sm font-semibold", up ? "text-success" : "text-destructive")}>{pct}</Text> : null}
      </View>
      {points.length >= MIN_POINTS ? (
        <AreaChart
          points={points}
          height={CHART_HEIGHT}
          colors={{ up: colors.success, down: colors.destructive, muted: colors["muted-foreground"], scrub: colors.border }}
          formatValue={format}
          onScrub={setScrub}
          accessibilityLabel={t("insight.chartLabel", { title, range, value: format(last ?? 0) })}
        />
      ) : (
        <Text className="text-muted-foreground text-sm">{t("insight.chartEmpty")}</Text>
      )}
      <RangePills ranges={CHART_RANGES} value={range} onChange={(next) => void pick(next)} label={t("insight.chartRanges")} />
    </AgentCard>
  );
}

const REASON_KEYS: Record<string, string> = {
  no_quote: "insight.reasonNoQuote",
  no_route: "insight.reasonNoQuote",
  timeout: "insight.reasonTimeout",
  lower_out: "insight.reasonLowerOut",
  lower_yield: "insight.reasonLowerYield",
  not_active: "insight.reasonNotActive",
  quote_only: "insight.reasonQuoteOnly",
  not_on_arc: "insight.reasonNotOnArc",
  not_on_arc_testnet: "insight.reasonNotOnArc",
  not_on_network: "insight.reasonNotOnArc",
  amount_too_low: "insight.reasonAmountLow",
};

/** explain_choice: every option asked, the one chosen first, and why each other one lost. */
export function DecisionCard({ output }: { output: DecisionView }) {
  const { t } = useT();
  const { locale } = useLocale();
  if (output.status !== "ready")
    return (
      <AgentCard eyebrow={t("insight.decisionTitle")}>
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("insight.decisionNone")}</Text>
      </AgentCard>
    );
  const order = { chosen: 0, quoted: 1, unavailable: 2 } as const;
  const options = [...output.options].sort((a, b) => order[a.status] - order[b.status]);
  const when = output.quotedAt ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(output.quotedAt)) : null;
  return (
    <AgentCard eyebrow={`${t("insight.decisionTitle")} · ${output.network === "testnet" ? t("network.arcTestnet") : t("network.arc")}`}>
      <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{output.subject}</Text>
      <View className="gap-2">
        {options.map((option) => (
          <View
            key={option.name}
            className={cn("gap-1 rounded-2xl px-3 py-2.5", option.status === "chosen" ? "bg-success/10 border-success/40 border" : "bg-secondary")}
          >
            <View className="flex-row items-center gap-2">
              <Text className={cn("text-foreground flex-1 text-sm font-semibold", TEXT_START)} numberOfLines={1}>
                {option.name}
              </Text>
              <Text className={cn("text-xs font-semibold", option.status === "chosen" ? "text-success" : "text-muted-foreground")}>
                {t(`insight.${option.status}`)}
              </Text>
            </View>
            {option.value || option.fee || option.eta ? (
              <Amount className="text-muted-foreground text-xs">{[option.value, option.fee, option.eta].filter(Boolean).join(" · ")}</Amount>
            ) : null}
            {option.reason ? (
              <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t(REASON_KEYS[option.reason] ?? "insight.reasonOther")}</Text>
            ) : null}
          </View>
        ))}
      </View>
      <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
        {[output.basis === "highest_yield" ? t("insight.decisionBasisYield") : t("insight.decisionBasisMost"), when ? t("insight.quotedAt", { time: when }) : null]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </AgentCard>
  );
}

/** propose_setting_change: Now → After, and Apply (made here, on the device, by the person's tap). */
export function SettingDiffCard({ output }: { output: SettingDiff }) {
  const { t } = useT();
  const { update } = useSession();
  const signIn = useSignIn();
  const [state, setState] = React.useState<"idle" | "busy" | "applied">("idle");
  const label = { memory: t("insight.settingMemory"), replyLanguage: t("insight.settingReplyLanguage"), theme: t("insight.settingTheme") }[output.setting];
  const valueName = (value: string) => {
    if (output.setting === "memory") return value === "on" ? t("memory.on") : t("memory.off");
    if (output.setting === "theme") return value === "dark" ? t("settings.themeDark") : value === "light" ? t("settings.themeLight") : t("settings.themeSystem");
    return value === "same" ? t("insight.sameAsApp") : (LANGUAGE_NAMES[value as keyof typeof LANGUAGE_NAMES] ?? value);
  };
  const apply = async () => {
    if (output.status !== "proposed") return;
    setState("busy");
    try {
      if (output.setting === "memory") await api.memory.setEnabled(output.after === "on");
      else if (output.setting === "theme") await update({ theme: output.after as "system" | "dark" | "light" });
      else await update({ replyLanguage: output.after === "same" ? null : output.after });
      setState("applied");
    } catch {
      setState("idle");
      toast(t("common.error"));
    }
  };
  if (output.status === "needs_sign_in")
    return (
      <AgentCard eyebrow={t("insight.settingTitle")}>
        <Text className={cn("text-foreground text-sm", TEXT_START)}>{t("insight.settingSignIn")}</Text>
        <Button onPress={signIn.open}>
          <Text>{t("signIn.title")}</Text>
        </Button>
      </AgentCard>
    );
  return (
    <AgentCard eyebrow={`${t("insight.settingTitle")} · ${label}`}>
      {output.status === "unchanged" ? (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {valueName(output.now)} · {t("insight.unchanged")}
        </Text>
      ) : (
        <>
          <View className="flex-row items-center gap-3">
            <View className="bg-secondary flex-1 gap-0.5 rounded-2xl px-3 py-2.5">
              <Text className="text-muted-foreground text-xs">{t("insight.now")}</Text>
              <Text className="text-foreground text-sm font-semibold">{valueName(output.now)}</Text>
            </View>
            <Icon as={ArrowRight} className="text-muted-foreground size-4 rtl:-scale-x-100" />
            <View className="border-ring bg-ring/10 flex-1 gap-0.5 rounded-2xl border px-3 py-2.5">
              <Text className="text-muted-foreground text-xs">{t("insight.after")}</Text>
              <Text className="text-foreground text-sm font-semibold">{valueName(output.after)}</Text>
            </View>
          </View>
          {output.reason ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{output.reason}</Text> : null}
          <Button disabled={state !== "idle"} onPress={() => void apply()}>
            {state === "applied" ? <Icon as={Check} className="text-primary-foreground size-4" /> : null}
            <Text>{state === "applied" ? t("insight.applied") : t("insight.apply")}</Text>
          </Button>
        </>
      )}
    </AgentCard>
  );
}

const DEPENDENCY_KEYS: Record<DependencyLine["id"], string> = {
  kawase_api: "insight.depKawase",
  database: "insight.depDatabase",
  arc_testnet: "insight.depArcTestnet",
  arc_mainnet: "insight.depArcMainnet",
  circle: "insight.depCircle",
  prices: "insight.depPrices",
  fx: "insight.depFx",
};
const STATE_KEYS = { ok: "insight.statusOk", slow: "insight.statusSlow", down: "insight.statusDown" } as const;
const OVERALL_KEYS = { ok: "insight.overallOk", slow: "insight.overallSlow", down: "insight.overallDown" } as const;
const DOT = { ok: "bg-success", slow: "bg-muted-foreground", down: "bg-destructive" } as const;

/** get_status: each dependency, working / slow / down, with its fact (latest block, time to answer). */
export function StatusCard({ output }: { output: StatusView }) {
  const { t } = useT();
  const { locale } = useLocale();
  const when = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(output.checkedAt));
  return (
    <AgentCard eyebrow={`${t("insight.statusTitle")} · ${t("insight.checkedAt", { time: when })}`}>
      <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t(OVERALL_KEYS[output.overall])}</Text>
      <View className="gap-2">
        {output.items.map((item) => (
          <View key={item.id} className="flex-row items-center gap-3">
            <View className={cn("size-2 rounded-full", DOT[item.state])} />
            <View className="min-w-0 flex-1">
              <Text className={cn("text-foreground text-sm", TEXT_START)}>{t(DEPENDENCY_KEYS[item.id])}</Text>
              {item.detail ? <Amount className="text-muted-foreground text-xs">{item.detail}</Amount> : null}
            </View>
            <Text className={cn("text-xs font-semibold", item.state === "ok" ? "text-success" : item.state === "slow" ? "text-foreground" : "text-destructive")}>
              {t(STATE_KEYS[item.state])}
              {item.ms !== null ? ` · ${item.ms} ms` : ""}
            </Text>
          </View>
        ))}
      </View>
    </AgentCard>
  );
}

/** get_for_you: the same cards as Home's "For you", or a calm line when nothing needs the person. */
export function ForYouChatCard({ output }: { output: SuggestionsView }) {
  const { t } = useT();
  if (output.suggestions.length === 0)
    return (
      <AgentCard eyebrow={t("forYou.title")}>
        <Text className={cn("text-muted-foreground text-sm leading-6", TEXT_START)}>{t("forYou.nothing")}</Text>
      </AgentCard>
    );
  return <ForYouList view={output} />;
}
