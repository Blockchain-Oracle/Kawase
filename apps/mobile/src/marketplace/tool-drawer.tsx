// One tool in the marketplace (21st.dev wensity/drawer #31360 as the drawer: a sheet on a phone, the right drawer on a
// desktop window, held in the URL as `?d=<key>`). The price per call is the hero, then what $1 buys, who sells it (1P/3P)
// and how it is paid (Gateway or any wallet); the endpoints by sub-group behind one disclosure; and "Try for $0.10":
// the seller's live 402 price first (nothing paid), then one paid call from the agent wallet under the person's own
// caps (`POST /marketplace/try`, the agent's payment path), then the answer. The answer is the seller's text,
// untrusted: it is shown as plain text in a box that says so, never rendered, followed or acted on.
import { useRouter } from "expo-router";
import * as React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { BuyOutcome, CatalogToolView, InspectServiceResult, ServiceListing } from "@kawase/api-client";
import { explorerTxUrl } from "@kawase/config";

import { Button, DisclosureRow, ErrorState, FilterChips, KeyValue, LoadingState, Panel, Rule, WaitingText } from "@/components/kit";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { Sheet } from "@/components/sheet/Sheet";
import { TxCta, useTxLifecycle } from "@/components/tx";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { marketApi } from "./market-api";
import { ToolMark, useCalls, usePerCall } from "./tool-parts";
import { useTool } from "./use-catalog";
import { useAgentWallet } from "./use-agent-wallet";
import { TopUpPresets } from "./parts";

const ENDPOINTS_SHOWN = 8;
const RESULT_MAX_HEIGHT = 240;
const JSON_INDENT = 2;
const UUID_HEX = 16;
const RECEIPT_HEAD = 10;
const RECEIPT_TAIL = 6;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** An id for this drawer's tries: a second tap in the same drawer is the same call, paid once. */
function newTryId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random;
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * UUID_HEX).toString(UUID_HEX));
}

/** The first endpoint that can be called as listed: GET, nothing to fill in the path. */
function tryable(endpoints: readonly ServiceListing[]): ServiceListing | undefined {
  return endpoints.find((endpoint) => endpoint.method.toUpperCase() === "GET" && !endpoint.url.includes("{"));
}

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

export function ToolDrawer({ toolKey, preview, onClose }: { toolKey: string; preview: CatalogToolView | undefined; onClose: () => void }) {
  const { t } = useT();
  return (
    <Sheet onClose={onClose} closeLabel={t("market402.closeNamed", { name: preview?.name ?? "" })} maxHeight={0.94}>
      <ToolDetailBody toolKey={toolKey} preview={preview} />
    </Sheet>
  );
}

