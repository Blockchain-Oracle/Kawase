// The run card (D37 "watch it work"; plan §D): one agent run as ONE object from the tap to the receipt, on Home and in
// the thread alike. Its phases, top to bottom, each replacing the last in place:
//   understand  what was asked, drawn from the tool input while it is still streaming ("2 USDC → EURC");
//   race        every venue asked at once, rows lighting up as quotes land (race_routes; RaceRows);
//   approve     nothing when the weekly budget allows it ("Inside your budget · no Face ID"), else one slide;
//   steps       Signing → Sent → Confirmed (TxSteps), driven by the intent as the api sees it;
//   receipt     the slide morphs into the receipt (TxMorph); a failure card says whether money moved (TxFailureCard).
// A typed blocker in the middle (an unknown name, no money, no budget, the wrong network, not signed in) shows the
// smart fix in place, and the same run carries on from that step once it is fixed (needs-you/smart-fix.tsx).
// The run survives an app kill: the card is drawn again from the stored thread, and the intent's own state (read from
// the api, never re-sent) decides the phase; an automatic approval is acted on only while the person watches it land.
//
// Built from 21st parts (premium bar §1): 29318 "Agent Activity" (starc007: one object whose phases tick by with a
// live verb), the race rows (29368/6955/12336, race-card.tsx), the kit's SlideToConfirm (29304), TxSteps (29815),
// TxMorph and TxFailureCard (Mitoshi tx kit).
import { isToolUIPart, type UIMessage } from "ai";
import { useRouter } from "expo-router";
import * as React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition, useReducedMotion } from "react-native-reanimated";

import type { ProposeSendOutput, ProposeSwapOutput, RaceRoutesOutput, SendIntent, SwapIntent, TokenWarning } from "@kawase/api-client";

import { Button, DisclosureRow, Icon, ShimmerText, SIZE, Skeleton, SlideToConfirm, SPACE, TIMING, TYPE, useTheme } from "@/components/kit";
import { CircleCheck, TriangleAlert } from "@/components/kit/icons";
import { TxFailureCard, TxMorph, TxSteps, type TxState } from "@/components/tx";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { SmartFix } from "@/needs-you/smart-fix";
import { recipientName, useMoney, usePolicyText } from "@/send/copy";
import { isFinished as isSendFinished, isMoving as isSendMoving, isOpen as isSendOpen, useSend } from "@/send/use-send";
import { useSwapPolicyText, useSwapPrompt } from "@/swap/copy";
import { useSwapMoney } from "@/swap/swap-tokens";
import { isSwapMoving, isSwapOpen, useSwap } from "@/swap/use-swap";

import { useOpenIn } from "./open-in";
import { RaceRows } from "./race-card";
import { ToolCard, type ToolPart } from "./tool-cards";

/** The steps a run carries to the receipt itself; any other propose step is shown as its own card inside the run. */
const SWAP_STEPS = new Set(["propose_trade", "propose_swap"]);
const SEND_STEPS = new Set(["propose_send"]);
/** Every step that moves money after a race or on its own, drawn inside the run plate. */
/** The race skeleton before the first snapshot: three rows. */
const SKELETON_COUNT = 3;
const SKELETON_ROWS = Array.from({ length: SKELETON_COUNT }, (_, row) => row);
const STEP_TOOLS = new Set([...SWAP_STEPS, ...SEND_STEPS, "propose_bridge", "bring_to_arc", "propose_earn", "propose_supply", "propose_withdraw", "start_buy"]);

export type RunPieces = { race: ToolPart | null; step: ToolPart | null; text: string };
export type RunPhase = "understand" | "race" | "approve" | "blocked" | "steps" | "receipt" | "failed" | "answer";

const toolOf = (part: ToolPart) => part.type.replace(/^tool-/, "");

/** The run inside one assistant message: its race and its money step (null when it is a plain answer). */
export function runPiecesOf(message: UIMessage): RunPieces | null {
  let race: ToolPart | null = null;
  let step: ToolPart | null = null;
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    const tool = part.type.replace(/^tool-/, "");
    if (tool === "race_routes") race = part as unknown as ToolPart;
    else if (!step && STEP_TOOLS.has(tool)) step = part as unknown as ToolPart;
  }
  if (!race && !step) return null;
  const text = message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
  return { race, step, text };
}

/** The tool call ids the run card draws (the thread skips them in its own list). */
export const runPartIds = (pieces: RunPieces) => new Set([pieces.race?.toolCallId, pieces.step?.toolCallId].filter(Boolean) as string[]);

type RaceInput = { kind?: string; from?: string; to?: string; amount?: string; destination?: string; source?: string };

