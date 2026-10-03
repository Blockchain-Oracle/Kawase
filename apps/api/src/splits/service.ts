// Split a bill (plan §A.4.4 "Split a bill: requests to each person", C3): one amount of any token (R1) shared equally
// or by hand, as one payment request per person — each with its own link, paid from Kawase or any wallet and marked
// paid like any request (the send that paid it, or a matching transfer) — and the split that shows who has paid back.
// Someone the person's words name exactly on Kawase (an @handle, or a saved contact with one) is also asked in the app:
// "@x asked you for 12 USDC" in their inbox and by push. Nobody is asked by a guess; everyone else gets the link.
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { PaymentRequest, RequestToken, SplitInput, SplitView } from "@kawase/api-client";
import { REQUEST_NOTE_MAX } from "@kawase/config";
import { paymentRequests, splitShares, splits, type Db } from "@kawase/db";

import { HTTP, problem } from "../http/problem";
import type { RequestService } from "../requests/service";
import { parseTokenAmount } from "../send/facts";
import type { Recipients } from "../send/recipients";
import type { SessionUser } from "../types";

export const SPLIT_PEOPLE_MAX = 20;
export const SPLIT_TITLE_MAX = 60;
const ZERO = 0n;
const ONE = 1n;
const TEN = 10n;
const STABLE_DECIMALS = 6;

type SplitRow = typeof splits.$inferSelect;

