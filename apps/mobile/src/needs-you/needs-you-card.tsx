// One step waiting for the person (Needs you): what the automation wants to do and why it waits, and the answer.
// "Review and approve" claims it once on the api, which re-checks everything by opening the very send or swap a person
// would make by hand; that card then appears here and the person confirms it as usual (Face ID, or the slide for a
// swap). Answered elsewhere already — on another device, from the push, on the web — it says when and where.
import { ArrowLeftRight, BellRing, PauseCircle } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import { ApiError, type NeedsYouApproval, type NeedsYouItem, type ProposeSendOutput, type ProposeSwapOutput } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { SendCard } from "@/chat/send-card";
import { SwapCard } from "@/chat/swap-card";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { shortAddress, useMoney, usePolicyText } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const AVATAR = 40;
const HTTP_CONFLICT = 409;

export function useNeedsYouText() {
  const { t, i18n } = useT();
  const { locale } = useLocale();
  const money = useMoney();
  const policyText = usePolicyText();
  return {
    what: (item: NeedsYouItem) => {
      const request = item.request;
      if (request.type === "send") return t("needsYou.send", { amount: money(request.asset, request.amount), name: request.name ?? shortAddress(request.recipientAddress) });
      return t("needsYou.swap", { amount: formatTokenAmount(BigInt(request.amount), request.decimalsIn, request.symbolIn, locale, { trimZeros: true }), symbolOut: request.symbolOut });
    },
    quote: (item: NeedsYouItem) => {
      const request = item.request;
      if (request.type !== "swap" || !request.quotedOut || request.decimalsOut === null) return null;
      return t("needsYou.swapQuote", { amount: formatTokenAmount(BigInt(request.quotedOut), request.decimalsOut, request.symbolOut, locale, { trimZeros: true }) });
    },
    why: (item: NeedsYouItem) => {
      const key = `needsYou.reason_${item.reason}`;
      return i18n.exists(key) ? t(key) : policyText({ code: item.reason as never, kind: "policy", ...(item.reasonParams ? { params: item.reasonParams } : {}) }, item.network);
    },
    when: (iso: string) => new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)),
  };
}

export function NeedsYouCard({ item: initial, via = "app", onChange }: { item: NeedsYouItem; via?: "app" | "push" | "web"; onChange?: (item: NeedsYouItem) => void }) {
  const { t } = useT();
  const { user } = useSession();
  const text = useNeedsYouText();
  const [item, setItem] = React.useState(initial);
  const [opened, setOpened] = React.useState<Extract<NeedsYouApproval, { status: "opened" }>>();
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setItem(initial), [initial]);
  const request = item.request;
  const elsewhere = (user?.activeNetwork ?? "testnet") !== item.network;
  const networkName = item.network === "testnet" ? t("network.arcTestnet") : t("network.arc");

  const settle = (next: NeedsYouItem) => {
    setItem(next);
    onChange?.(next);
  };
  const approve = async () => {
    setBusy(true);
    try {
      const answer = await api.needsYou.approve(item.id, via);
      settle(answer.item);
      if (answer.status === "opened") setOpened(answer);
      else toast(t("needsYou.alreadyAnswered", { status: t(`needsYou.status_${answer.item.status}`), when: answer.item.decidedAt ? text.when(answer.item.decidedAt) : "" }));
    } catch (error) {
      toast(error instanceof ApiError && error.status === HTTP_CONFLICT ? t("needsYou.switchNetwork", { network: networkName }) : t("needsYou.failed"));
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    setBusy(true);
    try {
      const { item: next } = await api.needsYou.decline(item.id, via);
      settle(next);
    } catch {
      toast(t("needsYou.failed"));
    } finally {
      setBusy(false);
    }
  };

  const mark =
    request.type === "send" ? (
      <DefaultAvatar seed={request.recipientAddress.toLowerCase()} size={AVATAR} label={request.name ?? shortAddress(request.recipientAddress)} />
    ) : (
      <View className="bg-muted items-center justify-center rounded-full" style={{ width: AVATAR, height: AVATAR }}>
        <Icon as={ArrowLeftRight} className="text-foreground size-5" />
      </View>
    );

  return (
    <View className="gap-3">
      <View className="bg-card border-border gap-3 rounded-3xl border p-4">
        <View className="flex-row items-center justify-between">
          <Eyebrow>{`${t("needsYou.title")} · ${networkName}`}</Eyebrow>
          <StateLabel>{t(`needsYou.status_${item.status}`)}</StateLabel>
        </View>
        <View className="flex-row items-center gap-3">
          {mark}
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className={cn("font-display text-foreground text-lg font-bold", TEXT_START)}>{text.what(item)}</Text>
            {text.quote(item) ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{text.quote(item)}</Text> : null}
          </View>
        </View>
        <View className="flex-row items-start gap-2">
          <Icon as={item.reason === "SWAP_STEP" || item.reason === "PRICE_REACHED" ? BellRing : PauseCircle} className="text-muted-foreground mt-0.5 size-4" />
          <Text className={cn("text-muted-foreground flex-1 text-sm leading-5", TEXT_START)}>{text.why(item)}</Text>
        </View>
        {item.status === "pending" ? (
          elsewhere ? (
            <Text className={cn("text-foreground text-sm", TEXT_START)}>{t("needsYou.switchNetwork", { network: networkName })}</Text>
          ) : (
            <View className="gap-2">
              <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("needsYou.expires", { time: text.when(item.expiresAt) })}</Text>
              <Button disabled={busy} onPress={() => void approve()}>
                <Text>{t("needsYou.approve")}</Text>
              </Button>
              <Button variant="ghost" disabled={busy} onPress={() => void decline()}>
                <Text>{t("needsYou.decline")}</Text>
              </Button>
            </View>
          )
        ) : item.decidedAt ? (
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
            {t("needsYou.answered", { when: text.when(item.decidedAt), via: t(`needsYou.via_${item.decidedVia ?? "app"}`, { defaultValue: item.decidedVia ?? "" }) })}
          </Text>
        ) : null}
      </View>
      {/* The opened payment, confirmed as by hand: the same card, the same Face ID or slide. */}
      {opened?.kind === "send" ? <SendCard output={{ intent: opened.intent, summary: {} as ProposeSendOutput["summary"] }} /> : null}
      {opened?.kind === "swap" ? <SwapCard output={{ intent: opened.intent, summary: {} as ProposeSwapOutput["summary"] }} /> : null}
    </View>
  );
}
