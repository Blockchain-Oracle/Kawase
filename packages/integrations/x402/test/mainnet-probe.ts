// Mainnet, nothing paid: Circle's Arc catalog read through Discovery (all pages), BlockRun's DefiLlama yields found by
// search, its 402 asked live, and the option Kawase would pay chosen exactly as buy_service does (exact, USDC on Arc,
// the catalog's payTo). Run: pnpm --filter @kawase/integrations-x402 exec tsx test/mainnet-probe.ts
import { MARKETPLACE_DEFAULTS } from "@kawase/config";
import { getNetwork } from "@kawase/networks";

import { Discovery, isGatewayOption, optionsHere, probe } from "../src/index";

const mainnet = getNetwork("mainnet");
const discovery = new Discovery();
const all = await discovery.all(mainnet);
console.log(`catalog: ${all.length} listings payable on Arc mainnet; gateway-only ${all.filter((listing) => !listing.rails.includes("eip3009")).length}, eip3009 ${all.filter((listing) => listing.rails.includes("eip3009")).length}`);
const { listings } = await discovery.search(mainnet, { query: "defillama yields", limit: 5 });
const yields = listings.find((listing) => listing.url.endsWith("/defillama/yields"));
if (!yields) throw new Error("BlockRun's yields listing was not found");
console.log("listing:", yields.provider.name, yields.url, `price=${yields.price}`, `rails=${yields.rails.join("+")}`, `payTo=${yields.payTo}`);
const asked = await probe({ url: yields.url, method: yields.method });
if (asked.kind !== "payment_required") throw new Error(`expected a 402, got ${asked.kind}`);
const { gateway, eip3009 } = optionsHere(asked.required, mainnet);
const chosen = gateway ?? eip3009;
if (!chosen) throw new Error("no option payable on Arc");
console.log("402 options here:", { gateway: gateway?.amount ?? null, eip3009: eip3009?.amount ?? null });
console.log("would pay:", chosen.amount, isGatewayOption(chosen) ? "via Gateway" : "via EIP-3009", "to", chosen.payTo);
console.log("payTo matches the catalog:", chosen.payTo.toLowerCase() === yields.payTo.toLowerCase());
console.log("within the default per-call cap:", BigInt(chosen.amount) <= MARKETPLACE_DEFAULTS.mainnet.perCallCap);