/** What was asked, from whatever the tools hold so far (a streaming input is partial: every read is guarded). */
function useHeroLine(pieces: RunPieces, asked: string | null): string | null {
  const { t } = useT();
  const raceInput = (pieces.race?.input ?? null) as RaceInput | null;
  const stepInput = (pieces.step?.input ?? null) as (RaceInput & { recipient?: string; asset?: string }) | null;
  const input = raceInput ?? stepInput;
  if (input) {
    const amount = typeof input.amount === "string" ? input.amount : null;
    const from = (typeof input.from === "string" && input.from) || (typeof stepInput?.asset === "string" && stepInput.asset) || null;
    if (input.kind === "bridge" || (pieces.step && toolOf(pieces.step) === "bring_to_arc")) {
      const source = typeof input.source === "string" ? input.source : null;
      const destination = typeof input.destination === "string" ? input.destination : null;
      return t("feed.run.heroMove", { what: [amount, from ?? "USDC"].filter(Boolean).join(" "), from: source ?? "Arc", to: destination ?? "Arc" });
    }
    if (input.kind === "yield") return t("feed.run.heroEarn", { what: [amount, from ?? "USDC"].filter(Boolean).join(" ") });
    if (typeof stepInput?.recipient === "string") return t("feed.run.heroSend", { what: [amount, from].filter(Boolean).join(" "), name: stepInput.recipient });
    const to = typeof input.to === "string" ? input.to : null;
    if (amount || from || to) return t("feed.run.heroSwap", { what: [amount, from].filter(Boolean).join(" ") || "…", to: to ?? "…" });
  }
  return asked;
}

/** The warning before a buy (the meme/copycat check): what looks wrong, in words, never colour alone. */
function TokenWarningNote({ warning }: { warning: TokenWarning }) {
  const { t } = useT();
  const { color } = useTheme();
  const reasons = warning.reasons.map((reason) => (reason === "copies_name" ? t("feed.run.warn_copies_name", { asset: warning.copies ?? "" }) : t(`feed.run.warn_${reason}`)));
  return (
    <View accessibilityRole="alert" style={[styles.warning, { backgroundColor: warning.level === "danger" ? color.destructiveWash : color.warnWash }]}>
      <Icon icon={TriangleAlert} size={SIZE.iconSm} tint={warning.level === "danger" ? color.destructive : color.warn} />
      <View style={styles.grow}>
        <Text style={[TYPE.bodyStrong, { color: color.ink }]}>{t("feed.run.warnTitle", { symbol: warning.token.symbol })}</Text>
        <Text style={[TYPE.caption, { color: color.text2 }]}>{reasons.join(" · ")}</Text>
        {warning.checkedBy ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("feed.run.warnSource", { source: warning.checkedBy })}</Text> : null}
      </View>
    </View>
  );
}

/** Inside the person's weekly budget: nothing to tap (D38). */
function InsideBudgetLine() {
  const { t } = useT();
  const { color } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(TIMING.selection)} style={[styles.inside, { backgroundColor: color.raised2 }]}>
      <Icon icon={CircleCheck} size={SIZE.iconSm} tint={color.up} />
      <Text style={[TYPE.caption, { color: color.ink }]}>{t("feed.run.insideBudget")}</Text>
    </Animated.View>
  );
}

/** The intent → the lifecycle the tx kit draws. */
function txStateOf(intent: { state: string; outcome: string | null; tx: { hash: string } | null }, busy: boolean): TxState {
  const hash = intent.tx?.hash ?? null;
  if (intent.state === "completed") return intent.outcome === "practiced" ? { kind: "confirmed", txHash: null } : { kind: "confirmed", txHash: hash };
  if (intent.state === "unknown_outcome") return { kind: "unknown", txHash: hash, diagnosis: { kind: "timeout", retryable: false } };
  if (intent.state === "approved" || intent.state === "executing") return { kind: "submitted", txHash: hash, startedAt: Date.now() };
  if (intent.state === "failed" || intent.state === "rejected" || intent.state === "canceled" || intent.state === "expired") {
    const moved = intent.outcome === "sent" ? "yes" : intent.outcome === "checking" ? "unknown" : "no";
    const kind = intent.state === "expired" ? "expired" : intent.state === "rejected" ? "rejected" : intent.outcome === "reverted" ? "slippage" : "unknown";
    return { kind: "failed", diagnosis: { kind, retryable: false, technical: intent.state }, moneyMoved: moved, txHash: hash };
  }
  if (busy) return { kind: "signing", startedAt: Date.now() };
  return { kind: "review" };
}

