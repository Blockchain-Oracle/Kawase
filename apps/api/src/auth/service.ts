// Sign-in: a guest gets a user and a device session at once. An account sign-in links the person's Privy identity to a
// Kawase user (moving a guest's data across if there is one) and issues a session (D41): the app's Privy access and
// identity tokens, verified here (privy.ts); the Privy wallet is registered from the signed identity token in the same
// step. Dev sign-in (local development only) is a throwaway key signing our single-use nonce.
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { verifyMessage, type Address, type Hex } from "viem";

import { loadPrivyEnv } from "@kawase/env";
import { devices, moveUserData, revokedIdentitySessions, signInNonces, users, type Db } from "@kawase/db";

import { HTTP, ProblemError, problem } from "../http/problem";
import { registerUserWallet } from "../wallet/service";
import { createPrivyVerifier, PrivyTokenError, type PrivyIdentity, type PrivyVerifier } from "./privy";
import { createSession } from "./session";
import { retryOnRace } from "./unique";

const NONCE_BYTES = 32;
const MS_PER_SECOND = 1000;
const NONCE_TTL_SECONDS = 300;

export type DeviceInput = {
  platform: "ios" | "android" | "web" | "desktop";
  installationId: string;
  appVersion?: string | undefined;
  locale?: string | undefined;
};

/** Privy sign-in from the PRIVY_* variables; undefined without an app id (a test or a local run that needs none). */
export function privyFromEnv(source?: Record<string, string | undefined>): PrivyVerifier | undefined {
  const env = loadPrivyEnv(source);
  if (!env.PRIVY_APP_ID) return undefined;
  return createPrivyVerifier({
    appId: env.PRIVY_APP_ID,
    verificationKey: env.PRIVY_VERIFICATION_KEY,
    appSecret: env.PRIVY_APP_SECRET,
  });
}

const PRIVY = "privy" as const;
/** Dev accounts live on this domain only (RFC 2606 reserves .test), so no real address is ever signed into this way. */
export const DEV_EMAIL_DOMAIN = "@kawase.test";
/** What a dev key signs to sign in: the api's nonce, in words. */
export const devSignInMessage = (nonce: string) => `Kawase dev sign-in\n${nonce}`;
/** The unique indexes two concurrent first sign-ins can collide on (the identity, the email, the device). */
const RACED_INDEXES = ["users_identity_idx", "users_email_idx", "devices_installation_idx"] as const;
const raceConflict = () => problem(HTTP.conflict, "conflict", "this sign-in is already being finished; try again");

export class AuthService {
  readonly privy: PrivyVerifier | undefined;

  constructor(
    private readonly db: Db,
    privy: PrivyVerifier | undefined = privyFromEnv(),
  ) {
    this.privy = privy;
  }

  /**
   * The tokens' identity, or the problem the app shows (a bad or expired token is a 401; Privy unreachable a 502). A
   * Privy session signed out from Settings → Devices is refused for good: that device has to sign in afresh.
   */
  private async privyIdentity(input: { accessToken: string; identityToken?: string | undefined }): Promise<PrivyIdentity> {
    if (!this.privy) throw problem(HTTP.notFound, "not_found", "Privy sign-in is not on");
    let identity: PrivyIdentity;
    try {
      identity = await this.privy.identify(input);
    } catch (error) {
      if (error instanceof PrivyTokenError) throw problem(HTTP.unauthorized, "proof_invalid", "the Privy tokens do not verify");
      throw problem(HTTP.badGateway, "upstream", "Privy could not be reached");
    }
    const [revoked] = await this.db
      .select({ sessionId: revokedIdentitySessions.sessionId })
      .from(revokedIdentitySessions)
      .where(eq(revokedIdentitySessions.sessionId, identity.sessionId));
    if (revoked) throw problem(HTTP.unauthorized, "session_signed_out", "this device was signed out; sign in again");
    return identity;
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
   * finds the account that email belongs to; an account already linked to another Privy identity is not taken over
   * (recovery). The embedded wallet in the identity token is registered in the same step; a wallet that
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
   * unless it already belongs to another Kawase account.
   */
  async syncPrivyEmail(userId: string, input: { accessToken: string; identityToken?: string | undefined }) {
    const { email } = await this.ownPrivyIdentity(userId, input);
    if (!email) {
      // The person removed their last verified email at Privy: Kawase stops keeping one for them too.
      await this.db.update(users).set({ email: null }).where(eq(users.id, userId));
      return { email: null };
    }
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

  /**
   * Dev sign-in (local development only; app.ts mounts it only outside production with mainnet off): a throwaway
   * testnet key proves itself by signing the api's single-use nonce, and its `@kawase.test` email names the account.
   * The key is the account's wallet (custody "external"), so every flow can be tried end to end without a provider.
   */
  async signInWithDevKey(input: {
    email: string;
    address: Address;
    nonce: string;
    signature: Hex;
    device: DeviceInput;
    guestUserId?: string | undefined;
  }) {
    const email = input.email.trim().toLowerCase();
    if (!email.endsWith(DEV_EMAIL_DOMAIN)) throw problem(HTTP.badRequest, "validation", `a dev account's email ends in ${DEV_EMAIL_DOMAIN}`);
    await this.consumeNonce(input.nonce);
    const valid = await verifyMessage({ address: input.address, message: devSignInMessage(input.nonce), signature: input.signature });
    if (!valid) throw problem(HTTP.unauthorized, "proof_invalid", "the signature does not match the key");
    const user = await retryOnRace(() => this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(sql`lower(${users.email}) = ${email}`);
      if (existing) {
        if (input.guestUserId && input.guestUserId !== existing.id) await moveUserData(tx, input.guestUserId, existing.id);
        return existing;
      }
      if (input.guestUserId) {
        const [upgraded] = await tx
          .update(users)
          .set({ email, isAnonymous: false })
          .where(and(eq(users.id, input.guestUserId), eq(users.isAnonymous, true)))
          .returning();
        if (upgraded) return upgraded;
      }
      const [created] = await tx.insert(users).values({ email, isAnonymous: false, locale: input.device.locale ?? "en" }).returning();
      return created!;
    }), RACED_INDEXES, raceConflict);
    const device = await retryOnRace(() => this.upsertDevice(user.id, input.device), RACED_INDEXES, raceConflict);
    const wallet = await registerUserWallet(this.db, user.id, { address: input.address, custody: "external", providerRef: { kind: "dev" } });
    const { token } = await createSession(this.db, user.id, device.id);
    return { token, user, device, wallet };
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
}
