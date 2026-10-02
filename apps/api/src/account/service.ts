// Getting in and staying in (cards/access.md): this device and the others, signing one out or all of them, the email
// that follows the account's Turnkey user, what the account holds before it is deleted, and deleting it.
//
// Signing a device out revokes its Kawase sessions here and hands back that device's Turnkey session key; the app
// (signed in to Turnkey on this device) then deletes that API key from the person's sub-organization, which only the
// person's own session may do. Deleting the account deletes the person's data at Kawase (contacts, threads and their
// transcripts, inbox, requests, grants as Kawase holds them) — the wallet stays theirs in their Turnkey sub-org — and
// holds the @handle for 30 days. Money in the agent wallet goes back to their wallet first.
import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { HANDLE_HOLD_DAYS, SECONDS_PER_DAY } from "@kawase/config";
import { devices, grants, handleHolds, sessions, users, type Db } from "@kawase/db";
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import type { AuditWriter } from "../audit/writer";
import type { TurnkeyReader } from "../auth/turnkey";
import { HTTP, problem } from "../http/problem";
import type { MarketplaceService } from "../marketplace/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

const MS_PER_SECOND = 1000;

export type DeviceView = {
  id: string;
  platform: "ios" | "android" | "web" | "desktop";
  name: string | null;
  appVersion: string | null;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
  signedIn: boolean;
  /** The device's Turnkey session key, for the app to delete when signing it out. */
  turnkeyPublicKey: string | null;
};

export class AccountService {
  constructor(
    private readonly db: Db,
    private readonly chains: Chains,
    private readonly turnkey: TurnkeyReader,
    private readonly wallets: WalletService,
    private readonly audit: AuditWriter,
    private readonly log: Logger,
    private readonly marketplace?: MarketplaceService | undefined,
  ) {}

  async devices(userId: string, currentDeviceId: string | undefined): Promise<DeviceView[]> {
    const rows = await this.db
      .select({
        device: devices,
        live: sql<number>`(select count(*) from ${sessions} where ${sessions.deviceId} = ${devices.id} and ${sessions.revokedAt} is null and ${sessions.expiresAt} > now())`,
      })
      .from(devices)
      .where(eq(devices.userId, userId))
      .orderBy(sql`${devices.lastSeenAt} desc`);
    return rows.map(({ device, live }) => ({
      id: device.id,
      platform: device.platform,
      name: device.name,
      appVersion: device.appVersion,
      lastSeenAt: device.lastSeenAt.toISOString(),
      createdAt: device.createdAt.toISOString(),
      current: device.id === currentDeviceId,
      signedIn: Number(live) > 0 && !device.revokedAt,
      turnkeyPublicKey: device.turnkeyPublicKey,
    }));
  }

