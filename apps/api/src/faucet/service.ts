// The in-app faucet (S2), shared by the routes and the agent: whether the person can claim test money now, and the
// claim itself — Circle's testnet faucet dripping to their own wallet. Testnet only; one successful claim per user
// per day; every attempt is recorded, refusals included, so the app can show the honest state.
import { and, desc, eq, gte } from "drizzle-orm";

import { FAUCET } from "@kawase/config";
import { faucetClaims, type Db } from "@kawase/db";
import { getNetwork, type NetworkId } from "@kawase/networks";

import type { Logger } from "@kawase/log";
import type { WalletService } from "../wallet/service";
import { FaucetRefused, type FaucetDrip } from "./circle-faucet";

const MS_PER_SECOND = 1_000;
export const FAUCET_NETWORK = "testnet" as const;
/** How much of a provider's refusal is kept with the claim. */
const FAILURE_MAX_CHARS = 500;

export type FaucetClaimResult =
  | { status: "sent"; amounts: Record<string, string>; address: string; nextAt: string }
  | { status: "claimed_today"; nextAt: string }
  | { status: "not_testnet" }
  | { status: "needs_wallet" }
  | { status: "failed"; fallbackUrl: string };

export const expectedAmounts = () => Object.fromEntries(Object.entries(FAUCET.expected).map(([asset, value]) => [asset, value.toString()]));

export class FaucetService {
  constructor(
    private readonly db: Db,
    private readonly wallets: WalletService,
    private readonly drip: FaucetDrip,
  ) {}

  private nextAt(claimedAt: Date) {
    return new Date(claimedAt.getTime() + FAUCET.claimEveryS * MS_PER_SECOND).toISOString();
  }

  /** The last successful claim inside the window, if any. */
  private async lastClaim(userId: string) {
    const since = new Date(Date.now() - FAUCET.claimEveryS * MS_PER_SECOND);
    const [row] = await this.db
      .select({ createdAt: faucetClaims.createdAt })
      .from(faucetClaims)
      .where(and(eq(faucetClaims.userId, userId), eq(faucetClaims.status, "sent"), gte(faucetClaims.createdAt, since)))
      .orderBy(desc(faucetClaims.createdAt))
      .limit(1);
    return row;
  }

  async status(userId: string) {
    const claim = await this.lastClaim(userId);
    return {
      network: FAUCET_NETWORK,
      eligible: !claim,
      nextAt: claim ? this.nextAt(claim.createdAt) : null,
      amounts: expectedAmounts(),
      fallbackUrl: FAUCET.circleFaucetUrl,
    };
  }

  async claim(userId: string, activeNetwork: NetworkId, log: Logger): Promise<FaucetClaimResult> {
    if (activeNetwork !== FAUCET_NETWORK) return { status: "not_testnet" };
    const wallet = await this.wallets.userWallet(userId);
    if (!wallet) return { status: "needs_wallet" };
    const claim = await this.lastClaim(userId);
    if (claim) return { status: "claimed_today", nextAt: this.nextAt(claim.createdAt) };

    const amounts = expectedAmounts();
    try {
      await this.drip({ network: getNetwork(FAUCET_NETWORK), address: wallet.address });
    } catch (failure) {
      const reason = failure instanceof FaucetRefused ? `${failure.status} ${failure.body}`.slice(0, FAILURE_MAX_CHARS) : String(failure);
      await this.db.insert(faucetClaims).values({ userId, network: FAUCET_NETWORK, address: wallet.address, amounts, status: "failed", failure: reason });
      log.warn({ reason }, "faucet drip refused");
      return { status: "failed", fallbackUrl: FAUCET.circleFaucetUrl };
    }
    const [row] = await this.db
      .insert(faucetClaims)
      .values({ userId, network: FAUCET_NETWORK, address: wallet.address, amounts, status: "sent" })
      .returning({ createdAt: faucetClaims.createdAt });
    return { status: "sent", amounts, address: wallet.address, nextAt: this.nextAt(row!.createdAt) };
  }
}