function ToolDetailBody({ toolKey, preview }: { toolKey: string; preview: CatalogToolView | undefined }) {
  const { t } = useT();
  const { color } = useTheme();
  const perCall = usePerCall();
  const calls = useCalls();
  const [group, setGroup] = React.useState<string | null>(null);
  const { detail, failed, loading, reload } = useTool(toolKey, group);
  const tool = detail?.tool ?? preview;
  if (!tool) return failed ? <ErrorState diagnosis={{ kind: "server", retryable: true }} stillWorks={t("market402.errorBody")} retry={reload} /> : <LoadingState shape="detail" />;
  const groups = tool.groups.length > 1 ? tool.groups : [];
  return (
    <View style={styles.stack}>
      <View style={styles.head}>
        <ToolMark tool={tool} size={SIZE.markDetail} />
        <View style={styles.grow}>
          <Text accessibilityRole="header" style={[TYPE.sheetTitle, { color: color.ink }]}>
            {tool.name}
          </Text>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{[tool.provider.name, t(`market402.party_${tool.party}`), t(`market402.category_${tool.category}`)].join(" · ")}</Text>
        </View>
      </View>
      <View>
        <Text style={[TYPE.displayPrice, { color: color.ink }]}>{perCall(tool.price)}</Text>
        <Text style={[TYPE.rowDetail, { color: color.text2 }]}>
          {[t("market402.perCallWord"), t("market402.callsPerDollar", { calls: calls(tool.callsPerDollar) })].join(" · ")}
        </Text>
      </View>
      {tool.description ? (
        <Text numberOfLines={4} style={[TYPE.body, { color: color.text2 }]}>
          {tool.description}
        </Text>
      ) : null}
      <Panel style={styles.panel}>
        <KeyValue label={t("market402.paysWith")} value={tool.gatewayOnly ? t("market402.rail_gateway") : tool.rails.map((rail) => t(`market402.rail_${rail}`)).join(" · ")} />
        <Rule />
        <KeyValue label={t("market402.endpointsLabel")} value={String(tool.endpoints)} />
        {tool.maxPrice !== tool.price ? (
          <>
            <Rule />
            <KeyValue label={t("market402.priceRange")} value={`${perCall(tool.price)} – ${perCall(tool.maxPrice)}`} />
          </>
        ) : null}
      </Panel>
      {detail ? <TryPanel tool={tool} endpoint={tryable(detail.endpoints)} /> : loading ? <LoadingState shape="plate" /> : null}
      <DisclosureRow title={t("market402.endpointsLabel")} value={group ?? t("market402.categoryAll")}>
        {groups.length > 0 ? (
          <FilterChips
            options={[{ value: "", label: t("market402.categoryAll") }, ...groups.map((entry) => ({ value: entry.key, label: `${entry.name} ${entry.endpoints}` }))]}
            value={group ?? ""}
            onChange={(next) => setGroup(next || null)}
            label={t("market402.endpointsLabel")}
          />
        ) : null}
        {loading && !detail ? <LoadingState shape="list" /> : null}
        {(detail?.endpoints ?? []).slice(0, ENDPOINTS_SHOWN).map((endpoint) => (
          <View key={`${endpoint.method} ${endpoint.url}`} style={styles.endpoint}>
            <Text style={[TYPE.micro, styles.method, { color: color.text2, backgroundColor: color.raised2 }]}>{endpoint.method.toUpperCase()}</Text>
            <Text numberOfLines={1} style={[TYPE.rowDetail, styles.grow, { color: color.ink }]}>
              {pathOf(endpoint.url)}
            </Text>
            <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{perCall(endpoint.price)}</Text>
          </View>
        ))}
        {detail && detail.page.total > ENDPOINTS_SHOWN ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("market402.moreEndpoints", { n: detail.page.total - ENDPOINTS_SHOWN })}</Text> : null}
      </DisclosureRow>
    </View>
  );
}

type TryStage = { kind: "idle" } | { kind: "asking" } | { kind: "asked"; result: Extract<InspectServiceResult, { status: "listed" }> } | { kind: "unlisted" } | { kind: "askFailed" } | { kind: "done"; outcome: BuyOutcome };

