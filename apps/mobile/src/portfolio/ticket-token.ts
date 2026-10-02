// A token chosen on a ticket (Send, Request, Withdraw, Swap): enough to draw its mark, name it, and read and write
// amounts in its own decimals (R1). USDC and EURC come from the identity registry; any other token from the picker.
import type { NetworkId, TokenView } from "@kawase/api-client";
import { arcIdentity, CHAIN_IDS, getEntity } from "@kawase/identity";

export type TicketToken = Pick<TokenView, "chainId" | "address" | "symbol" | "name" | "decimals" | "logoUrl">;

const TEN = 10n;
const DECIMAL = /^\d+(\.\d+)?$/;

/** Arc's USDC or EURC on this network. */
export function stableToken(network: NetworkId, symbol: "USDC" | "EURC"): TicketToken {
  const ids = arcIdentity(network);
  const entity = getEntity(symbol === "USDC" ? ids.usdc : ids.eurc)!;
  return { chainId: network === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet, address: entity.address!, symbol, name: entity.name, decimals: entity.decimals!, logoUrl: null };
}

/** What the api is asked for: USDC/EURC by symbol (older flows and automations know them so), any other by address. */
export const assetParam = (token: TicketToken) => (token.symbol === "USDC" || token.symbol === "EURC" ? token.symbol : token.address);

/** Base units → the canonical decimal the keypad edits ("12.5"). */
export function canonicalUnits(units: bigint, decimals: number): string {
  const divisor = TEN ** BigInt(decimals);
  const whole = units / divisor;
  const fraction = (units % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** The canonical decimal → base units; undefined while it is empty or not a number yet. */
export function unitsFromCanonical(value: string, decimals: number): bigint | undefined {
  const text = value.endsWith(".") ? value.slice(0, -1) : value;
  if (!DECIMAL.test(text) || (text.split(".")[1]?.length ?? 0) > decimals) return undefined;
  const [whole = "0", fraction = ""] = text.split(".");
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}
