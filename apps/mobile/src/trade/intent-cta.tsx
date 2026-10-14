// The money CTA of every surface in this lane (trade, position close, send, earn, borrow), on the Look lane's tx kit:
//  - blocked: BlockedCta wears the fix ("Add money", "Switch to mainnet", "Edit amount") and runs it; the reason is one
//    caption line. A wait (the quote is pricing) is a named wait on the same plate, never a grey ghost.
//  - ready: the confirm, as a slide (an open, a borrow, a withdrawal: D38 "still a confirm") or a press (inside the
//    weekly budget, or above it with Face ID named on the plate).
//  - in flight: TxCta never looks disabled; Signing → Sent → Confirmed run under it.
//  - done: it morphs into the host's receipt (TxMorph), with the confirmed sound once per intent.
//  - failed: TxFailureCard says whether money moved; Try again only when nothing did.
// The intent is journalled once it leaves the phone and forgotten when it ends, so a kill never loses it and recovery
// only reads its status (nothing here re-sends).
import * as React from "react";
import { Linking, StyleSheet, View } from "react-native";

import { type SlideTone, SlideToConfirm, SPACE } from "@/components/kit";
import { BlockedCta, forgetIntent, journalIntent, noteTxHash, TxCta, TxFailureCard, type IntentKind } from "@/components/tx";
import { fire } from "@/feedback/fire";

import { txStateOf, type TxIntent } from "./intent-tx";

export type CtaBlocker = {
  /** The blocker in words ("Enter an amount"), or the fix's label when `onFix` is given ("Add money"). */
  label: string;
  reason?: string | null;
  onFix?: (() => void) | undefined;
  /** A wait (pricing): a named wait on the plate. */
  busy?: boolean;
};

export type CtaConfirm = { kind: "slide"; label: string; tone: SlideTone } | { kind: "press"; label: string; tone?: "primary" | "accent" };

export type CtaJournal = { what: string; kind: IntentKind; network: "mainnet" | "testnet"; owner: string | null | undefined };

type Props = {
  intent: TxIntent | undefined;
  busy: boolean;
  connectionLost: boolean;
  confirm: CtaConfirm;
  onConfirm: () => void;
  blocker?: CtaBlocker | null;
  /** The receipt the CTA morphs into once confirmed. */
  receipt?: React.ReactNode;
  /** After a failure where no money moved: start again (a fresh draft). */
  onRetry?: () => void;
  journal?: CtaJournal;
  /** The outcome cue: money leaving ("send") or the default confirmation. */
  sound?: "send" | "confirmed";
};

export function IntentCta({ intent, busy, connectionLost, confirm, onConfirm, blocker, receipt, onRetry, journal, sound = "confirmed" }: Props) {
  const state = txStateOf(intent, { busy, connectionLost, blocked: blocker && !blocker.busy ? blocker.label : null });
  const id = intent?.id;

  // The outcome cue once per intent, never on a remount (the identity holds it).
  React.useEffect(() => {
    if (!id) return;
    if (state.kind === "confirmed") fire("filled", { sound, identity: `${id}:done` });
    if (state.kind === "failed") fire("fail", { sound: "error", identity: `${id}:failed` });
  }, [id, sound, state.kind]);

  // The journal: written when the action leaves the phone, its hash noted, forgotten once it ends either way.
  const leftPhone = state.kind === "submitted" || state.kind === "unknown";
  const ended = state.kind === "confirmed" || state.kind === "failed";
  const hash = "txHash" in state ? state.txHash : null;
  const journalRef = React.useRef(journal);
  journalRef.current = journal;
  React.useEffect(() => {
    const mark = journalRef.current;
    if (!id || !mark?.owner) return;
    if (leftPhone) {
      journalIntent({ what: mark.what, kind: mark.kind, network: mark.network, id, owner: mark.owner.toLowerCase(), sentAt: Date.now() });
      if (hash) noteTxHash(id, hash);
    }
    if (ended) forgetIntent(id);
  }, [ended, hash, id, leftPhone]);

  if (state.kind === "blocked" && blocker) {
    return (
      <BlockedCta
        blocker={{ label: blocker.label, reason: blocker.reason ?? null, fix: blocker.onFix ? { kind: "retry" } : null }}
        {...(blocker.onFix ? { onFix: blocker.onFix, fixLabel: blocker.label } : {})}
      />
    );
  }
  if (blocker?.busy && (state.kind === "idle" || state.kind === "review")) {
    return <BlockedCta blocker={{ label: blocker.label, reason: blocker.reason ?? null, busy: true }} />;
  }
  if ((state.kind === "review" || state.kind === "idle") && confirm.kind === "slide") {
    return <SlideToConfirm label={confirm.label} tone={confirm.tone} disabled={state.kind !== "review"} resetKey={`${id ?? "none"}:${intent?.state ?? ""}`} onConfirm={onConfirm} />;
  }
  const tone = confirm.kind === "press" ? (confirm.tone ?? "primary") : confirm.tone === "accent" ? "accent" : "primary";
  return (
    <View style={styles.stack}>
      <TxCta
        state={state}
        action={confirm.label}
        tone={tone}
        onConfirm={state.kind === "failed" ? (onRetry ?? onConfirm) : onConfirm}
        {...(receipt !== undefined ? { receipt } : {})}
      />
      {state.kind === "failed" ? (
        <TxFailureCard
          state={state}
          {...(onRetry ? { onRetry } : {})}
          explorerUrl={intent?.tx?.explorerUrl ?? null}
        />
      ) : null}
    </View>
  );
}

/** Opens a transaction on the explorer (receipts' "View on the explorer"). */
export const openExplorer = (url: string | null | undefined) => {
  if (url) void Linking.openURL(url);
};

const styles = StyleSheet.create({ stack: { gap: SPACE.md } });
