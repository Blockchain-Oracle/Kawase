// The Agent wallet page (cards/marketplace.md, Abu 10-02: "x402 was supposed to have their page … user can fund their
// x402 wallet"). Top to bottom: the balance (ready to pay in Gateway vs on hand), Top up (presets, one tap; the first
// one signs the capped grant with Face ID), Return to my wallet, the budget (per day, per call, ask first; tighten
// instant, loosen with Face ID), categories, blocked sellers, and the spending history. Reached from Settings, the chat
// card "Top up your agent wallet" and the agent's wallet card.
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { Bot, ChevronLeft, Copy } from "lucide-react-native";
import * as React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { MarketplaceCategory } from "@kawase/api-client";
import { Amount } from "@kawase/ui-native/components/amount";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { CardTopUp } from "@/marketplace/card-top-up";
import { Chip, MoveRow, PurchaseRow, TopUpPresets } from "@/marketplace/parts";
import { useAgentWallet } from "@/marketplace/use-agent-wallet";
import { shortAddress } from "@/send/copy";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ART_SIZE = 56;
const SKELETON_HEIGHT = 160;
const CATEGORIES: MarketplaceCategory[] = ["SEARCH", "FINANCIAL", "PREDICTION", "DATA", "SOCIAL", "INFRASTRUCTURE", "CREATIVE", "OTHER"];
/** Budget choices in USDC base units: per day, and per call. */
const DAILY_CHOICES = ["500000", "1000000", "5000000", "20000000"];
const PER_CALL_CHOICES = ["10000", "50000", "100000", "500000"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Eyebrow className="px-1">{title}</Eyebrow>
      {children}
    </View>
  );
}

/** A choice row: the presets plus the current value when it is not one of them. */
function Choices({ values, current, onChange, disabled, label }: { values: string[]; current: string; onChange: (value: string) => void; disabled: boolean; label: (value: string) => string }) {
  const shown = values.includes(current) ? values : [...values, current].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  return (
    <View className="flex-row flex-wrap gap-2">
      {shown.map((value) => (
        <Chip key={value} label={label(value)} selected={value === current} disabled={disabled} onPress={() => onChange(value)} />
      ))}
    </View>
  );
}

