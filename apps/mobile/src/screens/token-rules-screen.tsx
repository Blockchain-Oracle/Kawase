// Token rules (D12; cards/automate-safety.md, trade.md; surfaces.md Settings → Token rules): what buys of tokens
// Kawase does not vouch for may be — on screens, in chat, by voice and in automations. Which tokens (verified only,
// or verified and popular with warnings), the per-trade and per-day caps for unverified tokens with today's meter,
// and the highest price impact; copycats and high-risk tokens are always blocked. Tightening saves at once; a
// loosening asks for Face ID and the wallet signs the exact new rules (the same yes as Wallet & limits).
import { useRouter } from "expo-router";
import { ChevronLeft, ShieldCheck } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import type { TypedDataDefinition } from "viem";

import type { TokenRulesValuesView, TokenRulesView } from "@kawase/api-client";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { useWalletSigner } from "@/wallet/use-wallet-signer";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 32;
const SKELETON_HEIGHT = 120;
const BPS_PER_PERCENT = 100;

const valuesOf = (rules: TokenRulesView): TokenRulesValuesView => ({
  access: rules.access,
  unverifiedPerTradeUsd: rules.unverifiedPerTradeUsd,
  unverifiedPerDayUsd: rules.unverifiedPerDayUsd,
  maxPriceImpactBps: rules.maxPriceImpactBps,
});
const sameValues = (a: TokenRulesValuesView, b: TokenRulesValuesView) => JSON.stringify(a) === JSON.stringify(b);
/** Each rule's own direction, as the api decides it: any looser rule makes the change a loosening. */
const loosens = (from: TokenRulesValuesView, to: TokenRulesValuesView) =>
  (from.access === "verified" && to.access === "warned") || to.unverifiedPerTradeUsd > from.unverifiedPerTradeUsd || to.unverifiedPerDayUsd > from.unverifiedPerDayUsd || to.maxPriceImpactBps > from.maxPriceImpactBps;

export function TokenRulesScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale } = useLocale();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const [rules, setRules] = React.useState<TokenRulesView>();
  const [draft, setDraft] = React.useState<TokenRulesValuesView>();
  const [failed, setFailed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (status !== "account") return;
    try {
      const { rules: next } = await api.tokenRules.get();
      setRules(next);
      setDraft(valuesOf(next));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [status]);
  React.useEffect(() => {
    void load();
  }, [load, user?.activeNetwork]);

  const usd = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  const percent = (bps: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(bps / BPS_PER_PERCENT / BPS_PER_PERCENT);
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const changed = rules && draft ? !sameValues(valuesOf(rules), draft) : false;
  const looser = rules && draft ? loosens(valuesOf(rules), draft) : false;

  const save = async () => {
    if (!draft || !rules) return;
    setSaving(true);
    try {
      let answer = await api.tokenRules.change(draft);
      if (answer.status === "needs_approval") {
        const check = await confirmWithBiometrics(t("tokenRules.faceId"), t("common.cancel"));
        if (check !== "approved" || !signer) {
          toast(check === "unavailable" || !signer ? t("send.approvalUnavailable") : t("tokenRules.notChanged"));
          return;
        }
        const signature = await signer.signTypedData(answer.typedData as unknown as TypedDataDefinition);
        answer = await api.tokenRules.approve(answer.changeId, signature);
      }
      if (answer.status === "applied" || answer.status === "unchanged") {
        setRules(answer.rules);
        setDraft(valuesOf(answer.rules));
        toast(t("tokenRules.saved"));
      }
    } catch {
      toast(t("tokenRules.failed"));
    } finally {
      setSaving(false);
    }
  };

  const chips = (values: number[], current: number, label: (value: number) => string, onPick: (value: number) => void, disabled = false) => (
    <View accessibilityRole="radiogroup" className={cn("flex-row flex-wrap gap-2", disabled && "opacity-50")}>
      {values.map((value) => {
        const selected = value === current;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onPick(value)}
            className={cn("rounded-full border px-3.5 py-2", selected ? "border-foreground bg-secondary" : "border-border active:bg-secondary")}
          >
            <Text className={cn("text-sm font-semibold", selected ? "text-foreground" : "text-muted-foreground")}>{label(value)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={leave}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("tokenRules.title")}
        </Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("tokenRules.intro")}</Text>
        {status !== "account" ? (
          <Button onPress={() => signIn.open()}>
            <Text>{t("signIn.title")}</Text>
          </Button>
        ) : !rules || !draft ? (
          failed ? (
            <Button variant="secondary" onPress={() => void load()}>
              <Text>{t("common.retry")}</Text>
            </Button>
          ) : (
            <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
          )
        ) : (
          <>
            <ListGroup label={t("tokenRules.accessTitle")}>
              {(["verified", "warned"] as const).map((access) => (
                <ListRow
                  key={access}
                  accessibilityRole="radio"
                  title={t(`tokenRules.access_${access}`)}
                  subtitle={t(`tokenRules.access_${access}Body`)}
                  selected={draft.access === access}
                  onPress={() => setDraft({ ...draft, access })}
                />
              ))}
            </ListGroup>

            <View className="bg-card border-border gap-4 rounded-3xl border p-4">
              <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("tokenRules.capsTitle")}</Text>
              <View className="gap-2">
                <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("tokenRules.perTrade")}</Text>
                {chips(rules.choices.unverifiedPerTradeUsd, draft.unverifiedPerTradeUsd, usd, (value) => setDraft({ ...draft, unverifiedPerTradeUsd: value }), draft.access === "verified")}
              </View>
              <View className="gap-2">
                <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("tokenRules.perDay")}</Text>
                {chips(rules.choices.unverifiedPerDayUsd, draft.unverifiedPerDayUsd, usd, (value) => setDraft({ ...draft, unverifiedPerDayUsd: value }), draft.access === "verified")}
                <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("tokenRules.usedToday", { used: usd(rules.spentTodayUsd), cap: usd(rules.unverifiedPerDayUsd) })}</Text>
              </View>
              {draft.access === "verified" ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("tokenRules.capsOff")}</Text> : null}
            </View>

            <View className="bg-card border-border gap-3 rounded-3xl border p-4">
              <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("tokenRules.impactTitle")}</Text>
              <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("tokenRules.impactBody")}</Text>
              {chips(rules.choices.maxPriceImpactBps, draft.maxPriceImpactBps, percent, (value) => setDraft({ ...draft, maxPriceImpactBps: value }))}
            </View>

            <View className="bg-muted flex-row items-center gap-3 rounded-3xl p-4">
              <Icon as={ShieldCheck} className="text-foreground size-5" />
              <Text className={cn("text-foreground min-w-0 flex-1 text-sm leading-5", TEXT_START)}>{t("tokenRules.always")}</Text>
            </View>

            <Button disabled={!changed || saving} onPress={() => void save()}>
              <Text>{saving ? t("common.loading") : looser ? t("tokenRules.saveLoosen") : t("tokenRules.save")}</Text>
            </Button>
            <Text className={cn("text-muted-foreground text-xs leading-4", TEXT_START)}>{t("tokenRules.how")}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
