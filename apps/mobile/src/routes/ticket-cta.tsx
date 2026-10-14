// The foot of a route ticket (swap, move), the whole money lifecycle in one place (premium bar §3): blocked → the
// kit's BlockedCta naming its fix; review → slide to confirm (the accent rail: a trade, Senryo); in flight → the TxCta
// plate with its phase bar and Signing · Sent · Confirmed (or the ticket's own steps); confirmed → it morphs into the
// receipt; failed → the failure card, which always says whether money moved, with Try again when nothing did. The
// slide resets on any new version (`resetKey`).
import type * as React from "react";
import { StyleSheet, View } from "react-native";

import { type BlockerFix, SlideToConfirm, SPACE } from "@/components/kit";
import { type Blocker, BlockedCta, TxCta, TxFailureCard, type TxState } from "@/components/tx";

export function TicketCta({
  tx,
  action,
  slideLabel,
  resetKey,
  onConfirm,
  blocker,
  onFix,
  receipt,
  steps,
  explorerUrl,
  onRetry,
  busy = false,
}: {
  tx: TxState;
  /** The action's words on the in-flight plate ("Swap 10 USDC to EURC"). */
  action: string;
  slideLabel: string;
  resetKey: string;
  onConfirm: () => void;
  blocker?: Blocker | undefined;
  onFix?: ((fix: BlockerFix) => void) | undefined;
  receipt: React.ReactNode;
  /** A ticket's own tracker under the plate (a move's four steps); the kit's three when omitted. */
  steps?: React.ReactNode;
  explorerUrl?: string | null | undefined;
  onRetry?: (() => void) | undefined;
  /** A fresh price is being fetched: the rail holds still. */
  busy?: boolean;
}) {
  if (tx.kind === "blocked") return <BlockedCta blocker={blocker ?? { label: tx.reason }} {...(onFix ? { onFix } : {})} />;
  if (tx.kind === "review" || tx.kind === "idle") {
    return (
      <View style={styles.wrap}>
        <SlideToConfirm label={slideLabel} tone="accent" resetKey={resetKey} busy={busy} disabled={busy} onConfirm={onConfirm} />
      </View>
    );
  }
  if (tx.kind === "failed") {
    return (
      <View style={styles.wrap}>
        <TxFailureCard state={tx} {...(onRetry && tx.moneyMoved === "no" ? { onRetry } : {})} {...(onFix ? { onFix } : {})} explorerUrl={explorerUrl ?? null} />
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <TxCta state={tx} action={action} tone="accent" onConfirm={onConfirm} receipt={receipt} steps={steps === undefined} />
      {steps !== undefined && tx.kind !== "confirmed" ? steps : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.sm },
});
