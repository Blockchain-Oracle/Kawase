import { Hono } from "hono";
import { isAddress, type Address, type Hex, type SignedAuthorization } from "viem";
import { z } from "zod";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { SignedRevoke, WalletService } from "./service";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const network = z.enum(["mainnet", "testnet"]);
const AUTHORIZATION_KEYS = ["address", "chainId", "nonce", "r", "s", "yParity"] as const;

const networkSchema = z.object({ network });
const setupSubmitSchema = z.object({
  network,
  authorization: z.object({
    address: z.string().refine(isAddress),
    chainId: z.number().int(),
    nonce: z.number().int().nonnegative(),
    r: hex,
    s: hex,
    yParity: z.number().int().min(0).max(1),
  }),
});
const activitySchema = z.object({ network });
const allowanceRequestSchema = z.object({
  network,
  periodAmount: z.string().regex(/^\d+$/).optional(),
  /** The token; USDC when not named (one allowance per token). */
  token: z.string().refine((value) => isAddress(value, { strict: false }), "expected a token address").optional(),
});
/** What the wallet signed for a revoke handed out with a new grant (a relayed batch's signature or a transaction). */
export const signedRevokeSchema = z.object({ requestId: z.uuid(), signed: hex });
const allowanceSubmitSchema = z.object({ grantId: z.uuid(), signature: hex, revoke: signedRevokeSchema.optional() });
/** A signed transaction, or the wallet's signature on a relayed request (Kawase's relayer sends it). */
const submitTransactionSchema = z
  .object({ requestId: z.uuid(), signedTransaction: hex.optional(), signature: hex.optional() })
  .refine((input) => Boolean(input.signedTransaction) !== Boolean(input.signature), "send signedTransaction or signature");

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function walletRoutes(wallets: WalletService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);

  app.get("/", async (c) => c.json(await wallets.status(c.get("userId")!)));

  /** The money history on one network (USDC and EURC in and out), from the chain's explorer. */
  app.get("/activity", async (c) => {
    const input = await parse(activitySchema, { network: c.req.query("network") });
    return c.json(await wallets.activity(c.get("userId")!, input.network));
  });

  app.post("/setup/request", async (c) => {
    const input = await parse(networkSchema, await c.req.json());
    return c.json(await wallets.setupRequest(c.get("userId")!, input.network));
  });

  app.post("/setup/submit", async (c) => {
    const input = await parse(setupSubmitSchema, await c.req.json());
    const authorization = Object.fromEntries(
      AUTHORIZATION_KEYS.map((key) => [key, input.authorization[key]]),
    ) as unknown as SignedAuthorization;
    return c.json(await wallets.setupSubmit(c.get("userId")!, input.network, authorization));
  });

  app.post("/allowance/request", async (c) => {
    const input = await parse(allowanceRequestSchema, await c.req.json());
    return c.json(
      await wallets.allowanceRequest(
        c.get("userId")!,
        input.network,
        input.periodAmount ? BigInt(input.periodAmount) : undefined,
        input.token as Address | undefined,
      ),
    );
  });

  app.post("/allowance/submit", async (c) => {
    const input = await parse(allowanceSubmitSchema, await c.req.json());
    return c.json(await wallets.allowanceSubmit(c.get("userId")!, input.grantId, input.signature as Hex, input.revoke as SignedRevoke | undefined));
  });

  app.post("/allowance/revoke/request", async (c) => {
    const input = await parse(networkSchema, await c.req.json());
    return c.json(await wallets.revokeRequest(c.get("userId")!, input.network));
  });

  app.post("/transactions/submit", async (c) => {
    const input = await parse(submitTransactionSchema, await c.req.json());
    return c.json(await wallets.submitSigned(c.get("userId")!, input.requestId, (input.signature ?? input.signedTransaction) as Hex));
  });

  return app;
}