/** Base units in a token's decimals as the plain decimal a request takes ("0.02"). */
const decimal = (base: bigint, decimals: number) => {
  const unit = TEN ** BigInt(decimals);
  const fraction = (base % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${base / unit}.${fraction}` : (base / unit).toString();
};

const baseUnits = (text: string, decimals: number) => {
  const parsed = parseTokenAmount(text, decimals);
  if (parsed.status !== "ok") throw problem(HTTP.unprocessable, "validation", "the amount is not valid");
  return parsed.baseUnits;
};

export class SplitService {
  constructor(
    private readonly db: Db,
    private readonly requests: RequestService,
    private readonly recipients: Recipients,
  ) {}

  /** Each share in base units: equal (the remainder, a few base units at most, stays with the first shares), or by hand. */
  private shares(input: SplitInput, total: bigint, decimals: number): { mine: bigint | null; each: bigint[] } {
    const custom = input.people.some((person) => person.amount);
    if (custom) {
      if (!input.people.every((person) => person.amount)) throw problem(HTTP.unprocessable, "validation", "give every person an amount, or none");
      const each = input.people.map((person) => baseUnits(person.amount!, decimals));
      const theirs = each.reduce((sum, value) => sum + value, ZERO);
      if (theirs > total) throw problem(HTTP.unprocessable, "validation", "the shares add up to more than the bill");
      const mine = total - theirs;
      if (!input.includeMe && mine !== ZERO) throw problem(HTTP.unprocessable, "validation", "the shares must add up to the bill");
      return { mine: input.includeMe ? mine : null, each };
    }
    const parts = BigInt(input.people.length + (input.includeMe ? 1 : 0));
    const base = total / parts;
    let left = total - base * parts;
    // Mine first (it is never requested), then the people in order, each taking one base unit of the remainder.
    const take = () => {
      if (left === ZERO) return base;
      left -= ONE;
      return base + ONE;
    };
    const mine = input.includeMe ? take() : null;
    return { mine, each: input.people.map(() => take()) };
  }

  async create(user: SessionUser, input: SplitInput): Promise<SplitView> {
    if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in to split a bill");
    const token = await this.requests.token(user.activeNetwork, input.asset);
    const total = baseUnits(input.total, token.decimals);
    if (total <= ZERO) throw problem(HTTP.unprocessable, "validation", "the bill must be more than zero");
    const { mine, each } = this.shares(input, total, token.decimals);
    if (each.some((value) => value <= ZERO)) throw problem(HTTP.unprocessable, "validation", "every share must be more than zero");
    const title = input.title.trim().slice(0, SPLIT_TITLE_MAX);
    // Who each name is, for the progress list (a contact's @handle, or a Kawase @handle typed as such).
    const handles = await Promise.all(
      input.people.map(async (person) => {
        const [match] = await this.recipients.search(user.id, person.name).catch(() => []);
        return match?.handle ?? null;
      }),
    );
    // The requests first (each is a full request with its own link, and asks its payer in the app when the name is
    // exactly someone on Kawase), then the split that ties them together.
    const requests: PaymentRequest[] = [];
    for (const [index, person] of input.people.entries()) {
      const note = `${title} · ${person.name.trim()}`.slice(0, REQUEST_NOTE_MAX);
      requests.push(await this.requests.create(user, { amount: decimal(each[index]!, token.decimals), asset: token.stored, note, payer: person.ask === false ? null : person.name }));
    }
    const [row] = await this.db
      .insert(splits)
      .values({ userId: user.id, network: user.activeNetwork, title, asset: token.stored, total, myShare: mine })
      .returning();
    await this.db.insert(splitShares).values(
      input.people.map((person, index) => ({
        splitId: row!.id,
        userId: user.id,
        seq: index,
        name: person.name.trim(),
        handle: requests[index]!.payer?.handle ?? handles[index] ?? null,
        amount: each[index]!,
        requestId: requests[index]!.id,
      })),
    );
    return this.view(user.id, row!);
  }

  private async own(userId: string, id: string): Promise<SplitRow> {
    const [row] = await this.db.select().from(splits).where(and(eq(splits.id, id), eq(splits.userId, userId)));
    if (!row) throw problem(HTTP.notFound, "not_found");
    return row;
  }

  /** The split with each request read fresh (paid, expired), settled once every share is paid. */
  async view(userId: string, row: SplitRow): Promise<SplitView> {
    const shareRows = await this.db.select().from(splitShares).where(eq(splitShares.splitId, row.id)).orderBy(asc(splitShares.seq));
    const all = await this.requests.list(userId);
    const byId = new Map(all.map((request) => [request.id, request]));
    const shares = shareRows.flatMap((share) => {
      const request = byId.get(share.requestId);
      return request ? [{ name: share.name, handle: share.handle, askedInApp: Boolean(request.payer), amount: share.amount.toString(), request }] : [];
    });
    // The token as the requests carry it (any asset, R1); USDC/EURC by name for a split with no share left.
    const assetToken: RequestToken = shares[0]?.request.assetToken ?? { address: "", symbol: row.asset, decimals: STABLE_DECIMALS };
    const paid = shares.filter((share) => share.request.status === "paid");
    let status = row.status;
    if (status === "open" && shares.length > 0 && paid.length === shares.length) {
      status = "settled";
      await this.db.update(splits).set({ status }).where(eq(splits.id, row.id));
    }
    return {
      id: row.id,
      network: row.network,
      title: row.title,
      asset: assetToken.symbol,
      assetToken,
      total: row.total.toString(),
      myShare: row.myShare?.toString() ?? null,
      shares,
      collected: paid.reduce((sum, share) => sum + BigInt(share.amount), ZERO).toString(),
      paidCount: paid.length,
      status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async get(userId: string, id: string) {
    return this.view(userId, await this.own(userId, id));
  }

  async list(userId: string): Promise<SplitView[]> {
    const rows = await this.db.select().from(splits).where(eq(splits.userId, userId)).orderBy(desc(splits.createdAt));
    return Promise.all(rows.map((row) => this.view(userId, row)));
  }

  /** Cancels every share still open (paid ones stay paid) and the split. */
  async cancel(userId: string, id: string): Promise<SplitView> {
    const row = await this.own(userId, id);
    const shareRows = await this.db.select({ requestId: splitShares.requestId }).from(splitShares).where(eq(splitShares.splitId, id));
    const open = await this.db
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(and(inArray(paymentRequests.id, shareRows.map((share) => share.requestId)), eq(paymentRequests.status, "open")));
    for (const request of open) await this.requests.cancel(userId, request.id);
    const [updated] = await this.db.update(splits).set({ status: "canceled" }).where(eq(splits.id, id)).returning();
    return this.view(userId, updated ?? row);
  }
}
