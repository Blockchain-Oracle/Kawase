// Block (capability matrix, Counterparts "Block"): the person can block a Kawase user (by account, so every address of
// theirs follows it), a contact (its Kawase account when it has a handle, and its addresses) or a bare address.
// Blocked means: a payment to them is refused by the send rules (RECIPIENT_BLOCKED, so the agent and automations
// cannot pay them either: `Recipients.resolve` marks the recipient), and their asks, requests, split shares and
// reminders never reach the person's inbox or push. The one blocked is never told.
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { BlockView } from "@kawase/api-client";
import { blocks, contactAddresses, contacts, users, wallets, type Db } from "@kawase/db";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { Executor } from "../send/facts";
import type { AppEnv } from "../types";
import { addressForHandle } from "./service";

const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const TARGET_MAX = 80;

const short = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

/** Whether paying `address` is refused for this person: the address is blocked, or the Kawase user who owns it is. */
export async function blockedRecipient(db: Executor, userId: string, address: string): Promise<boolean> {
  const lower = address.toLowerCase();
  const [row] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      and(
        eq(blocks.userId, userId),
        or(
          eq(blocks.address, lower),
          inArray(blocks.blockedUserId, db.select({ id: wallets.userId }).from(wallets).where(and(eq(wallets.role, "user"), sql`lower(${wallets.address}) = ${lower}`))),
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Whether a Kawase user (asking from `address`, the wallet their request pays into) is kept out of this person's inbox. */
export async function blockedSender(db: Executor, userId: string, senderId: string, address: string): Promise<boolean> {
  const [row] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.userId, userId), or(eq(blocks.blockedUserId, senderId), eq(blocks.address, address.toLowerCase()))))
    .limit(1);
  return Boolean(row);
}

/** Everything this person blocked, as lower-case handles and addresses, to mark contacts in a list. */
export async function blockedSets(db: Executor, userId: string): Promise<{ handles: Set<string>; addresses: Set<string> }> {
  const rows = await db.select({ address: blocks.address, handle: users.handle }).from(blocks).leftJoin(users, eq(users.id, blocks.blockedUserId)).where(eq(blocks.userId, userId));
  return {
    handles: new Set(rows.flatMap((row) => (row.handle ? [row.handle.toLowerCase()] : []))),
    addresses: new Set(rows.flatMap((row) => (row.address ? [row.address] : []))),
  };
}

/** Every address this person blocked, with the wallets of the Kawase users they blocked (lower-case). */
export async function blockedAddresses(db: Executor, userId: string): Promise<Set<string>> {
  const [direct, accounts] = await Promise.all([
    db.select({ address: blocks.address }).from(blocks).where(and(eq(blocks.userId, userId), sql`${blocks.address} is not null`)),
    db
      .select({ address: wallets.address })
      .from(blocks)
      .innerJoin(wallets, and(eq(wallets.userId, blocks.blockedUserId), eq(wallets.role, "user")))
      .where(eq(blocks.userId, userId)),
  ]);
  return new Set([...direct, ...accounts].flatMap((row) => (row.address ? [row.address.toLowerCase()] : [])));
}

/** Who to block or unblock: one of a saved contact, an @handle, or an address. */
export type BlockTarget = { contactId?: string | undefined; handle?: string | undefined; address?: string | undefined };

export class BlockService {
  constructor(private readonly db: Db) {}

  async list(userId: string): Promise<BlockView[]> {
    const rows = await this.db
      .select({ id: blocks.id, label: blocks.label, address: blocks.address, handle: users.handle, createdAt: blocks.createdAt })
      .from(blocks)
      .leftJoin(users, eq(users.id, blocks.blockedUserId))
      .where(eq(blocks.userId, userId))
      .orderBy(blocks.createdAt);
    return rows.map((row) => ({ id: row.id, label: row.label, handle: row.handle, address: row.address, createdAt: row.createdAt.toISOString() }));
  }

  /** What a target means: the Kawase account (when there is one) and the addresses, with the label for the list. */
  private async resolve(userId: string, target: BlockTarget): Promise<{ label: string; userIds: string[]; addresses: string[] }> {
    if (target.contactId) {
      const [contact] = await this.db
        .select({ name: contacts.displayName, handle: contacts.handle })
        .from(contacts)
        .where(and(eq(contacts.id, target.contactId), eq(contacts.userId, userId)));
      if (!contact) throw problem(HTTP.notFound, "not_found");
      const kawase = contact.handle ? await addressForHandle(this.db, contact.handle) : undefined;
      const addresses = await this.db
        .select({ address: contactAddresses.address })
        .from(contactAddresses)
        .where(and(eq(contactAddresses.contactId, target.contactId), inArray(contactAddresses.status, ["active", "pending_cooldown"])));
      return { label: contact.name, userIds: kawase ? [kawase.userId] : [], addresses: kawase ? [] : addresses.map((row) => row.address.toLowerCase()) };
    }
    if (target.handle) {
      const kawase = await addressForHandle(this.db, target.handle);
      if (!kawase) throw problem(HTTP.unprocessable, "recipient_unknown", `no Kawase user ${target.handle}`);
      return { label: `@${kawase.handle}`, userIds: [kawase.userId], addresses: [] };
    }
    const address = target.address?.trim().toLowerCase();
    if (!address || !/^0x[0-9a-f]{40}$/.test(address)) throw problem(HTTP.unprocessable, "address_invalid");
    return { label: short(address), userIds: [], addresses: [address] };
  }

  async block(userId: string, target: BlockTarget): Promise<BlockView[]> {
    const { label, userIds, addresses } = await this.resolve(userId, target);
    if (userIds.includes(userId)) throw problem(HTTP.unprocessable, "recipient_is_self");
    const values = [...userIds.map((blockedUserId) => ({ userId, blockedUserId, label })), ...addresses.map((address) => ({ userId, address, label }))];
    if (values.length > 0) await this.db.insert(blocks).values(values).onConflictDoNothing();
    return this.list(userId);
  }

  async unblock(userId: string, target: BlockTarget & { id?: string | undefined }): Promise<BlockView[]> {
    if (target.id) {
      await this.db.delete(blocks).where(and(eq(blocks.userId, userId), eq(blocks.id, target.id)));
      return this.list(userId);
    }
    const { userIds, addresses } = await this.resolve(userId, target);
    const matches = [...(userIds.length ? [inArray(blocks.blockedUserId, userIds)] : []), ...(addresses.length ? [inArray(blocks.address, addresses)] : [])];
    if (matches.length > 0) await this.db.delete(blocks).where(and(eq(blocks.userId, userId), or(...matches)));
    return this.list(userId);
  }
}

const targetSchema = z
  .object({
    contactId: z.uuid().optional(),
    handle: z.string().trim().min(1).max(TARGET_MAX).optional(),
    address: z.string().trim().min(1).max(TARGET_MAX).optional(),
  })
  .refine((target) => [target.contactId, target.handle, target.address].filter(Boolean).length === 1, "name exactly one of contactId, handle or address");

export function blockRoutes(service: BlockService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);
  app.get("/", async (c) => c.json({ blocks: await service.list(c.get("userId")!) }));
  app.post("/", async (c) => {
    const parsed = targetSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    return c.json({ blocks: await service.block(c.get("userId")!, parsed.data) });
  });
  app.delete("/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    return c.json({ blocks: await service.unblock(c.get("userId")!, { id: id.data }) });
  });
  app.post("/remove", async (c) => {
    const parsed = targetSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    return c.json({ blocks: await service.unblock(c.get("userId")!, parsed.data) });
  });
  return app;
}
