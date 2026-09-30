// Sign-in: a guest gets a user and a device session at once; a Turnkey sign-in proves the session key, links
// the sub-organization to a Kawase user (moving a guest's data across if there is one) and issues a session.
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { devices, moveUserData, signInNonces, users, type Db } from "@kawase/db";

import { HTTP, problem } from "../http/problem";
import { createSession } from "./session";
import { parseStamp, proofClaims, verifyStamp, type StampedProof } from "./turnkey-proof";
import type { TurnkeyReader, TurnkeyUser } from "./turnkey";

const NONCE_BYTES = 32;
const MS_PER_SECOND = 1000;
const NONCE_TTL_SECONDS = 300;
const KEY_LOOKUP_ATTEMPTS = 3;
const KEY_LOOKUP_DELAY_MS = 1500;

export type DeviceInput = {
  platform: "ios" | "android" | "web" | "desktop";
  installationId: string;
  appVersion?: string | undefined;
  locale?: string | undefined;
};

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly turnkey: TurnkeyReader,
  ) {}

  async issueNonce() {
    const nonce = randomBytes(NONCE_BYTES).toString("base64url");
    const expiresAt = new Date(Date.now() + NONCE_TTL_SECONDS * MS_PER_SECOND);
    await this.db.insert(signInNonces).values({ nonce, expiresAt });
    return { nonce, expiresAt };
  }

  private async consumeNonce(nonce: string) {
    const [row] = await this.db
      .update(signInNonces)
      .set({ usedAt: new Date() })
      .where(and(eq(signInNonces.nonce, nonce), isNull(signInNonces.usedAt), gt(signInNonces.expiresAt, new Date())))
      .returning({ nonce: signInNonces.nonce });
    if (!row) throw problem(HTTP.unauthorized, "nonce_invalid");
  }

  private async upsertDevice(userId: string, input: DeviceInput) {
    const [device] = await this.db
      .insert(devices)
      .values({
        userId,
        platform: input.platform,
        installationId: input.installationId,
        appVersion: input.appVersion,
        locale: input.locale,
      })
      .onConflictDoUpdate({
        target: [devices.userId, devices.installationId],
        set: { appVersion: input.appVersion, locale: input.locale, lastSeenAt: new Date(), revokedAt: null },
      })
      .returning();
    return device!;
  }

  async signInAsGuest(input: { device: DeviceInput; locale?: string | undefined }) {
    const [user] = await this.db
      .insert(users)
      .values({ isAnonymous: true, locale: input.locale ?? "en" })
      .returning();
    const device = await this.upsertDevice(user!.id, input.device);
    const { token } = await createSession(this.db, user!.id, device.id);
    return { token, user: user!, device };
  }

  /**
   * The proof is a Turnkey stamp over `{"organizationId": <sub-org>, "activityId": <our nonce>}`. It is
   * checked in this order: the nonce is ours and unused, the signature is valid for the stamp's key, and the
   * parent organization can see that key on the claimed user.
   */
  async signInWithTurnkey(input: {
    proof: StampedProof;
    turnkeyUserId: string;
    device: DeviceInput;
    guestUserId?: string | undefined;
  }) {
    const claims = proofClaims(input.proof.body);
    if (!claims) throw problem(HTTP.unauthorized, "proof_invalid", "the signed body is not a sign-in request");
    await this.consumeNonce(claims.nonce);

    let stamp;
    try {
      stamp = parseStamp(input.proof.stamp);
    } catch {
      throw problem(HTTP.unauthorized, "proof_invalid", "the stamp is not a Turnkey P-256 stamp");
    }
    if (!verifyStamp(input.proof.body, stamp)) throw problem(HTTP.unauthorized, "proof_invalid");

    // Right after a sign-in the new session key can take a moment to show up on the user, so the read is
    // repeated a few times before the proof is refused.
    let turnkeyUser: TurnkeyUser | undefined;
    for (let attempt = 0; attempt < KEY_LOOKUP_ATTEMPTS; attempt++) {
      turnkeyUser = await this.turnkey.getUser(claims.organizationId, input.turnkeyUserId);
      if (turnkeyUser?.sessionPublicKeys.includes(stamp.publicKey)) break;
      if (attempt < KEY_LOOKUP_ATTEMPTS - 1) await new Promise((resolve) => setTimeout(resolve, KEY_LOOKUP_DELAY_MS));
    }
    if (!turnkeyUser) throw problem(HTTP.unauthorized, "session_key_unknown", "no such user in this organization");
    if (!turnkeyUser.sessionPublicKeys.includes(stamp.publicKey))
      throw problem(HTTP.unauthorized, "session_key_unknown");

    const user = await this.db.transaction(async (tx) => {
      // The sub-organization is the identity. The same verified email on a row without one (a re-created
      // sub-organization) is the same person, so that row is linked rather than duplicated.
      const [bySubOrg] = await tx.select().from(users).where(eq(users.turnkeySubOrganizationId, claims.organizationId));
      const [byEmail] =
        bySubOrg || !turnkeyUser.email
          ? []
          : await tx
              .select()
              .from(users)
              .where(sql`lower(${users.email}) = lower(${turnkeyUser.email})`);
      const existing = bySubOrg ?? byEmail;
      if (existing) {
        if (input.guestUserId && input.guestUserId !== existing.id) {
          await moveUserData(tx, input.guestUserId, existing.id);
        }
        const [updated] = await tx
          .update(users)
          .set({
            email: turnkeyUser.email ?? existing.email,
            turnkeySubOrganizationId: claims.organizationId,
            turnkeyUserId: turnkeyUser.userId,
            isAnonymous: false,
          })
          .where(eq(users.id, existing.id))
          .returning();
        return updated!;
      }
      if (input.guestUserId) {
        // The guest becomes the account: nothing to move, the row is upgraded in place.
        const [upgraded] = await tx
          .update(users)
          .set({
            email: turnkeyUser.email,
            turnkeySubOrganizationId: claims.organizationId,
            turnkeyUserId: turnkeyUser.userId,
            isAnonymous: false,
          })
          .where(and(eq(users.id, input.guestUserId), eq(users.isAnonymous, true)))
          .returning();
        if (upgraded) return upgraded;
      }
      const [created] = await tx
        .insert(users)
        .values({
          email: turnkeyUser.email,
          turnkeySubOrganizationId: claims.organizationId,
          turnkeyUserId: turnkeyUser.userId,
          isAnonymous: false,
          locale: input.device.locale ?? "en",
        })
        .returning();
      return created!;
    });

    const device = await this.upsertDevice(user.id, input.device);
    const { token } = await createSession(this.db, user.id, device.id);
    return { token, user, device, turnkeyUser };
  }
}
