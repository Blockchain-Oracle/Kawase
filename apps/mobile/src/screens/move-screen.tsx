// Move between chains (surfaces.md "Bridge"; routes.md): out of Arc to anyone on another chain, or Bring to Arc.
// The form asks only what it cannot infer: the chain (marks; for Bring to Arc the chains where USDC is waiting at the
// person's address, with how much), the amount (Max for Bring to Arc), and for a move out who receives it (themselves
// unless they say a contact, @handle or address). Review is the bridge card: route options, the slide, the tracker.
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { CrossChainRequest } from "@kawase/api-client";
import { CHAIN_IDS, chainKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { MoveTicket } from "@/crosschain/move-ticket";
import { useCrossChain, useElsewhere } from "@/crosschain/use-crosschain";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 24;
const CHAIN_MARK = 32;
const USDC_UNIT = 1_000_000;
const CHAINS = [
  { key: "base", chainId: CHAIN_IDS.base },
  { key: "ethereum", chainId: CHAIN_IDS.ethereum },
  { key: "arbitrum", chainId: CHAIN_IDS.arbitrum },
  { key: "optimism", chainId: CHAIN_IDS.optimism },
  { key: "polygon", chainId: CHAIN_IDS.polygon },
  { key: "avalanche", chainId: CHAIN_IDS.avalanche },
] as const;

export type MovePrefill = { direction?: "out" | "in" | undefined; chain?: string | undefined; amount?: string | undefined; recipient?: string | undefined };

export function MoveScreen({ prefill }: { prefill: MovePrefill }) {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const money = useMoney();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const elsewhere = useElsewhere();
  const controller = useCrossChain();
  const testnet = (user?.activeNetwork ?? "testnet") === "testnet";
  const [direction, setDirection] = React.useState<"out" | "in">(prefill.direction ?? "out");
  const [chain, setChain] = React.useState<string | undefined>(prefill.chain);
  const [amount, setAmount] = React.useState(prefill.amount ?? "");
  const [recipient, setRecipient] = React.useState(prefill.recipient ?? "");
  const [creating, setCreating] = React.useState(false);
  const waiting = elsewhere?.chains ?? [];
  // Bring to Arc from where the money is: the chain holding the most, unless one was named.
  React.useEffect(() => {
    if (direction === "in" && !chain && waiting[0]) setChain(waiting[0].key);
  }, [direction, chain, waiting]);

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const review = async () => {
    if (status !== "account") {
      signIn.open();
      return;
    }
    const request: CrossChainRequest = direction === "in" ? { direction, source: chain ?? null, amount } : { direction, destination: chain ?? null, amount, recipient: recipient.trim() || null };
    setCreating(true);
    try {
      const { intent } = await api.crosschain.create(request);
      controller.set(intent);
    } catch {
      toast(t("move.unavailable"));
    } finally {
      setCreating(false);
    }
  };

  const intent = controller.intent;
  const valid = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0 && Boolean(chain);
  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={intent ? () => controller.reset() : leave}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {direction === "in" ? t("move.bringTitle") : t("move.title")}
        </Text>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }} keyboardShouldPersistTaps="handled">
        {intent ? (
          <MoveTicket controller={controller} onRetry={() => controller.reset()} />
        ) : (
          <>
            <SegmentedControl
              label={t("move.title")}
              value={direction}
              onValueChange={(value) => {
                setDirection(value as "out" | "in");
                setChain(undefined);
              }}
              options={[
                { value: "out", label: t("move.directionOut") },
                { value: "in", label: t("move.directionIn") },
              ]}
            />
            <View className="gap-2">
              <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{direction === "in" ? t("move.from") : t("move.to")}</Text>
              <View className="flex-row flex-wrap gap-2">
                {CHAINS.map((entry) => {
                  const held = waiting.find((row) => row.key === entry.key);
                  const dim = direction === "in" && !held;
                  return (
                    <Pressable
                      key={entry.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: chain === entry.key }}
                      onPress={() => {
                        setChain(entry.key);
                        if (direction === "in" && held && !amount) setAmount((Number(held.balance) / USDC_UNIT).toString());
                      }}
                      className={cn("flex-row items-center gap-2 rounded-full border px-3 py-2", chain === entry.key ? "border-foreground bg-secondary" : "border-border", dim && "opacity-50")}
                    >
                      <Mark entity={chainKey(entry.chainId)} size={CHAIN_MARK} />
                      <Text className="text-foreground text-sm font-semibold">{t(`move.chain_${entry.key}`)}</Text>
                      {held ? <Text className="text-muted-foreground text-xs">{money("USDC", held.balance)}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
              {direction === "in" && elsewhere && waiting.length === 0 ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("move.nothingElsewhere")}</Text> : null}
            </View>
            <View className="gap-2">
              <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("move.amount")}</Text>
              <TextInput
                accessibilityLabel={t("move.amount")}
                value={amount}
                onChangeText={(text) => setAmount(text.replace(",", ".").replace(/[^\d.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors["muted-foreground"]}
                className="font-display text-4xl font-bold"
                style={{ color: colors.foreground }}
              />
            </View>
            {direction === "out" ? (
              <View className="gap-2">
                <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("move.recipient")}</Text>
                <TextInput
                  accessibilityLabel={t("move.recipient")}
                  value={recipient}
                  onChangeText={setRecipient}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t("move.recipientPlaceholder")}
                  placeholderTextColor={colors["muted-foreground"]}
                  className="border-border rounded-2xl border px-4 py-3 text-base"
                  style={{ color: colors.foreground }}
                />
              </View>
            ) : (
              <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("move.bringNote")}</Text>
            )}
            <Button size="lg" disabled={!valid || creating} onPress={() => void review()}>
              <Text>{creating ? t("common.loading") : t("move.review")}</Text>
            </Button>
          </>
        )}
      </ScrollView>
    </View>
  );
}
