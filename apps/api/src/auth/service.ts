// Sign-in: a guest gets a user and a device session at once. An account sign-in links the wallet provider's identity
// to a Kawase user (moving a guest's data across if there is one) and issues a session:
// - Privy (D41): the app's Privy access and identity tokens, verified here (privy.ts); the Privy wallet is registered
//   from the signed identity token in the same step. A Turnkey-era account is matched by the email Privy verified.
// - Turnkey (the fallback for one build): a stamp by the session key over our single-use nonce.
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";

import { loadPrivyEnv } from "@kawase/env";
import { devices, moveUserData, signInNonces, users, type Db } from "@kawase/db";

import { HTTP, ProblemError, problem } from "../http/problem";
import { registerUserWallet } from "../wallet/service";
import { createPrivyVerifier, PrivyTokenError, type PrivyIdentity, type PrivyVerifier } from "./privy";
import { createSession } from "./session";
import { retryOnRace } from "./unique";
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

/** Privy sign-in as configured by WALLET_PROVIDER and the PRIVY_* variables; undefined while Turnkey is the provider. */
export function privyFromEnv(source?: Record<string, string | undefined>): PrivyVerifier | undefined {
  const env = loadPrivyEnv(source);
  if (env.WALLET_PROVIDER !== "privy" || !env.PRIVY_APP_ID) return undefined;
  return createPrivyVerifier({
    appId: env.PRIVY_APP_ID,
    verificationKey: env.PRIVY_VERIFICATION_KEY,
    appSecret: env.PRIVY_APP_SECRET,
  });
}

const PRIVY = "privy" as const;
/** The unique indexes two concurrent first sign-ins can collide on (the identity, the email, the device). */
const RACED_INDEXES = ["users_identity_idx", "users_email_idx", "devices_installation_idx"] as const;
const raceConflict = () => problem(HTTP.conflict, "conflict", "this sign-in is already being finished; try again");

export class AuthService {
  readonly privy: PrivyVerifier | undefined;

  constructor(
    private readonly db: Db,
    private readonly turnkey: TurnkeyReader,
    privy: PrivyVerifier | undefined = privyFromEnv(),
  ) {
    this.privy = privy;
  }

  /** The tokens' identity, or the problem the app shows (a bad or expired token is a 401; Privy unreachable a 502). */
  private async privyIdentity(input: { accessToken: string; identityToken?: string | undefined }): Promise<PrivyIdentity> {
    if (!this.privy) throw problem(HTTP.notFound, "not_found", "Privy sign-in is not on");
    try {
      return await this.privy.identify(input);
    } catch (error) {
      if (error instanceof PrivyTokenError) throw problem(HTTP.unauthorized, "proof_invalid", "the Privy tokens do not verify");
      throw problem(HTTP.badGateway, "upstream", "Privy could not be reached");
    }
  }

  private privyWallet(userId: string, identity: PrivyIdentity, wallet: NonNullable<PrivyIdentity["wallet"]>) {
    return registerUserWallet(this.db, userId, {
      address: wallet.address,
      custody: PRIVY,
      providerRef: { userId: identity.userId, ...(wallet.walletId ? { walletId: wallet.walletId } : {}) },
    });
  }

  /**
   * Privy sign-in (D41). The Privy DID is the identity. Without a Kawase user for it yet, the email Privy verified
   * finds a Turnkey-era account (the move from Turnkey); an account already linked to another Privy identity is not
   * taken over (recovery). The embedded wallet in the identity token is registered in the same step; a wallet that
   * cannot be registered never fails the sign-in (the app registers it again after creating it).
   */
  async signInWithPrivy(input: {
    accessToken: string;
    identityToken?: string | undefined;
    device: DeviceInput;
    guestUserId?: string | undefined;
  }) {
    const identity = await this.privyIdentity(input);
    const email = identity.email;
    // Two first sign-ins for the same Privy user at once (a double tap, two tabs) race to create the account: the one
    // that loses runs again and finds the winner's row; losing twice is a 409, never a 500.
    const user = await retryOnRace(() => this.db.transaction(async (tx) => {
      const [byIdentity] = await tx
        .select()
        .from(users)
        .where(and(eq(users.identityProvider, PRIVY), eq(users.identitySubject, identity.userId)));
      const [byEmail] = email
        ? await tx
            .select()
            .from(users)
            .where(sql`lower(${users.email}) = lower(${email})`)
        : [];
      let existing = byIdentity;
      if (!existing && byEmail) {
        if (byEmail.identityProvider === PRIVY) throw problem(HTTP.conflict, "account_recovery_required");
        existing = byEmail;
      }
      // The email stays unique across accounts: another account's email is never copied onto this one.
      const emailFree = !byEmail || byEmail.id === existing?.id;
      const linked = { identityProvider: PRIVY, identitySubject: identity.userId, isAnonymous: false };
      if (existing) {
        if (input.guestUserId && input.guestUserId !== existing.id) await moveUserData(tx, input.guestUserId, existing.id);
        const [updated] = await tx
          .update(users)
          .set({ ...linked, email: emailFree && email ? email : existing.email })
          .where(eq(users.id, existing.id))
          .returning();
        return updated!;
      }
      if (input.guestUserId) {
        // The guest becomes the account: nothing to move, the row is upgraded in place.
        const [upgraded] = await tx
          .update(users)
          .set({ ...linked, email: emailFree ? (email ?? null) : null })
          .where(and(eq(users.id, input.guestUserId), eq(users.isAnonymous, true)))
          .returning();
        if (upgraded) return upgraded;
      }
      const [created] = await tx
        .insert(users)
        .values({ ...linked, email: emailFree ? (email ?? null) : null, locale: input.device.locale ?? "en" })
        .returning();
      return created!;
    }), RACED_INDEXES, raceConflict);

    const device = await retryOnRace(() => this.upsertDevice(user.id, input.device), RACED_INDEXES, raceConflict);
    await this.db.update(devices).set({ identitySessionId: identity.sessionId }).where(eq(devices.id, device.id));
    const wallet = identity.wallet
      ? await this.privyWallet(user.id, identity, identity.wallet).catch((error: unknown) => {
          if (error instanceof ProblemError) return undefined;
          throw error;
        })
      : undefined;
    const { token } = await createSession(this.db, user.id, device.id);
    return { token, user, device, wallet };
  }