  /** The app names this device and says it is alive (Settings → Devices). */
  async touchCurrent(userId: string, deviceId: string, input: { name?: string | undefined; appVersion?: string | undefined }) {
    await this.db
      .update(devices)
      .set({ lastSeenAt: new Date(), ...(input.name ? { name: input.name } : {}), ...(input.appVersion ? { appVersion: input.appVersion } : {}) })
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)));
  }

  /** Revokes every Kawase session on one device and stops its pushes; returns its Turnkey key for the app to delete. */
  async signOutDevice(user: SessionUser, deviceId: string, by: { deviceId: string | undefined }) {
    const [device] = await this.db.select().from(devices).where(and(eq(devices.id, deviceId), eq(devices.userId, user.id)));
    if (!device) throw problem(HTTP.notFound, "not_found");
    await this.db.transaction(async (tx) => {
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.deviceId, deviceId), isNull(sessions.revokedAt)));
      await tx.update(devices).set({ revokedAt: new Date(), expoPushToken: null }).where(eq(devices.id, deviceId));
    });
    await this.audit.write({ userId: user.id, actor: "user", action: "device.sign_out", subjectType: "device", subjectId: deviceId, deviceId: by.deviceId });
    return { turnkeyPublicKey: device.turnkeyPublicKey };
  }

  /** Every other device out at once (lost phone); this one stays signed in. */
  async signOutEverywhere(user: SessionUser, by: { deviceId: string | undefined }) {
    const others = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.userId, user.id), by.deviceId ? ne(devices.id, by.deviceId) : sql`true`));
    for (const device of others) {
      await this.db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.deviceId, device.id), isNull(sessions.revokedAt)));
      await this.db.update(devices).set({ revokedAt: new Date(), expoPushToken: null }).where(eq(devices.id, device.id));
    }
    await this.audit.write({ userId: user.id, actor: "user", action: "device.sign_out_everywhere", checks: { devices: others.length }, deviceId: by.deviceId });
    return { turnkeyPublicKeys: others.map((device) => device.turnkeyPublicKey).filter((key): key is string => Boolean(key)) };
  }

  /** After the app changed or linked a sign-in method: the account email follows the Turnkey user's. */
  async syncEmail(user: SessionUser) {
    if (!user.turnkeySubOrganizationId || !user.turnkeyUserId) throw problem(HTTP.forbidden, "forbidden");
    const turnkeyUser = await this.turnkey.getUser(user.turnkeySubOrganizationId, user.turnkeyUserId);
    const email = turnkeyUser?.email ?? null;
    if (email && email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
      const [other] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(sql`lower(${users.email}) = lower(${email})`, ne(users.id, user.id)));
      // That address already belongs to another Kawase account: the method stays linked at Turnkey, the email here does not move.
      if (other) throw problem(HTTP.conflict, "account_recovery_required", "this email belongs to another account");
      await this.db.update(users).set({ email }).where(eq(users.id, user.id));
      await this.audit.write({ userId: user.id, actor: "user", action: "account.email_changed" });
    }
    return { email };
  }

  /** Step 1 of deleting: what is still held, per network, and which grants are still on (step 3 revokes them). */
  async holdings(user: SessionUser) {
    const status = await this.wallets.status(user.id);
    const networks = await Promise.all(
      this.chains.available.map(async (network) => {
        const state = (status.networks as Record<string, { usdcBalance: string; eurcBalance: string } | undefined>)[network];
        const live = await this.db
          .select({ id: grants.id, kind: grants.kind })
          .from(grants)
          .where(and(eq(grants.userId, user.id), eq(grants.network, network), eq(grants.status, "active")));
        const agent = this.marketplace ? await this.marketplace.agentWallet(user.id, network) : undefined;
        let agentTotal = "0";
        if (agent && this.marketplace) {
          const view = await this.marketplace.view({ ...user, activeNetwork: network }).catch(() => undefined);
          agentTotal = view?.balances.total ?? "0";
        }
        return {
          network,
          balances: { USDC: state?.usdcBalance ?? "0", EURC: state?.eurcBalance ?? "0" },
          agentWallet: agentTotal,
          activeGrants: live.map((row) => ({ id: row.id, kind: row.kind })),
        };
      }),
    );
    return { address: status.address ?? null, networks };
  }

  /** Step 3: one transaction (one Face ID) that revokes every grant still on, on one network. */
  async revokeAllRequest(user: SessionUser, network: NetworkId) {
    const live = await this.db
      .select({ id: grants.id })
      .from(grants)
      .where(and(eq(grants.userId, user.id), eq(grants.network, network), eq(grants.status, "active")));
    return this.wallets.revokeGrantsRequest(user.id, live.map((row) => row.id));
  }

  /**
   * Step 5. The person typed their @handle (or their email when they have none). Money in the agent wallet goes back to
   * their wallet first; then everything Kawase keeps about them is deleted (one cascade from the user row) and the
   * handle is held. Grants not revoked on chain can no longer be used: their signed delegations were only ever here.
   */
  async deleteAccount(user: SessionUser, confirm: string, by: { deviceId: string | undefined }) {
    const expected = user.handle ? `@${user.handle}` : (user.email ?? "");
    const typed = confirm.trim();
    const matches = typed.toLowerCase() === expected.toLowerCase() || (user.handle && typed.toLowerCase() === user.handle.toLowerCase());
    if (!expected || !matches) throw problem(HTTP.unprocessable, "validation", "type your handle to confirm");
    if (this.marketplace) {
      for (const network of this.chains.available) {
        if (!(await this.marketplace.agentWallet(user.id, network))) continue;
        await this.marketplace.returnToWallet({ ...user, activeNetwork: network }).catch((error: unknown) => {
          this.log.warn({ err: error, userId: user.id, network }, "agent wallet return before deletion failed");
        });
      }
    }
    const holdings = await this.holdings(user).catch(() => undefined);
    await this.db.transaction(async (tx) => {
      if (user.handle) {
        const heldUntil = new Date(Date.now() + HANDLE_HOLD_DAYS * SECONDS_PER_DAY * MS_PER_SECOND);
        await tx
          .insert(handleHolds)
          .values({ handle: user.handle.toLowerCase(), heldUntil })
          .onConflictDoUpdate({ target: handleHolds.handle, set: { heldUntil } });
      }
      await tx.delete(users).where(eq(users.id, user.id));
    });
    // The record of the deletion outlives the account (it names no one: the user row is gone).
    await this.audit.write({
      userId: null,
      actor: "user",
      actorRef: user.turnkeySubOrganizationId ?? undefined,
      action: "account.deleted",
      checks: { grantsLeftOn: holdings?.networks.reduce((sum, entry) => sum + entry.activeGrants.length, 0) ?? null },
      deviceId: by.deviceId,
    });
    return { deleted: true as const, handleHeldDays: user.handle ? HANDLE_HOLD_DAYS : 0 };
  }

  /** Export is done on the device with Turnkey; this records that it happened (cards/access.md "After: an audit row"). */
  async recordExport(user: SessionUser, by: { deviceId: string | undefined }) {
    await this.audit.write({ userId: user.id, actor: "user", action: "wallet.exported", deviceId: by.deviceId });
  }
}
