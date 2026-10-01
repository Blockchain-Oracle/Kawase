// Shapes the api returns. Kept by hand next to the routes in apps/api; a test there compares them.
export type NetworkId = "mainnet" | "testnet";

export type ApiUser = {
  id: string;
  email: string | null;
  /** The public @handle, without the @; null until the user picks one. */
  handle: string | null;
  /** The optional handle step was answered (saved or skipped); absent on users cached before it existed. */
  handlePrompted?: boolean;
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
  /** The person's own name for the counterparty, when its address is in their contacts. */
  contactName?: string | null;
  txHash: string;
  at: string;
  explorerUrl: string;
};

export type ThreadSummary = { id: string; title: string | null; network: NetworkId; lastMessageAt: string };

// ── Contacts and sends (Stage 5) ────────────────────────────────────────────────────────────────────────────

export type AddressSource = "typed" | "pasted" | "scanned" | "handle" | "received" | "agent";
export type ContactAddressStatus = "pending_cooldown" | "active" | "retired" | "blocked";

export type ContactAddress = {
  id: string;
  address: string;
  version: number;
  status: ContactAddressStatus;
  source: AddressSource;
  sourceDetail: string | null;
  /** When a changed address becomes payable. */
  activatesAt: string | null;
  createdAt: string;
  /** Per network: whether it was paid, how often, and how it was verified. */
  trust: Partial<Record<NetworkId, { paymentCount: number; lastPaidAt: string | null; verifiedMethod: string | null }>>;
};

export type Contact = {
  id: string;
  displayName: string;
  aliases: string[];
  handle: string | null;
  kind: "person" | "business";
  label: string | null;
  notes: string | null;
  /** The address money goes to now (null while a change is on hold). */
  address: string | null;
  /** Set while a changed address waits out its cooldown; payments to the contact are frozen until then. */
  pendingChange: { address: string; activatesAt: string } | null;
  addresses: ContactAddress[];
  createdAt: string;
};

export type ContactInput = {
  displayName: string;
  /** An 0x address or an @handle. */
  address: string;
  source?: AddressSource | undefined;
  kind?: "person" | "business" | undefined;
  label?: string | null | undefined;
  notes?: string | null | undefined;
  aliases?: string[] | undefined;
};

/** A match for the recipient search: a saved contact or a Kawase @handle. */
export type RecipientMatch =
  | { kind: "contact"; contactId: string; name: string; handle: string | null; address: string | null; onHold: boolean }
  | { kind: "handle"; handle: string; address: string };

export type PolicyKind = "error" | "policy" | "precondition" | "clarification" | "warning";
export type PolicyResultView = { code: string; kind: PolicyKind; params?: Record<string, string> };

export type IntentState =
  | "submitted"
  | "working"
  | "input_required"
  | "auth_required"
  | "ready_for_approval"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "rejected"
  | "canceled"
  | "expired"
  | "unknown_outcome";

/**
 * How a send ended, in money terms (the money-ending taxonomy): sent and confirmed; not sent (nothing left the
 * wallet); reverted (on chain but undone; only a fee may have been paid); checking (the outcome is not known yet
 * and nothing is retried); canceled; expired.
 */
export type SendOutcome = "sent" | "not_sent" | "reverted" | "checking" | "canceled" | "expired";

export type SendRecipientView = {
  via: "contact" | "handle" | "address";
  address: string;
  name: string | null;
  handle: string | null;
  contactId: string | null;
  /** How the address reached the book ("scanned", "handle"…), for the trust chip. */
  source: AddressSource | null;
  verifiedMethod: string | null;
  paidBefore: boolean;
};

export type SendDraftView = {
  recipient: SendRecipientView;
  asset: "USDC" | "EURC";
  /** Base units (6 decimals). */
  amount: string;
  note: string | null;
  /** Who pays the network fee, and about how much (USDC base units, 6 decimals). */
  fee: { payer: "kawase" | "wallet"; estimate: string | null };
};

export type SendIntent = {
  id: string;
  network: NetworkId;
  state: IntentState;
  outcome: SendOutcome | null;
  version: number;
  /** The person's own words for each field. */
  request: { recipient: string | null; amount: string | null; asset: "USDC" | "EURC" | null; note: string | null };
  draft: SendDraftView | null;
  results: PolicyResultView[];
  blocking: PolicyResultView | null;
  route: "allowance" | "wallet_signature" | null;
  allowance: { active: boolean; available: string; perPeriod: string | null };
  /** For an unknown name: Kawase handles that match it exactly; never chosen for the person. */
  suggestions: RecipientMatch[];
  tx: { hash: string; explorerUrl: string } | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
};

export type SendRequest = {
  recipient?: string | null | undefined;
  amount?: string | null | undefined;
  asset?: "USDC" | "EURC" | null | undefined;
  note?: string | null | undefined;
};

export type SendApproveResponse =
  | { status: "executing" | "changed" | "final"; intent: SendIntent }
  | { status: "sign"; intent: SendIntent; approvalId: string; transaction: UnsignedTransaction };
