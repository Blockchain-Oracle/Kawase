// One live round trip against KyberSwap on Arc mainnet (no funds move): quote 10 USDC → EURC, build the calldata
// for a wallet, and check that what was built pays that wallet at least the minimum.
import assert from "node:assert/strict";

import { build, checkKyberSwap, quote } from "../src/index";

const ARC = 5042;
const USDC = "0x3600000000000000000000000000000000000000";
const EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const WALLET = "0x000000000000000000000000000000000000bEEF";
const TEN_USDC = 10_000_000n;
const SLIPPAGE_BPS = 50;

const route = await quote({ chainId: ARC, tokenIn: USDC, tokenOut: EURC, amountIn: TEN_USDC, sender: WALLET, recipient: WALLET, slippageBps: SLIPPAGE_BPS });
const tx = await build(route, { slippageBps: SLIPPAGE_BPS / 2 });
const check = checkKyberSwap(tx, { tokenIn: USDC, tokenOut: EURC, amountIn: TEN_USDC, recipient: WALLET, minOut: route.minOut });
assert.ok(check.ok, `built swap refused: ${check.ok ? "" : check.reason}`);
console.log(`10 USDC → ${route.amountOut} EURC units via ${route.venues.join(", ")}; min ${tx.minOut}; ${tx.data.length} bytes calldata`);
