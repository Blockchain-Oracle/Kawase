// The tx kit: the lifecycle of every money action. A lane builds its action as `useTxLifecycle().run(...)`, draws
// `TxCta` (blocked → fix → steps → receipt) and, on failure, `TxFailureCard` (always says whether money moved).
export { BlockedCta, type Blocker } from "./BlockedCta";
export { TxCta, type TxCtaProps } from "./TxCta";
export { TxFailureCard } from "./TxFailureCard";
export { TxMorph } from "./TxMorph";
export { TxSteps, txSteps } from "./TxSteps";
export {
  answerLost,
  forgetIntent,
  hydrateJournal,
  type IntentKind,
  type IntentReading,
  intentsOf,
  type JournalEntry,
  type JournalMark,
  journalIntent,
  noteTxHash,
  type RecoveryNote,
  sendJournalled,
  useIntentRecovery,
  wasLost,
} from "./journal";
export {
  canConfirm,
  isInFlight,
  type MoneyMoved,
  reduceTx,
  TX_IDLE,
  type TxEvent,
  type TxState,
  txProgress,
  txReached,
} from "./tx-state";
export { type TxOutcome, type TxProgress, type TxRunner, type TxRunOptions, useTxLifecycle } from "./useTxLifecycle";
