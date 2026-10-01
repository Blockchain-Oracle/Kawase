// The in-app faucet (S2): `GET /faucet` says whether the person can claim test money now (and when next), and
// `POST /faucet/claim` sends it — Circle's testnet faucet dripping to the person's own wallet address. Testnet
// only; one successful claim per user per day; every attempt is recorded, refusals included, so the app can show
// the honest state and the Circle fallback link.
import { and, desc, eq, gte } from "drizzle-orm";
import { Hono } from "hono";

import { FAUCET } from "@kawase/config";
import { faucetClaims, type Db } from "@kawase/db";
import { getNetwork } from "@kawase/networks";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { WalletService } from "../wallet/service";
import { FaucetRefused, type FaucetDrip } from "./circle-faucet";

const MS_PER_SECOND = 1_000;
const FAUCET_NETWORK = "testnet" as const;
/** How much of a provider's refusal is kept with the claim. */
const FAILURE_MAX_CHARS = 500;

const expectedAmounts = () => Object.fromEntries(Object.entries(FAUCET.expected).map(([asset, value]) => [asset, value.toString()]));

export function faucetRoutes(db: Db, wallets: WalletService, drip: FaucetDrip) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);

  /** The last successful claim inside the window, if any. */
  const lastClaim = async (userId: string) => {
    const since = new Date(Date.now() - FAUCET.claimEveryS * MS_PER_SECOND);
    const [row] = await db
      .select({ createdAt: faucetClaims.createdAt })
      .from(faucetClaims)
      .where(and(eq(faucetClaims.userId, userId), eq(faucetClaims.status, "sent"), gte(faucetClaims.createdAt, since)))
      .orderBy(desc(faucetClaims.createdAt))
      .limit(1);
    return row;
  };
  const nextAt = (claimedAt: Date) => new Date(claimedAt.getTime() + FAUCET.claimEveryS * MS_PER_SECOND).toISOString();

  app.get("/", async (c) => {
    const claim = await lastClaim(c.get("userId")!);
    return c.json({
      network: FAUCET_NETWORK,
      eligible: !claim,
      nextAt: claim ? nextAt(claim.createdAt) : null,
      amounts: expectedAmounts(),
      fallbackUrl: FAUCET.circleFaucetUrl,
    });
  });

  app.post("/claim", async (c) => {
    const userId = c.get("userId")!;
    if (c.get("user")!.activeNetwork !== FAUCET_NETWORK) throw problem(HTTP.unprocessable, "faucet_testnet_only");
    const wallet = await wallets.userWallet(userId);
    if (!wallet) throw problem(HTTP.unprocessable, "wallet_not_registered");
    const claim = await lastClaim(userId);
    if (claim) throw problem(HTTP.tooManyRequests, "faucet_claimed_today", undefined, { nextAt: nextAt(claim.createdAt) });

    const amounts = expectedAmounts();
    try {
      await drip({ network: getNetwork(FAUCET_NETWORK), address: wallet.address });
    } catch (failure) {
      const reason = failure instanceof FaucetRefused ? `${failure.status} ${failure.body}`.slice(0, FAILURE_MAX_CHARS) : String(failure);
      await db.insert(faucetClaims).values({ userId, network: FAUCET_NETWORK, address: wallet.address, amounts, status: "failed", failure: reason });
      c.get("log").warn({ reason }, "faucet drip refused");
      throw problem(HTTP.badGateway, "upstream", "the faucet did not send", { fallbackUrl: FAUCET.circleFaucetUrl });
    }
    const [row] = await db
      .insert(faucetClaims)
      .values({ userId, network: FAUCET_NETWORK, address: wallet.address, amounts, status: "sent" })
      .returning({ createdAt: faucetClaims.createdAt });
    return c.json({ status: "sent", amounts, address: wallet.address, nextAt: nextAt(row!.createdAt) }, HTTP.created);
  });

  return app;
}
