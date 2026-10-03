// Business mode (cards/agent-business.md): profile, invoices, batch payouts. Amounts in base units. Payroll is the
// automations `payroll` kind (automations-8c.ts).
import type { NetworkId, TransactionRequestResponse } from "./types";

export type BusinessProfile = { name: string; address: string | null; taxId: string | null; email: string | null };
export type BusinessProfileInput = { name: string; address?: string | undefined; taxId?: string | undefined; email?: string | undefined };

export type InvoiceLineInput = { description: string; quantity: number; /** Decimal, in the invoice's asset. */ unitPrice: string };
export type InvoiceInput = {
  clientName: string;
  clientEmail?: string | undefined;
  /** A symbol (USDC, EURC, cirBTC, a listed token) or a token address on Arc. */
  asset: string;
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
  /** The token symbol; amounts are in its base units (`decimals`). */
  asset: string;
  tokenAddress: string | null;
  decimals: number;
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
  asset: string;
  tokenAddress: string | null;
  decimals: number;
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
  asset: string;
  tokenAddress: string | null;
  decimals: number;
  lines: PayoutLine[];
  total: string;
  status: "ready" | "submitted" | "confirmed" | "failed";
  txHash: string | null;
  createdAt: string;
};
export type PayoutCreateResult = { payout: PayoutView; problems: [] } | { payout: null; problems: PayoutProblem[] };

export type PayoutSignRequest = TransactionRequestResponse;
