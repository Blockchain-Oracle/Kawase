// Live check of the Arc RPC fallback (wallet/chain.ts arcTransport): a read on each network through the chain of
// public endpoints. Run: pnpm --filter @kawase/api exec tsx test/rpc-fallback.live.ts
import { createPublicClient } from "viem";

import { getNetwork } from "@kawase/networks";

import { arcTransport } from "../src/wallet/chain";

for (const id of ["mainnet", "testnet"] as const) {
  const client = createPublicClient({ chain: getNetwork(id).viemChain, transport: arcTransport(id) });
  const started = Date.now();
  const block = await client.getBlockNumber();
  console.log(`${id}: block ${block} in ${Date.now() - started} ms`);
}
