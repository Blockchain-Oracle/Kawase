// Kawase's relayer on each network pays the gas for every wallet setup and gas-free send (relayed.ts), so a person
// needs no gas of their own. One that runs dry refuses them all as "Kawase is getting <network> ready" (10-15: mainnet's
// had never been funded, and nothing said so until a person's setup was refused). Every few minutes each relayer's
// balance is read: a low one is logged as a warning, an empty one as an error, and /health reports each network's
// state, so it shows before anyone is turned away.
import type { Logger } from "@kawase/log";
import type { NetworkId } from "@kawase/networks";

import type { Chains } from "../wallet/chain";
import { RELAYER_MIN_GAS } from "./relayed";

/** 1 USDC in Arc's 18-decimal native units: about a hundred setups left (≈1 cent each), time to top it up. */
const RELAYER_LOW_GAS = 1_000_000_000_000_000_000n;

export type RelayerState = "ok" | "low" | "empty" | "unknown";

export class RelayerWatch {
  private readonly states = new Map<NetworkId, RelayerState>();

  constructor(
    private readonly chains: Chains,
    private readonly log: Logger,
  ) {}

  /** Each network's last reading ("unknown" until the first read, or when the chain could not be read). */
  state(): Partial<Record<NetworkId, RelayerState>> {
    return Object.fromEntries(this.states);
  }

  async check(): Promise<void> {
    for (const network of this.chains.available) {
      const clients = this.chains.get(network);
      if (!clients) continue;
      const balance = await clients.client.getBalance({ address: clients.relayerAddress }).catch(() => undefined);
      const state: RelayerState = balance === undefined ? "unknown" : balance < RELAYER_MIN_GAS ? "empty" : balance < RELAYER_LOW_GAS ? "low" : "ok";
      const was = this.states.get(network);
      this.states.set(network, state);
      const facts = { network, relayer: clients.relayerAddress, balance: balance?.toString() };
      if (state === "empty") this.log.error(facts, "relayer out of gas: wallet setups and gas-free sends are refused");
      else if (state === "low") this.log.warn(facts, "relayer low on gas");
      else if (state === "ok" && was !== undefined && was !== "ok") this.log.info(facts, "relayer funded again");
    }
  }

  /** Reads now and every `intervalMs`; returns the stop. */
  start(intervalMs: number): () => void {
    void this.check();
    const timer = setInterval(() => void this.check(), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
