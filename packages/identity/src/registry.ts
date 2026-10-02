import { NETWORKS, NETWORK_ADDRESSES, SHARED_ADDRESSES } from "@kawase/networks";

/**
 * The entities Kawase shows with their real artwork. Keys follow the reference study's asset-delivery contract
 * (docs/design/reference-study-2026-09-30/08-logos-and-identity.md): chains by chain id, tokens by chain id +
 * lowercase address, providers and venues by slug. Chain ids and addresses come from @kawase/networks so the
 * registry cannot drift from the verified values. Mark files live in svg/ with a row in PROVENANCE.md each;
 * an entity whose file has not arrived yet renders the labelled neutral disc, never a stand-in logo.
 */
export type EntityKind = "chain" | "token" | "provider" | "venue" | "name-service";

export type MarkVariant = "color" | "mono";

export type Entity = {
  id: string;
  kind: EntityKind;
  name: string;
  /** Short label for chips and lists (USDC, ETH); chains use their name. */
  symbol?: string;
  chainId?: number;
  address?: string;
  decimals?: number;
  /** The brand's own colour, for the disc behind an uncontained mark and for the neutral fallback's tint. */
  brandColor: string;
  /** "disc" marks come as a full circle; "tile" marks fill their box with their own shape (a rounded square);
   * "uncontained" marks are a glyph that sits on a disc we draw. */
  shape: "disc" | "tile" | "uncontained";
  /** File stems in svg/ (without .svg) per variant; absent = not delivered yet. */
  marks: Partial<Record<MarkVariant, string>> & { wordmark?: string };
  /** Test networks reuse the mainnet mark and say so in text. */
  environment?: "mainnet" | "testnet";
  /** For chains: whether a Kawase route can bring funds from here (the capability registry decides at runtime). */
  role?: "home" | "bridge-source";
};

const ARC_MAINNET = NETWORKS.mainnet.chainId;
const ARC_TESTNET = NETWORKS.testnet.chainId;

export const chainKey = (chainId: number) => `chain:eip155:${chainId}`;
export const tokenKey = (chainId: number, address: string) => `token:eip155:${chainId}:${address.toLowerCase()}`;
export const providerKey = (slug: string) => `provider:${slug}`;
export const venueKey = (slug: string) => `venue:${slug}`;

const USDC_DECIMALS = 6;
const EURC_DECIMALS = 6;
const CIRBTC_DECIMALS = 8;
const WETH_DECIMALS = 18;

/** Token addresses on Arc mainnet that have marks (Aave V4 Main Spoke reserves, read 2026-10-02). */
export const ARC_MAINNET_TOKENS = {
  cirBTC: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
  WETH: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB",
} as const;

const chain = (
  chainId: number,
  name: string,
  brandColor: string,
  marks: Entity["marks"],
  extra: Partial<Entity> = {},
): Entity => ({
  id: chainKey(chainId),
  kind: "chain",
  name,
  chainId,
  brandColor,
  shape: "disc",
  marks,
  environment: "mainnet",
  role: "bridge-source",
  ...extra,
});

/** Chain ids of the CCTP V2 / App Kit bridge sources (context/01-arc/app-kit.md, checked 2026-09-30). */
export const CHAIN_IDS = {
  arc: ARC_MAINNET,
  arcTestnet: ARC_TESTNET,
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  polygon: 137,
  avalanche: 43114,
  optimism: 10,
  unichain: 130,
  sepolia: 11155111,
  baseSepolia: 84532,
  arbitrumSepolia: 421614,
  polygonAmoy: 80002,
  avalancheFuji: 43113,
  optimismSepolia: 11155420,
} as const;