  /**
   * After the app created the embedded wallet (an account that signed in before it had one): fresh tokens for the
   * same Privy identity register it. The address comes from the signed identity token, never from the body.
   */
  async linkPrivyWallet(userId: string, input: { accessToken: string; identityToken?: string | undefined }) {
    const identity = await this.ownPrivyIdentity(userId, input);
    // An identity token minted before the wallet existed (the SDK caches it) does not name the wallet yet; Privy's own
    // record of the user does, when the api has the app secret to read it. The app also refreshes its token and retries.
    const wallet = identity.wallet ?? (input.identityToken ? await this.privyWalletFromApi(input.accessToken) : undefined);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered", "the Privy account has no wallet yet");
    return this.privyWallet(userId, identity, wallet);
  }

  /** The embedded wallet as Privy's REST API has it now (needs PRIVY_APP_SECRET); undefined when it cannot be read. */
  private async privyWalletFromApi(accessToken: string): Promise<PrivyIdentity["wallet"]> {
    try {
      return (await this.privy?.identify({ accessToken }))?.wallet;
    } catch {
      return undefined;
    }
  }

  /** The tokens' identity, refused unless it is the one this Kawase account is linked to. */
  private async ownPrivyIdentity(userId: string, input: { accessToken: string; identityToken?: string | undefined }) {
    const identity = await this.privyIdentity(input);
    const [user] = await this.db
      .select({ provider: users.identityProvider, subject: users.identitySubject })
      .from(users)
      .where(eq(users.id, userId));
    if (user?.provider !== PRIVY || user.subject !== identity.userId)
      throw problem(HTTP.forbidden, "forbidden", "these tokens are for another account");
    return identity;
  }

  /**
   * After the person changed their email at Privy (a code to the new address): Kawase follows the verified address,
   * unless it already belongs to another Kawase account (the same rule as the Turnkey sync).
   */
  async syncPrivyEmail(userId: string, input: { accessToken: string; identityToken?: string | undefined }) {
    const { email } = await this.ownPrivyIdentity(userId, input);
    if (!email) return { email: null };
    const [other] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = lower(${email})`, ne(users.id, userId)));
    if (other) throw problem(HTTP.conflict, "account_recovery_required", "this email belongs to another account");
    await this.db.update(users).set({ email }).where(eq(users.id, userId));
    return { email };
  }

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
      // The proved sub-organization is the identity. Email is mutable provider metadata and cannot rebind
      // another account or its wallet. A different identity needs an explicit recovery ceremony.
      const [bySubOrg] = await tx.select().from(users).where(eq(users.turnkeySubOrganizationId, claims.organizationId));
      const [byEmail] =
        bySubOrg || !turnkeyUser.email
          ? []
          : await tx
              .select()
              .from(users)
              .where(sql`lower(${users.email}) = lower(${turnkeyUser.email})`);
      if (byEmail) throw problem(HTTP.conflict, "account_recovery_required");
      const existing = bySubOrg;
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
            ...(existing.identityProvider ? {} : { identityProvider: "turnkey" as const, identitySubject: claims.organizationId }),
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
            identityProvider: "turnkey",
            identitySubject: claims.organizationId,
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
          identityProvider: "turnkey",
          identitySubject: claims.organizationId,
          isAnonymous: false,
          locale: input.device.locale ?? "en",
        })
        .returning();
      return created!;
    });

    const device = await this.upsertDevice(user.id, input.device);
    // The session key that proved this sign-in is this device's Turnkey API key: "sign out this device" deletes it.
    await this.db.update(devices).set({ turnkeyPublicKey: stamp.publicKey }).where(eq(devices.id, device.id));
    const { token } = await createSession(this.db, user.id, device.id);
    return { token, user, device, turnkeyUser };
  }
}
