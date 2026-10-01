// The A2A task states an intent moves through (ARCHITECTURE §3), and which moves are legal. The api checks every
// state change against this table, so a stale tap or a replayed request cannot move an intent backwards.
export const INTENT_STATES = [
  "submitted",
  "working",
  "input_required",
  "auth_required",
  "ready_for_approval",
  "approved",
  "executing",
  "completed",
  "failed",
  "rejected",
  "canceled",
  "expired",
  "unknown_outcome",
] as const;
export type IntentState = (typeof INTENT_STATES)[number];

/** Nothing moves an intent out of these, except reconciliation settling an unknown outcome. */
export const FINAL_STATES: ReadonlySet<IntentState> = new Set(["completed", "failed", "rejected", "canceled", "expired"]);

/** States in which a new draft version may be made (a fix arrived, the person edited the amount). */
export const DRAFTABLE_STATES: ReadonlySet<IntentState> = new Set([
  "submitted",
  "working",
  "input_required",
  "auth_required",
  "ready_for_approval",
]);

const TRANSITIONS: Record<IntentState, readonly IntentState[]> = {
  submitted: ["working", "input_required", "auth_required", "ready_for_approval", "rejected", "canceled", "expired"],
  working: ["input_required", "auth_required", "ready_for_approval", "rejected", "canceled", "expired"],
  input_required: ["working", "input_required", "auth_required", "ready_for_approval", "rejected", "canceled", "expired"],
  auth_required: ["working", "input_required", "auth_required", "ready_for_approval", "rejected", "canceled", "expired"],
  ready_for_approval: ["working", "input_required", "auth_required", "ready_for_approval", "approved", "rejected", "canceled", "expired"],
  approved: ["executing", "failed", "canceled", "ready_for_approval"],
  executing: ["completed", "failed", "unknown_outcome"],
  unknown_outcome: ["completed", "failed"],
  completed: [],
  failed: [],
  rejected: [],
  canceled: [],
  expired: [],
};

export function canTransition(from: IntentState, to: IntentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export const isFinal = (state: IntentState) => FINAL_STATES.has(state);
