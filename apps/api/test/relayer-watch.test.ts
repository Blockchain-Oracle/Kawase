// The relayer watch (send/relayer-watch.ts): a dry relayer refuses every setup and gas-free send, so its state is read
// on a timer, logged and shown on /health. No chain: the balance comes from a stand-in client.
import assert from "node:assert/strict";
import { test } from "node:test";

import { RelayerWatch } from "../src/send/relayer-watch";
import type { Chains } from "../src/wallet/chain";

const USDC = 1_000_000_000_000_000_000n;
const RELAYER = "0x18fb4f6679dcb927Ef70b3B9Be8B0440e7836b78";

function setup(balances: { mainnet: () => bigint }) {
  const lines: { level: string; msg: string }[] = [];
  const log = {
    error: (_facts: unknown, msg: string) => lines.push({ level: "error", msg }),
    warn: (_facts: unknown, msg: string) => lines.push({ level: "warn", msg }),
    info: (_facts: unknown, msg: string) => lines.push({ level: "info", msg }),
  } as never;
  const chains = {
    available: ["mainnet", "testnet"],
    get: (network: string) =>
      network === "mainnet"
        ? { relayerAddress: RELAYER, client: { getBalance: async () => balances.mainnet() } }
        : { relayerAddress: RELAYER, client: { getBalance: async () => Promise.reject(new Error("rpc down")) } },
  } as unknown as Chains;
  return { watch: new RelayerWatch(chains, log), lines };
}

test("a dry relayer is an error, a low one a warning, a refill is said once; an unreadable chain is unknown", async () => {
  let balance = 0n;
  const { watch, lines } = setup({ mainnet: () => balance });
  assert.deepEqual(watch.state(), {});

  await watch.check();
  assert.deepEqual(watch.state(), { mainnet: "empty", testnet: "unknown" });
  assert.deepEqual(lines.map((line) => line.level), ["error"]);

  balance = USDC / 2n;
  await watch.check();
  assert.equal(watch.state().mainnet, "low");
  assert.equal(lines.at(-1)?.level, "warn");

  balance = 7n * USDC;
  await watch.check();
  await watch.check();
  assert.equal(watch.state().mainnet, "ok");
  assert.deepEqual(lines.slice(2).map((line) => line.msg), ["relayer funded again"], "said once, not on every read");
});
