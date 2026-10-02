// Business mode (cards/agent-business.md). `/business/*` needs an account; `/invoices/public/:token` is what the client
// opens from the link (no account), with a printable document.
import { Hono } from "hono";
import { z } from "zod";

import {
  INVOICE_DUE_DAYS_MAX,
  INVOICE_LINES_MAX,
  INVOICE_QUANTITY_MAX,
  INVOICE_TEXT_MAX,
  PAYOUT_LINES_MAX,
  PAYROLL_PAYEES_MAX,
} from "@kawase/config";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { InvoiceService } from "./invoices";
import type { PayoutService } from "./payouts";
import type { PayrollService } from "./payroll";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const text = z.string().trim().min(1).max(INVOICE_TEXT_MAX);
const asset = z.enum(["USDC", "EURC"]);
const RECIPIENT_MAX = 80;
const LAST_WEEKDAY = 6;
const LAST_MONTHDAY = 28;

const profileSchema = z.object({ name: text, address: z.string().max(INVOICE_TEXT_MAX).optional(), taxId: z.string().max(INVOICE_TEXT_MAX).optional(), email: z.string().max(INVOICE_TEXT_MAX).optional() });
const invoiceSchema = z.object({
  clientName: text,
  clientEmail: z.string().max(INVOICE_TEXT_MAX).optional(),
  asset,
  lines: z.array(z.object({ description: text, quantity: z.number().int().min(1).max(INVOICE_QUANTITY_MAX), unitPrice: decimal })).min(1).max(INVOICE_LINES_MAX),
  dueInDays: z.number().int().min(0).max(INVOICE_DUE_DAYS_MAX).optional(),
  dueAt: z.iso.datetime().optional(),
  note: z.string().max(INVOICE_TEXT_MAX).optional(),
});
const line = z.object({ recipient: z.string().trim().min(1).max(RECIPIENT_MAX), amount: decimal });
const payoutSchema = z.object({ asset, lines: z.array(line).min(1).max(PAYOUT_LINES_MAX) });
const submitSchema = z.object({ requestId: z.uuid(), signedTransaction: hex });
const payrollSchema = z.object({
  name: text,
  asset: asset.optional(),
  every: z.enum(["week", "month"]),
  weekday: z.number().int().min(0).max(LAST_WEEKDAY).optional(),
  monthday: z.number().int().min(1).max(LAST_MONTHDAY).optional(),
  time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  payees: z.array(line).min(1).max(PAYROLL_PAYEES_MAX),
});
const activateSchema = z.object({ lines: z.array(z.object({ automationId: z.uuid(), signatures: z.array(z.object({ grantId: z.uuid(), signature: hex })) })) });
const changeSchema = z.object({ change: z.enum(["pause", "resume", "cancel"]) });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function businessRoutes(services: { invoices: InvoiceService; payouts: PayoutService; payroll: PayrollService }) {
  const { invoices, payouts, payroll } = services;
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);

  app.get("/profile", async (c) => c.json({ profile: await invoices.profile(c.get("userId")!) }));
  app.put("/profile", async (c) => c.json({ profile: await invoices.saveProfile(c.get("user")!, await parse(profileSchema, await c.req.json())) }));

  app.get("/invoices", async (c) => c.json({ invoices: await invoices.list(c.get("user")!) }));
  app.post("/invoices", async (c) => c.json({ invoice: await invoices.create(c.get("user")!, await parse(invoiceSchema, await c.req.json())) }, HTTP.created));
  app.get("/invoices/:id", async (c) => c.json({ invoice: await invoices.get(c.get("user")!, c.req.param("id")) }));
  app.post("/invoices/:id/cancel", async (c) => c.json({ invoice: await invoices.cancel(c.get("user")!, c.req.param("id")) }));

  app.get("/payouts", async (c) => c.json({ payouts: await payouts.list(c.get("user")!) }));
  app.post("/payouts", async (c) => c.json(await payouts.create(c.get("user")!, await parse(payoutSchema, await c.req.json()))));
  app.post("/payouts/:id/sign", async (c) => c.json(await payouts.signRequest(c.get("user")!, c.req.param("id"))));
  app.post("/payouts/:id/submit", async (c) => {
    const input = await parse(submitSchema, await c.req.json());
    return c.json({ payout: await payouts.submit(c.get("user")!, c.req.param("id"), { requestId: input.requestId, signedTransaction: input.signedTransaction as `0x${string}` }) });
  });

  app.get("/payroll", async (c) => c.json({ payrolls: await payroll.list(c.get("user")!) }));
  app.post("/payroll", async (c) => c.json({ payroll: await payroll.create(c.get("user")!, await parse(payrollSchema, await c.req.json())) }, HTTP.created));
  app.get("/payroll/:id", async (c) => c.json({ payroll: await payroll.get(c.get("user")!, c.req.param("id")) }));
  app.post("/payroll/:id/grant", async (c) => c.json(await payroll.grantRequest(c.get("user")!, c.req.param("id"))));
  app.post("/payroll/:id/activate", async (c) => {
    const input = await parse(activateSchema, await c.req.json());
    const lines = input.lines.map((entry) => ({ automationId: entry.automationId, signatures: entry.signatures.map((s) => ({ grantId: s.grantId, signature: s.signature as `0x${string}` })) }));
    return c.json({ payroll: await payroll.activate(c.get("user")!, c.req.param("id"), lines) });
  });
  app.post("/payroll/:id/change", async (c) => {
    const input = await parse(changeSchema, await c.req.json());
    return c.json({ payroll: await payroll.change(c.get("user")!, c.req.param("id"), input.change) });
  });

  return app;
}

/** No account: the client's view of an invoice and its printable document. */
export function publicInvoiceRoutes(invoices: InvoiceService) {
  const app = new Hono<AppEnv>();
  app.get("/:token", async (c) => c.json({ invoice: await invoices.publicView(c.req.param("token")) }));
  app.get("/:token/document", async (c) => c.html(await invoices.document(c.req.param("token"))));
  return app;
}
