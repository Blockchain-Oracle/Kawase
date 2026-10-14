// Live check of market/live.ts on Arc mainnet: the last 30 minutes of trades for three meme tokens (v3 and v4 pools),
// the newest decoded price beside DexScreener's, then live trades for 60 s.
// Run: pnpm --filter @kawase/api exec tsx test/live-swaps.live.ts
import type { Address } from "viem";

import { LiveTrades } from "../src/market/live";

const TOKENS: Record<string, Address> = {
  TOLLY: "0xBc43CE8DEc648EA298C4275559b81D6261c90b67",
  FAZE: "0x394D38F807eE0027A182216f5e67a15Ae441FA2E",
  MALA: "0x4F7DC89dc44aD08c20d9680d2Ee9cfad69BFDa55",
};
const WATCH_MS = 60_000;

const live = new LiveTrades();
let seen = 0;
const { snapshot, stop } = await live.subscribe(Object.values(TOKENS), (trade) => {
  seen += 1;
  const name = Object.entries(TOKENS).find(([, address]) => address.toLowerCase() === trade.token.toLowerCase())?.[0];
  console.log(
    `live ${name} ${trade.side} $${trade.amountUsd.toFixed(2)} @ ${trade.priceUsd.toPrecision(5)} ${trade.tx.slice(0, 10)}`,
  );
});
for (const [name, address] of Object.entries(TOKENS)) {
  const trades = snapshot[address.toLowerCase()] ?? [];
  const last = trades.at(-1);
  const ds = (await (await fetch(`https://api.dexscreener.com/tokens/v1/arc/${address}`)).json()) as {
    priceUsd?: string;
    liquidity?: { usd?: number };
  }[];
  const dsPrice = Number([...ds].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]?.priceUsd);
  const minutes = last && trades[0] ? ((last.at - trades[0].at) / 60_000).toFixed(1) : "0";
  console.log(
    `${name}: ${trades.length} trades over ${minutes} min; last ${last?.side} @ ${last?.priceUsd.toPrecision(5)}; DexScreener ${dsPrice.toPrecision(5)}`,
  );
}
await new Promise((resolve) => setTimeout(resolve, WATCH_MS));
stop();
console.log(`${seen} live trades in ${WATCH_MS / 1000} s`);
process.exit(0);
