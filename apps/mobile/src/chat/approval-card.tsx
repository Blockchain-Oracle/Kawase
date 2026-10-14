// Who said yes to an agent step (D38, AI SDK 7 toolApproval). Inside the weekly budget the api approves by itself:
// the step's card carries a quiet "Inside your budget" chip and the person is never asked (an automatic approval is
// never answered from here). When the trust rule stops a step before it is drafted (text from outside Kawase in this
// chat, or money going to someone else), the card asks once: what Kawase would prepare, why it asks, "Go ahead" or
// "Not now". The answer goes back with the whole part (its signature binds the tool, the call and the input) and the
// turn carries on. A refusal says plainly that nothing moved.
import { Check, ShieldCheck } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { MOTION } from "@kawase/config";
import { getVenueIdentity } from "@kawase/identity";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { tapFeedback } from "@/feedback/feedback";
import { useT } from "@/i18n";

import { AgentCard } from "./card";

/** The step a tool prepares, as the approval card names it (the api's BUDGETED_TOOLS). */
const STEP: Record<string, string> = {
  propose_trade: "feed.stepSwap",
  propose_swap: "feed.stepSwap",
  propose_bridge: "feed.stepBridge",
  bring_to_arc: "feed.stepBringIn",
  propose_earn: "feed.stepEarn",
  propose_supply: "feed.stepEarn",
};

const WHY: Record<string, string> = { outside_text: "feed.askOutsideText", other_recipient: "feed.askOtherRecipient" };

type StepInput = { amount?: unknown; from?: unknown; asset?: unknown; to?: unknown; destination?: unknown; source?: unknown; recipient?: unknown; venue?: unknown };

const word = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null);

/** The chains a move names by id (the agent's CHAINS), as people know them; brand names are never translated. */
const CHAIN_NAMES: Record<string, string> = { base: "Base", ethereum: "Ethereum", arbitrum: "Arbitrum", optimism: "OP Mainnet", polygon: "Polygon", avalanche: "Avalanche" };
const place = (value: unknown) => {
  const named = word(value);
  return named ? (CHAIN_NAMES[named.toLowerCase()] ?? named) : null;
};

/** "Swap 2 USDC → EURC via LI.FI", from the call's own input (guarded: an input may be partial). */
function useStepLine(tool: string, input: unknown) {
  const { t } = useT();
  const step = input && typeof input === "object" ? (input as StepInput) : {};
  const what = [word(step.amount), word(step.from) ?? word(step.asset) ?? (tool === "propose_trade" || tool === "propose_swap" ? null : "USDC")].filter(Boolean).join(" ");
  // Bringing to Arc already says where it goes ("Bring to Arc 5 USDC").
  const where = tool === "bring_to_arc" ? null : (word(step.to) ?? place(step.destination) ?? word(step.recipient));
  const venue = word(step.venue);
  const venueName = venue ? (getVenueIdentity(venue)?.name ?? venue) : null;
  return [t(STEP[tool] ?? "feed.stepSwap"), what, where ? `→ ${where}` : null, venueName ? t("feed.stepVia", { venue: venueName }) : null].filter(Boolean).join(" ");
}

/** The one ask, before anything is drafted. */
export function ApprovalCard({ tool, input, reason, onAnswer }: { tool: string; input: unknown; reason: string | undefined; onAnswer: (approved: boolean) => void }) {
  const { t } = useT();
  const line = useStepLine(tool, input);
  const [answered, setAnswered] = React.useState(false);
  const answer = (approved: boolean) => {
    if (answered) return;
    setAnswered(true);
    tapFeedback("light");
    onAnswer(approved);
  };
  return (
    <AgentCard eyebrow={t("feed.askFirst")}>
      <Text className={cn("text-foreground font-display text-xl font-bold", TEXT_START)}>{line}</Text>
      {reason && WHY[reason] ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t(WHY[reason])}</Text> : null}
      <View className="flex-row gap-2">
        <Button className="flex-1" disabled={answered} onPress={() => answer(true)}>
          <Icon as={Check} className="text-primary-foreground size-4" />
          <Text>{t("feed.goAhead")}</Text>
        </Button>
        <Button className="flex-1" variant="secondary" disabled={answered} onPress={() => answer(false)}>
          <Text>{t("feed.notNow")}</Text>
        </Button>
      </View>
    </AgentCard>
  );
}

/** The step was not approved: nothing was drafted, nothing moved. */
export function NotDoneCard({ tool, input }: { tool: string; input: unknown }) {
  const { t } = useT();
  const line = useStepLine(tool, input);
  return (
    <AgentCard>
      <Text className={cn("text-muted-foreground text-base line-through", TEXT_START)}>{line}</Text>
      <Text className={cn("text-foreground text-sm", TEXT_START)}>{t("feed.notDone")}</Text>
    </AgentCard>
  );
}

/** Above a step the api approved inside the person's weekly budget. */
export function InsideBudgetChip() {
  const { t } = useT();
  const reduced = useReducedMotionLive();
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(MOTION.sheetMs)} className="bg-secondary mb-2 flex-row items-center gap-1.5 self-start rounded-full px-3 py-1">
      <Icon as={ShieldCheck} className="text-success size-3.5" />
      <Text className="text-secondary-foreground text-xs font-semibold">{t("feed.insideBudget")}</Text>
    </Animated.View>
  );
}