export function AgentWalletScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const signIn = useSignIn();
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

  const toggleCategory = (category: MarketplaceCategory) => {
    if (!settings) return;
    const all = settings.allowedCategories.length === 0;
    const next = all ? CATEGORIES.filter((entry) => entry !== category) : settings.allowedCategories.includes(category) ? settings.allowedCategories.filter((entry) => entry !== category) : [...settings.allowedCategories, category];
    void wallet.updateSettings({ allowedCategories: next.length === CATEGORIES.length ? [] : next });
  };

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={() => router.back()}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("agentWallet.title")}
        </Text>
      </View>
      <ScrollView
        contentContainerClassName="gap-7 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + EDGE_INSET, flexGrow: 1 }}
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
        {!wallet.account ? (
          <EmptyState
            art={<Icon as={Bot} className="text-muted-foreground" size={ART_SIZE} />}
            title={t("agentWallet.guestTitle")}
            body={t("agentWallet.guestBody")}
            action={
              <Button onPress={signIn.open}>
                <Text>{t("signIn.title")}</Text>
              </Button>
            }
          />
        ) : wallet.failed && !view ? (
          <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
            <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("agentWallet.failed")}</Text>
            <Button size="sm" variant="secondary" onPress={() => void refresh()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          </View>
        ) : !view || !settings ? (
          <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
        ) : (
          <>
            {/* 1. Balance */}
            <View className="bg-card border-border gap-3 rounded-3xl border p-5">
              <Eyebrow>{t("agentWallet.balance")}</Eyebrow>
              <Amount className="text-foreground text-4xl font-semibold">{price(view.balances.total)}</Amount>
              <View className="gap-1">
                <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
                  {`${t("agentWallet.inGateway")}: ${price(view.balances.inGateway)}`}
                </Text>
                <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{`${t("agentWallet.onHand")}: ${price(view.balances.onHand)}`}</Text>
                <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
                  {t("agentWallet.spentToday", { amount: price(view.spentToday) })}
                </Text>
              </View>
              {view.address ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("receive.copy")}
                  className="flex-row items-center gap-2"
                  onPress={() => {
                    void Clipboard.setStringAsync(view.address!).then(() => toast(t("home.addressCopied")));
                  }}
                >
                  <Amount className="text-muted-foreground text-sm">{shortAddress(view.address)}</Amount>
                  <Icon as={Copy} className="text-muted-foreground size-3.5" />
                </Pressable>
              ) : null}
              {testnet ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("agentWallet.testnetNote")}</Text> : null}
            </View>

            {/* 2–3. Top up and return */}
            <Section title={t("agentWallet.topUp")}>
              <View className="bg-card border-border gap-4 rounded-3xl border p-4">
                <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>
                  {view.grant ? t("agentWallet.topUpBody", { perDay: price(view.grant.perDay) }) : t("agentWallet.topUpFirstBody")}
                </Text>
                <TopUpPresets presets={view.topUpPresets} value={chosen} onChange={setAmount} disabled={busy} />
                <Button disabled={busy} onPress={() => void wallet.topUp(chosen)}>
                  <Text>{wallet.busy === "top_up" ? t("common.loading") : `${t("agentWallet.topUp")} ${price(chosen)}`}</Text>
                </Button>
                <CardTopUp amount={chosen} disabled={busy} />
                <Button variant="secondary" disabled={busy || BigInt(view.balances.total) === BigInt(0)} onPress={() => void wallet.returnAll()}>
                  <Text>{wallet.busy === "return" ? t("common.loading") : t("agentWallet.return")}</Text>
                </Button>
              </View>
            </Section>

            {/* 4. Budget */}
            <Section title={t("agentWallet.budget")}>
              <View className="bg-card border-border gap-4 rounded-3xl border p-4">
                <View className="gap-2">
                  <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("agentWallet.dailyBudget")}</Text>
                  <Choices values={DAILY_CHOICES.filter((value) => BigInt(value) <= BigInt(settings.limits.maxDailyBudget))} current={settings.dailyBudget} disabled={busy} label={price} onChange={(value) => void wallet.updateSettings({ dailyBudget: value, ...(BigInt(settings.perCallCap) > BigInt(value) ? { perCallCap: value } : {}) })} />
                </View>
                <View className="gap-2">
                  <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("agentWallet.perCallCap")}</Text>
                  <Choices values={PER_CALL_CHOICES.filter((value) => BigInt(value) <= BigInt(settings.dailyBudget))} current={settings.perCallCap} disabled={busy} label={price} onChange={(value) => void wallet.updateSettings({ perCallCap: value })} />
                </View>
                <View className="flex-row items-center gap-3">
                  <Text className={cn("text-foreground flex-1 text-base", TEXT_START)}>{t("agentWallet.askFirst")}</Text>
                  <Switch checked={settings.askFirst} disabled={busy} onCheckedChange={(checked) => void wallet.updateSettings({ askFirst: checked })} accessibilityLabel={t("agentWallet.askFirst")} />
                </View>
              </View>
            </Section>

            {/* 5. Categories and sellers */}
            <Section title={t("agentWallet.categories")}>
              <View className="flex-row flex-wrap gap-2">
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
              <ListGroup>
                {settings.blockedSellers.length === 0 ? (
                  <ListRow title={t("agentWallet.noBlocked")} />
                ) : (
                  settings.blockedSellers.map((seller) => (
                    <ListRow
                      key={seller.key}
                      title={seller.name}
                      trailing={<Text className="text-primary text-sm font-semibold">{t("agentWallet.unblock")}</Text>}
                      onPress={() => void wallet.updateSettings({ blockedSellers: settings.blockedSellers.filter((entry) => entry.key !== seller.key) })}
                    />
                  ))
                )}
              </ListGroup>
            </Section>

            {/* 6. Spending history */}
            <Section title={t("agentWallet.history")}>
              {view.history.length === 0 ? (
                <Text className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>{t("agentWallet.historyEmpty")}</Text>
              ) : (
                <ListGroup>
                  {view.history.map((item) =>
                    item.kind === "purchase" ? (
                      <PurchaseRow
                        key={item.purchase.id}
                        purchase={item.purchase}
                        onPress={() => {
                          const key = item.purchase.provider.toLowerCase();
                          if (settings.blockedSellers.some((seller) => seller.key === key)) return;
                          // A tap on a purchase offers to block its seller (tightening: no Face ID).
                          toast(item.purchase.provider, {
                            description: item.purchase.description ?? undefined,
                            action: {
                              label: t("agentWallet.block"),
                              onClick: () =>
                                void wallet
                                  .updateSettings({ blockedSellers: [...settings.blockedSellers, { key, name: item.purchase.provider }] })
                                  .then(() => toast(t("agentWallet.blocked", { name: item.purchase.provider }))),
                            },
                          });
                        }}
                      />
                    ) : (
                      <MoveRow key={item.move.id} move={item.move} />
                    ),
                  )}
                </ListGroup>
              )}
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}
