import { Hono } from "hono";
import { isAddress, type Address, type Hex, type SignedAuthorization } from "viem";
import { z } from "zod";

import { requireAccount } from "../auth/middleware";
import type { TurnkeyReader } from "../auth/turnkey";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { WalletService } from "./service";

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const network = z.enum(["mainnet", "testnet"]);
const AUTHORIZATION_KEYS = ["address", "chainId", "nonce", "r", "s", "yParity"] as const;

const registerSchema = z.object({
  address: z.string().refine(isAddress, "expected an address"),
  walletId: z.string().min(1),
});
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
const allowanceRequestSchema = z.object({ network, periodAmount: z.string().regex(/^\d+$/).optional() });
const allowanceSubmitSchema = z.object({ grantId: z.uuid(), signature: hex });
const submitTransactionSchema = z.object({ requestId: z.uuid(), signedTransaction: hex });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function walletRoutes(wallets: WalletService, turnkey: TurnkeyReader) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);

  app.get("/", async (c) => c.json(await wallets.status(c.get("userId")!)));

  /** The money history on one network (USDC and EURC in and out), from the chain's explorer. */
  app.get("/activity", async (c) => {
    const input = await parse(activitySchema, { network: c.req.query("network") });
    return c.json(await wallets.activity(c.get("userId")!, input.network));
  });

  /** The app creates the wallet with the Turnkey kit, then registers its address here. */
  app.post("/", async (c) => {
    const input = await parse(registerSchema, await c.req.json());
    const user = c.get("user")!;
    if (!user.turnkeySubOrganizationId) throw problem(HTTP.forbidden, "forbidden");
    const known = await turnkey.getWalletAddresses(user.turnkeySubOrganizationId);
    const match = known.find(
      (entry) => entry.address.toLowerCase() === input.address.toLowerCase() && entry.walletId === input.walletId,
    );
    if (!match) throw problem(HTTP.unprocessable, "validation", "this address is not in your Turnkey organization");
    const wallet = await wallets.register(user.id, {
      address: input.address as Address,
      walletId: input.walletId,
      subOrganizationId: user.turnkeySubOrganizationId,
    });
    return c.json({ wallet: { id: wallet!.id, address: wallet!.address } }, HTTP.created);
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
      ),
    );
  });

  app.post("/allowance/submit", async (c) => {
    const input = await parse(allowanceSubmitSchema, await c.req.json());
    return c.json(await wallets.allowanceSubmit(c.get("userId")!, input.grantId, input.signature as Hex));
  });

  app.post("/allowance/revoke/request", async (c) => {
    const input = await parse(networkSchema, await c.req.json());
    return c.json(await wallets.revokeRequest(c.get("userId")!, input.network));
  });

  app.post("/transactions/submit", async (c) => {
    const input = await parse(submitTransactionSchema, await c.req.json());
    return c.json(await wallets.submitTransaction(c.get("userId")!, input.requestId, input.signedTransaction as Hex));
  });

  return app;
}
