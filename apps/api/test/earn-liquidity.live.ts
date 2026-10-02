// One live read of the earn ranking on Arc mainnet (gaps.md G1): vaults that cannot pay out now are "stuck" and never
// the default deposit; liquid ones lead. Run: tsx test/earn-liquidity.live.ts
import assert from "node:assert/strict";
import { config } from "dotenv";

import { EARN_LIQUIDITY } from "@kawase/config";
import { exploreVaults } from "@kawase/integrations-app-kit";
import { getNetwork } from "@kawase/networks";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const vaults = await exploreVaults(getNetwork("mainnet"), process.env.CIRCLE_LIVE_API_KEY ?? "", EARN_LIQUIDITY);
for (const vault of vaults) console.log(vault.liquidity.padEnd(7), `${(vault.apy * 100).toFixed(2)}%`.padStart(7), Number(vault.available).toFixed(0).padStart(10), "of", Number(vault.totalDeposits).toFixed(0).padStart(10), vault.name);
const firstStuck = vaults.findIndex((vault) => vault.liquidity === "stuck");
assert.ok(firstStuck === -1 || vaults.slice(firstStuck).every((vault) => vault.liquidity === "stuck"), "stuck vaults rank last");
assert.ok(vaults[0]?.liquidity !== "stuck", "the default deposit target can pay out");
