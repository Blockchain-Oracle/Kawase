// The swap fan-out on Arc mainnet, read-only: KyberSwap, Circle App Kit and LI.FI each quote 1 USDC → ARGUS for a
// real wallet; the best is recommended; then every venue that quoted builds its calls, and each set passes its
// checks (right contract, exact amount, the wallet as recipient, on-chain minimum ≥ what was shown, no native
// value) and simulates as one batch would (eth_call of the swap call after the approval cannot run without the
// 7702 code, so the calls are checked, not sent). Nothing is signed or sent.
// Run: pnpm --filter @kawase/api exec tsx --test test/swap-venues-live.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "dotenv";
import { createPublicClient, http, parseUnits } from "viem";
import { arc } from "viem/chains";

import { DEFAULT_LIMITS, SWAP_ROUTE_SLIPPAGE_DIVISOR } from "@kawase/config";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitSwaps } from "../src/swap/engine";
import { createSwapVenues } from "../src/swap/venues";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const HOLDER = "0x7d613c6316eDe9d257f3BF512777Cb4Ea4A6beE4";
const ARGUS = "0xeCe5cA8bf9220718E5727754026757512212cb3c";
const USDC_DECIMALS = 6;
const ARGUS_DECIMALS = 18;

test("fan-out: three venues quote and build 1 USDC → ARGUS on Arc mainnet", { timeout: 120_000 }, async () => {
  const env = loadApiEnv();
  const network = getNetwork("mainnet");
  const client = createPublicClient({ chain: arc, transport: http() });
  const venues = createSwapVenues(appKitSwaps(env));
  const input = {
    network,
    client,
    from: HOLDER as `0x${string}`,
    tokenIn: network.addresses.usdc,
    tokenOut: ARGUS as `0x${string}`,
    amountIn: parseUnits("1", USDC_DECIMALS),
    decimalsIn: USDC_DECIMALS,
    decimalsOut: ARGUS_DECIMALS,
    slippageBps: DEFAULT_LIMITS.mainnet.maxSlippageOtherBps,
  };
  const { quotes, failures } = await venues.quoteAll(input);
  console.log("quotes", quotes.map((quote) => `${quote.venue}: ${quote.estimatedOut / 10n ** 15n}e-3 ARGUS (min ${quote.minOut / 10n ** 15n}e-3) via ${quote.via.join("/")}`), "failures", failures);
  assert.ok(quotes.length >= 2, "at least two venues quote ARGUS");
  for (const quote of quotes) {
    const prepared = await venues.prepare(quote.venue, { ...input, slippageBps: input.slippageBps / SWAP_ROUTE_SLIPPAGE_DIVISOR, minOut: quote.minOut });
    console.log(quote.venue, "built", prepared.calls.length, "calls to", prepared.calls.map((call) => call.to.slice(0, 10)).join(","), "guaranteed", prepared.guaranteedOut / 10n ** 15n, "e-3");
    assert.ok(prepared.guaranteedOut >= quote.minOut);
  }
});