/** Approved by the api inside the budget, and this part arrived while the person watched: act on it once. */
const actedOn = new Set<string>();

type StepProps = { part: ToolPart; live: boolean; onPhase: (phase: RunPhase) => void };

/** A swap from its draft to its receipt. */
function RunSwapStep({ part, live, onPhase }: StepProps) {
  const { t } = useT();
  const { color } = useTheme();
  const output = part.output as ProposeSwapOutput;
  const controller = useSwap(output.intent);
  const intent: SwapIntent = controller.intent ?? output.intent;
  const policyText = useSwapPolicyText();
  const prompt = useSwapPrompt();
  const money = useSwapMoney();
  const open = useOpenIn();
  const router = useRouter();
  const automatic = part.approval?.isAutomatic === true && part.approval.approved !== false;
  const ready = isSwapOpen(intent) && !intent.blocking && Boolean(intent.draft) && intent.state === "ready_for_approval";
  const state = txStateOf(intent, controller.busy);

  // Inside the budget and watched live: the run goes on by itself, once (never again after a reload).
  React.useEffect(() => {
    if (!ready || !automatic || !live || actedOn.has(intent.id) || controller.busy) return;
    actedOn.add(intent.id);
    void controller.approve(prompt(intent.draft, intent.network));
  }, [ready, automatic, live, intent.id, intent.draft, intent.network, controller, prompt]);

  const phase: RunPhase = intent.blocking && isSwapOpen(intent) ? "blocked" : isSwapOpen(intent) ? "approve" : isSwapMoving(intent) ? "steps" : state.kind === "confirmed" ? "receipt" : "failed";
  React.useEffect(() => onPhase(phase), [phase, onPhase]);
  // Money confirmed while the person watches: the sound and the haptic, once per intent.
  React.useEffect(() => {
    if (state.kind === "confirmed" && live) fire("filled", { sound: "confirmed", identity: `run:${intent.id}` });
    if (state.kind === "failed" && live) fire("fail", { sound: "error", identity: `run-failed:${intent.id}` });
  }, [state.kind, live, intent.id]);

  const draft = intent.draft;
  const paid = draft ? money(draft, "in", draft.amountIn, intent.network) : "";
  const got = draft ? money(draft, "out", intent.received ?? draft.estimatedOut, intent.network) : "";
  const receipt = (
    <View style={styles.receipt}>
      <Text style={[TYPE.caption, { color: color.text3 }]}>{t("feed.run.receipt")}</Text>
      <Text style={[TYPE.sheetTitle, { color: color.ink }]}>{t("feed.run.swapped", { paid, got })}</Text>
      {draft ? <Text style={[TYPE.caption, { color: color.text2 }]}>{t("feed.run.via", { venue: draft.provider })}</Text> : null}
      <View style={styles.row}>
        {intent.tx ? <Button size="sm" block={false} variant="secondary" label={t("feed.run.explorer")} onPress={() => void Linking.openURL(intent.tx!.explorerUrl)} /> : null}
        <Button size="sm" block={false} variant="ghost" label={open.intent("swap", intent.id).label} onPress={() => router.push(open.intent("swap", intent.id).href)} />
      </View>
    </View>
  );

  if (intent.blocking && isSwapOpen(intent))
    return <SmartFix blocking={intent.blocking} reason={policyText(intent.blocking, intent.network)} network={intent.network} onFixed={() => void controller.revise({})} />;
  if (state.kind === "failed") return <TxFailureCard state={state} explorerUrl={intent.tx?.explorerUrl ?? null} onRetry={() => void controller.revise({})} />;
  return (
    <TxMorph morphed={state.kind === "confirmed"} receipt={receipt}>
      <View style={styles.step}>
        {draft && isSwapOpen(intent) ? <Text style={[TYPE.body, { color: color.ink }]}>{t("feed.run.swapLine", { paid, got, venue: draft.provider })}</Text> : null}
        {ready ? (
          automatic ? (
            <InsideBudgetLine />
          ) : (
            <SlideToConfirm label={t("feed.run.slideSwap")} onConfirm={() => void controller.approve(prompt(intent.draft, intent.network))} busy={controller.busy} resetKey={`${intent.id}:${intent.version}`} />
          )
        ) : isSwapOpen(intent) ? (
          <ShimmerText style={[TYPE.caption, { color: color.text3 }]}>{t("feed.run.pricing")}</ShimmerText>
        ) : null}
        {state.kind !== "review" ? <TxSteps state={state} /> : null}
      </View>
    </TxMorph>
  );
}