/** "Try for $0.10": the live price, then one paid call, then the answer (untrusted, shown as text). */
function TryPanel({ tool, endpoint }: { tool: CatalogToolView; endpoint: ServiceListing | undefined }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const perCall = usePerCall();
  const signIn = useSignIn();
  const { status } = useSession();
  const runner = useTxLifecycle();
  const wallet = useAgentWallet({ load: false });
  const tryId = React.useRef(newTryId()).current;
  const [stage, setStage] = React.useState<TryStage>({ kind: "idle" });
  const [chosen, setChosen] = React.useState<string>();
  const startedAt = React.useRef(0);

  if (!endpoint) {
    return (
      <Panel style={styles.panel}>
        <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t("market402.tryTitle")}</Text>
        <Text style={[TYPE.body, { color: color.text2 }]}>{t("market402.tryNeedsInput")}</Text>
      </Panel>
    );
  }
  const call = { url: endpoint.url, method: endpoint.method };
  const ask = async () => {
    if (status !== "account") {
      signIn.open();
      return;
    }
    startedAt.current = Date.now();
    setStage({ kind: "asking" });
    try {
      const result = await marketApi.inspect(call);
      setStage(result.status === "listed" ? { kind: "asked", result } : { kind: "unlisted" });
    } catch {
      setStage({ kind: "askFailed" });
    }
  };
  const pay = () =>
    void runner.run(
      async (progress) => {
        const outcome = await marketApi.try({ ...call, tryId });
        setStage({ kind: "done", outcome });
        if (outcome.status === "paid") {
          const settlement = outcome.purchase.settlement;
          progress.submitted(settlement && TX_HASH.test(settlement) ? settlement : null);
          return { status: "confirmed", txHash: settlement && TX_HASH.test(settlement) ? settlement : null };
        }
        if (outcome.status === "free") return { status: "confirmed" };
        // Anything else is a stop that names its fix below (no money moved), not a failure of the lifecycle.
        return { status: "refused", diagnosis: { kind: "rejected", retryable: true, technical: outcome.status } };
      },
      { identity: `x402:${tryId}`, sound: "confirmed" },
    );
  const price = stage.kind === "asked" && stage.result.livePrice ? stage.result.livePrice : endpoint.price;
  const outcome = stage.kind === "done" ? stage.outcome : null;
  const paid = outcome?.status === "paid" || outcome?.status === "free";

  return (
    <Panel style={styles.panel}>
      <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t("market402.tryTitle")}</Text>
      <Text numberOfLines={1} style={[TYPE.rowDetail, { color: color.text3 }]}>{`${endpoint.method.toUpperCase()} ${pathOf(endpoint.url)}`}</Text>
      {stage.kind === "idle" ? <Button label={t("market402.tryFor", { price: perCall(endpoint.price) })} onPress={() => void ask()} /> : null}
      {stage.kind === "asking" ? <WaitingText startedAtMs={startedAt.current}>{t("market402.askingSeller")}</WaitingText> : null}
      {stage.kind === "askFailed" || stage.kind === "unlisted" ? (
        <ErrorState diagnosis={{ kind: stage.kind === "unlisted" ? "unknown" : "server", retryable: true }} stillWorks={t("market402.nothingPaid")} retry={() => void ask()} variant="strip" />
      ) : null}
      {stage.kind === "asked" || stage.kind === "done" ? (
        <>
          {stage.kind === "asked" ? (
            <Text style={[TYPE.body, { color: color.text2 }]}>
              {stage.result.free
                ? t("market402.sellerFree")
                : [t("market402.sellerAsks", { price: perCall(price) }), stage.result.withinPerCallCap === false ? t("market402.overCap") : null].filter(Boolean).join(" ")}
            </Text>
          ) : null}
          <TxCta
            state={runner.state.kind === "failed" ? { kind: "review" } : runner.state}
            action={t("market402.payFromAgent", { price: perCall(price) })}
            tone="accent"
            onConfirm={pay}
            receipt={outcome && (outcome.status === "paid" || outcome.status === "free") ? <PaidAnswer outcome={outcome} tool={tool} /> : undefined}
          />
        </>
      ) : null}
      {outcome && !paid ? <OutcomeStop outcome={outcome} wallet={wallet} chosen={chosen} setChosen={setChosen} onAgain={pay} onWallet={() => router.push("/agent-wallet")} /> : null}
    </Panel>
  );
}

/** A call that did not pay, in words, with the one fix it needs (top up, approve this price, sign in, open the controls). */
function OutcomeStop({
  outcome,
  wallet,
  chosen,
  setChosen,
  onAgain,
  onWallet,
}: {
  outcome: BuyOutcome;
  wallet: ReturnType<typeof useAgentWallet>;
  chosen: string | undefined;
  setChosen: (value: string) => void;
  onAgain: () => void;
  onWallet: () => void;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const perCall = usePerCall();
  const signIn = useSignIn();
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    fire("warn");
  }, [outcome]);
  if (outcome.status === "needs_top_up") {
    const amount = chosen ?? outcome.suggested;
    return (
      <View style={[styles.stop, { backgroundColor: color.warnSurface }]}>
        <Text style={[TYPE.body, { color: color.ink }]}>{t("market402.needsTopUp", { price: perCall(outcome.price), have: perCall((BigInt(outcome.wallet.onHand) + BigInt(outcome.wallet.inGateway)).toString()) })}</Text>
        <TopUpPresets presets={outcome.presets} value={amount} onChange={setChosen} disabled={busy} />
        <Button
          label={t("market402.topUpThenTry", { amount: perCall(amount) })}
          loading={busy}
          onPress={() => {
            setBusy(true);
            void wallet
              .topUp(amount)
              .then((ok) => (ok ? onAgain() : undefined))
              .finally(() => setBusy(false));
          }}
        />
      </View>
    );
  }
  if (outcome.status === "needs_consent") {
    return (
      <View style={[styles.stop, { backgroundColor: color.warnSurface }]}>
        <Text style={[TYPE.body, { color: color.ink }]}>{t(`market402.consent_${outcome.why}`, { price: perCall(outcome.purchase.amount) })}</Text>
        <Button
          label={t("market402.approveOnce", { price: perCall(outcome.purchase.amount) })}
          loading={busy}
          onPress={() => {
            setBusy(true);
            void api.marketplace
              .decide(outcome.purchase.id, "approve")
              .then(() => onAgain())
              .catch(() => fire("fail"))
              .finally(() => setBusy(false));
          }}
        />
      </View>
    );
  }
  if (outcome.status === "needs_sign_in" || outcome.status === "needs_wallet") {
    return <Button label={t("market402.signInToTry")} onPress={() => signIn.open()} />;
  }
  if (outcome.status === "practiced") {
    return <Text style={[TYPE.body, { color: color.text2 }]}>{t("market402.practiced", { price: perCall(outcome.price) })}</Text>;
  }
  const failedAfterPayment = outcome.status === "failed" && outcome.reason === "failed_after_payment";
  const why = outcome.status === "refused" ? t(`market402.refused_${outcome.reason}`) : outcome.status === "failed" ? t(`market402.failed_${outcome.reason}`) : "";
  return (
    <View style={[styles.stop, { backgroundColor: color.destructiveSurface }]} accessibilityRole="alert">
      <Text style={[TYPE.body, { color: color.ink }]}>{why}</Text>
      <Text style={[TYPE.rowStrong, { color: color.ink }]}>{failedAfterPayment ? t("market402.moneyPaidNoAnswer") : t("market402.nothingPaid")}</Text>
      {outcome.status === "refused" && (outcome.reason === "category_off" || outcome.reason === "blocked_seller" || outcome.reason === "over_budget" || outcome.reason === "paused") ? (
        <Button label={t("market402.openControls")} variant="secondary" onPress={onWallet} />
      ) : null}
    </View>
  );
}

