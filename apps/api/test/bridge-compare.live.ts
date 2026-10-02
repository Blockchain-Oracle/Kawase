// One live round trip of the bridge comparison on Arc mainnet (no funds move): 50 USDC Arc → Base, every provider.
// gaps.md G3 (Across quotes for real) and G4 (deBridge gets Arc USDC as the native coin). Run: tsx test/bridge-compare.live.ts
import assert from "node:assert/strict";

import { getNetwork } from "@kawase/networks";

import { compareRoutes, netOf } from "../src/bridge/compare";

const FIFTY_USDC = 50_000_000n;
const BASE = 8453;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WALLET = "0x000000000000000000000000000000000000bEEF";

const routes = await compareRoutes(
  { network: getNetwork("mainnet"), from: WALLET, recipient: WALLET, amount: FIFTY_USDC, destinationChainId: BASE, destinationUsdc: BASE_USDC },
  FIFTY_USDC,
);
for (const route of routes) console.log(route.provider.padEnd(24), route.status.padEnd(11), String(route.received ?? "-").padStart(9), `extra ${route.extraCost}`, `eta ${route.etaSeconds ?? "-"}`, route.reason ?? "");
const across = routes.find((route) => route.provider === "Across");
assert.ok(across?.received, "Across quotes Arc → Base");
const others = routes.slice(1).filter((route) => route.received !== null);
for (let i = 1; i < others.length; i++) assert.ok(netOf(others[i - 1]!) >= netOf(others[i]!), "ranked by net");
