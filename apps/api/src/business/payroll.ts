// Payroll (cards/agent-business.md): the same scheduled payment to several people, every week or month. Built from
// the automation engine as it is: one scheduled send per payee, each with its own grant pinned to that payee and that
// amount per period, so the chain bounds every line; all of them turned on with one Face ID (every grant signed in one
// go). A payee whose saved address changes is paused by the engine until reviewed, that line only (X6). Runs, skips,
// "Needs you", receipts and why are the engine's own.
import { and, desc, eq } from "drizzle-orm";
import type { Hex } from "viem";

import type { PayrollGrantRequest, PayrollInput, PayrollView } from "@kawase/api-client";
import { PAYROLL_PAYEES_MAX } from "@kawase/config";
import { payrolls, type Db } from "@kawase/db";

import type { AuditWriter } from "../audit/writer";
import type { AutomationService } from "../automations/service";
import { HTTP, problem } from "../http/problem";
import type { SessionUser } from "../types";

type PayrollRow = typeof payrolls.$inferSelect;

export class PayrollService {
  constructor(
    private readonly db: Db,
    private readonly automations: AutomationService,
    private readonly audit: AuditWriter,
  ) {}

  private async view(user: SessionUser, row: PayrollRow): Promise<PayrollView> {
    const lines = await Promise.all(row.automationIds.map((id) => this.automations.get(user.id, id).catch(() => undefined)));
    return { id: row.id, network: row.network, name: row.name, lines: lines.filter((line) => line !== undefined), createdAt: row.createdAt.toISOString() };
  }

  private async own(user: SessionUser, id: string) {
    const [row] = await this.db.select().from(payrolls).where(and(eq(payrolls.id, id), eq(payrolls.userId, user.id)));
    if (!row) throw problem(HTTP.notFound, "not_found");
    return row;
  }

  /** Drafts every line (nothing runs yet); a line the engine cannot draft (an unknown name) shows its fix. */
  async create(user: SessionUser, input: PayrollInput): Promise<PayrollView> {
    if (input.payees.length === 0 || input.payees.length > PAYROLL_PAYEES_MAX) throw problem(HTTP.unprocessable, "validation", `1 to ${PAYROLL_PAYEES_MAX} payees`);
    const ids: string[] = [];
    for (const payee of input.payees) {
      const draft = await this.automations.create(user, {
        recipient: payee.recipient,
        amount: payee.amount,
        asset: input.asset,
        every: input.every,
        weekday: input.weekday,
        monthday: input.monthday,
        time: input.time,
        note: input.name,
      });
      ids.push(draft.id);
    }
    const [row] = await this.db.insert(payrolls).values({ userId: user.id, network: user.activeNetwork, name: input.name.trim(), automationIds: ids }).returning();
    await this.audit.write({ userId: user.id, actor: "user", action: "payroll.drafted", subjectType: "payroll", subjectId: row!.id, network: user.activeNetwork, checks: { payees: ids.length } });
    return this.view(user, row!);
  }

  async list(user: SessionUser): Promise<PayrollView[]> {
    const rows = await this.db
      .select()
      .from(payrolls)
      .where(and(eq(payrolls.userId, user.id), eq(payrolls.network, user.activeNetwork)))
      .orderBy(desc(payrolls.createdAt));
    return Promise.all(rows.map((row) => this.view(user, row)));
  }

  async get(user: SessionUser, id: string) {
    return this.view(user, await this.own(user, id));
  }

  /** Every line's grants to sign, for one Face ID. Lines already on are left out. */
  async grantRequest(user: SessionUser, id: string): Promise<PayrollGrantRequest> {
    const row = await this.own(user, id);
    const lines: PayrollGrantRequest["lines"] = [];
    for (const automationId of row.automationIds) {
      const current = await this.automations.get(user.id, automationId);
      if (current.status !== "draft") continue;
      lines.push({ automationId, request: await this.automations.grantRequest(user, automationId) });
    }
    return { lines };
  }

  async activate(user: SessionUser, id: string, signed: { automationId: string; signatures: { grantId: string; signature: Hex }[] }[]) {
    const row = await this.own(user, id);
    for (const line of signed) {
      if (!row.automationIds.includes(line.automationId)) throw problem(HTTP.unprocessable, "validation", "not a line of this payroll");
      await this.automations.activate(user, line.automationId, { signatures: line.signatures });
    }
    await this.audit.write({ userId: user.id, actor: "user", action: "payroll.activated", subjectType: "payroll", subjectId: id, network: row.network, checks: { lines: signed.length } });
    return this.view(user, row);
  }

  async change(user: SessionUser, id: string, change: "pause" | "resume" | "cancel") {
    const row = await this.own(user, id);
    for (const automationId of row.automationIds) {
      const current = await this.automations.get(user.id, automationId).catch(() => undefined);
      if (!current) continue;
      if (change === "pause" && current.status === "active") await this.automations.pause(user, automationId);
      if (change === "resume" && current.status === "paused") await this.automations.resume(user, automationId);
      if (change === "cancel" && (current.status === "active" || current.status === "paused" || current.status === "draft")) await this.automations.cancel(user, automationId);
    }
    await this.audit.write({ userId: user.id, actor: "user", action: `payroll.${change}`, subjectType: "payroll", subjectId: id, network: row.network });
    return this.view(user, row);
  }
}