/** A send from its draft to its receipt; an unknown name is the smart fix (add the address, then the same send goes on). */
function RunSendStep({ part, live, onPhase }: StepProps) {
  const { t } = useT();
  const { color } = useTheme();
  const output = part.output as ProposeSendOutput;
  const controller = useSend(output.intent);
  const intent: SendIntent = controller.intent ?? output.intent;
  const policyText = usePolicyText();
  const money = useMoney();
  const name = recipientName(intent.draft?.recipient, intent.request.recipient);
  const amount = intent.draft ? money(intent.draft.asset, intent.draft.amount, intent.draft.token?.decimals) : [intent.request.amount, intent.request.asset].filter(Boolean).join(" ");
  const ready = isSendOpen(intent) && !intent.blocking && intent.state === "ready_for_approval";
  const state = txStateOf(intent, controller.busy);
  const phase: RunPhase = intent.blocking && isSendOpen(intent) ? "blocked" : isSendOpen(intent) ? "approve" : isSendMoving(intent) ? "steps" : state.kind === "confirmed" ? "receipt" : "failed";
  React.useEffect(() => onPhase(phase), [phase, onPhase]);
  React.useEffect(() => {
    if (state.kind === "confirmed" && live) fire("filled", { sound: "send", identity: `run:${intent.id}` });
  }, [state.kind, live, intent.id]);
  const prompt = t("send.signPrompt", { amount, name });

  if (intent.blocking && isSendOpen(intent))
    return <SmartFix blocking={intent.blocking} reason={policyText(intent.blocking, intent.network)} name={intent.request.recipient} network={intent.network} onFixed={() => void controller.revise({})} />;
  if (state.kind === "failed") return <TxFailureCard state={state} explorerUrl={intent.tx?.explorerUrl ?? null} />;
  const receipt = (
    <View style={styles.receipt}>
      <Text style={[TYPE.caption, { color: color.text3 }]}>{t("feed.run.receipt")}</Text>
      <Text style={[TYPE.sheetTitle, { color: color.ink }]}>{t("feed.run.sent", { amount, name })}</Text>
      {intent.tx ? <Button size="sm" block={false} variant="secondary" label={t("feed.run.explorer")} onPress={() => void Linking.openURL(intent.tx!.explorerUrl)} /> : null}
    </View>
  );
  return (
    <TxMorph morphed={state.kind === "confirmed" && isSendFinished(intent)} receipt={receipt}>
      <View style={styles.step}>
        {isSendOpen(intent) ? <Text style={[TYPE.body, { color: color.ink }]}>{t("feed.run.sendLine", { amount, name })}</Text> : null}
        {ready ? (
          <SlideToConfirm label={t("feed.run.slideSend")} onConfirm={() => void controller.approve(prompt)} busy={controller.busy} resetKey={`${intent.id}:${intent.version}`} />
        ) : null}
        {state.kind !== "review" ? <TxSteps state={state} /> : null}
      </View>
    </TxMorph>
  );
}

/** The phase verb at the top of the card, shimmering while it is live. */
function PhaseLine({ phase, racing }: { phase: RunPhase; racing: { answered: number; total: number } | null }) {
  const { t } = useT();
  const { color } = useTheme();
  const words: Record<RunPhase, string> = {
    understand: t("feed.run.phaseUnderstand"),
    race: racing ? t("feed.run.phaseRace", { answered: racing.answered, total: racing.total }) : t("feed.run.phaseRaceStart"),
    approve: t("feed.run.phaseApprove"),
    blocked: t("feed.run.phaseBlocked"),
    steps: t("feed.run.phaseSteps"),
    receipt: t("feed.run.phaseDone"),
    failed: t("feed.run.phaseFailed"),
    answer: t("feed.run.phaseAnswer"),
  };
  const active = phase === "understand" || phase === "race" || phase === "steps";
  return active ? (
    <ShimmerText style={[TYPE.caption, { color: color.text3 }]}>{words[phase]}</ShimmerText>
  ) : (
    <Text style={[TYPE.caption, { color: phase === "failed" ? color.destructive : phase === "blocked" ? color.warn : color.text3 }]}>{words[phase]}</Text>
  );
}

export type RunCardProps = {
  pieces: RunPieces;
  /** The person's own words, from the message before. */
  asked: string | null;
  /** This run is happening now (not a reopened thread): automatic approvals and sounds act only then. */
  live: boolean;
  /** The agent is still answering this message. */
  streaming: boolean;
  onToolOutput: (tool: string, toolCallId: string, output: unknown) => void;
  onApproval?: ((id: string, approved: boolean) => void) | undefined;
  /** Each phase change, for the live strip above Home's feed. */
  onPhase?: ((phase: RunPhase) => void) | undefined;
};

