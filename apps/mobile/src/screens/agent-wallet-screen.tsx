// The Agent wallet page on the Senryo kit (cards/marketplace.md; D38: the agent wallet is the budget's "services" line).
// The hero is a card: the balance, what the agent spent today against its daily budget as a meter, where the money sits
// (ready in Gateway, on hand) as two cells, and the address. A desktop window puts the money (hero, top up) beside the
// rules (budget, categories, sellers, history) instead of one long column. Then, as before: a quiet plate when it runs
// low, Top up (presets, one tap; the first one signs the capped grant), buy straight into it with Apple Pay or card (D42),
// Return to my wallet; the controls (per day, per call, ask first: tightening is instant, loosening asks first), the
// categories it may pay for, blocked sellers, the spending history, and the way into the marketplace. Every state is
// drawn: guest, loading, failed (with what still holds), empty history.
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { Copy } from "lucide-react-native";
import * as React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { MarketplaceCategory } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { useWide } from "@kawase/ui-native/lib/wide";

import { Button, EmptyState, ErrorState, LoadingState, Panel, Rule, Switch } from "@/components/kit";
import { ChevronLeft, ChevronRight, Icon } from "@/components/kit/icons";
import { RollingFigure } from "@/components/kit/RollingFigure";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { notify } from "@/components/toast/notify";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { CardTopUp } from "@/marketplace/card-top-up";
import { Chip, MoveRow, PurchaseRow, TopUpPresets } from "@/marketplace/parts";
import { useAgentWallet } from "@/marketplace/use-agent-wallet";
import { shortAddress } from "@/send/copy";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

const CATEGORIES: MarketplaceCategory[] = ["SEARCH", "FINANCIAL", "PREDICTION", "DATA", "SOCIAL", "INFRASTRUCTURE", "CREATIVE", "OTHER"];
/** Budget choices in USDC base units: per day, and per call. */
const DAILY_CHOICES = ["500000", "1000000", "5000000", "20000000"];
const PER_CALL_CHOICES = ["10000", "50000", "100000", "500000"];
/** Under this the agent cannot pay for a typical call: the top-up card comes first. */
const LOW_BALANCE = 100_000n;
const ZERO = 0n;
const PERCENT = 100;
const METER_H = 8;
/** The hero's coin, beside the figure. */
const COIN = 40;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { color } = useTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: color.ink }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** A choice row: the presets plus the current value when it is not one of them. */
function Choices({ values, current, onChange, disabled, label }: { values: string[]; current: string; onChange: (value: string) => void; disabled: boolean; label: (value: string) => string }) {
  const shown = values.includes(current) ? values : [...values, current].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  return (
    <View style={styles.wrap}>
      {shown.map((value) => (
        <Chip key={value} label={label(value)} selected={value === current} disabled={disabled} onPress={() => onChange(value)} />
      ))}
    </View>
  );
}

/** Today's spending against the daily budget: a thin bar and the two figures, so the cap is never a surprise. */
function BudgetMeter({ spent, budget, price }: { spent: string; budget: string; price: (units: string) => string }) {
  const { t } = useT();
  const { color } = useTheme();
  const cap = BigInt(budget);
  const share = cap > ZERO ? Math.min(PERCENT, Number((BigInt(spent) * BigInt(PERCENT)) / cap)) : 0;
  return (
    <View style={styles.meter} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: PERCENT, now: share }} accessibilityLabel={t("agentWallet.spentOfBudget", { spent: price(spent), budget: price(budget) })}>
      <View style={styles.meterHead}>
        <Text style={[TYPE.rowDetail, styles.grow, { color: color.text2 }]}>{t("agentWallet.spentTodayLabel")}</Text>
        <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t("agentWallet.spentOfBudget", { spent: price(spent), budget: price(budget) })}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: color.raised2 }]}>
        <View style={[styles.fillBar, { width: `${share}%`, backgroundColor: share >= PERCENT ? color.destructive : color.accent }]} />
      </View>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  const { color } = useTheme();
  return (
    <View style={[styles.cell, { backgroundColor: color.raised2 }]}>
      <Text numberOfLines={1} style={[TYPE.meta, { color: color.text3 }]}>{label}</Text>
      <Text numberOfLines={1} style={[TYPE.rowStrong, { color: color.ink }]}>{value}</Text>
    </View>
  );
}

