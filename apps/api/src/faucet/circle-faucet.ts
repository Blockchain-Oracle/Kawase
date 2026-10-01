// Circle's testnet faucet as a drip: one call sends test USDC and EURC to an address on Arc Testnet
// (`POST /v1/faucet/drips`, the TEST api key; 204 on success). Behind an interface so tests use a fake.
import type { NetworkContext, NetworkId } from "@kawase/networks";

/**
 * The wallets Circle's faucet sends from, per network (lower-case). The drip answers 204 with no body, so there is
 * no transaction to keep with a claim; what proves a transfer in came from the faucet is its sender. Observed on
 * ArcScan on 2026-10-01: both drips Kawase claimed that day came from these two addresses, at the second of the
 * claim, and their own histories are nothing but 20 USDC / 20 EURC drips to other addresses. A drip from a wallet
 * Circle adds later shows as a plain address until it is listed here — never as the faucet by guesswork (R15).
 */
export const CIRCLE_FAUCET_SENDERS: Partial<Record<NetworkId, ReadonlySet<string>>> = {
  testnet: new Set(["0x35f9621e9d943e46c418b9556bdbcf5214ae0f47", "0x697e526d0d31fe08119b9ddc64419e81601d21b8"]),
};

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