export const ENTITIES: readonly Entity[] = [
  // Arc: the home network on both environments; one mark, the environment is always said in text.
  chain(CHAIN_IDS.arc, "Arc", "#0F0F0F", { color: "arc", mono: "arc-mono" }, { role: "home" }),
  chain(CHAIN_IDS.arcTestnet, "Arc Testnet", "#0F0F0F", { color: "arc", mono: "arc-mono" }, { role: "home", environment: "testnet" }),

  // Tokens on Arc (same USDC address on both networks; EURC per network).
  {
    id: tokenKey(ARC_MAINNET, SHARED_ADDRESSES.usdc),
    kind: "token",
    name: "USD Coin",
    symbol: "USDC",
    chainId: ARC_MAINNET,
    address: SHARED_ADDRESSES.usdc,
    decimals: USDC_DECIMALS,
    brandColor: "#2775CA",
    shape: "disc",
    marks: { color: "usdc", mono: "usdc-mono" },
    environment: "mainnet",
  },
  {
    id: tokenKey(ARC_TESTNET, SHARED_ADDRESSES.usdc),
    kind: "token",
    name: "USD Coin (test)",
    symbol: "USDC",
    chainId: ARC_TESTNET,
    address: SHARED_ADDRESSES.usdc,
    decimals: USDC_DECIMALS,
    brandColor: "#2775CA",
    shape: "disc",
    marks: { color: "usdc", mono: "usdc-mono" },
    environment: "testnet",
  },
  {
    id: tokenKey(ARC_MAINNET, NETWORK_ADDRESSES.mainnet.eurc),
    kind: "token",
    name: "Euro Coin",
    symbol: "EURC",
    chainId: ARC_MAINNET,
    address: NETWORK_ADDRESSES.mainnet.eurc,
    decimals: EURC_DECIMALS,
    brandColor: "#2775CA",
    shape: "disc",
    marks: { color: "eurc", mono: "eurc-mono" },
    environment: "mainnet",
  },
  {
    id: tokenKey(ARC_TESTNET, NETWORK_ADDRESSES.testnet.eurc),
    kind: "token",
    name: "Euro Coin (test)",
    symbol: "EURC",
    chainId: ARC_TESTNET,
    address: NETWORK_ADDRESSES.testnet.eurc,
    decimals: EURC_DECIMALS,
    brandColor: "#2775CA",
    shape: "disc",
    marks: { color: "eurc", mono: "eurc-mono" },
    environment: "testnet",
  },

  // Bridge sources (CCTP V2 / App Kit). Testnets reuse the mark.
  chain(CHAIN_IDS.ethereum, "Ethereum", "#627EEA", { color: "ethereum", mono: "ethereum-mono" }, { shape: "uncontained" }),
  chain(CHAIN_IDS.base, "Base", "#0052FF", { color: "base", mono: "base-mono" }, { shape: "tile" }),
  chain(CHAIN_IDS.arbitrum, "Arbitrum One", "#12AAFF", { color: "arbitrum", mono: "arbitrum-mono" }),
  chain(CHAIN_IDS.polygon, "Polygon", "#8247E5", { color: "polygon", mono: "polygon-mono" }),
  chain(CHAIN_IDS.avalanche, "Avalanche", "#E84142", { color: "avalanche", mono: "avalanche-mono" }),
  chain(CHAIN_IDS.optimism, "OP Mainnet", "#FF0420", { color: "optimism", mono: "optimism-mono" }),
  chain(CHAIN_IDS.unichain, "Unichain", "#F50DB4", { color: "unichain", mono: "unichain-mono" }),
  chain(CHAIN_IDS.sepolia, "Sepolia", "#627EEA", { color: "ethereum", mono: "ethereum-mono" }, { environment: "testnet", shape: "uncontained" }),
  chain(CHAIN_IDS.baseSepolia, "Base Sepolia", "#0052FF", { color: "base", mono: "base-mono" }, { environment: "testnet", shape: "tile" }),
  chain(CHAIN_IDS.arbitrumSepolia, "Arbitrum Sepolia", "#12AAFF", { color: "arbitrum", mono: "arbitrum-mono" }, { environment: "testnet" }),
  chain(CHAIN_IDS.polygonAmoy, "Polygon Amoy", "#8247E5", { color: "polygon", mono: "polygon-mono" }, { environment: "testnet" }),
  chain(CHAIN_IDS.avalancheFuji, "Avalanche Fuji", "#E84142", { color: "avalanche", mono: "avalanche-mono" }, { environment: "testnet" }),
  chain(CHAIN_IDS.optimismSepolia, "OP Sepolia", "#FF0420", { color: "optimism", mono: "optimism-mono" }, { environment: "testnet" }),
  {
    id: "chain:solana:mainnet",
    kind: "chain",
    name: "Solana",
    brandColor: "#9945FF",
    shape: "uncontained",
    marks: { color: "solana", mono: "solana-mono" },
    environment: "mainnet",
    role: "bridge-source",
  },
  {
    id: "chain:solana:devnet",
    kind: "chain",
    name: "Solana Devnet",
    brandColor: "#9945FF",
    shape: "uncontained",
    marks: { color: "solana", mono: "solana-mono" },
    environment: "testnet",
    role: "bridge-source",
  },

  // Sign-in and platform providers.
  { id: providerKey("apple"), kind: "provider", name: "Apple", brandColor: "#000000", shape: "uncontained", marks: { color: "apple", mono: "apple-mono" } },
  { id: providerKey("google"), kind: "provider", name: "Google", brandColor: "#4285F4", shape: "uncontained", marks: { color: "google", mono: "google-mono" } },
  { id: providerKey("circle"), kind: "provider", name: "Circle", brandColor: "#00E599", shape: "uncontained", marks: { color: "circle", mono: "circle-mono" } },
  { id: providerKey("kawase"), kind: "provider", name: "Kawase", brandColor: "#D4FF3A", shape: "tile", marks: { color: "kawase", mono: "kawase-mono" } },
  { id: providerKey("morpho"), kind: "provider", name: "Morpho", brandColor: "#15181A", shape: "tile", marks: { color: "morpho", mono: "morpho-mono" } },
  { id: providerKey("aave"), kind: "provider", name: "Aave", brandColor: "#9391F7", shape: "disc", marks: { color: "aave", mono: "aave-mono" } },

  // Assets Aave V4 lists on Arc mainnet (reserves read from the Main Spoke, 2026-10-02). cirBTC shows the Bitcoin
  // mark and WETH the Ether mark (web3icons, MIT); the symbol beside them says which token it is.
  {
    id: tokenKey(ARC_MAINNET, ARC_MAINNET_TOKENS.cirBTC),
    kind: "token",
    name: "Circle Bitcoin",
    symbol: "cirBTC",
    chainId: ARC_MAINNET,
    address: ARC_MAINNET_TOKENS.cirBTC,
    decimals: CIRBTC_DECIMALS,
    brandColor: "#F7931A",
    shape: "disc",
    marks: { color: "btc", mono: "btc-mono" },
    environment: "mainnet",
  },
  {
    id: tokenKey(ARC_MAINNET, ARC_MAINNET_TOKENS.WETH),
    kind: "token",
    name: "Wrapped Ether",
    symbol: "WETH",
    chainId: ARC_MAINNET,
    address: ARC_MAINNET_TOKENS.WETH,
    decimals: WETH_DECIMALS,
    brandColor: "#627EEA",
    shape: "disc",
    marks: { color: "weth", mono: "weth-mono" },
    environment: "mainnet",
  },

  // Registered now, marks later (Stage 6 routes and names).
  { id: venueKey("cctp"), kind: "venue", name: "Circle CCTP", brandColor: "#00E599", shape: "uncontained", marks: {} },
  { id: venueKey("lifi"), kind: "venue", name: "LI.FI", brandColor: "#5F2FEA", shape: "uncontained", marks: {} },
  { id: venueKey("across"), kind: "venue", name: "Across", brandColor: "#6CF9D8", shape: "disc", marks: { color: "across", mono: "across-mono" } },
  { id: venueKey("relay"), kind: "venue", name: "Relay", brandColor: "#7C3AED", shape: "uncontained", marks: {} },
  { id: venueKey("debridge"), kind: "venue", name: "deBridge", brandColor: "#FBFF3A", shape: "disc", marks: { color: "debridge", mono: "debridge-mono" } },
  { id: venueKey("kyberswap"), kind: "venue", name: "KyberSwap", brandColor: "#31CB9E", shape: "disc", marks: { color: "kyberswap", mono: "kyberswap-mono" } },
  { id: venueKey("socket"), kind: "venue", name: "Socket", brandColor: "#FF6B6B", shape: "uncontained", marks: {} },
  { id: "name-service:ens", kind: "name-service", name: "ENS", brandColor: "#5298FF", shape: "uncontained", marks: {} },
  { id: "name-service:basenames", kind: "name-service", name: "Basenames", brandColor: "#0052FF", shape: "uncontained", marks: {} },
  { id: "name-service:arcns", kind: "name-service", name: "ArcNS (unofficial)", brandColor: "#0F0F0F", shape: "uncontained", marks: {} },
];
