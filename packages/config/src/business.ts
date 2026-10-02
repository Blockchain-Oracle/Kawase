// Business mode (cards/agent-business.md): invoices, batch payouts and payroll.
import { MS_PER_SECOND, SECONDS_PER_DAY, SECONDS_PER_MINUTE } from "./units";

export const INVOICE_NUMBER_PREFIX = "INV-";
export const INVOICE_NUMBER_DIGITS = 4;
/** When the person does not say: due in two weeks. */
export const INVOICE_DUE_DAYS_DEFAULT = 14;
export const INVOICE_DUE_DAYS_MAX = 365;
export const INVOICE_LINES_MAX = 50;
export const INVOICE_TEXT_MAX = 200;
export const INVOICE_QUANTITY_MAX = 1_000_000;
/** The Memo watcher looks at most this many blocks back the first time (public Arc RPC: ≤ 9,999 per getLogs). */
export const MEMO_SCAN_BLOCKS = 9_000;
export const MEMO_SCAN_TICK_MS = 15_000;
/** One transaction pays at most this many people (gas stays well inside a block). */
export const PAYOUT_LINES_MAX = 50;
/** Gas for a self-batch of transfers: a base plus each transfer. */
export const PAYOUT_GAS_BASE = 120_000n;
export const PAYOUT_GAS_PER_LINE = 60_000n;
export const PAYROLL_PAYEES_MAX = 20;
/** Due-date choices on a new invoice (days). */
export const INVOICE_DUE_CHOICES = [7, 14, 30] as const;
/** Payroll days offered (1–28, so every month has them). */
export const PAYROLL_MONTHDAYS = [1, 15, 28] as const;
/** An invoice is "due soon" this long before its due date (the day-before reminder). */
export const INVOICE_DUE_SOON_MS = SECONDS_PER_DAY * MS_PER_SECOND;
/** How often invoice reminders are looked for. */
const INVOICE_REMINDER_TICK_MINUTES = 15;
export const INVOICE_REMINDER_TICK_MS = INVOICE_REMINDER_TICK_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
