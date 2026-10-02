// Business mode (cards/agent-business.md): profile, invoices, batch payouts, payroll. Amounts in base units.
import type { AutomationGrantRequest, AutomationView, NetworkId, TransactionRequestResponse } from "./types";

export type BusinessProfile = { name: string; address: string | null; taxId: string | null; email: string | null };
export type BusinessProfileInput = { name: string; address?: string | undefined; taxId?: string | undefined; email?: string | undefined };

export type InvoiceLineInput = { description: string; quantity: number; /** Decimal, in the invoice's asset. */ unitPrice: string };
export type InvoiceInput = {
  clientName: string;
  clientEmail?: string | undefined;
  asset: "USDC" | "EURC";
  lines: InvoiceLineInput[];
  dueInDays?: number | undefined;
  dueAt?: string | undefined;
  note?: string | undefined;
};

export type InvoiceLine = { description: string; quantity: number; unitAmount: string };
export type InvoicePayment = { txHash: string; from: string; amount: string; at: string; via: "memo" | "request" };
export type InvoiceStatus = "open" | "partially_paid" | "paid" | "canceled";

export type InvoiceView = {
  id: string;
  network: NetworkId;
  number: string;
  clientName: string;
  clientEmail: string | null;
  asset: "USDC" | "EURC";
  lines: InvoiceLine[];
  total: string;
  paid: string;
  remaining: string;
  dueAt: string;
  overdue: boolean;
  status: InvoiceStatus;
  /** The on-chain reference (Arc Memo id). */
  memoId: string;
  payments: InvoicePayment[];
  note: string | null;
  /** The link the client pays through. */
  link: string | null;
  token: string | null;
  createdAt: string;
};

/** What the client sees on the link, and the transaction a browser wallet sends to pay with the reference. */
export type InvoicePublicView = {
  number: string;
  network: NetworkId;
  business: BusinessProfile;
  clientName: string;
  asset: "USDC" | "EURC";
  lines: InvoiceLine[];
  total: string;
  paid: string;
  remaining: string;
  dueAt: string;
  status: InvoiceStatus;
  memoId: string;
  payTo: string;
  pay: { chainId: number; to: string; data: string } | null;
  note: string | null;
};

export type PayoutLineInput = { recipient: string; amount: string };
export type PayoutLine = { name: string | null; address: string; amount: string };
export type PayoutProblem = { index: number; recipient: string; problem: string };
export type PayoutView = {
  id: string;
  network: NetworkId;
  asset: "USDC" | "EURC";
  lines: PayoutLine[];
  total: string;
  status: "ready" | "submitted" | "confirmed" | "failed";
  txHash: string | null;
  createdAt: string;
};
export type PayoutCreateResult = { payout: PayoutView; problems: [] } | { payout: null; problems: PayoutProblem[] };

export type PayrollInput = {
  name: string;
  asset?: "USDC" | "EURC" | undefined;
  every: "week" | "month";
  weekday?: number | undefined;
  monthday?: number | undefined;
  time?: string | undefined;
  payees: PayoutLineInput[];
};
export type PayrollView = { id: string; network: NetworkId; name: string; lines: AutomationView[]; createdAt: string };
export type PayrollGrantRequest = { lines: { automationId: string; request: AutomationGrantRequest }[] };

export type PayoutSignRequest = TransactionRequestResponse;
