import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canConfirm,
  endingOfThrow,
  isClientRefusal,
  reduceTx,
  type TxState,
  TX_IDLE,
} from "../src/components/tx/tx-state";

const notFound = Object.assign(new Error("transaction not found"), { status: 404 });
const diagnosis = { kind: "unknown" as const, retryable: true, technical: "404" };

/** The path `useTxLifecycle.run` takes: confirm, submitted, then a thrown error classified by `endingOfThrow`. */
function afterThrow(left: boolean, journalled: boolean, error: unknown, rejected = false): TxState {
  let state = reduceTx(TX_IDLE, { type: "confirm", nowMs: 1 });
  if (left) state = reduceTx(state, { type: "submitted", txHash: "0xabc", nowMs: 2 });
  const ending = endingOfThrow({ left, journalled, refusedInWords: rejected || isClientRefusal(error) });
  return ending === "unknown"
    ? reduceTx(state, { type: "timeout", diagnosis })
    : reduceTx(state, { type: "error", diagnosis });
}

test("a 404 from a receipt read after the send ends unknown, keeps the hash and never offers a retry", () => {
  const state = afterThrow(true, true, notFound);
  assert.equal(state.kind, "unknown");
  assert.equal(state.kind === "unknown" ? state.txHash : null, "0xabc");
  assert.equal(canConfirm(state), false);
});

test("a 409 or a refusal-sounding message after the send is still unknown, journalled or not", () => {
  const conflict = Object.assign(new Error("already known"), { status: 409 });
  assert.equal(endingOfThrow({ left: true, journalled: true, refusedInWords: isClientRefusal(conflict) }), "unknown");
  assert.equal(endingOfThrow({ left: true, journalled: false, refusedInWords: true }), "unknown");
});

test("the journal entry is kept once the send left: only a 'refused' ending settles (forgets) it", () => {
  // useTxLifecycle forgets the intent on confirmed, reverted and refused; an unknown ending is left for recovery.
  assert.notEqual(endingOfThrow({ left: true, journalled: true, refusedInWords: true }), "refused");
});

test("a 4xx before anything left the phone is a plain no, and the button may try again", () => {
  const state = afterThrow(false, true, Object.assign(new Error("bad amount"), { status: 422 }));
  assert.equal(state.kind, "failed");
  assert.equal(state.kind === "failed" ? state.moneyMoved : null, "no");
  assert.equal(canConfirm(state), true);
});

test("a journalled send that lost its answer before submitted is unknown, not a no", () => {
  assert.equal(afterThrow(false, true, new Error("Network request failed")).kind, "unknown");
});

test("an error before the intent was journalled (a cancelled prompt) is a plain no", () => {
  assert.equal(afterThrow(false, false, new Error("User rejected"), true).kind, "failed");
});