/** The receipt and the seller's answer, as untrusted text: pretty-printed when it is JSON, never rendered or followed. */
function PaidAnswer({ outcome, tool }: { outcome: Extract<BuyOutcome, { status: "paid" } | { status: "free" }>; tool: CatalogToolView }) {
  const { t } = useT();
  const { color } = useTheme();
  const perCall = usePerCall();
  const { user } = useSession();
  const shown = React.useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(outcome.content), null, JSON_INDENT);
    } catch {
      return outcome.content;
    }
  }, [outcome.content]);
  const purchase = outcome.status === "paid" ? outcome.purchase : null;
  const hash = purchase?.settlement && TX_HASH.test(purchase.settlement) ? purchase.settlement : null;
  return (
    <View style={styles.stack}>
      {purchase ? (
        <View style={styles.receipt}>
          <KeyValue label={t("market402.paid")} value={perCall(purchase.amount)} />
          <KeyValue label={t("market402.paidWith")} value={purchase.rail ? t(`market402.rail_${purchase.rail}`) : "—"} />
          {purchase.settlement ? <KeyValue label={t("market402.receipt")} value={`${purchase.settlement.slice(0, RECEIPT_HEAD)}…${purchase.settlement.slice(-RECEIPT_TAIL)}`} /> : null}
          {hash ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(explorerTxUrl(user?.activeNetwork === "mainnet" ? "arc" : "arcTestnet", hash))}>
              <Text style={[TYPE.rowDetail, { color: color.link }]}>{t("market402.viewTx")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={[TYPE.body, { color: color.text2 }]}>{t("market402.sellerFree")}</Text>
      )}
      <Text style={[TYPE.meta, { color: color.text3 }]}>{t("market402.untrusted", { seller: tool.provider.name })}</Text>
      <ScrollView style={[styles.answer, { backgroundColor: color.raised2 }]} nestedScrollEnabled>
        <Text selectable style={[TYPE.rowDetail, styles.mono, { color: color.ink }]}>
          {shown}
          {outcome.truncated ? `\n${t("market402.truncated")}` : ""}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.lg },
  grow: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  panel: { padding: SPACE.lg, gap: SPACE.md },
  endpoint: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: SIZE.touch },
  method: { paddingHorizontal: SPACE.xs, paddingVertical: SPACE.xxs, borderRadius: RADIUS.xs, overflow: "hidden" },
  stop: { gap: SPACE.md, padding: SPACE.lg, borderRadius: RADIUS.md },
  receipt: { gap: SPACE.xs },
  answer: { maxHeight: RESULT_MAX_HEIGHT, borderRadius: RADIUS.md, padding: SPACE.md },
  mono: { fontFamily: "monospace" },
});