export function RunCard({ pieces, asked, live, streaming, onToolOutput, onApproval, onPhase }: RunCardProps) {
  const { t } = useT();
  const { color } = useTheme();
  const reduced = useReducedMotion();
  const hero = useHeroLine(pieces, asked);
  const [stepPhase, setStepPhase] = React.useState<RunPhase | null>(null);

  const race = pieces.race?.state === "output-available" ? (pieces.race.output as RaceRoutesOutput) : null;
  const raced = race && race.status !== "routes_unavailable" ? race : null;
  const raceLive = pieces.race ? pieces.race.state !== "output-available" || pieces.race.preliminary === true : false;
  const step = pieces.step;
  const stepTool = step ? toolOf(step) : null;
  const stepReady = step?.state === "output-available" && step.output !== undefined;
  const ownStep = stepReady && stepTool && (SWAP_STEPS.has(stepTool) || SEND_STEPS.has(stepTool)) && (step!.output as { intent?: unknown }).intent;

  const phase: RunPhase = stepPhase && ownStep ? stepPhase : step ? (stepReady ? "approve" : "understand") : pieces.race ? (raced ? (raceLive ? "race" : "answer") : "race") : "understand";
  React.useEffect(() => {
    onPhase?.(phase);
    if (phase === "receipt" && live) fire("agentDone", { sound: "agentDone", identity: `run-done:${step?.toolCallId ?? ""}` });
  }, [phase, onPhase, live, step?.toolCallId]);
  const answered = raced ? raced.race.rows.filter((row) => row.status !== "checking").length : 0;
  const best = raced?.race.rows.find((row) => row.venue === raced.race.best);
  // The race folds into one line once the step below it is drawn (detail behind one disclosure).
  const folded = Boolean(step) && !raceLive && Boolean(raced);

  return (
    <Animated.View layout={reduced ? undefined : LinearTransition.duration(TIMING.selection)} style={[styles.card, { backgroundColor: color.card }]}>
      <PhaseLine phase={phase} racing={raced ? { answered, total: raced.race.rows.length } : null} />
      {hero ? (
        <Text style={[TYPE.sheetTitle, { color: color.ink }]} accessibilityRole="header">
          {hero}
        </Text>
      ) : (
        <Skeleton width="70%" height={TYPE.sheetTitle.lineHeight ?? SPACE.xl} />
      )}

      {raced?.warning ? <TokenWarningNote warning={raced.warning} /> : null}

      {pieces.race && !raced && pieces.race.state !== "output-available" ? (
        <View style={styles.skeletonRows}>
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} height={SPACE.xxl} />
          ))}
        </View>
      ) : null}
      {raced ? (
        folded ? (
          <DisclosureRow title={t("feed.run.raceFolded", { total: raced.race.rows.length })} value={best ? best.label : t("feed.run.raceNoBest")}>
            <RaceRows race={raced.race} live={false} />
          </DisclosureRow>
        ) : (
          <RaceRows race={raced.race} live={raceLive} />
        )
      ) : race && race.status === "routes_unavailable" && !step ? (
        <ToolCard part={pieces.race!} onToolOutput={onToolOutput} onApproval={onApproval} />
      ) : null}

      {step ? (
        ownStep && stepTool && SWAP_STEPS.has(stepTool) ? (
          <RunSwapStep part={step} live={live} onPhase={setStepPhase} />
        ) : ownStep && stepTool && SEND_STEPS.has(stepTool) ? (
          <RunSendStep part={step} live={live} onPhase={setStepPhase} />
        ) : (
          <ToolCard part={step} onToolOutput={onToolOutput} onApproval={onApproval} />
        )
      ) : null}

      {pieces.text ? <Text style={[TYPE.caption, { color: color.text2 }]}>{pieces.text}</Text> : streaming && !step && !raceLive ? <ShimmerText style={[TYPE.caption, { color: color.text3 }]}>{t("feed.run.thinking")}</ShimmerText> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: SPACE.xl, padding: SPACE.lg, gap: SPACE.md },
  grow: { flex: 1, gap: SPACE.xxs },
  row: { flexDirection: "row", gap: SPACE.sm, flexWrap: "wrap" },
  step: { gap: SPACE.md },
  receipt: { gap: SPACE.xs },
  warning: { flexDirection: "row", gap: SPACE.sm, borderRadius: SPACE.lg, padding: SPACE.md, alignItems: "flex-start" },
  inside: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, alignSelf: "flex-start", borderRadius: SPACE.lg, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs },
  skeletonRows: { gap: SPACE.sm },
});
