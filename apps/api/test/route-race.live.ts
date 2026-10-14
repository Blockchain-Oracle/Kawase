// Live, read-only check of the route race on Arc mainnet (no signing, no transaction): races 10 USDC → EURC across
// every swap venue, has each new venue (Uniswap, 0x, Socket) build and pass its calldata checks for the requester,
// and races 5 USDC Arc → Base (USDC) and 1 USDC Arc → Base (ETH, Gas.zip). Prints request ids, amounts and targets.
// Run from the repo root: pnpm --filter @kawase/api exec tsx test/route-race.live.ts [requester] [--record file.json]
// (--record writes every snapshot, for the RouteList's gallery recording.)
// Keys come from the repo's .env (UNISWAP_API_KEY, ZEROX_API_KEY); nothing secret is printed.
import { existsSync, writeFileSync } from "node:fs";
import { createPublicClient, getAddress, http, type Address, type PublicClient } from "viem";

import type { RouteRace } from "@kawase/api-client";
import { loadApiEnv } from "@kawase/env";
import { getNetwork } from "@kawase/networks";

import { appKitBridges } from "../src/bridge/engine";
import { appKitSwaps } from "../src/swap/engine";
import { createSwapVenues, type SwapVenue } from "../src/swap/venues";
import type { SessionUser } from "../src/types";
import type { Chains, NetworkClients } from "../src/wallet/chain";
import { createRouteRacer } from "../src/routing/racer";

const ENV_FILE = new URL("../../../../.env", import.meta.url).pathname;
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

/** argv[0] is node, argv[1] this script. */
const ARGS_FROM = 2;
const SELECTOR_CHARS = 10;
/** Prepare is held to 99% of the shown minimum, as the swap service's half-slippage build would be. */
const HELD_SHARE = 99n;
const WHOLE = 100n;
const args = process.argv.slice(ARGS_FROM);
const recordAt = args.indexOf("--record");
const recordFile = recordAt >= 0 ? args[recordAt + 1] : undefined;
const requester = getAddress(args.find((arg) => arg.startsWith("0x")) ?? "0x1111111111111111111111111111111111111111");
const recorded: Record<string, RouteRace[]> = {};
const env = loadApiEnv();
const network = getNetwork("mainnet");
const client = createPublicClient({ chain: network.viemChain, transport: http(env.ARC_RPC_URL_MAINNET) }) as PublicClient;
// Reads only: the race never touches the relayer or the ops wallet.
const chains: Chains = { available: ["mainnet"], get: (id) => (id === "mainnet" ? ({ network, client } as unknown as NetworkClients) : undefined) };
const engine = appKitSwaps(env);
const venues = createSwapVenues(engine);
const racer = createRouteRacer({ chains, wallets: { userWallet: async () => ({ address: requester }) as never }, venues, bridges: appKitBridges(env) });
const user = { id: "live-check", activeNetwork: "mainnet", isAnonymous: false } as unknown as SessionUser;

const line = (race: RouteRace, index: number) =>
  `#${index} done=${race.done} best=${race.best ?? "-"} ` +
  race.rows.map((row) => `${row.venue}:${row.status}${row.receive ? `=${row.receive.amount}` : ""}${row.reason ? `(${row.reason})` : ""}`).join(" ");

async function run(label: string, race: AsyncGenerator<RouteRace>) {
  console.log(`\n== ${label}`);
  let count = 0;
  let last: RouteRace | undefined;
  const list: RouteRace[] = (recorded[label] = []);
  for await (const snapshot of race) {
    console.log(line(snapshot, count++));
    list.push(snapshot);
    last = snapshot;
  }
  console.log(`snapshots: ${count}`);
  return last;
}

/** The RouteList's view of a finished race: each row's logo key, whether it is a choice, and what it delivers. */
function rowsTable(race: RouteRace | undefined) {
  if (!race) return;
  console.log(`best=${race.best}`);
  for (const row of race.rows) console.log(`  ${row.venue.padEnd(10)} mark=${row.mark.padEnd(16)} ${row.status.padEnd(8)} executable=${row.executable} receive=${row.receive ? `${row.receive.amount} ${row.receive.symbol}` : "-"}${row.reason ? ` reason=${row.reason}` : ""}`);
  console.log(`executable venues: ${race.rows.filter((row) => row.status === "quoted" && row.executable).length}`);
}

const swapRace = await run("swap 10 USDC → EURC", await racer.swap(user, { kind: "swap", tokenIn: "USDC", tokenOut: "EURC", amount: "10" }));
rowsTable(swapRace);

console.log("\n== new venues build for the requester", requester);
const USDC = network.addresses.usdc;
const EURC = network.addresses.eurc as Address;
for (const venue of ["uniswap", "zerox", "socket"] as SwapVenue[]) {
  const row = swapRace?.rows.find((entry) => entry.venue === venue);
  if (!row?.minReceive) {
    console.log(venue, "did not quote:", row?.reason);
    continue;
  }
  const input = { network, client, from: requester, tokenIn: USDC, tokenOut: EURC, amountIn: 10_000_000n, decimalsIn: 6, decimalsOut: 6, slippageBps: 50, minOut: (BigInt(row.minReceive) * HELD_SHARE) / WHOLE };
  try {
    const prepared = await venues.prepare(venue, input);
    console.log(
      venue,
      `quoteId=${row.quoteId ?? "-"}`,
      `receive=${row.receive?.amount}`,
      `min=${row.minReceive}`,
      `guaranteed=${prepared.guaranteedOut}`,
      `feeBps=${row.feeBps ?? "-"}`,
      "calls:",
      prepared.calls.map((call) => `${call.to}:${call.data.slice(0, SELECTOR_CHARS)}:value=${call.value}`).join(" → "),
      "checks: passed (recipient = requester)",
    );
  } catch (error) {
    console.log(venue, "prepare refused:", error instanceof Error ? error.message : error);
  }
}

await run("bridge 5 USDC Arc → Base (USDC)", await racer.bridge(user, { kind: "bridge", destination: "base", amount: "5" }));
await run("bridge 1 USDC Arc → Base (ETH for gas)", await racer.bridge(user, { kind: "bridge", destination: "base", amount: "1", toAsset: "ETH" }));

if (recordFile) {
  writeFileSync(recordFile, JSON.stringify(recorded, null, 1));
  console.log("\nrecorded to", recordFile);
}
