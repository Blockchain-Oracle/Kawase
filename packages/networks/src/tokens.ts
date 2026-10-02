import type { Address } from "viem";

import { NETWORK_ADDRESSES, SHARED_ADDRESSES } from "./addresses";
import type { NetworkId } from "./network-id";

/**
 * The asset registry's fixed part (R1, G5): the tokens Kawase vouches for on each Arc network. Every other token a
 * wallet holds is discovered from its Transfer logs and described from the chain and the market lists at runtime;
 * this table only says which addresses are the real ones. Symbols, names and decimals were read from each contract
 * on 2026-10-02 (symbol(), name(), decimals() via Multicall3); addresses come from @kawase/networks' verified
 * blocks and Circle's/issuers' published lists (context/01-arc/network-config.md, the census).
 */
export type TokenKind =
  /** A dollar stablecoin (USDC). */
  | "dollar"
  /** Another fiat stablecoin (EURC, wARS). */
  | "fiat"
  | "bitcoin"
  | "ether"
  /** A tokenized real-world asset anyone may hold (XAUm). */
  | "rwa"
  /** A tokenized real-world asset only allowlisted holders may hold (USYC): display-only. */
  | "permissioned"
  /** A share of a vault or wrapper (ERC-4626): shown as a position, not a loose token. */
  | "position"
  /** Anything else: governance, utility and meme tokens. */
  | "token";

export type CanonicalToken = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  kind: TokenKind;
  /** The currency or commodity it tracks, when it tracks one. */
  peg?: "USD" | "EUR" | "ARS" | "XAU";
  /** CoinGecko's id, which the market data and the copycat rule cross-check. */
  coingeckoId?: string;
};

/** The same token's address on mainnet, for test tokens priced by their mainnet twin. */
export type TestTwin = { mainnet: Address };

const MAINNET_TOKENS: readonly CanonicalToken[] = [
  { address: SHARED_ADDRESSES.usdc, symbol: "USDC", name: "USD Coin", decimals: 6, kind: "dollar", peg: "USD", coingeckoId: "usd-coin" },
  { address: NETWORK_ADDRESSES.mainnet.eurc, symbol: "EURC", name: "Euro Coin", decimals: 6, kind: "fiat", peg: "EUR", coingeckoId: "euro-coin" },
  { address: NETWORK_ADDRESSES.mainnet.usyc, symbol: "USYC", name: "US Yield Coin", decimals: 6, kind: "permissioned", peg: "USD", coingeckoId: "hashnote-usyc" },
  { address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", symbol: "cirBTC", name: "Circle Wrapped Bitcoin", decimals: 8, kind: "bitcoin", coingeckoId: "circle-wrapped-btc" },
  { address: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB", symbol: "WETH", name: "Wrapped Ether", decimals: 18, kind: "ether", coingeckoId: "weth" },
  { address: "0x178b01f61CBeA1D2a5581Fe1621Be607835EC349", symbol: "XAUm", name: "Matrixdock Gold", decimals: 18, kind: "rwa", peg: "XAU", coingeckoId: "matrixdock-gold" },
  { address: "0x76a443768a5e3b8d1aed0105fc250877841deb40", symbol: "LINK", name: "Chainlink", decimals: 18, kind: "token", coingeckoId: "chainlink" },
  { address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D", symbol: "wARS", name: "Peso Argentino", decimals: 18, kind: "fiat", peg: "ARS" },
];

const TESTNET_TOKENS: readonly CanonicalToken[] = [
  { address: SHARED_ADDRESSES.usdc, symbol: "USDC", name: "USD Coin", decimals: 6, kind: "dollar", peg: "USD" },
  { address: NETWORK_ADDRESSES.testnet.eurc, symbol: "EURC", name: "Euro Coin", decimals: 6, kind: "fiat", peg: "EUR" },
  { address: NETWORK_ADDRESSES.testnet.usyc, symbol: "USYC", name: "US Yield Coin", decimals: 6, kind: "permissioned", peg: "USD" },
];

export const CANONICAL_TOKENS: Record<NetworkId, readonly CanonicalToken[]> = {
  mainnet: MAINNET_TOKENS,
  testnet: TESTNET_TOKENS,
};

/** Test tokens have no market; each is valued at its mainnet twin's price and always labelled test money. */
export const TESTNET_PRICE_TWINS: Readonly<Record<string, Address>> = {
  [SHARED_ADDRESSES.usdc.toLowerCase()]: SHARED_ADDRESSES.usdc,
  [NETWORK_ADDRESSES.testnet.eurc.toLowerCase()]: NETWORK_ADDRESSES.mainnet.eurc,
  [NETWORK_ADDRESSES.testnet.usyc.toLowerCase()]: NETWORK_ADDRESSES.mainnet.usyc,
};

/**
 * Symbols only a real stablecoin may carry. A token using one of these at any address that is not the canonical
 * one is an impersonator and is hard-blocked (cards/trade.md "Kawase copycat rule": a fake "USDC" pool trended on
 * Arc on 2026-10-02, and GoPlus cannot see copycats).
 */
export const STABLECOIN_SYMBOLS: ReadonlySet<string> = new Set([
  "USDC", "EURC", "USDT", "USDT0", "DAI", "USDS", "USDE", "PYUSD", "FDUSD", "TUSD", "USDP", "GUSD", "FRAX", "LUSD",
  "USD1", "RLUSD", "USDB", "USDG", "GBPA", "EUROC", "EURT", "USYC", "XSGD", "AUDF", "BRLA", "MXNB", "QCAD", "JPYC",
]);

/**
 * Latin look-alikes that copycats use to dodge an exact symbol match (Cyrillic and Greek capitals that render the
 * same as the Latin letters in a stablecoin ticker).
 */
const HOMOGLYPHS: Readonly<Record<string, string>> = {
  А: "A", В: "B", С: "C", Е: "E", Н: "H", К: "K", М: "M", О: "O", Р: "P", Т: "T", Х: "X", У: "Y", Ѕ: "S", І: "I", Ј: "J",
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};

/** A symbol as a person reads it: compatibility-folded, look-alike letters made Latin, upper case, letters and digits only. */
export function normalizeSymbol(symbol: string): string {
  return [...symbol.normalize("NFKC").toUpperCase()]
    .map((char) => HOMOGLYPHS[char] ?? char)
    .join("")
    .replace(/[^A-Z0-9]/g, "");
}

export function canonicalToken(network: NetworkId, address: string): CanonicalToken | undefined {
  const target = address.toLowerCase();
  return CANONICAL_TOKENS[network].find((token) => token.address.toLowerCase() === target);
}

/** True when the token claims a stablecoin's symbol at an address that is not that stablecoin's on this network. */
export function impersonatesStablecoin(network: NetworkId, symbol: string, address: string): boolean {
  const normalized = normalizeSymbol(symbol);
  if (!STABLECOIN_SYMBOLS.has(normalized)) return false;
  const real = CANONICAL_TOKENS[network].find((token) => normalizeSymbol(token.symbol) === normalized);
  return !real || real.address.toLowerCase() !== address.toLowerCase();
}

/** The two USDC interfaces on Arc are one asset: the ERC-20 view at 0x3600… (6 decimals) is what Kawase shows. */
export function isArcUsdc(address: string): boolean {
  return address.toLowerCase() === SHARED_ADDRESSES.usdc.toLowerCase();
}
