// Circle's testnet faucet as a drip: one call sends test USDC and EURC to an address on Arc Testnet
// (`POST /v1/faucet/drips`, the TEST api key; 204 on success). Behind an interface so tests use a fake.
import type { NetworkContext } from "@kawase/networks";

export type FaucetDrip = (input: { network: NetworkContext; address: string }) => Promise<void>;

export class FaucetRefused extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`faucet refused (${status})`);
    this.name = "FaucetRefused";
  }
}

const CIRCLE_API = "https://api.circle.com";
const DRIP_TIMEOUT_MS = 15_000;

export function circleFaucet(apiKey: string): FaucetDrip {
  return async ({ network, address }) => {
    const response = await fetch(`${CIRCLE_API}/v1/faucet/drips`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ address, blockchain: network.circleBlockchain, usdc: true, eurc: true }),
      signal: AbortSignal.timeout(DRIP_TIMEOUT_MS),
    });
    if (!response.ok) throw new FaucetRefused(response.status, await response.text());
  };
}
