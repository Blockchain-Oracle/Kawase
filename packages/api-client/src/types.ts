// Shapes the api returns. Kept by hand next to the routes in apps/api; a test there compares them.
export type NetworkId = "mainnet" | "testnet";

export type ApiUser = {
  id: string;
  email: string | null;
  /** The public @handle, without the @; null until the user picks one. */
  handle: string | null;
  isGuest: boolean;
  locale: string;
  replyLanguage: string | null;
  displayCurrency: string;
  timezone: string;
  theme: "system" | "light" | "dark";
  activeNetwork: NetworkId;
  riskMode: "careful" | "balanced" | "autonomous";
  practiceMode: boolean;
  turnkeySubOrganizationId: string | null;
};

export type DeviceInfo = {
  platform: "ios" | "android" | "web" | "desktop";
  installationId: string;
  appVersion?: string;
  locale?: string;
};

export type SignInResponse = { token: string; user: ApiUser };

export type StampedProof = { body: string; stamp: string };

export type ConsentKind = "terms" | "mainnet_real_money" | "meme_risk" | "marketplace_risk" | "voice_retention";
export type Consent = { kind: ConsentKind; version: string; acceptedAt: string };

export type CapabilityState = "available" | "coming" | "unavailable";
export type Capabilities = Record<string, Record<NetworkId, { state: CapabilityState; reason?: string }>>;

export type GrantReceipt = {
  wallet: string;
  redeemer: string;
  token?: string;
  amountPerPeriod?: string;
  periodSeconds?: number;
  startsAt?: number;
  expiresAt?: number;
  targets: string[];
  methods: string[];
  recipient?: string;
  maxNativeValue?: string;
  redeemers: string[];
  unknownCaveats: string[];
};

export type WalletNetworkStatus = {
  setUp: boolean;
  setupAt: string | null;
  usdcBalance: string;
  /** Base units (6 decimals), like `usdcBalance`. */
  eurcBalance: string;
  allowance: { id: string; receipt: GrantReceipt; expiresAt: string } | null;
};

export type WalletStatus = { address?: string; networks: Partial<Record<NetworkId, WalletNetworkStatus>> };

export type AuthorizationRequest = { contractAddress: `0x${string}`; chainId: number; nonce: number };
export type SignedAuthorizationInput = {
  address: string;
  chainId: number;
  nonce: number;
  r: string;
  s: string;
  yParity: number;
};

export type SetupRequestResponse =
  { alreadySetUp: true } | { alreadySetUp: false; authorization: AuthorizationRequest };

export type TypedDataPayload = {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

export type AllowanceRequestResponse = { grantId: string; typedData: TypedDataPayload; receipt: GrantReceipt };

export type UnsignedTransaction = {
  type: "eip1559";
  chainId: number;
  nonce: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
};

export type TransactionRequestResponse = { requestId: string; transaction: UnsignedTransaction; grantId?: string };

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  [extra: string]: unknown;
};

export type HandleAvailability =
  | { handle: string; available: true }
  | { handle: string; available: false; reason: "too_short" | "too_long" | "invalid" | "reserved" | "taken" };

export type FaucetStatus = {
  network: NetworkId;
  eligible: boolean;
  /** When the next claim opens, after a successful one. */
  nextAt: string | null;
  /** Base units per asset ("USDC", "EURC"). */
  amounts: Record<string, string>;
  /** Circle's own faucet, for when the in-app drip is refused. */
  fallbackUrl: string;
};

export type FaucetClaim = { status: "sent"; amounts: Record<string, string>; address: string; nextAt: string };

export type ActivityItem = {
  id: string;
  network: NetworkId;
  direction: "in" | "out";
  asset: "USDC" | "EURC";
  /** Base units (6 decimals). */
  amount: string;
  counterparty: string;
  /** Who the counterparty is, when Kawase knows: its own wallets, Circle's faucet, or the user's own address. */
  counterpartyLabel: "circle_faucet" | "kawase_agent" | "kawase_relayer" | "self" | null;
  txHash: string;
  at: string;
  explorerUrl: string;
};

export type ThreadSummary = { id: string; title: string | null; network: NetworkId; lastMessageAt: string };
