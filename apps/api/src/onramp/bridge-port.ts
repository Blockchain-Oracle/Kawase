// The glue between a Coinbase delivery on Base and Kawase's Bring-to-Arc leg: the onramp service says "USDC arrived on
// Base for this person", this makes the cross-chain intent the person approves (one yes, or none inside the budget).
// The crosschain service is L4's; it is used through its public `create` only. Wire it in app.ts:
//   onramp.setCrossChain(crossChainPort(deps.db, crosschain));
import { eq } from "drizzle-orm";
import { formatUnits } from "viem";

import { users, type Db } from "@kawase/db";
import { USDC_NATIVE_DECIMALS } from "@kawase/money";

import type { SessionUser } from "../types";
import type { CrossChainPort } from "./service";

type CrossChainCreate = {
  create(user: SessionUser, request: { direction: "in"; source: string; asset: string; amount: string }, origin: { surface: "app" | "chat" | "voice" }): Promise<{ id: string }>;
};

export function crossChainPort(db: Db, crosschain: CrossChainCreate): CrossChainPort {
  return {
    async bringToArc(userId, network, input) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error("no such user");
      // The intent is made for the network the order was bought on, whatever the person's switch says now.
      const intent = await crosschain.create({ ...user, activeNetwork: network } as SessionUser, { direction: "in", source: input.source, asset: "USDC", amount: formatUnits(input.amount, USDC_NATIVE_DECIMALS) }, { surface: "app" });
      return { intentId: intent.id };
    },
  };
}
