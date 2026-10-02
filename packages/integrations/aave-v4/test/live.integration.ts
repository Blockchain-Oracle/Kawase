// Live reads of the Aave V4 Main Spoke on Arc mainnet (no funds move): every reserve with its factor, price, rates
// and liquidity, and an empty account's health. Run: pnpm test:live
import assert from "node:assert/strict";
import { createPublicClient, formatUnits, http } from "viem";
import { arc } from "viem/chains";

import { borrowApr, hasNoDebt, readAccount, readMarket, supplyApr } from "../src/index";

const MAIN_SPOKE = "0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d";
const RPC = process.env.ARC_RPC_URL_MAINNET ?? "https://rpc.drpc.mainnet.arc.io";
const TIMEOUT_MS = 30_000;
const PRICE_DECIMALS = 8;
const PERCENT = 100;

const client = createPublicClient({ chain: arc, transport: http(RPC, { timeout: TIMEOUT_MS }) });
const market = await readMarket(client, MAIN_SPOKE);
for (const r of market.reserves) {
  console.log(
    `#${r.reserveId} ${r.symbol.padEnd(7)} CF ${r.collateralFactorBps / PERCENT}%  borrowable ${r.borrowable}  $${formatUnits(r.price, PRICE_DECIMALS)}  ` +
      `borrow ${(borrowApr(r) * PERCENT).toFixed(2)}%  supply ${(supplyApr(r) * PERCENT).toFixed(2)}%  liquidity ${formatUnits(r.liquidity, r.decimals)}`,
  );
}
assert.equal(market.reserves.length, 4);
const account = await readAccount(client, MAIN_SPOKE, "0x000000000000000000000000000000000000bEEF", market.reserves.length);
assert.ok(hasNoDebt(account));
console.log("target health", formatUnits(market.targetHealthFactor, 18));