export function AgentWalletScreen() {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const signIn = useSignIn();
  const wide = useWide();
  const wallet = useAgentWallet({ load: false });
  const { view, price } = wallet;
  const [amount, setAmount] = React.useState<string>();
  const [refreshing, setRefreshing] = React.useState(false);
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const refresh = wallet.refresh;

  useFocusEffect(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const chosen = amount ?? view?.topUpPresets[0] ?? "0";
  const settings = view?.settings;
  const busy = Boolean(wallet.busy);
  const total = view ? BigInt(view.balances.total) : ZERO;

  const toggleCategory = (category: MarketplaceCategory) => {
    if (!settings) return;
    const all = settings.allowedCategories.length === 0;
    const next = all ? CATEGORIES.filter((entry) => entry !== category) : settings.allowedCategories.includes(category) ? settings.allowedCategories.filter((entry) => entry !== category) : [...settings.allowedCategories, category];
    void wallet.updateSettings({ allowedCategories: next.length === CATEGORIES.length ? [] : next });
  };

  let body: React.ReactNode;
  if (!wallet.account) {
    body = <EmptyState why={t("agentWallet.guestTitle")} detail={t("agentWallet.guestBody")} action={{ label: t("agentWallet.signIn"), onPress: signIn.open }} size="page" />;
  } else if (wallet.failed && !view) {
    body = <ErrorState diagnosis={{ kind: "server", retryable: true }} stillWorks={t("agentWallet.stillWorks")} retry={() => void refresh()} />;
  } else if (!view || !settings) {
    body = (
      <View style={styles.section}>
        <LoadingState shape="hero" />
        <LoadingState shape="list" />
      </View>
    );
  } else {
    body = (
      <View style={wide ? styles.columns : styles.stack}>
      <View style={wide ? styles.column : styles.stack}>
        {/* 1. The hero: the balance, today's spending against the daily budget, where the money sits */}
        <Panel style={styles.heroCard}>
          <View style={styles.heroHead}>
            <Mark entity={arcIdentity(user?.activeNetwork ?? "testnet").usdc} size={COIN} />
            <View style={styles.grow}>
              <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("agentWallet.balance")}</Text>
              <RollingFigure text={price(view.balances.total)} value={total} color={color.ink} height={TYPE.displayBalance.lineHeight ?? SIZE.avatarLg} align="left" sensitive />
            </View>
          </View>
          <BudgetMeter spent={view.spentToday} budget={settings.dailyBudget} price={price} />
          <View style={styles.cells}>
            <Cell label={t("agentWallet.inGateway")} value={price(view.balances.inGateway)} />
            <Cell label={t("agentWallet.onHand")} value={price(view.balances.onHand)} />
          </View>
          {view.address ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("agentWallet.copyAddress")}
              onPress={() => void Clipboard.setStringAsync(view.address!).then(() => notify.success(t("agentWallet.addressCopied")))}
              style={({ pressed }) => [styles.addressChip, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
            >
              <Icon icon={Copy} size={SIZE.iconSm} tint={color.text2} />
              <Text style={[TYPE.meta, { color: color.text2 }]}>{shortAddress(view.address)}</Text>
            </Pressable>
          ) : null}
          {testnet ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("agentWallet.testnetNote")}</Text> : null}
        </Panel>

        {/* 2. Low: the fix first */}
        {total < LOW_BALANCE ? (
          <View style={[styles.low, { backgroundColor: color.raised2 }]} accessibilityRole="alert">
            <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t("agentWallet.lowTitle")}</Text>
            <Text style={[TYPE.body, { color: color.text2 }]}>{t("agentWallet.lowBody")}</Text>
          </View>
        ) : null}

        {/* 3. Top up and return */}
        <Section title={t("agentWallet.topUp")}>
          <Panel style={styles.panel}>
            <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{view.grant ? t("agentWallet.topUpBody", { perDay: price(view.grant.perDay) }) : t("agentWallet.topUpFirstBody")}</Text>
            <TopUpPresets presets={view.topUpPresets} value={chosen} onChange={setAmount} disabled={busy} />
            <Button label={`${t("agentWallet.topUp")} ${price(chosen)}`} loading={wallet.busy === "top_up"} disabled={busy} onPress={() => void wallet.topUp(chosen)} />
            <CardTopUp amount={chosen} disabled={busy} />
            <Button label={t("agentWallet.return")} variant="ghost" loading={wallet.busy === "return"} disabled={busy || total === ZERO} onPress={() => void wallet.returnAll()} />
          </Panel>
        </Section>

      </View>
      <View style={wide ? styles.column : styles.stack}>
        {/* 4. Controls */}
        <Section title={t("agentWallet.budget")}>
          <Panel style={styles.panel}>
            <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t("agentWallet.dailyBudget")}</Text>
            <Choices
              values={DAILY_CHOICES.filter((value) => BigInt(value) <= BigInt(settings.limits.maxDailyBudget))}
              current={settings.dailyBudget}
              disabled={busy}
              label={price}
              onChange={(value) => void wallet.updateSettings({ dailyBudget: value, ...(BigInt(settings.perCallCap) > BigInt(value) ? { perCallCap: value } : {}) })}
            />
            <Rule />
            <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t("agentWallet.perCallCap")}</Text>
            <Choices values={PER_CALL_CHOICES.filter((value) => BigInt(value) <= BigInt(settings.dailyBudget))} current={settings.perCallCap} disabled={busy} label={price} onChange={(value) => void wallet.updateSettings({ perCallCap: value })} />
            <Rule />
            <View style={styles.switchRow}>
              <Text style={[TYPE.row, styles.grow, { color: color.ink }]}>{t("agentWallet.askFirst")}</Text>
              <Switch value={settings.askFirst} disabled={busy} onValueChange={(checked) => void wallet.updateSettings({ askFirst: checked })} accessibilityLabel={t("agentWallet.askFirst")} />
            </View>
          </Panel>
        </Section>

        {/* 5. Categories and sellers */}
        <Section title={t("agentWallet.categories")}>
          <View style={styles.wrap}>
            {CATEGORIES.map((category) => (
              <Chip
                key={category}
                label={t(`agentWallet.category.${category}`)}
                selected={settings.allowedCategories.length === 0 || settings.allowedCategories.includes(category)}
                disabled={busy}
                onPress={() => toggleCategory(category)}
              />
            ))}
          </View>
        </Section>
        <Section title={t("agentWallet.blockedSellers")}>
          <Panel>
            {settings.blockedSellers.length === 0 ? (
              <Text style={[TYPE.body, styles.pad, { color: color.text3 }]}>{t("agentWallet.noBlocked")}</Text>
            ) : (
              settings.blockedSellers.map((seller) => (
                <View key={seller.key} style={[styles.switchRow, styles.pad]}>
                  <Text style={[TYPE.row, styles.grow, { color: color.ink }]}>{seller.name}</Text>
                  <Button label={t("agentWallet.unblock")} variant="ghost" size="sm" block={false} onPress={() => void wallet.updateSettings({ blockedSellers: settings.blockedSellers.filter((entry) => entry.key !== seller.key) })} />
                </View>
              ))
            )}
          </Panel>
        </Section>

        {/* 6. Spending history */}
        <Section title={t("agentWallet.history")}>
          {view.history.length === 0 ? (
            <EmptyState why={t("agentWallet.historyEmpty")} action={{ label: t("agentWallet.browse"), onPress: () => router.push("/marketplace") }} size="inline" />
          ) : (
            <Panel>
              {view.history.map((item) =>
                item.kind === "purchase" ? (
                  <PurchaseRow
                    key={item.purchase.id}
                    purchase={item.purchase}
                    onPress={() => {
                      const key = item.purchase.provider.toLowerCase();
                      if (settings.blockedSellers.some((seller) => seller.key === key)) return;
                      // A tap on a purchase offers to block its seller (tightening: no prompt).
                      toast(item.purchase.provider, {
                        description: item.purchase.description ?? undefined,
                        action: {
                          label: t("agentWallet.block"),
                          onClick: () =>
                            void wallet
                              .updateSettings({ blockedSellers: [...settings.blockedSellers, { key, name: item.purchase.provider }] })
                              .then(() => notify.success(t("agentWallet.blocked", { name: item.purchase.provider }))),
                        },
                      });
                    }}
                  />
                ) : (
                  <MoveRow key={item.move.id} move={item.move} />
                ),
              )}
            </Panel>
          )}
        </Section>

        {/* 7. The marketplace */}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            fire("tick");
            router.push("/marketplace");
          }}
          style={({ pressed }) => [styles.link, { backgroundColor: pressed ? color.rowPressed : color.card }]}
        >
          <View style={styles.grow}>
            <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t("agentWallet.browse")}</Text>
            <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("agentWallet.browseBody")}</Text>
          </View>
          <Icon icon={ChevronRight} size={SIZE.iconSm} tint={color.text3} />
        </Pressable>
      </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: color.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + SPACE.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("agentWallet.back")}
          hitSlop={SPACE.sm}
          onPress={() => {
            fire("tick");
            if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
          style={({ pressed }) => [styles.round, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
        >
          <Icon icon={ChevronLeft} size={SIZE.iconSm} tint={color.ink} />
        </Pressable>
        <Text accessibilityRole="header" style={[TYPE.pageTitle, { color: color.ink }]}>
          {t("agentWallet.title")}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + SPACE.xxxl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.inset, paddingBottom: SPACE.sm },
  round: { width: SIZE.touch - SPACE.sm, height: SIZE.touch - SPACE.sm, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  body: { gap: SPACE.xxl, paddingHorizontal: SPACE.inset, paddingTop: SPACE.md },
  heroCard: { padding: SPACE.lg, gap: SPACE.lg },
  heroHead: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  meter: { gap: SPACE.xs },
  meterHead: { flexDirection: "row", alignItems: "baseline", gap: SPACE.sm },
  track: { height: METER_H, borderRadius: RADIUS.pill, overflow: "hidden" },
  fillBar: { height: METER_H, borderRadius: RADIUS.pill },
  cells: { flexDirection: "row", gap: SPACE.sm },
  cell: { flex: 1, minWidth: 0, gap: SPACE.xxs, padding: SPACE.md, borderRadius: RADIUS.md },
  addressChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: SPACE.xs, paddingHorizontal: SPACE.md, height: SIZE.chipHeight, borderRadius: RADIUS.pill },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.xxl },
  column: { flex: 1, minWidth: 0, gap: SPACE.xxl },
  stack: { gap: SPACE.xxl },
  section: { gap: SPACE.md },
  panel: { padding: SPACE.lg, gap: SPACE.md },
  pad: { padding: SPACE.lg },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  switchRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  low: { gap: SPACE.xs, padding: SPACE.lg, borderRadius: RADIUS.md },
  link: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.lg, borderRadius: RADIUS.md },
});
